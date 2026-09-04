import assert from 'node:assert/strict';
import { authoritativeReceiptCount, canonicalConversation, directSourceCoverage, maskedActivityFeed, missionStats, needsYouKind, statusTab, subscriberStatus } from '../lib/subscriber-ui-model.js';

const role = { id: 'role-1', packageRunId: 'package-1', status: 'Found' };
assert.equal(subscriberStatus(role), 'Found');
assert.equal(subscriberStatus({ ...role, status: 'Verified' }), 'Verified');
assert.equal(subscriberStatus({ ...role, status: 'Package Ready' }), 'Package Ready');
assert.equal(subscriberStatus({ ...role, status: 'Rejected/Closed' }), 'Rejected/Closed');
assert.equal(subscriberStatus({ ...role, activityStatus: 'Closed by direct page' }), 'Rejected/Closed');
assert.equal(subscriberStatus(role, { packageRunId: 'package-1', state: 'Preparing' }), 'Applying');
assert.equal(subscriberStatus(role, { packageRunId: 'package-1', state: 'Waiting for You' }), 'Needs You');
assert.equal(subscriberStatus({ ...role, status: 'Submitted' }), 'Applying');
assert.equal(subscriberStatus({ ...role, status: 'Submitted', receipt: { simulated: true, confirmationId: 'demo' } }), 'Applying');
assert.equal(subscriberStatus({ ...role, status: 'Submitted', receipt: { confirmationId: 'EMP-123', receivedAt: '2026-08-29T10:00:00Z' } }), 'Receipt Verified');
assert.equal(statusTab('Found'), 'Matches');
assert.equal(statusTab('Package Ready'), 'Preparing');
assert.equal(statusTab('Needs You'), 'Needs You');
assert.equal(statusTab('Receipt Verified'), 'Submitted');
assert.equal(statusTab('Interview'), 'Interviews');
assert.equal(statusTab('Follow-up Due'), 'Follow-ups');
assert.equal(statusTab('Rejected/Closed'), 'Closed');
const durableReceipt = { receipt: { confirmationId: 'EMP-789' }, postSubmission: { status: 'INTERVIEW', followUp: { status: 'NOT_SCHEDULED' } } };
assert.equal(subscriberStatus(role, durableReceipt), 'Interview');
assert.equal(subscriberStatus(role, { ...durableReceipt, postSubmission: { status: 'INTERVIEW', followUp: { status: 'SCHEDULED', dueAt: '2020-01-01T00:00:00.000Z' } } }), 'Follow-up Due');
assert.equal(subscriberStatus(role, { ...durableReceipt, postSubmission: { status: 'REJECTED_CLOSED', followUp: { status: 'NOT_SCHEDULED' } } }), 'Rejected/Closed');
assert.equal(subscriberStatus(role, { closedBeforeSubmission: { source: 'direct-employer-reverification' } }), 'Rejected/Closed');

const stats = missionStats([
  role,
  { id: 'role-2', status: 'Package Ready' },
  { id: 'role-3', status: 'Submitted', receipt: { confirmationId: 'EMP-456' } },
  { id: 'role-4', status: 'Interview' },
  { id: 'role-5', status: 'Submitted', receipt: { simulated: true, confirmationId: 'demo' } },
], [], 2);
assert.deepEqual(stats, { new: 1, verifiedMatches: 0, packagesReady: 1, applying: 1, needsYou: 2, blocked: 0, submitted: 1, interviews: 1, followUpDue: 0, rejectedClosed: 0 });
const exactStates = missionStats([
  { id: 'blocked', status: 'Blocked' },
  { id: 'closed', status: 'Rejected/Closed' },
], [{ id: 'follow-up', postSubmission: { followUp: { status: 'SCHEDULED', dueAt: '2020-01-01T00:00:00.000Z' } } }], 1);
assert.equal(exactStates.blocked, 1);
assert.equal(exactStates.followUpDue, 1);
assert.equal(exactStates.rejectedClosed, 1);

