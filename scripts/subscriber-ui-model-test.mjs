import assert from 'node:assert/strict';
import { canonicalConversation, missionStats, needsYouKind, statusTab, subscriberStatus } from '../lib/subscriber-ui-model.js';

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
assert.deepEqual(stats, { verifiedMatches: 4, packagesReady: 4, needsYou: 2, submitted: 1, interviews: 1 });

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

console.log('subscriber UI model tests passed');
