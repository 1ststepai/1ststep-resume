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
    return { role, status: subscriberStatus(role, session) };
  });
  const sessionOnly = applicationSessions.filter(session => !roles.some(role => role.packageRunId && role.packageRunId === session.packageRunId));
  for (const session of sessionOnly) normalized.push({ role: {}, status: subscriberStatus({}, session) });
  return {
    verifiedMatches: normalized.filter(item => item.status !== 'Found').length,
    packagesReady: normalized.filter(item => ['Package Ready', 'Applying', 'Needs You', 'Submitted', 'Receipt Verified', 'Follow-up Due', 'Interview', 'Rejected/Closed'].includes(item.status)).length,
    needsYou: Math.max(0, Number(openActionCount) || 0),
    submitted: normalized.filter(item => item.status === 'Receipt Verified').length,
    interviews: normalized.filter(item => item.status === 'Interview').length,
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
