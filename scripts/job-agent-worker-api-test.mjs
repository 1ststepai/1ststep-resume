import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeJobAgentWorkerCycle, maxDuration } from '../api/job-agent-worker.js';

const deploymentConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.equal(maxDuration, deploymentConfig.functions['api/job-agent-worker.js'].maxDuration, 'worker duration must match the deployed Vercel bound');
assert.equal(maxDuration, 60, 'worker must preserve the bounded 60-second drain contract from the recovery runbook');

const events = [];
const heartbeats = [];
let cleanupRuns = 0;
const queueReaders = {
  readSubmissionQueue: async () => ({ status: 'idle', pending: 0, overdue: 0, reconciliationPending: 0, reconciliationDue: 0, contentFree: true }),
  readReceiptQueue: async () => ({ status: 'idle', pending: 0, overdue: 0, contentFree: true, containsReceiptEvidence: false }),
  readAccountExportQueue: async () => ({ status: 'idle', pending: 0, overdue: 0, overdueAfterSeconds: 300, contentFree: true, containsCandidateValues: false, containsAccountIdentifiers: false }),
};
const scheduleResults = [
  { status: 'enqueued', runId: 'run_fixture_1' },
  { status: 'enqueued', runId: 'run_fixture_1', replayed: true },
  { status: 'deferred', reason: 'GLOBAL_DAILY_SCHEDULE_BUDGET' },
];
const success = await executeJobAgentWorkerCycle({
  ...queueReaders,
  config: { redis: {} }, env: {}, query: { scheduleLimit: '3', limit: '1' },
  processSchedule: async () => scheduleResults.shift() || null,
  processRun: async () => ({ id: 'run_recovery_1', status: 'Finished', attempt: 2 }),
  processNotification: async () => ({ status: 'provider-accepted', attempt: 1, recipientActionVerified: false }),
  processFollowUp: async () => ({ status: 'enqueued', attempt: 1, containsEmployerData: false }),
  reconcileSpend: async () => ({ status: 'completed', examined: 1, settledAtMaximum: 1, staleIndexEntriesRemoved: 0, releasedCents: 0 }),
  processBrowserSessionCleanup: async () => cleanupRuns++ === 0 ? ({ status: 'cleaned', providerConfirmed: true }) : ({ status: 'idle' }),
  browserConfiguration: () => ({ enabled: true }),
  reconcileBrowserTask: async () => ({ status: 'idle' }),
  processBrowserTask: async () => ({ status: 'completed', transmittedFieldCount: 2, externalApplicationExecution: true, submitted: false }),
  recordEvent: async event => { events.push(event); },
  recordHeartbeat: async value => { heartbeats.push(value.outcome); },
  clock: () => new Date('2026-08-30T04:00:00.000Z'),
});
assert.equal(success.httpStatus, 200);
assert.equal(success.body.submissionsEnabled, false);
assert.equal(success.body.scheduledCount, 3);
assert.equal(success.body.count, 1);
assert.equal(success.body.notificationCount, 1);
assert.equal(success.body.followUpCount, 1);
assert.equal(success.body.browserTaskCount, 1);
assert.equal(success.body.browserSessionCleanupCount, 1);
assert.deepEqual(success.body.browserSessionCleanup, [{ status: 'cleaned', providerConfirmed: true }]);
assert.deepEqual(success.body.browserReconciliation, { status: 'idle' });
assert.deepEqual(success.body.browserTasks, [{ status: 'completed', transmittedFieldCount: 2, submitted: false }]);
assert.deepEqual(success.body.notifications, [{ status: 'provider-accepted', attempt: 1 }]);
assert.deepEqual(success.body.followUps, [{ status: 'enqueued', attempt: 1 }]);
assert.equal(success.body.monetarySpendReconciliation.settledAtMaximum, 1);
assert.deepEqual(events, ['background_worker_invocation', 'monetary_spend_reconciled', 'employer_browser_session_cleanup_completed', 'schedule_enqueued', 'schedule_replayed', 'schedule_deferred', 'needs_you_notification_queued', 'needs_you_notification_provider_accepted', 'employer_browser_task_completed']);
assert.deepEqual(heartbeats, ['started', 'succeeded']);

