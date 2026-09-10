export const SUBSCRIBER_STATUS_ORDER = Object.freeze([
  'Found',
  'Verified',
  'Package Ready',
  'Applying',
  'Needs You',
  'Submitted',
  'Receipt Verified',
  'Follow-up Due',
  'Interview',
  'Rejected/Closed',
]);

export const JOB_TABS = Object.freeze(['Matches', 'Preparing', 'Needs You', 'Submitted', 'Follow-ups', 'Interviews', 'Closed']);

function authoritativeReceipt(value) {
  return Boolean(value && value.simulated !== true && (value.confirmationId || value.receivedAt || value.reference));
}

export const TIME_SAVED_BASELINES = Object.freeze({
  completedSearch: 10,
  organizedJob: 2,
  verifiedJob: 3,
  preparedPackage: 20,
  filledOrdinaryField: 1,
  trackedReceipt: 2,
});
export const TIME_SAVED_MODEL_VERSION = 'job-agent-time-saved-v1';

const VERIFIED_TIME_SAVED_STATUSES = new Set([
  'Verified', 'Verified - Package Preparation', 'Package Ready', 'Awaiting Approval', 'Submitted', 'Interview',
]);

function timeSavedRoleKey(role = {}, index = 0) {
  const provider = String(role.sourceProvider || '').trim().toLowerCase();
  const requisition = String(role.requisitionId || '').trim().toLowerCase();
  if (provider && requisition) return `${provider}:${requisition}`;
  try {
    const url = new URL(role.directEmployerUrl || role.sourceUrl || '');
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'gh_src'].forEach(key => url.searchParams.delete(key));
    return url.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return String(role.id || `role-${index}`);
  }
}

function timeSavedAt(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function estimateJobAgentTimeSaved({ roles = [], applicationSessions = [], run = null, now = new Date(), sessionStartedAt = null } = {}) {
  const events = [];
  const add = (key, label, count, minutes, at, explanation) => {
    if (!count || !minutes) return;
    events.push({ key, label, count, minutes, at: at || null, explanation });
  };

  const uniqueRoles = new Map();
  roles.forEach((role, index) => {
    if (!role || typeof role !== 'object') return;
    const key = timeSavedRoleKey(role, index);
    if (!uniqueRoles.has(key)) uniqueRoles.set(key, role);
  });

  for (const [key, role] of uniqueRoles) {
    const roleAt = role.updatedAt || role.createdAt || null;
    if (role.id && role.directEmployerUrl) {
      add(`organized:${key}`, 'Jobs captured and organized', 1, TIME_SAVED_BASELINES.organizedJob, role.createdAt || roleAt,
        `${TIME_SAVED_BASELINES.organizedJob} min per saved job`);
    }
    const verified = role.applyPathActive === true && Boolean(role.discoveryRunId || role.sourceType === 'direct-employer')
      || VERIFIED_TIME_SAVED_STATUSES.has(role.status) && Boolean(role.requisitionId && role.directEmployerUrl);
    if (verified) {
      add(`verified:${key}`, 'Employer listings verified', 1, TIME_SAVED_BASELINES.verifiedJob, roleAt,
        `${TIME_SAVED_BASELINES.verifiedJob} min per verified job`);
    }
    const prepared = Boolean(role.packageDraft?.generatedAt)
      || ['Package Ready', 'Awaiting Approval'].includes(role.status);
    if (prepared) {
      add(`package:${key}`, 'Application packages prepared', 1, TIME_SAVED_BASELINES.preparedPackage,
        role.packageDraft?.generatedAt || roleAt, `${TIME_SAVED_BASELINES.preparedPackage} min per completed package`);
    }
  }

  applicationSessions.forEach((session, index) => {
    if (!session || typeof session !== 'object') return;
    const completed = session.workerExecution?.status === 'completed';
    const reconciled = (session.timeline || []).find(item => item?.kind === 'TRANSMISSION_RECONCILED_FIELDS_PRESENT');
    const transmitted = session.transmissionAttempt?.transmittedFieldKeys || session.workerExecution?.stagedFieldKeys || [];
    const fieldCount = completed || reconciled ? Math.min(10, new Set(transmitted).size || Number(reconciled?.metadata?.stagedFieldCount) || 0) : 0;
    if (fieldCount) {
      add(`fields:${session.id || index}`, 'Routine form fields completed', fieldCount,
        fieldCount * TIME_SAVED_BASELINES.filledOrdinaryField,
        session.workerExecution?.completedAt || reconciled?.at || session.transmissionAttempt?.transmittedAt || session.updatedAt,
        `${TIME_SAVED_BASELINES.filledOrdinaryField} min per confirmed ordinary field, capped at 10 per application`);
    }
  });

  const receiptKeys = new Set();
  [...roles, ...applicationSessions].forEach((item, index) => {
    if (!authoritativeReceipt(item?.receipt)) return;
    const key = String(item.receipt.confirmationId || item.receipt.reference || item.packageRunId || item.id || `receipt-${index}`);
    if (receiptKeys.has(key)) return;
    receiptKeys.add(key);
    add(`receipt:${key}`, 'Employer confirmations tracked', 1, TIME_SAVED_BASELINES.trackedReceipt,
      item.receipt.verifiedAt || item.receipt.receivedAt || item.receipt.submittedAt || item.updatedAt,
      `${TIME_SAVED_BASELINES.trackedReceipt} min per authoritative employer receipt`);
  });

  const sourceChecks = Array.isArray(run?.result?.sourceSummary) ? run.result.sourceSummary.length : 0;
  if (run?.status === 'Finished' && run?.taskType === 'direct_employer_discovery' && sourceChecks > 0) {
    add(`search:${run.id || run.result?.completedAt || 'latest'}`, 'Direct-employer search completed', 1,
      TIME_SAVED_BASELINES.completedSearch, run.result?.completedAt || run.updatedAt,
      `${TIME_SAVED_BASELINES.completedSearch} min per completed multi-source search`);
  }

  const nowMs = timeSavedAt(now) || Date.now();
  const weekStart = nowMs - (7 * 24 * 60 * 60 * 1000);
  const sessionStart = timeSavedAt(sessionStartedAt);
  const sum = predicate => events.filter(event => predicate(event)).reduce((total, event) => total + event.minutes, 0);
  const breakdown = [...new Map(events.map(event => [event.label, event])).values()].map(first => {
    const matching = events.filter(event => event.label === first.label);
    return {
      label: first.label,
      count: matching.reduce((total, event) => total + event.count, 0),
      minutes: matching.reduce((total, event) => total + event.minutes, 0),
      explanation: first.explanation,
    };
  }).sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label));

  return {
    estimated: true,
    modelVersion: TIME_SAVED_MODEL_VERSION,
    totalMinutes: sum(() => true),
    lastSevenDaysMinutes: sum(event => timeSavedAt(event.at) >= weekStart && timeSavedAt(event.at) <= nowMs),
    sessionMinutes: sessionStart ? sum(event => timeSavedAt(event.at) >= sessionStart && timeSavedAt(event.at) <= nowMs) : 0,
    completedEventCount: events.length,
    breakdown,
  };
}

