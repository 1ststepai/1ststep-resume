import { beginReservedApplicationSubmission, cancelArmedApplicationSubmissionBeforeProvider, cancelReservedApplicationSubmission, completeReservedApplicationSubmission, expireReservedApplicationSubmission, failReservedApplicationSubmission } from './application-session-domain.js';
import { executeApplicationSubmissionProvider, applicationSubmissionProviderConfiguration } from './application-submission-provider.js';
import { readDurableApplicationSessionForTenant, updateDurableApplicationSessionAsWorker } from './application-session-store.js';
import { acknowledgeApplicationSubmissionTaskReconciliation, cancelApplicationSubmissionTaskBeforeStart, claimNextApplicationSubmissionTask, finishApplicationSubmissionTask, markNextStaleApplicationSubmissionTaskUnknown, startApplicationSubmissionTask } from './application-submission-task-store.js';
import { readEmployerBrowserSessionForTenantApplication } from './employer-browser-session-store.js';
import { requireConfiguredJobAgentConsentForTenant } from './job-agent-consent-store.js';
import { verifyJobAgentLaunchEvidence } from './job-agent-launch-evidence.js';
import { prepareApplicationReceiptTaskRecord } from './application-receipt-task-store.js';
import { applicationReceiptTaskWorkerConfiguration } from './application-receipt-task-worker.js';

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
function enabled(value) { return String(value || '').toLowerCase() === 'true'; }

export function applicationSubmissionTaskWorkerConfiguration(env = process.env, { now = new Date() } = {}) {
  const active = enabled(env.JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_ENABLED);
  const approved = enabled(env.JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_APPROVED);
  const approvalVersion = String(env.JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_APPROVAL_VERSION || '');
  const employerTermsReviewVersion = String(env.EMPLOYER_TERMS_REVIEW_VERSION || '');
  const assistedApplicationApproved = enabled(env.JOB_AGENT_ASSISTED_APPLICATION_APPROVED);
  const assistedApplicationApprovalVersion = String(env.JOB_AGENT_ASSISTED_APPLICATION_APPROVAL_VERSION || '');
  const controlledBetaApproved = enabled(env.JOB_AGENT_CONTROLLED_BETA_APPROVED);
  const controlledBetaApprovalVersion = String(env.JOB_AGENT_CONTROLLED_BETA_APPROVAL_VERSION || '');
  const provider = applicationSubmissionProviderConfiguration(env);
  const receiptWorker = applicationReceiptTaskWorkerConfiguration(env);
  const evidence = verifyJobAgentLaunchEvidence(env.JOB_AGENT_FINAL_SUBMISSION_EXECUTION_EVIDENCE, { kind: 'final-submission-execution', env, now });
  let reason = null;
  if (!active) reason = 'final-submission-durable-execution-disabled';
  else if (!approved || !VERSION.test(approvalVersion)) reason = 'final-submission-durable-execution-not-approved';
  else if (!provider.ready) reason = 'final-submission-provider-not-ready';
  else if (!receiptWorker.ready) reason = 'authoritative-receipt-worker-not-ready';
  else if (!VERSION.test(employerTermsReviewVersion)) reason = 'employer-terms-review-not-recorded';
  else if (!assistedApplicationApproved || !VERSION.test(assistedApplicationApprovalVersion)) reason = 'assisted-application-not-approved';
  else if (!controlledBetaApproved || !VERSION.test(controlledBetaApprovalVersion)) reason = 'controlled-beta-not-approved';
  else if (!evidence.verified) reason = 'final-submission-supervised-execution-not-verified';
  return { enabled: active, approved, ready: reason === null, reason, approvalVersion: VERSION.test(approvalVersion) ? approvalVersion : null, providerReady: provider.ready === true, receiptWorkerReady: receiptWorker.ready === true, evidenceVerified: evidence.verified === true };
}

