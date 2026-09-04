import { beginReservedApplicationTransmission, completeReservedApplicationTransmission, expireReservedApplicationTransmission, failReservedApplicationTransmission } from './application-session-domain.js';
import { readDurableApplicationSessionForTenant, updateDurableApplicationSessionAsWorker } from './application-session-store.js';
import { readApplicantVaultForTenant } from './applicant-vault-store.js';
import { acknowledgeEmployerBrowserTaskReconciliation, cancelEmployerBrowserTaskBeforeStart, claimNextEmployerBrowserTask, finishEmployerBrowserTask, markNextStaleEmployerBrowserTaskUnknown, reconcileEmployerBrowserTaskCompleted, startEmployerBrowserTask } from './employer-browser-task-store.js';
import { executeEmployerBrowserCheckpoint } from './employer-browser-worker.js';
import { requireConfiguredJobAgentConsentForTenant } from './job-agent-consent-store.js';

function privateSession(publicSession) {
  if (!publicSession) return null;
  const { version, audit: _audit, ...session } = publicSession;
  return { version, session };
}

function workerErrorCode(error) {
  const message = String(error?.message || '').toUpperCase();
  if (/APPROVAL.*EXPIRED|EXPIRED.*APPROVAL|EXPIRED_TASK/.test(message)) return 'TRANSMISSION_APPROVAL_EXPIRED';
  if (/TIMEOUT|ABORT/.test(message)) return 'SANDBOX_TIMEOUT';
  if (/VAULT|CONSENT|REUSABLE/.test(message)) return 'VAULT_FACT_REVIEW_REQUIRED';
  if (/SCHEMA|MISMATCH|PLAN/.test(message)) return 'EMPLOYER_SCHEMA_CHANGED';
  return 'EMPLOYER_WORKER_OUTCOME_UNKNOWN';
}

export async function reconcileNextStaleEmployerBrowserTask({ redis, dataEncryptionKey, auditSigningSecret, deps = {}, now = new Date() } = {}) {
  const markStale = deps.markStale || markNextStaleEmployerBrowserTaskUnknown;
  const readSession = deps.readSession || readDurableApplicationSessionForTenant;
  const updateSession = deps.updateSession || updateDurableApplicationSessionAsWorker;
  const acknowledge = deps.acknowledge || acknowledgeEmployerBrowserTaskReconciliation;
  const reconcileCompleted = deps.reconcileCompleted || reconcileEmployerBrowserTaskCompleted;
  const stale = await markStale({ redis, dataEncryptionKey, now });
  if (!stale) return { status: 'idle' };
  const { task, tenantId } = stale;
  const restored = privateSession(await readSession({ redis, tenantId, dataEncryptionKey, sessionId: task.payload.sessionId }));
  if (!restored) {
    await acknowledge({ redis, taskId: task.id });
    return { status: 'orphaned-outcome-unknown' };
  }
  const execution = restored.session.workerExecution;
  if (execution?.id !== task.id || execution.fieldSchemaHash !== task.payload.fieldSchemaHash) return { status: 'manual-reconciliation-required' };
  if (execution.status === 'completed') {
    const transmitted = restored.session.transmissionAttempt?.transmittedFieldKeys || [];
    const reconciled = await reconcileCompleted({ redis, taskId: task.id, dataEncryptionKey, transmittedFieldKeys: transmitted, now });
    return { status: reconciled ? 'completed-from-checkpoint' : 'manual-reconciliation-required' };
  }
  if (execution.status === 'executing') {
    const failed = failReservedApplicationTransmission(restored.session, { taskId: task.id, failureCode: 'EMPLOYER_WORKER_OUTCOME_UNKNOWN' }, now);
    const saved = await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: failed.id, expectedVersion: restored.version, session: failed, now });
    if (!saved) return { status: 'manual-reconciliation-required' };
    await acknowledge({ redis, taskId: task.id });
    return { status: 'outcome-unknown' };
  }
  if (execution.status === 'outcome-unknown') {
    await acknowledge({ redis, taskId: task.id });
    return { status: 'outcome-unknown' };
  }
  return { status: 'manual-reconciliation-required' };
}