const reconciliationEvents = [];
const recovered = await executeJobAgentWorkerCycle({
  ...queueReaders,
  config: { redis: {} }, env: {}, query: { scheduleLimit: '0', notificationLimit: '0', browserLimit: '1' },
  processSchedule: async () => null,
  processRun: async () => null,
  processNotification: async () => null,
  reconcileSpend: async () => ({ status: 'idle', examined: 0, settledAtMaximum: 0, staleIndexEntriesRemoved: 0, releasedCents: 0 }),
  processBrowserSessionCleanup: async () => ({ status: 'idle' }),
  browserConfiguration: () => ({ enabled: true }),
  reconcileBrowserTask: async () => ({ status: 'outcome-unknown' }),
  processBrowserTask: async () => ({ status: 'idle' }),
  recordEvent: async event => { reconciliationEvents.push(event); },
  recordHeartbeat: async () => {},
  clock: () => new Date('2026-08-30T04:02:00.000Z'),
});
assert.equal(recovered.httpStatus, 200);
assert.deepEqual(recovered.body.browserReconciliation, { status: 'outcome-unknown' });
assert.deepEqual(reconciliationEvents, ['background_worker_invocation', 'employer_browser_task_outcome_unknown']);

const expiryEvents = [];
const expiryCycle = await executeJobAgentWorkerCycle({
  ...queueReaders,
  config: { redis: {} }, env: {}, query: { scheduleLimit: '0', notificationLimit: '0', browserLimit: '1', browserCleanupLimit: '0' },
  processSchedule: async () => null, processRun: async () => null, processNotification: async () => null,
  reconcileSpend: async () => ({ status: 'idle', examined: 0, settledAtMaximum: 0, staleIndexEntriesRemoved: 0, releasedCents: 0 }),
  processBrowserSessionCleanup: async () => ({ status: 'idle' }), browserConfiguration: () => ({ enabled: true }),
  reconcileBrowserTask: async () => ({ status: 'idle' }),
  processBrowserTask: async () => ({ status: 'approval-expired', reasonCode: 'TRANSMISSION_APPROVAL_EXPIRED', externalApplicationExecution: false, submitted: false }),
  recordEvent: async event => { expiryEvents.push(event); }, recordHeartbeat: async () => {},
  clock: () => new Date('2026-08-30T04:03:00.000Z'),
});
assert.equal(expiryCycle.httpStatus, 200);
assert.deepEqual(expiryCycle.body.browserTasks, [{ status: 'approval-expired', transmittedFieldCount: 0, submitted: false }]);
assert.deepEqual(expiryEvents, ['background_worker_invocation', 'employer_browser_task_approval_expired']);

const submissionEvents = [];
const submissionCycle = await executeJobAgentWorkerCycle({
  ...queueReaders,
  config: { redis: {} }, env: {}, query: { scheduleLimit: '0', notificationLimit: '0', followUpLimit: '0', browserCleanupLimit: '0', browserLimit: '0', submissionLimit: '1' },
  processSchedule: async () => null, processRun: async () => null, processNotification: async () => null, processFollowUp: async () => null,
  reconcileSpend: async () => ({ status: 'idle', examined: 0, settledAtMaximum: 0, staleIndexEntriesRemoved: 0, releasedCents: 0 }),
  processBrowserSessionCleanup: async () => ({ status: 'idle' }), browserConfiguration: () => ({ enabled: false }),
  submissionConfiguration: () => ({ ready: true }), reconcileSubmissionTask: async () => ({ status: 'idle' }),
  processSubmissionTask: async () => ({ status: 'attempt-recorded', submitted: true, authoritativeReceiptVerified: false }),
  recordEvent: async event => { submissionEvents.push(event); }, recordHeartbeat: async () => {},
  clock: () => new Date('2026-08-30T04:04:00.000Z'),
});
assert.equal(submissionCycle.httpStatus, 200);
assert.equal(submissionCycle.body.submissionsEnabled, true);
assert.deepEqual(submissionCycle.body.submissionReconciliation, { status: 'idle' });
assert.deepEqual(submissionCycle.body.submissionTasks, [{ status: 'attempt-recorded', submitted: true, authoritativeReceiptVerified: false }]);
assert.deepEqual(submissionEvents, ['background_worker_invocation', 'application_submission_attempt_recorded']);

const receiptEvents = [];
const receiptAlerts = [];
const receiptCycle = await executeJobAgentWorkerCycle({
  ...queueReaders,
  config: { redis: {} }, env: {}, query: { scheduleLimit: '0', notificationLimit: '0', followUpLimit: '0', browserCleanupLimit: '0', browserLimit: '0', submissionLimit: '0', receiptLimit: '1' },
  processSchedule: async () => null, processRun: async () => null, processNotification: async () => null, processFollowUp: async () => null,
  reconcileSpend: async () => ({ status: 'idle', examined: 0, settledAtMaximum: 0, staleIndexEntriesRemoved: 0, releasedCents: 0 }),
  processBrowserSessionCleanup: async () => ({ status: 'idle' }), browserConfiguration: () => ({ enabled: false }),
  submissionConfiguration: () => ({ ready: false }), receiptConfiguration: () => ({ ready: true }),
  processReceiptTask: async () => ({ status: 'verified', authoritativeReceiptVerified: true }),
  sendAlert: async event => { receiptAlerts.push(event); },
  recordEvent: async event => { receiptEvents.push(event); }, recordHeartbeat: async () => {},
  clock: () => new Date('2026-08-30T04:04:30.000Z'),
});
assert.deepEqual(receiptCycle.body.receiptTasks, [{ status: 'verified', authoritativeReceiptVerified: true }]);
assert.deepEqual(receiptEvents, ['background_worker_invocation', 'authoritative_receipt_verified']);
assert.deepEqual(receiptAlerts, []);