export function publicApplicationSubmissionTaskWorkerConfiguration(configuration = {}) {
  return { enabled: configuration.enabled === true, approved: configuration.approved === true, ready: configuration.ready === true, reason: configuration.reason || null, approvalVersion: configuration.approvalVersion || null, providerReady: configuration.providerReady === true, receiptWorkerReady: configuration.receiptWorkerReady === true, evidenceVerified: configuration.evidenceVerified === true };
}

function privateSession(publicSession) {
  if (!publicSession) return null;
  const { version, audit: _audit, ...session } = publicSession;
  return { version, session };
}

function taskMatchesSession(task, session) {
  const execution = session?.submissionExecution;
  return execution?.id === task.id && execution.scopeHash === task.payload.scopeHash
    && execution.documentVersion === task.payload.documentVersion && execution.fieldSchemaHash === task.payload.fieldSchemaHash;
}

export async function reconcileNextStaleApplicationSubmissionTask({ redis, dataEncryptionKey, auditSigningSecret, deps = {}, now = new Date() } = {}) {
  const markStale = deps.markStale || markNextStaleApplicationSubmissionTaskUnknown;
  const readSession = deps.readSession || readDurableApplicationSessionForTenant;
  const updateSession = deps.updateSession || updateDurableApplicationSessionAsWorker;
  const acknowledge = deps.acknowledge || acknowledgeApplicationSubmissionTaskReconciliation;
  const stale = await markStale({ redis, dataEncryptionKey, now });
  if (!stale) return { status: 'idle' };
  const { task, tenantId } = stale;
  const restored = privateSession(await readSession({ redis, tenantId, dataEncryptionKey, sessionId: task.payload.sessionId }));
  if (!restored) { await acknowledge({ redis, taskId: task.id }); return { status: 'orphaned-outcome-unknown' }; }
  if (!taskMatchesSession(task, restored.session)) return { status: 'manual-reconciliation-required' };
  if (restored.session.submissionExecution.status === 'completed' && restored.session.submissionAttempt) {
    await acknowledge({ redis, taskId: task.id });
    return { status: 'completed-from-session-checkpoint' };
  }
  if (restored.session.submissionExecution.status === 'executing') {
    const failed = failReservedApplicationSubmission(restored.session, { taskId: task.id, failureCode: 'SUBMISSION_PROVIDER_OUTCOME_UNKNOWN' }, now);
    const saved = await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: failed.id, expectedVersion: restored.version, session: failed, now });
    if (!saved) return { status: 'manual-reconciliation-required' };
    await acknowledge({ redis, taskId: task.id });
    return { status: 'outcome-unknown' };
  }
  if (restored.session.submissionExecution.status === 'outcome-unknown') { await acknowledge({ redis, taskId: task.id }); return { status: 'outcome-unknown' }; }
  return { status: 'manual-reconciliation-required' };
}