export function formatTimeSaved(minutes = 0) {
  const safe = Math.max(0, Math.floor(Number(minutes) || 0));
  if (safe < 60) return `${safe} min`;
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${hours} hr${hours === 1 ? '' : 's'}${remainder ? ` ${remainder} min` : ''}`;
}

export function authoritativeReceiptCount(items = [], onDate = null) {
  const receiptKeys = new Set();
  const expectedDay = onDate ? new Date(onDate).toDateString() : '';
  for (const item of items) {
    if (!authoritativeReceipt(item?.receipt)) continue;
    const receivedAt = item.receipt.receivedAt || item.receipt.submittedAt || '';
    if (expectedDay && new Date(receivedAt || 0).toDateString() !== expectedDay) continue;
    receiptKeys.add(String(item.packageRunId || item.id || item.receipt.confirmationId || item.receipt.reference || receivedAt));
  }
  return receiptKeys.size;
}

export function subscriberStatus(role = {}, applicationSession = null) {
  if (applicationSession?.postSubmission?.status === 'REJECTED_CLOSED') return 'Rejected/Closed';
  if (applicationSession?.closedBeforeSubmission?.source === 'direct-employer-reverification') return 'Rejected/Closed';
  if (role.status === 'Rejected/Closed' || role.activityStatus === 'Closed by direct page') return 'Rejected/Closed';
  if (applicationSession?.postSubmission?.followUp?.status === 'SCHEDULED'
    && new Date(applicationSession.postSubmission.followUp.dueAt).getTime() <= Date.now()) return 'Follow-up Due';
  if (applicationSession?.postSubmission?.status === 'INTERVIEW') return 'Interview';
  if (authoritativeReceipt(applicationSession?.receipt) || authoritativeReceipt(role.receipt)) return 'Receipt Verified';
  if (role.status === 'Interview' || applicationSession?.state === 'Interview') return 'Interview';
  if (applicationSession?.state === 'Waiting for You' || role.status === 'Blocked' || role.status === 'Needs You') return 'Needs You';
  if (applicationSession && ['Preparing', 'Applying', 'Paused'].includes(applicationSession.state)) return 'Applying';
  if (['Package Ready', 'Awaiting Approval'].includes(role.status)) return 'Package Ready';
  if (['Verified', 'Verified - Package Preparation'].includes(role.status)) return 'Verified';
  if (role.status === 'Submitted') return 'Applying';
  return 'Found';
}

export function statusTab(status) {
  if (status === 'Needs You') return 'Needs You';
  if (status === 'Submitted' || status === 'Receipt Verified') return 'Submitted';
  if (status === 'Interview') return 'Interviews';
  if (status === 'Follow-up Due') return 'Follow-ups';
  if (status === 'Rejected/Closed') return 'Closed';
  if (['Verified', 'Package Ready', 'Applying'].includes(status)) return 'Preparing';
  return 'Matches';
}

export function statusBadgeClass(status) {
  return `status-${String(status || 'Found').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export function missionStats(roles = [], applicationSessions = [], openActionCount = 0) {
  const normalized = roles.map(role => {
    const session = applicationSessions.find(item => item.packageRunId && item.packageRunId === role.packageRunId) || null;
    return { role, session, status: subscriberStatus(role, session) };
  });
  const sessionOnly = applicationSessions.filter(session => !roles.some(role => role.packageRunId && role.packageRunId === session.packageRunId));
  for (const session of sessionOnly) normalized.push({ role: {}, session, status: subscriberStatus({}, session) });
  return {
    new: normalized.filter(item => item.status === 'Found').length,
    verifiedMatches: normalized.filter(item => item.status === 'Verified').length,
    packagesReady: normalized.filter(item => item.status === 'Package Ready').length,
    applying: normalized.filter(item => item.status === 'Applying').length,
    needsYou: Math.max(0, Number(openActionCount) || 0),
    blocked: normalized.filter(item => item.role?.status === 'Blocked').length,
    submitted: normalized.filter(item => item.status === 'Receipt Verified').length,
    interviews: normalized.filter(item => item.status === 'Interview').length,
    followUpDue: normalized.filter(item => item.status === 'Follow-up Due').length,
    rejectedClosed: normalized.filter(item => item.status === 'Rejected/Closed').length,
  };
}

export function canonicalConversation(messages = [], limit = 4) {
  const unique = [];
  const seen = new Set();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] || {};
    const normalized = String(message.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const key = `${message.role || ''}|${normalized}`;
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    unique.unshift(message);
    if (unique.length >= limit) break;
  }
  return unique;
}

export function needsYouKind(type = '') {
  const labels = {
    OTP: 'One-time code', CAPTCHA: 'Security check', IDENTITY_VERIFICATION: 'Identity verification',
    MISSING_FACT: 'Missing factual answer', AMBIGUOUS_FACT: 'Missing factual answer',
    OUTSIDE_EMPLOYMENT_CONFLICT: 'Outside-employment conflict', NONSTANDARD_CERTIFICATION: 'Unusual employer certification',
    SALARY_DISCREPANCY: 'Salary discrepancy', TRAVEL_DISCREPANCY: 'Travel discrepancy',
    QUALIFICATION_DISCREPANCY: 'Qualification discrepancy', TRANSMISSION_APPROVAL: 'Sharing approval',
    SUBMISSION_APPROVAL: 'Final submission', RECEIPT_VERIFICATION: 'Verify employer receipt', LOGIN: 'Employer sign-in', FOLLOW_UP_DUE: 'Follow-up reminder',
  };
  return labels[String(type).toUpperCase()] || 'Your decision';
}

const PROVIDER_LABELS = Object.freeze({
  greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', smartrecruiters: 'SmartRecruiters',
});

export function directSourceCoverage(run = null) {
  const sourceSummary = Array.isArray(run?.result?.sourceSummary) ? run.result.sourceSummary : [];
  const providers = new Map();
  for (const source of sourceSummary) {
    const provider = String(source?.provider || '').toLowerCase();
    if (!provider) continue;
    const current = providers.get(provider) || { provider, label: PROVIDER_LABELS[provider] || provider, checked: 0, healthy: 0, partial: 0, unavailable: 0, found: 0 };
    current.checked += 1;
    current.found += Math.max(0, Number(source?.found) || 0);
    if (source?.status === 'ok') current.healthy += 1;
    else if (source?.status === 'partial') current.partial += 1;
    else current.unavailable += 1;
    providers.set(provider, current);
  }
  const healthy = sourceSummary.filter(source => source?.status === 'ok').length;
  const partial = sourceSummary.filter(source => source?.status === 'partial').length;
  const unavailable = Math.max(0, sourceSummary.length - healthy - partial);
  const active = ['Searching', 'Preparing'].includes(run?.status);
  return {
    state: active ? 'searching' : !sourceSummary.length ? 'not-run' : unavailable || partial ? 'partial' : 'healthy',
    checked: sourceSummary.length,
    healthy,
    partial,
    unavailable,
    providers: [...providers.values()].sort((a, b) => a.label.localeCompare(b.label)),
    requests: sourceSummary.reduce((sum, source) => sum + Math.max(0, Number(source?.requestCount) || 0), 0),
    verifiedMatches: Math.max((run?.result?.jobs || []).filter(job => job?.applyPathVerified === true).length, Math.max(0, Number(run?.result?.filterSummary?.returned) || 0)),
    llmTokens: sourceSummary.reduce((sum, source) => sum + Math.max(0, Number(source?.llmTokens) || 0), 0),
    checkedAt: run?.result?.completedAt || run?.updatedAt || null,
  };
}

function timestampValue(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestTimestamp(items = []) {
  return items.reduce((latest, item) => {
    const candidate = item?.updatedAt || item?.createdAt || item?.receipt?.receivedAt || item?.receipt?.submittedAt || null;
    return timestampValue(candidate) > timestampValue(latest) ? candidate : latest;
  }, null);
}

export function maskedActivityFeed({ run = null, roles = [], applicationSessions = [], openActionCount = 0 } = {}, limit = 5) {
  const rows = [];
  const coverage = directSourceCoverage(run);
  const add = (kind, label, detail, at) => rows.push({ kind, label, detail, at: at || null });
  if (['Searching', 'Preparing'].includes(run?.status)) {
    add('working', 'Direct-employer search is running', 'The durable run can resume if a source is slow.', run.updatedAt);
  } else if (run?.status === 'Finished' && run?.taskType === 'direct_employer_discovery') {
    const responding = coverage.healthy + coverage.partial;
    add('complete', 'Direct-employer search completed', `${coverage.verifiedMatches} verified match${coverage.verifiedMatches === 1 ? '' : 'es'} from ${responding} responding source${responding === 1 ? '' : 's'}.`, coverage.checkedAt);
  } else if (run?.status === 'Failed') {
    add('attention', 'Search paused safely', 'Progress is saved. A retry is required before more sources are checked.', run.updatedAt);
  }
  if (coverage.state === 'partial') {
    add('attention', 'Some employer sources need retry', `${coverage.partial + coverage.unavailable} of ${coverage.checked} checked sources were partial or unavailable; healthy results were kept.`, coverage.checkedAt);
  }
  const verified = roles.filter(role => ['Verified', 'Verified - Package Preparation'].includes(role?.status)).length;
  if (verified) add('verified', 'Verified matches ready for preparation', `${verified} direct-employer match${verified === 1 ? '' : 'es'} passed the current mission filters.`, latestTimestamp(roles));
  const readyRoles = roles.filter(role => role?.status === 'Package Ready');
  if (readyRoles.length) add('prepared', 'Application packages ready', `${readyRoles.length} role-specific package${readyRoles.length === 1 ? '' : 's'} can be reviewed.`, latestTimestamp(readyRoles));
  const receipts = authoritativeReceiptCount([...roles, ...applicationSessions]);
  if (receipts) add('receipt', 'Employer receipts verified', `${receipts} application${receipts === 1 ? '' : 's'} counted as submitted.`, latestTimestamp([...roles, ...applicationSessions]));
  const actions = Math.max(0, Number(openActionCount) || 0);
  if (actions) add('attention', 'Waiting for you', `${actions} saved step${actions === 1 ? '' : 's'} need${actions === 1 ? 's' : ''} your decision. Other safe work can continue.`, latestTimestamp(applicationSessions));
  return rows.sort((a, b) => timestampValue(b.at) - timestampValue(a.at)).slice(0, Math.max(1, Math.min(10, Number(limit) || 5)));
}
