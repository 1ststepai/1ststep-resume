import assert from 'node:assert/strict';
import { beginReservedApplicationTransmission, confirmApplicationApproval, createApplicationSession, expireReservedApplicationTransmission, preserveApplicationFormCheckpoint, reserveApplicationTransmission } from '../lib/application-session-domain.js';
import { processNextEmployerBrowserTask, reconcileNextStaleEmployerBrowserTask } from '../lib/employer-browser-task-worker.js';

const taskId = 'browser_task_worker_fixture';
const schemaHash = 'd'.repeat(64);
function queuedSession() {
  let session = createApplicationSession({
    packageRunId: 'run_browser_worker_fixture', packageQaVerified: true, documentVersion: 'resume-v1',
    employer: 'Example Employer', title: 'Buyer', requisitionId: 'REQ-1', directEmployerUrl: 'https://jobs.example.test/apply/REQ-1',
    proposedFields: [{ fieldKey: 'email', label: 'Email', factId: 'fact_email_fixture', maskedPreview: 'j•••@example.test', confidence: 1, provenance: 'user-confirmed', ordinaryVerified: true }],
  }, new Date('2026-08-30T17:00:00.000Z'));
  session = confirmApplicationApproval(session, { kind: 'transmission', confirmed: true }, new Date('2026-08-30T17:01:00.000Z'));
  session = preserveApplicationFormCheckpoint(session, { pageUrl: session.role.directEmployerUrl, stepKey: 'employer-form', fieldSchemaHash: schemaHash, stagedFieldKeys: ['email'] }, new Date('2026-08-30T17:01:10.000Z'));
  return reserveApplicationTransmission(session, { taskId, fieldSchemaHash: schemaHash, stagedFieldKeys: ['email'] }, new Date('2026-08-30T17:01:20.000Z'));
}
const task = { id: taskId, payload: { sessionId: queuedSession().id, fieldSchemaHash: schemaHash, stagedFieldKeys: ['email'], stagedFields: [{ fieldRef: 'field_email', fieldKey: 'email', factId: 'fact_email_fixture' }] } };
const vault = { consent: { status: 'granted', scopes: ['confirmed-facts'] }, facts: [{ id: 'fact_email_fixture', fieldKey: 'email', status: 'active', currentVersion: 1, versions: [{ version: 1, value: 'jordan@example.test', verificationState: 'user-confirmed', confidence: 1, autoReuse: true }] }] };

function dependencies({ crash = false } = {}) {
  const order = [];
  let current = queuedSession();
  task.payload.sessionId = current.id;
  let version = 2;
  return {
    order,
    deps: {
      claimNext: async () => ({ task, tenantId: 'a'.repeat(40), leaseToken: 'lease-token' }),
      clock: () => new Date('2026-08-30T17:01:30.000Z'),
      requireConsent: async () => ({ ok: true }),
      readSession: async () => ({ version, audit: { count: 2 }, ...current }),
      updateSession: async ({ session }) => { order.push(`session:${session.workerExecution.status}`); current = session; version += 1; return { version, audit: { count: version }, ...current }; },
      startTask: async () => { order.push('task:started'); return { status: 'executing' }; },
      readVault: async () => ({ vault }),
      execute: async ({ plan, vault: suppliedVault }) => {
        order.push('sandbox:execute');
        assert.equal(order.indexOf('session:executing') < order.indexOf('sandbox:execute'), true);
        assert.equal(order.indexOf('task:started') < order.indexOf('sandbox:execute'), true);
        assert.equal(suppliedVault, vault);
        if (crash) throw new Error('synthetic sandbox timeout');
        return { status: 'checkpoint-preserved', checkpoint: { stagedFieldKeys: plan.stagedFields.map(item => item.fieldKey), submission: 'none' } };
      },
      finishTask: async ({ status }) => { order.push(`task:${status}`); return { status }; },
    },
  };
}

const successDeps = dependencies();
const completed = await processNextEmployerBrowserTask({ deps: successDeps.deps, now: new Date('2026-08-30T17:01:30.000Z') });
assert.equal(completed.status, 'completed', JSON.stringify(completed));
assert.equal(completed.submitted, false);
assert.equal(completed.externalApplicationExecution, true);
assert.deepEqual(successDeps.order, ['session:executing', 'task:started', 'sandbox:execute', 'session:completed', 'task:completed']);

const failureDeps = dependencies({ crash: true });
const failed = await processNextEmployerBrowserTask({ deps: failureDeps.deps, now: new Date('2026-08-30T17:01:30.000Z') });
assert.equal(failed.status, 'outcome-unknown');
assert.equal(failed.errorCode, 'SANDBOX_TIMEOUT');
assert.equal(failed.submitted, false);
assert.deepEqual(failureDeps.order, ['session:executing', 'task:started', 'sandbox:execute', 'session:outcome-unknown', 'task:outcome-unknown']);