const receiptFailureEvents = [];
const receiptFailureAlerts = [];
const receiptFailureCycle = await executeJobAgentWorkerCycle({
  ...queueReaders,
  config: { redis: {} }, env: {}, query: { scheduleLimit: '0', notificationLimit: '0', followUpLimit: '0', browserCleanupLimit: '0', browserLimit: '0', submissionLimit: '0', receiptLimit: '1' },
  processSchedule: async () => null, processRun: async () => null, processNotification: async () => null, processFollowUp: async () => null,
  reconcileSpend: async () => ({ status: 'idle', examined: 0, settledAtMaximum: 0, staleIndexEntriesRemoved: 0, releasedCents: 0 }),
  processBrowserSessionCleanup: async () => ({ status: 'idle' }), browserConfiguration: () => ({ enabled: false }),
  submissionConfiguration: () => ({ ready: false }), receiptConfiguration: () => ({ ready: true }),
  processReceiptTask: async () => ({ status: 'manual-reconciliation-required', authoritativeReceiptVerified: false }),
  recordEvent: async event => { receiptFailureEvents.push(event); }, sendAlert: async event => { receiptFailureAlerts.push(event); }, recordHeartbeat: async () => {},
  clock: () => new Date('2026-08-30T04:04:40.000Z'),
});
assert.equal(receiptFailureCycle.httpStatus, 200);
assert.deepEqual(receiptFailureEvents, ['background_worker_invocation', 'authoritative_receipt_failure']);
assert.deepEqual(receiptFailureAlerts, ['authoritative_receipt_failure']);

const queueAttentionEvents = [];
const queueAttentionAlerts = [];
const queueAttention = await executeJobAgentWorkerCycle({
  ...queueReaders,
  config: { redis: {} }, env: {}, query: { scheduleLimit: '0', notificationLimit: '0', followUpLimit: '0', browserCleanupLimit: '0', browserLimit: '0', submissionLimit: '0', receiptLimit: '0' },
  processSchedule: async () => null, processRun: async () => null, processNotification: async () => null, processFollowUp: async () => null,
  reconcileSpend: async () => ({ status: 'idle', examined: 0, settledAtMaximum: 0, staleIndexEntriesRemoved: 0, releasedCents: 0 }),
  processBrowserSessionCleanup: async () => ({ status: 'idle' }), browserConfiguration: () => ({ enabled: false }), submissionConfiguration: () => ({ ready: false }), receiptConfiguration: () => ({ ready: false }),
  readSubmissionQueue: async () => ({ status: 'attention-required', pending: 1, overdue: 1, reconciliationPending: 2, reconciliationDue: 1, contentFree: true }),
  readReceiptQueue: async () => ({ status: 'pending', pending: 2, overdue: 0, contentFree: true, containsReceiptEvidence: false }),
  recordEvent: async event => { queueAttentionEvents.push(event); }, sendAlert: async event => { queueAttentionAlerts.push(event); }, recordHeartbeat: async () => {},
  clock: () => new Date('2026-08-30T04:04:50.000Z'),
});
assert.equal(queueAttention.httpStatus, 200);
assert.equal(queueAttention.body.consequentialQueueHealth.status, 'attention-required');
assert.equal(queueAttention.body.consequentialQueueHealth.containsCandidateValues, false);
assert.deepEqual(queueAttentionEvents, ['background_worker_invocation', 'consequential_queue_attention_required']);
assert.deepEqual(queueAttentionAlerts, ['consequential_queue_attention_required']);

