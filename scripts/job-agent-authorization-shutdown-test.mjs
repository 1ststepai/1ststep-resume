import assert from 'node:assert/strict';
import { shutdownTenantJobAgentAuthorization } from '../lib/job-agent-authorization-shutdown.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

const partitionSecret = 'authorization-shutdown-partition-secret-0001';
const config = { redis: {}, partitionSecret, dataEncryptionKey: 'unused-in-injected-test', auditSigningSecret: 'unused-in-injected-test' };
const subject = 'candidate-a@example.test';
const tenantId = jobAgentTenantId(subject, partitionSecret);
const updates = [];
const runUpdates = [];

function application(id, state, workerExecution = null) {
  return {
    version: 2, audit: { count: 1 }, id, state, stage: 'employer_form', updatedAt: '2026-08-30T18:00:00.000Z',
    role: { employer: 'Example Employer', title: 'Buyer', requisitionId: 'REQ-1', directEmployerUrl: 'https://jobs.example.test/apply/REQ-1' },
    documentVersion: 'resume-v1', proposedFields: [{ fieldKey: 'email', factId: 'fact_email' }], actions: [], timeline: [], workerExecution,
    approvals: { transmission: { id: 'approval-fixture', scopeHash: 'a'.repeat(64), confirmedAt: '2026-08-30T18:00:00.000Z', expiresAt: '2026-08-30T19:00:00.000Z', consumedAt: null, approvedFieldKeys: ['email'] } },
  };
}

const dependencies = {
  cancelTasks: async input => {
    assert.equal(input.tenantId, tenantId);
    return { cancelled: 1, executing: 1, cancelledTaskIds: ['task-queued'], executingTaskIds: ['task-executing'], reconciliationRequired: true };
  },
  cancelSubmissionTasks: async input => {
    assert.equal(input.tenantId, tenantId);
    return { cancelled: 0, executing: 0, cancelledTaskIds: [], executingTaskIds: [], reconciliationRequired: false };
  },
  cancelReceiptTasks: async input => { assert.equal(input.tenantId, tenantId); return { cancelled: 2 }; },
  closeSessions: async input => {
    assert.equal(input.subject, subject);
    const error = new Error('provider unavailable');
    error.closed = 1;
    error.retryRequired = 2;
    throw error;
  },
  listRuns: async input => {
    assert.equal(input.subject, subject);
    assert.equal(input.limit, 500);
    return [{ id: 'run-active', status: 'Searching' }, { id: 'run-finished', status: 'Finished' }];
  },
  setRunStatus: async input => { runUpdates.push(input); return { id: input.runId, status: input.status }; },
  listApplications: async input => {
    assert.equal(input.limit, 500);
    return [
      application('application-queued', 'Preparing', { id: 'task-queued', status: 'queued' }),
      application('application-executing', 'Preparing', { id: 'task-executing', status: 'executing' }),
      application('application-ordinary', 'Waiting for You'),
      application('application-finished', 'Finished'),
    ];
  },
  updateApplication: async input => { updates.push(input); return { version: input.expectedVersion + 1, ...input.session }; },
  pauseSchedule: async input => { assert.equal(input.tenantId, tenantId); return { status: 'paused' }; },
};

const result = await shutdownTenantJobAgentAuthorization({ config, subject, dependencies, now: new Date('2026-08-30T18:10:00.000Z') });
assert.deepEqual(result, {
  cancelledBrowserTasks: 1, executingBrowserTasks: 1, closedBrowserSessions: 1, retainedBrowserSessions: 2,
  cancelledSubmissionTasks: 0, executingSubmissionTasks: 0, cancelledReceiptTasks: 2,
  pausedRuns: 1, pausedApplications: 2, pausedSchedule: true,
  browserTaskReconciliationRequired: true, submissionTaskReconciliationRequired: false, browserSessionCloseRetryRequired: true,
  authorizationShutdownReconciliationRequired: true,
});
assert.equal(runUpdates.length, 1);
assert.equal(updates.some(item => item.sessionId === 'application-executing'), false);
const queued = updates.find(item => item.sessionId === 'application-queued').session;
assert.equal(queued.state, 'Paused');
assert.equal(queued.workerExecution.status, 'cancelled');
assert.equal(queued.timeline.at(-1).kind, 'TRANSMISSION_RESERVATION_CANCELLED');
assert.equal(queued.timeline.at(-1).summary.includes('No personal data was transmitted'), true);
assert.equal(queued.actions.filter(action => action.type === 'TRANSMISSION_APPROVAL' && action.status === 'open').length, 1);
assert.equal(updates.find(item => item.sessionId === 'application-ordinary').session.state, 'Paused');
assert.equal(JSON.stringify(result).includes('candidate-a@example.test'), false);
assert.equal(JSON.stringify(result).includes('task-queued'), false);

const otherSubject = 'candidate-b@example.test';
let otherTenant;
await shutdownTenantJobAgentAuthorization({
  config, subject: otherSubject,
  dependencies: {
    cancelTasks: async input => { otherTenant = input.tenantId; return { cancelled: 0, executing: 0 }; },
    cancelSubmissionTasks: async () => ({ cancelled: 0, executing: 0 }),
    cancelReceiptTasks: async () => ({ cancelled: 0 }),
    closeSessions: async () => ({ closed: 0 }), listRuns: async () => [], listApplications: async () => [],
    pauseSchedule: async () => null,
  },
});
assert.equal(otherTenant, jobAgentTenantId(otherSubject, partitionSecret));
assert.notEqual(otherTenant, tenantId);

console.log('Tenant-scoped Job Agent authorization shutdown, pre-start cancellation, in-flight reconciliation, provider-close retry, and content-free reporting tests passed.');