const messages = canonicalConversation([
  { role: 'user', html: 'Find jobs' },
  { role: 'assistant', html: '<strong>Saved</strong>' },
  { role: 'user', html: 'Find jobs' },
  { role: 'assistant', html: '<strong>Saved</strong>' },
  { role: 'assistant', html: 'Current status' },
]);
assert.deepEqual(messages.map(item => item.html), ['Find jobs', '<strong>Saved</strong>', 'Current status']);
assert.equal(needsYouKind('CAPTCHA'), 'Security check');
assert.equal(needsYouKind('OUTSIDE_EMPLOYMENT_CONFLICT'), 'Outside-employment conflict');
assert.equal(needsYouKind('FOLLOW_UP_DUE'), 'Follow-up reminder');
assert.equal(needsYouKind('RECEIPT_VERIFICATION'), 'Verify employer receipt');

const discoveryRun = {
  taskType: 'direct_employer_discovery', status: 'Finished', updatedAt: '2026-09-01T12:00:00Z',
  result: {
    completedAt: '2026-09-01T12:01:00Z',
    jobs: [{ applyPathVerified: true }, { applyPathVerified: false }],
    sourceSummary: [
      { provider: 'greenhouse', status: 'ok', found: 2, requestCount: 1, llmTokens: 0 },
      { provider: 'smartrecruiters', status: 'partial', found: 1, requestCount: 2, llmTokens: 0 },
      { provider: 'smartrecruiters', status: 'error', found: 0, requestCount: 1, llmTokens: 0 },
    ],
  },
};
const coverage = directSourceCoverage(discoveryRun);
assert.deepEqual({ state: coverage.state, checked: coverage.checked, healthy: coverage.healthy, partial: coverage.partial, unavailable: coverage.unavailable, requests: coverage.requests, verifiedMatches: coverage.verifiedMatches, llmTokens: coverage.llmTokens }, { state: 'partial', checked: 3, healthy: 1, partial: 1, unavailable: 1, requests: 4, verifiedMatches: 1, llmTokens: 0 });
assert.equal(coverage.providers.find(provider => provider.provider === 'smartrecruiters').checked, 2);
assert.equal(directSourceCoverage({ status: 'Searching' }).state, 'searching');
assert.equal(directSourceCoverage(null).state, 'not-run');

const activity = maskedActivityFeed({
  run: discoveryRun,
  roles: [{ status: 'Package Ready', packageDraft: { version: 1 }, updatedAt: '2026-09-01T12:02:00Z' }],
  openActionCount: 1,
});
assert.ok(activity.some(item => item.label === 'Direct-employer search completed'));
assert.ok(activity.some(item => item.label === 'Some employer sources need retry'));
assert.ok(activity.some(item => item.label === 'Application packages ready'));
assert.ok(activity.some(item => item.label === 'Waiting for you'));
assert.doesNotMatch(JSON.stringify(activity), /password|otp|captcha|email|phone|address|candidate/i);

const deduplicatedReceipts = maskedActivityFeed({
  roles: [{ id: 'role-receipt', packageRunId: 'package-receipt', receipt: { confirmationId: 'EMP-001' } }],
  applicationSessions: [{ id: 'session-receipt', packageRunId: 'package-receipt', receipt: { confirmationId: 'EMP-001' } }],
});
assert.match(deduplicatedReceipts.find(item => item.label === 'Employer receipts verified').detail, /^1 application counted/);
assert.equal(authoritativeReceiptCount([
  { id: 'role-today', packageRunId: 'package-today', receipt: { confirmationId: 'EMP-TODAY', receivedAt: '2026-09-01T10:00:00Z' } },
  { id: 'session-today', packageRunId: 'package-today', receipt: { confirmationId: 'EMP-TODAY', receivedAt: '2026-09-01T10:00:00Z' } },
  { id: 'role-old', receipt: { confirmationId: 'EMP-OLD', receivedAt: '2026-08-31T10:00:00Z' } },
  { id: 'role-simulated', receipt: { simulated: true, confirmationId: 'DEMO', receivedAt: '2026-09-01T10:00:00Z' } },
], new Date('2026-09-01T12:00:00Z')), 1);

console.log('subscriber UI model tests passed');