const exportQueueEvents = [];
const exportQueueAlerts = [];
const exportQueueAttention = await executeJobAgentWorkerCycle({
  ...queueReaders,
  config: { redis: {} }, env: {}, query: { scheduleLimit: '0', notificationLimit: '0', followUpLimit: '0', browserCleanupLimit: '0', browserLimit: '0', submissionLimit: '0', receiptLimit: '0' },
  processSchedule: async () => null, processRun: async () => null, processNotification: async () => null, processFollowUp: async () => null,
  reconcileSpend: async () => ({ status: 'idle', examined: 0, settledAtMaximum: 0, staleIndexEntriesRemoved: 0, releasedCents: 0 }),
  processBrowserSessionCleanup: async () => ({ status: 'idle' }), browserConfiguration: () => ({ enabled: false }), submissionConfiguration: () => ({ ready: false }), receiptConfiguration: () => ({ ready: false }),
  readAccountExportQueue: async () => ({ status: 'attention-required', pending: 3, overdue: 1, overdueAfterSeconds: 300, contentFree: true, containsCandidateValues: false, containsAccountIdentifiers: false }),
  recordEvent: async event => { exportQueueEvents.push(event); }, sendAlert: async event => { exportQueueAlerts.push(event); }, recordHeartbeat: async () => {},
  clock: () => new Date('2026-08-30T04:04:52.000Z'),
});
assert.equal(exportQueueAttention.httpStatus, 200);
assert.deepEqual(exportQueueAttention.body.accountExportQueueHealth, { status: 'attention-required', pending: 3, overdue: 1, overdueAfterSeconds: 300, contentFree: true, containsCandidateValues: false, containsAccountIdentifiers: false });
assert.deepEqual(exportQueueEvents, ['background_worker_invocation', 'account_export_queue_attention_required']);
assert.deepEqual(exportQueueAlerts, ['account_export_queue_attention_required']);

const queueFailureEvents = [];
const queueFailureAlerts = [];
const queueFailureLogs = [];
const queueFailure = await executeJobAgentWorkerCycle({
  ...queueReaders,
  config: { redis: {} }, env: {}, query: { scheduleLimit: '0', notificationLimit: '0', followUpLimit: '0', browserCleanupLimit: '0', browserLimit: '0', submissionLimit: '0', receiptLimit: '0' },
  processSchedule: async () => null, processRun: async () => null, processNotification: async () => null, processFollowUp: async () => null,
  reconcileSpend: async () => ({ status: 'idle', examined: 0, settledAtMaximum: 0, staleIndexEntriesRemoved: 0, releasedCents: 0 }),
  processBrowserSessionCleanup: async () => ({ status: 'idle' }), browserConfiguration: () => ({ enabled: false }), submissionConfiguration: () => ({ ready: false }), receiptConfiguration: () => ({ ready: false }),
  readSubmissionQueue: async () => { throw new Error('private queue detail must not escape'); },
  recordEvent: async event => { queueFailureEvents.push(event); }, sendAlert: async event => { queueFailureAlerts.push(event); }, recordHeartbeat: async () => {}, logError: value => { queueFailureLogs.push(value); },
  clock: () => new Date('2026-08-30T04:04:55.000Z'),
});
assert.equal(queueFailure.httpStatus, 500);
assert.deepEqual(queueFailure.body.consequentialQueueHealth, { status: 'unknown', contentFree: true, containsCandidateValues: false, submission: null, receipt: null });
assert.doesNotMatch(JSON.stringify(queueFailure.body), /private queue detail/);
assert.deepEqual(queueFailureEvents, ['background_worker_invocation', 'consequential_queue_observation_failure']);
assert.deepEqual(queueFailureAlerts, ['consequential_queue_observation_failure']);
assert.equal(queueFailureLogs.length, 1);
assert.doesNotMatch(queueFailureLogs[0], /private queue detail/);

const failedEvents = [];
const failedHeartbeats = [];
const failedLogs = [];
const failed = await executeJobAgentWorkerCycle({
  ...queueReaders,
  config: { redis: {} }, env: {}, query: {},
  processSchedule: async () => { throw new Error('private candidate payload must not escape'); },
  processRun: async () => null,
  reconcileSpend: async () => ({ status: 'idle', examined: 0, settledAtMaximum: 0, staleIndexEntriesRemoved: 0, releasedCents: 0 }),
  processBrowserSessionCleanup: async () => ({ status: 'idle' }),
  recordEvent: async event => { failedEvents.push(event); },
  recordHeartbeat: async value => { failedHeartbeats.push(value.outcome); },
  logError: value => { failedLogs.push(value); },
  clock: () => new Date('2026-08-30T04:05:00.000Z'),
});
assert.equal(failed.httpStatus, 500);
assert.equal(failed.body.ok, false);
assert.equal(failed.body.submissionsEnabled, false);
assert.doesNotMatch(JSON.stringify(failed.body), /private candidate payload/);
assert.deepEqual(failedEvents, ['background_worker_invocation', 'schedule_failure']);
assert.deepEqual(failedHeartbeats, ['started', 'failed']);
assert.equal(failedLogs.length, 1);
assert.doesNotMatch(failedLogs[0], /private candidate payload/);

console.log('Job Agent worker heartbeat, content-free scheduler metrics, bounded drain, and safe failure tests passed.');