export async function processNextApplicationSubmissionTask({ redis, dataEncryptionKey, auditSigningSecret, env = process.env, deps = {}, now = new Date() } = {}) {
  const configuration = applicationSubmissionTaskWorkerConfiguration(env, { now });
  if (!configuration.ready) return { status: 'not-configured', reason: configuration.reason, externalApplicationExecution: false, submitted: false };
  const claimNext = deps.claimNext || claimNextApplicationSubmissionTask;
  const readSession = deps.readSession || readDurableApplicationSessionForTenant;
  const updateSession = deps.updateSession || updateDurableApplicationSessionAsWorker;
  const readBrowserSession = deps.readBrowserSession || readEmployerBrowserSessionForTenantApplication;
  const startTask = deps.startTask || startApplicationSubmissionTask;
  const finishTask = deps.finishTask || finishApplicationSubmissionTask;
  const cancelTask = deps.cancelTask || cancelApplicationSubmissionTaskBeforeStart;
  const requireConsent = deps.requireConsent || requireConfiguredJobAgentConsentForTenant;
  const execute = deps.execute || executeApplicationSubmissionProvider;
  const prepareReceiptTask = deps.prepareReceiptTask || prepareApplicationReceiptTaskRecord;
  const clock = deps.clock || (() => new Date());
  const eventNow = () => new Date(Math.max(new Date(clock()).getTime(), new Date(now).getTime()));
  const claimed = await claimNext({ redis, dataEncryptionKey, now });
  if (!claimed) return { status: 'idle', externalApplicationExecution: false, submitted: false };
  const { task, tenantId, leaseToken } = claimed;
  let savedExecuting = null;
  let taskStarted = false;
  try {
    const consent = await requireConsent({ redis, dataEncryptionKey }, tenantId, env);
    if (!consent?.ok) {
      await cancelTask({ redis, taskId: task.id, dataEncryptionKey, reasonCode: 'JOB_AGENT_AUTHORIZATION_REVOKED', now });
      const restoredAfterRevocation = privateSession(await readSession({ redis, tenantId, dataEncryptionKey, sessionId: task.payload.sessionId }));
      if (restoredAfterRevocation && taskMatchesSession(task, restoredAfterRevocation.session) && ['queued', 'executing'].includes(restoredAfterRevocation.session.submissionExecution?.status)) {
        const cancelledSession = restoredAfterRevocation.session.submissionExecution.status === 'executing'
          ? cancelArmedApplicationSubmissionBeforeProvider(restoredAfterRevocation.session, { taskId: task.id, failureCode: 'JOB_AGENT_AUTHORIZATION_REVOKED' }, now)
          : cancelReservedApplicationSubmission(restoredAfterRevocation.session, { taskId: task.id, failureCode: 'JOB_AGENT_AUTHORIZATION_REVOKED' }, now);
        await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: cancelledSession.id, expectedVersion: restoredAfterRevocation.version, session: cancelledSession, now });
      }
      return { status: 'cancelled', reasonCode: consent?.code || 'JOB_AGENT_CONSENT_REQUIRED', externalApplicationExecution: false, submitted: false };
    }
    const restored = privateSession(await readSession({ redis, tenantId, dataEncryptionKey, sessionId: task.payload.sessionId }));
    if (!restored || !taskMatchesSession(task, restored.session)) throw new Error('SUBMISSION_TASK_SESSION_MISMATCH');
    const execution = restored.session.submissionExecution;
    if (['cancelled', 'cancelled-before-provider'].includes(execution.status)) {
      await cancelTask({ redis, taskId: task.id, dataEncryptionKey, reasonCode: execution.failureCode || 'SUBMISSION_TASK_CANCELLED_BEFORE_START', now });
      return { status: 'cancelled-from-session-checkpoint', externalApplicationExecution: false, submitted: false };
    }
    const executionConsent = await requireConsent({ redis, dataEncryptionKey }, tenantId, env);
    if (!executionConsent?.ok) {
      let cancelledSession = execution.status === 'executing'
        ? cancelArmedApplicationSubmissionBeforeProvider(restored.session, { taskId: task.id, failureCode: 'JOB_AGENT_AUTHORIZATION_REVOKED' }, eventNow())
        : cancelReservedApplicationSubmission(restored.session, { taskId: task.id, failureCode: 'JOB_AGENT_AUTHORIZATION_REVOKED' }, eventNow());
      await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: cancelledSession.id, expectedVersion: restored.version, session: cancelledSession, now: eventNow() });
      await cancelTask({ redis, taskId: task.id, dataEncryptionKey, reasonCode: 'JOB_AGENT_AUTHORIZATION_REVOKED', now: eventNow() });
      return { status: 'cancelled', reasonCode: executionConsent?.code || 'JOB_AGENT_CONSENT_REQUIRED', externalApplicationExecution: false, submitted: false };
    }
    if (execution.status === 'queued') {
      const startedAt = eventNow();
      let beginning;
      try { beginning = beginReservedApplicationSubmission(restored.session, { taskId: task.id }, startedAt); }
      catch (error) {
        if (!/expired before execution/i.test(String(error?.message || ''))) throw error;
        const expired = expireReservedApplicationSubmission(restored.session, { taskId: task.id }, startedAt);
        await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: expired.id, expectedVersion: restored.version, session: expired, now: startedAt });
        await cancelTask({ redis, taskId: task.id, dataEncryptionKey, reasonCode: 'SUBMISSION_APPROVAL_EXPIRED', now: startedAt });
        return { status: 'approval-expired', externalApplicationExecution: false, submitted: false };
      }
      const begun = await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: beginning.id, expectedVersion: restored.version, session: beginning, now: startedAt });
      if (!begun) throw new Error('SUBMISSION_SESSION_START_NOT_PERSISTED');
      savedExecuting = privateSession(begun);
    } else if (execution.status === 'executing' && restored.session.approvals?.submission?.consumedAt && !restored.session.submissionAttempt) {
      savedExecuting = restored;
    } else throw new Error('SUBMISSION_TASK_SESSION_NOT_QUEUED');

    const preProviderAt = eventNow();
    const browserSession = await readBrowserSession({ redis, tenantId, dataEncryptionKey, applicationSessionId: savedExecuting.session.id, now: preProviderAt });
    if (!browserSession) {
      const cancelled = cancelArmedApplicationSubmissionBeforeProvider(savedExecuting.session, { taskId: task.id, failureCode: 'SUBMISSION_BROWSER_SESSION_MISSING' }, preProviderAt);
      await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: cancelled.id, expectedVersion: savedExecuting.version, session: cancelled, now: preProviderAt });
      await cancelTask({ redis, taskId: task.id, dataEncryptionKey, reasonCode: 'SUBMISSION_BROWSER_SESSION_MISSING', now: preProviderAt });
      return { status: 'not-started', errorCode: 'SUBMISSION_BROWSER_SESSION_MISSING', externalApplicationExecution: false, submitted: false };
    }
    const finalConsent = await requireConsent({ redis, dataEncryptionKey }, tenantId, env);
    if (!finalConsent?.ok) {
      const cancelled = cancelArmedApplicationSubmissionBeforeProvider(savedExecuting.session, { taskId: task.id, failureCode: 'JOB_AGENT_AUTHORIZATION_REVOKED' }, preProviderAt);
      await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: cancelled.id, expectedVersion: savedExecuting.version, session: cancelled, now: preProviderAt });
      await cancelTask({ redis, taskId: task.id, dataEncryptionKey, reasonCode: 'JOB_AGENT_AUTHORIZATION_REVOKED', now: preProviderAt });
      return { status: 'cancelled', reasonCode: finalConsent?.code || 'JOB_AGENT_CONSENT_REQUIRED', externalApplicationExecution: false, submitted: false };
    }
    const providerStartedAt = eventNow();
    const started = await startTask({ redis, taskId: task.id, leaseToken, dataEncryptionKey, now: providerStartedAt });
    if (!started) {
      const cancelled = cancelArmedApplicationSubmissionBeforeProvider(savedExecuting.session, { taskId: task.id, failureCode: 'SUBMISSION_TASK_START_FAILED' }, providerStartedAt);
      await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: cancelled.id, expectedVersion: savedExecuting.version, session: cancelled, now: providerStartedAt });
      await cancelTask({ redis, taskId: task.id, dataEncryptionKey, reasonCode: 'SUBMISSION_TASK_START_FAILED', now: providerStartedAt }).catch(() => {});
      return { status: 'not-started', errorCode: 'SUBMISSION_TASK_START_FAILED', externalApplicationExecution: false, submitted: false };
    }
    taskStarted = true;
    const providerResult = await execute({ session: savedExecuting.session, browserSession, env, redis, now: providerStartedAt });
    if (providerResult?.status === 'not-started' && providerResult.externalApplicationExecution === false) {
      const failureCode = String(providerResult.code || 'SUBMISSION_PROVIDER_NOT_STARTED');
      const cancelled = cancelArmedApplicationSubmissionBeforeProvider(savedExecuting.session, { taskId: task.id, failureCode }, eventNow());
      await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: cancelled.id, expectedVersion: savedExecuting.version, session: cancelled, now: eventNow() });
      await finishTask({ redis, taskId: task.id, leaseToken, dataEncryptionKey, status: 'cancelled', result: { code: failureCode }, now: eventNow() });
      taskStarted = false;
      return { status: 'not-started', errorCode: failureCode, externalApplicationExecution: false, submitted: false };
    }
    if (providerResult?.status === 'attempt-recorded' && providerResult.submitted === true) {
      const completionAt = eventNow();
      const receiptTaskReservation = prepareReceiptTask({
        tenantId, dataEncryptionKey, sessionId: savedExecuting.session.id, documentVersion: savedExecuting.session.documentVersion,
        scopeHash: savedExecuting.session.submissionExecution.scopeHash, responseFingerprint: providerResult.responseFingerprint,
        submittedAt: providerResult.submittedAt, expectedSessionVersion: savedExecuting.version + 1,
        idempotencyKey: `receipt_${task.id}`, now: completionAt,
      });
      const completed = completeReservedApplicationSubmission(savedExecuting.session, { taskId: task.id, submittedAt: providerResult.submittedAt, responseFingerprint: providerResult.responseFingerprint, receiptTaskId: receiptTaskReservation.taskId }, completionAt);
      const saved = await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: completed.id, expectedVersion: savedExecuting.version, session: completed, receiptTaskReservation, now: completionAt });
      if (!saved) throw new Error('SUBMISSION_SESSION_COMPLETION_NOT_PERSISTED');
      await finishTask({ redis, taskId: task.id, leaseToken, dataEncryptionKey, status: 'completed', result: { code: 'SUBMISSION_ATTEMPT_RECORDED', submittedAt: providerResult.submittedAt, responseFingerprint: providerResult.responseFingerprint }, now: eventNow() });
      return { status: 'attempt-recorded', externalApplicationExecution: true, submitted: true, authoritativeReceiptVerified: false };
    }
    if (providerResult?.status !== 'outcome-unknown' || providerResult.externalApplicationExecution !== true) throw new Error('SUBMISSION_PROVIDER_RESULT_INVALID');
    const failed = failReservedApplicationSubmission(savedExecuting.session, { taskId: task.id, failureCode: 'SUBMISSION_PROVIDER_OUTCOME_UNKNOWN' }, eventNow());
    await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: failed.id, expectedVersion: savedExecuting.version, session: failed, now: eventNow() });
    await finishTask({ redis, taskId: task.id, leaseToken, dataEncryptionKey, status: 'outcome-unknown', result: { code: 'SUBMISSION_PROVIDER_OUTCOME_UNKNOWN' }, now: eventNow() });
    return { status: 'outcome-unknown', externalApplicationExecution: true, submitted: 'unknown', authoritativeReceiptVerified: false };
  } catch (error) {
    if (taskStarted && savedExecuting?.session?.submissionExecution?.status === 'executing') {
      try {
        const failed = failReservedApplicationSubmission(savedExecuting.session, { taskId: task.id, failureCode: 'SUBMISSION_PROVIDER_OUTCOME_UNKNOWN' }, eventNow());
        await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: failed.id, expectedVersion: savedExecuting.version, session: failed, now: eventNow() });
      } catch { /* stale reconciliation remains fail closed */ }
      await finishTask({ redis, taskId: task.id, leaseToken, dataEncryptionKey, status: 'outcome-unknown', result: { code: 'SUBMISSION_PROVIDER_OUTCOME_UNKNOWN' }, now: eventNow() }).catch(() => {});
    }
    return { status: taskStarted ? 'outcome-unknown' : 'not-started', errorCode: taskStarted ? 'SUBMISSION_PROVIDER_OUTCOME_UNKNOWN' : 'SUBMISSION_ORCHESTRATION_NOT_STARTED', externalApplicationExecution: taskStarted, submitted: taskStarted ? 'unknown' : false };
  }
}
