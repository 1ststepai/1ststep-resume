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
