import assert from 'node:assert/strict';
import { mock } from 'node:test';
// Mock every external-capability boundary before importing the real cycle.
mock.module('../lib/api-security.js', { namedExports: { applyApiHeaders: () => {} } });
mock.module('../lib/job-agent-worker.js', { namedExports: { jobAgentRuntimeConfiguration: () => ({ enabled: false, ready: false }), processNextJobAgentRun: async () => null } });
mock.module('../lib/job-agent-schedule-store.js', { namedExports: { processNextJobAgentSchedule: async () => null } });
mock.module('../lib/job-agent-operational-metrics.js', { namedExports: { recordJobAgentOperationalEvent: async () => null, recordJobAgentWorkerExecution: async () => null } });
mock.module('../lib/job-agent-notification-store.js', { namedExports: { processNextNeedsYouNotification: async () => null } });
mock.module('../lib/job-agent-object-storage.js', { namedExports: { processExpiredApplicationPackageArtifacts: async () => ({ status: 'idle', deleted: 0 }) } });
mock.module('../lib/employer-browser-task-worker.js', { namedExports: { processNextEmployerBrowserTask: async () => null, reconcileNextStaleEmployerBrowserTask: async () => null } });
mock.module('../lib/employer-browser-worker.js', { namedExports: { employerBrowserWorkerConfiguration: () => ({ enabled: false, ready: false }) } });
mock.module('../lib/employer-browser-session-cleanup.js', { namedExports: { processNextExpiredEmployerBrowserSession: async () => null } });
mock.module('../lib/job-agent-spend-ledger.js', { namedExports: { reconcileStaleJobAgentSpendReservations: async () => ({ status: 'idle', deleted: 0 }) } });
mock.module('../lib/application-follow-up-store.js', { namedExports: { processNextApplicationFollowUpReminder: async () => null } });
mock.module('../lib/application-submission-task-worker.js', { namedExports: { applicationSubmissionTaskWorkerConfiguration: () => ({ enabled: false, ready: false }), processNextApplicationSubmissionTask: async () => null, reconcileNextStaleApplicationSubmissionTask: async () => null } });
mock.module('../lib/application-receipt-task-worker.js', { namedExports: { applicationReceiptTaskWorkerConfiguration: () => ({ enabled: false, ready: false }), processNextApplicationReceiptTask: async () => null } });
mock.module('../lib/job-agent-operator-alert.js', { namedExports: { sendConfiguredJobAgentOperatorAlert: async () => null } });
mock.module('../lib/job-agent-operator-alert-outbox.js', { namedExports: { processNextJobAgentOperatorAlert: async () => null, readJobAgentOperatorAlertQueueHealth: async () => ({ status: 'idle' }) } });
mock.module('../lib/application-submission-task-store.js', { namedExports: { readApplicationSubmissionTaskQueueHealth: async () => ({ status: 'idle' }) } });
mock.module('../lib/application-receipt-task-store.js', { namedExports: { readApplicationReceiptTaskQueueHealth: async () => ({ status: 'idle' }) } });
mock.module('../lib/account-data-export-task.js', { namedExports: { processExpiredAccountDataExports: async () => ({ status: 'idle', deleted: 0 }), processNextAccountDataExportTask: async () => null, readAccountDataExportQueueHealth: async () => ({ status: 'idle' }) } });
mock.module('../lib/account-data-export-builder.js', { namedExports: { buildCompleteAccountDataExport: async () => null } });
mock.module('../lib/job-agent-continuous-improvement-worker.js', { namedExports: { jobAgentLearningConfiguration: () => ({ enabled: false, ready: false }), processNextJobAgentLearningMaintenance: async () => null } });

const { executeJobAgentWorkerCycle, default: handler } = await import('../api/job-agent-worker.js');
const noop = async () => null;
const base = { config: { redis: {} }, env: {}, recordEvent: noop, recordExecution: noop,
  reconcileSpend: async () => ({ status: 'idle' }), processAccountExportCleanup: async () => ({ deleted: 0 }),
  query: { limit: 3 } };
let active = 0, peak = 0, calls = 0;
const normal = await executeJobAgentWorkerCycle({ ...base, processRun: async () => {
  active++; peak = Math.max(peak, active); calls++; await Promise.resolve(); active--;
  if (calls === 1) throw new Error('synthetic blocked job');
  return { id: `run_synthetic_${calls}`, status: 'Finished', attempt: 1 };
}, logError: noop });
assert.equal(calls, 3, 'blocked job must not stop unrelated bounded work');
assert.equal(peak, 1, 'cycle concurrency remains serial');
assert.equal(normal.body.count, 2);
assert.equal(normal.body.submissionsEnabled, false);
assert.equal(normal.body.browserTaskCount, 0);
assert.equal(normal.body.submissionTaskCount, 0);
assert.equal(normal.body.receiptTaskCount, 0);
let starts = 0;
const exhausted = await executeJobAgentWorkerCycle({ ...base, budgetMs: 0, processRun: async () => { starts++; } });
assert.equal(exhausted.httpStatus, 503);
assert.equal(exhausted.body.outcome, 'unknown');
assert.equal(starts, 0);
// Accelerated timer exercises an adapter that never resolves, without network.
const stalled = await executeJobAgentWorkerCycle({ ...base, budgetMs: 10,
  reconcileSpend: () => new Promise(() => {}), processRun: async () => { starts++; } });
assert.equal(stalled.httpStatus, 503);
assert.equal(stalled.body.outcome, 'unknown');
assert.equal(starts, 0);
assert.equal(stalled.body.count, undefined, 'ambiguous invocation claims no completed count');
const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
await handler({ method: 'GET', headers: {} }, res);
assert.equal(res.code, 401, 'worker remains authenticated');
mock.restoreAll();
console.log('Queue cycle synthetic tests passed: serial bound, isolated failure, deadline, stall, auth and disabled external gates.');