export async function processNextEmployerBrowserTask({
  redis, dataEncryptionKey, auditSigningSecret, env = process.env, SandboxImpl,
  deps = {}, now = new Date(),
} = {}) {
  const claimNext = deps.claimNext || claimNextEmployerBrowserTask;
  const readSession = deps.readSession || readDurableApplicationSessionForTenant;
  const updateSession = deps.updateSession || updateDurableApplicationSessionAsWorker;
  const readVault = deps.readVault || readApplicantVaultForTenant;
  const startTask = deps.startTask || startEmployerBrowserTask;
  const finishTask = deps.finishTask || finishEmployerBrowserTask;
  const cancelTask = deps.cancelTask || cancelEmployerBrowserTaskBeforeStart;
  const requireConsent = deps.requireConsent || requireConfiguredJobAgentConsentForTenant;
  const execute = deps.execute || executeEmployerBrowserCheckpoint;
  const clock = deps.clock || (() => new Date());
  const eventNow = () => new Date(Math.max(new Date(clock()).getTime(), new Date(now).getTime()));
  const claimed = await claimNext({ redis, dataEncryptionKey, now });
  if (!claimed) return { status: 'idle', externalApplicationExecution: false };
  const { task, tenantId, leaseToken } = claimed;
  let savedExecuting = null;
  let taskStarted = false;
  try {
    const consent = await requireConsent({ redis, dataEncryptionKey }, tenantId, env);
    if (!consent?.ok) {
      await cancelTask({ redis, taskId: task.id, dataEncryptionKey, reasonCode: 'JOB_AGENT_AUTHORIZATION_REVOKED', now });
      return { status: 'cancelled', reasonCode: consent?.code || 'JOB_AGENT_CONSENT_REQUIRED', externalApplicationExecution: false, submitted: false };
    }
    if (!task.payload?.stagedFields?.length) throw new Error('EMPLOYER_SCHEMA_MISMATCH');
    const restored = privateSession(await readSession({ redis, tenantId, dataEncryptionKey, sessionId: task.payload.sessionId }));
    const restoredExecution = restored?.session?.workerExecution;
    if (restored && restoredExecution?.id === task.id && restoredExecution?.fieldSchemaHash === task.payload.fieldSchemaHash && restoredExecution.status === 'cancelled') {
      const reasonCode = restoredExecution.failureCode || 'EMPLOYER_TASK_CANCELLED_BEFORE_START';
      const cancelled = await cancelTask({ redis, taskId: task.id, dataEncryptionKey, reasonCode, now });
      if (!cancelled) throw new Error('EMPLOYER_CANCELLED_TASK_RECONCILIATION_FAILED');
      return { status: 'cancelled-from-session-checkpoint', reasonCode, externalApplicationExecution: false, submitted: false };
    }
    if (!restored || restoredExecution?.id !== task.id || restoredExecution?.status !== 'queued'
      || restoredExecution?.fieldSchemaHash !== task.payload.fieldSchemaHash) throw new Error('EMPLOYER_TASK_SESSION_MISMATCH');
    const executionConsent = await requireConsent({ redis, dataEncryptionKey }, tenantId, env);
    if (!executionConsent?.ok) {
      await cancelTask({ redis, taskId: task.id, dataEncryptionKey, reasonCode: 'JOB_AGENT_AUTHORIZATION_REVOKED', now });
      return { status: 'cancelled', reasonCode: executionConsent?.code || 'JOB_AGENT_CONSENT_REQUIRED', externalApplicationExecution: false, submitted: false };
    }
    let beginning;
    const executionStartedAt = eventNow();
    try {
      beginning = beginReservedApplicationTransmission(restored.session, { taskId: task.id }, executionStartedAt);
    } catch (error) {
      if (!/approval expired before execution/i.test(String(error?.message || ''))) throw error;
      const expired = expireReservedApplicationTransmission(restored.session, { taskId: task.id }, executionStartedAt);
      const savedExpired = await updateSession({
        redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: expired.id,
        expectedVersion: restored.version, session: expired, now: executionStartedAt,
      });
      if (!savedExpired) throw new Error('EMPLOYER_EXPIRED_APPROVAL_NOT_PERSISTED');
      const cancelled = await cancelTask({ redis, taskId: task.id, dataEncryptionKey, reasonCode: 'TRANSMISSION_APPROVAL_EXPIRED', now: executionStartedAt });
      if (!cancelled) throw new Error('EMPLOYER_EXPIRED_TASK_NOT_CANCELLED');
      return { status: 'approval-expired', reasonCode: 'TRANSMISSION_APPROVAL_EXPIRED', externalApplicationExecution: false, submitted: false };
    }
    const begun = await updateSession({
      redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: beginning.id,
      expectedVersion: restored.version, session: beginning, now: executionStartedAt,
    });
    if (!begun) throw new Error('EMPLOYER_SESSION_START_NOT_PERSISTED');
    savedExecuting = privateSession(begun);
    const started = await startTask({ redis, taskId: task.id, leaseToken, dataEncryptionKey, now: executionStartedAt });
    if (!started) throw new Error('EMPLOYER_TASK_START_NOT_PERSISTED');
    taskStarted = true;
    const { vault } = await readVault({ redis, tenantId, dataEncryptionKey });
    const plan = {
      status: 'ready-to-fill', target: { hostname: new URL(savedExecuting.session.role.directEmployerUrl).hostname.toLowerCase(), pageUrl: savedExecuting.session.formCheckpoint.pageUrl || savedExecuting.session.role.directEmployerUrl },
      fieldSchemaHash: task.payload.fieldSchemaHash, stagedFields: task.payload.stagedFields,
      leftUnanswered: [], actions: [], transmissionAuthorized: true, finalSubmissionAuthorized: false,
    };
    const execution = await execute({ plan, vault, env, SandboxImpl });
    if (execution?.status !== 'checkpoint-preserved' || execution.checkpoint?.submission !== 'none') throw new Error('EMPLOYER_WORKER_RESULT_MISMATCH');
    const completedSession = completeReservedApplicationTransmission(savedExecuting.session, {
      taskId: task.id, transmittedFieldKeys: execution.checkpoint.stagedFieldKeys,
    }, eventNow());
    const savedCompleted = await updateSession({
      redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: completedSession.id,
      expectedVersion: savedExecuting.version, session: completedSession, now: eventNow(),
    });
    if (!savedCompleted) throw new Error('EMPLOYER_SESSION_COMPLETION_NOT_PERSISTED');
    await finishTask({
      redis, taskId: task.id, leaseToken, dataEncryptionKey, status: 'completed',
      result: { code: 'FILLED_WITHOUT_SUBMIT', transmittedFieldKeys: execution.checkpoint.stagedFieldKeys }, now: eventNow(),
    });
    return { status: 'completed', transmittedFieldCount: execution.checkpoint.stagedFieldKeys.length, externalApplicationExecution: true, submitted: false };
  } catch (error) {
    const failureCode = workerErrorCode(error);
    if (savedExecuting?.session?.workerExecution?.status === 'executing') {
      try {
        const failed = failReservedApplicationTransmission(savedExecuting.session, { taskId: task.id, failureCode }, eventNow());
        await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: failed.id, expectedVersion: savedExecuting.version, session: failed, now: eventNow() });
      } catch { /* the stale-task reconciler remains fail closed */ }
    }
    if (taskStarted) {
      await finishTask({ redis, taskId: task.id, leaseToken, dataEncryptionKey, status: 'outcome-unknown', result: { code: failureCode, transmittedFieldKeys: [] }, now: eventNow() }).catch(() => {});
    }
    return { status: taskStarted ? 'outcome-unknown' : 'not-started', errorCode: failureCode, externalApplicationExecution: taskStarted, submitted: false };
  }
}