const expiredDeps = dependencies();
expiredDeps.deps.clock = () => new Date('2026-08-30T17:16:01.000Z');
expiredDeps.deps.cancelTask = async ({ reasonCode }) => { expiredDeps.order.push(`task:${reasonCode}`); return { status: 'cancelled' }; };
const expired = await processNextEmployerBrowserTask({ deps: expiredDeps.deps, now: new Date('2026-08-30T17:15:59.000Z') });
assert.deepEqual(expired, { status: 'approval-expired', reasonCode: 'TRANSMISSION_APPROVAL_EXPIRED', externalApplicationExecution: false, submitted: false });
assert.deepEqual(expiredDeps.order, ['session:cancelled', 'task:TRANSMISSION_APPROVAL_EXPIRED']);

const cancelledCheckpoint = expireReservedApplicationTransmission(queuedSession(), { taskId }, new Date('2026-08-30T17:16:01.000Z'));
let checkpointCancellation = '';
const convergedCancellation = await processNextEmployerBrowserTask({
  deps: {
    claimNext: async () => ({ task, tenantId: 'a'.repeat(40), leaseToken: 'lease-token' }), requireConsent: async () => ({ ok: true }),
    readSession: async () => ({ version: 4, audit: { count: 4 }, ...cancelledCheckpoint }),
    cancelTask: async ({ reasonCode }) => { checkpointCancellation = reasonCode; return { status: 'cancelled' }; },
    updateSession: async () => { throw new Error('a cancelled checkpoint must not be rewritten'); },
    startTask: async () => { throw new Error('a cancelled checkpoint must not start'); },
    execute: async () => { throw new Error('a cancelled checkpoint must not load candidate values'); },
  },
  now: new Date('2026-08-30T17:17:00.000Z'),
});
assert.equal(convergedCancellation.status, 'cancelled-from-session-checkpoint');
assert.equal(convergedCancellation.externalApplicationExecution, false);
assert.equal(checkpointCancellation, 'TRANSMISSION_APPROVAL_EXPIRED');

const idle = await processNextEmployerBrowserTask({ deps: { claimNext: async () => null } });
assert.deepEqual(idle, { status: 'idle', externalApplicationExecution: false });

let revokedTaskCancelled = false;
const revoked = await processNextEmployerBrowserTask({
  deps: {
    claimNext: async () => ({ task, tenantId: 'a'.repeat(40), leaseToken: 'lease-token' }),
    requireConsent: async () => ({ ok: false, code: 'JOB_AGENT_CONSENT_REQUIRED' }),
    cancelTask: async ({ reasonCode }) => { revokedTaskCancelled = reasonCode === 'JOB_AGENT_AUTHORIZATION_REVOKED'; return { status: 'cancelled' }; },
    readSession: async () => { throw new Error('revoked work must not restore an application session'); },
  },
});
assert.deepEqual(revoked, { status: 'cancelled', reasonCode: 'JOB_AGENT_CONSENT_REQUIRED', externalApplicationExecution: false, submitted: false });
assert.equal(revokedTaskCancelled, true);

const staleExecuting = dependencies();
let acknowledged = false;
const reconciledUnknown = await reconcileNextStaleEmployerBrowserTask({
  now: new Date('2026-08-30T17:10:00.000Z'),
  deps: {
    markStale: async () => ({ task, tenantId: 'a'.repeat(40) }),
    readSession: staleExecuting.deps.readSession,
    updateSession: staleExecuting.deps.updateSession,
    acknowledge: async () => { acknowledged = true; },
  },
});
assert.equal(reconciledUnknown.status, 'manual-reconciliation-required', 'a queued session must never be rewritten as if external execution had started');
assert.equal(acknowledged, false);

const executingForRecovery = beginReservedApplicationTransmission(queuedSession(), { taskId }, new Date('2026-08-30T17:01:30.000Z'));
let recoveredSession = null;
acknowledged = false;
const reconciledExecuting = await reconcileNextStaleEmployerBrowserTask({
  now: new Date('2026-08-30T17:10:00.000Z'),
  deps: {
    markStale: async () => ({ task, tenantId: 'a'.repeat(40) }),
    readSession: async () => ({ version: 4, audit: { count: 4 }, ...executingForRecovery }),
    updateSession: async ({ session }) => { recoveredSession = session; return { version: 5, ...session }; },
    acknowledge: async () => { acknowledged = true; },
  },
});
assert.equal(reconciledExecuting.status, 'outcome-unknown');
assert.equal(recoveredSession.state, 'Waiting for You');
assert.equal(recoveredSession.workerExecution.status, 'outcome-unknown');
assert.equal(acknowledged, true);

const completedState = dependencies();
await processNextEmployerBrowserTask({ deps: completedState.deps, now: new Date('2026-08-30T17:01:30.000Z') });
let completionRecovered = false;
const reconciledCompleted = await reconcileNextStaleEmployerBrowserTask({
  now: new Date('2026-08-30T17:10:00.000Z'),
  deps: {
    markStale: async () => ({ task, tenantId: 'a'.repeat(40) }),
    readSession: completedState.deps.readSession,
    reconcileCompleted: async ({ transmittedFieldKeys }) => { completionRecovered = transmittedFieldKeys[0] === 'email'; return { status: 'completed' }; },
  },
});
assert.equal(reconciledCompleted.status, 'completed-from-checkpoint');
assert.equal(completionRecovered, true);

console.log('Browser task worker single-use ordering, approval-expiry cancellation, vault handoff, no-submit completion, crash outcome-unknown, and idle tests passed.');
