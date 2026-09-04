import { captureAuthoritativeApplicationReceipt } from './application-receipt-capture-provider.js';
import { applicationReceiptEvidenceProviderConfiguration, collectEmployerPageReceiptEvidence } from './application-receipt-evidence-provider.js';
import { recordReceiptVerificationPending, requireManualReceiptVerification } from './application-session-domain.js';
import { readDurableApplicationSessionForTenant, updateDurableApplicationSessionAsWorker } from './application-session-store.js';
import { claimNextApplicationReceiptTask, finishApplicationReceiptTask, rescheduleApplicationReceiptTask } from './application-receipt-task-store.js';
import { readEmployerBrowserSessionForTenantApplication } from './employer-browser-session-store.js';
import { requireConfiguredJobAgentConsentForTenant } from './job-agent-consent-store.js';

const MAX_ATTEMPTS = 12;
const DEADLINE_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAYS_MS = [60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 20 * 60_000, 30 * 60_000, 60 * 60_000];

export function applicationReceiptTaskWorkerConfiguration(env = process.env) {
  return applicationReceiptEvidenceProviderConfiguration(env);
}

export function publicApplicationReceiptTaskWorkerConfiguration(value = {}) {
  return { enabled: value.enabled === true, approved: value.approved === true, ready: value.ready === true, reason: value.reason || null, approvalVersion: value.approvalVersion || null, provider: value.browser?.provider || null, captureReady: value.captureReady === true };
}

function privateSession(value) {
  if (!value) return null;
  const { version, audit: _audit, ...session } = value;
  return { version, session };
}

function exactTaskSession(task, session) {
  return session?.receiptVerification?.id === task.id && session?.submissionAttempt?.scopeHash === task.payload.scopeHash
    && session?.submissionAttempt?.responseFingerprint === task.payload.responseFingerprint && session?.documentVersion === task.payload.documentVersion;
}

function retryAt(task, now) {
  const delay = RETRY_DELAYS_MS[Math.min(RETRY_DELAYS_MS.length - 1, Math.max(0, task.attempt - 1))];
  return new Date(now.getTime() + delay);
}

export async function processNextApplicationReceiptTask({ redis, dataEncryptionKey, auditSigningSecret, env = process.env, deps = {}, now = new Date() } = {}) {
  const configuration = applicationReceiptTaskWorkerConfiguration(env);
  if (!configuration.ready) return { status: 'not-configured', reason: configuration.reason, authoritativeReceiptVerified: false, externalApplicationExecution: false };
  const claim = deps.claim || claimNextApplicationReceiptTask;
  const readSession = deps.readSession || readDurableApplicationSessionForTenant;
  const updateSession = deps.updateSession || updateDurableApplicationSessionAsWorker;
  const readBrowserSession = deps.readBrowserSession || readEmployerBrowserSessionForTenantApplication;
  const requireConsent = deps.requireConsent || requireConfiguredJobAgentConsentForTenant;
  const collect = deps.collect || collectEmployerPageReceiptEvidence;
  const capture = deps.capture || captureAuthoritativeApplicationReceipt;
  const reschedule = deps.reschedule || rescheduleApplicationReceiptTask;
  const finish = deps.finish || finishApplicationReceiptTask;
  const claimed = await claim({ redis, dataEncryptionKey, now });
  if (!claimed) return { status: 'idle', authoritativeReceiptVerified: false, externalApplicationExecution: false };
  const { task, tenantId, leaseToken } = claimed;
  const consent = await requireConsent({ redis, dataEncryptionKey }, tenantId, env);
  if (!consent?.ok) {
    await finish({ redis, taskId: task.id, leaseToken, dataEncryptionKey, status: 'cancelled', reasonCode: 'JOB_AGENT_AUTHORIZATION_REVOKED', now });
    return { status: 'cancelled', authoritativeReceiptVerified: false, externalApplicationExecution: false };
  }
  let restored = privateSession(await readSession({ redis, tenantId, dataEncryptionKey, sessionId: task.payload.sessionId }));
  if (!restored) {
    await finish({ redis, taskId: task.id, leaseToken, dataEncryptionKey, status: 'needs-human', reasonCode: 'RECEIPT_APPLICATION_SESSION_MISSING', now });
    return { status: 'orphaned', authoritativeReceiptVerified: false, externalApplicationExecution: false };
  }
  if (restored.session.receipt?.authority === 'employer-side') {
    await finish({ redis, taskId: task.id, leaseToken, dataEncryptionKey, status: 'completed', reasonCode: 'AUTHORITATIVE_RECEIPT_VERIFIED', now });
    return { status: 'verified-from-session-checkpoint', authoritativeReceiptVerified: true, externalApplicationExecution: false };
  }
  if (!exactTaskSession(task, restored.session)) {
    await finish({ redis, taskId: task.id, leaseToken, dataEncryptionKey, status: 'needs-human', reasonCode: 'RECEIPT_TASK_SESSION_MISMATCH', now });
    return { status: 'manual-reconciliation-required', authoritativeReceiptVerified: false, externalApplicationExecution: false };
  }
  const browserSession = await readBrowserSession({ redis, tenantId, dataEncryptionKey, applicationSessionId: restored.session.id, now });
  let result = browserSession
    ? await collect({ task, session: restored.session, browserSession, redis, env, now })
    : { status: 'unavailable', code: 'RECEIPT_BROWSER_SESSION_UNAVAILABLE', retryable: false };
  if (result.status === 'evidence') {
    const captured = await capture({ tenantId, sessionId: restored.session.id, version: restored.version, evidence: result.evidence, env, now });
    result = captured.verified
      ? { status: 'verified', code: 'AUTHORITATIVE_RECEIPT_VERIFIED' }
      : { status: captured.outcome, code: captured.code || 'RECEIPT_CAPTURE_NOT_VERIFIED', retryable: ['unknown', 'reconciliation-required'].includes(captured.outcome) };
  }
  if (result.status === 'verified') {
    await finish({ redis, taskId: task.id, leaseToken, dataEncryptionKey, status: 'completed', reasonCode: 'AUTHORITATIVE_RECEIPT_VERIFIED', now });
    return { status: 'verified', authoritativeReceiptVerified: true, externalApplicationExecution: false };
  }
  if (result.status === 'reconciliation-required') {
    restored = privateSession(await readSession({ redis, tenantId, dataEncryptionKey, sessionId: task.payload.sessionId }));
    if (restored?.session?.receipt?.authority === 'employer-side') {
      await finish({ redis, taskId: task.id, leaseToken, dataEncryptionKey, status: 'completed', reasonCode: 'AUTHORITATIVE_RECEIPT_VERIFIED', now });
      return { status: 'verified-from-session-checkpoint', authoritativeReceiptVerified: true, externalApplicationExecution: false };
    }
  }
  const createdAt = new Date(task.createdAt);
  const canRetry = result.retryable === true && task.attempt < MAX_ATTEMPTS && now.getTime() - createdAt.getTime() < DEADLINE_MS;
  if (canRetry) {
    const failureCode = String(result.code || 'AUTHORITATIVE_RECEIPT_NOT_YET_VERIFIED');
    const pending = recordReceiptVerificationPending(restored.session, { taskId: task.id, failureCode, attempt: task.attempt }, now);
    const saved = await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: pending.id, expectedVersion: restored.version, session: pending, now });
    if (!saved) return { status: 'manual-reconciliation-required', authoritativeReceiptVerified: false, externalApplicationExecution: false };
    const scheduled = await reschedule({ redis, taskId: task.id, leaseToken, dataEncryptionKey, reasonCode: failureCode, nextAttemptAt: retryAt(task, now), now });
    return { status: scheduled ? 'waiting' : 'manual-reconciliation-required', authoritativeReceiptVerified: false, externalApplicationExecution: false };
  }
  const failureCode = String(result.code || 'AUTHORITATIVE_RECEIPT_REVIEW_REQUIRED');
  const manual = requireManualReceiptVerification(restored.session, { taskId: task.id, failureCode, attempt: task.attempt }, now);
  const saved = await updateSession({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId: manual.id, expectedVersion: restored.version, session: manual, now });
  if (!saved) return { status: 'manual-reconciliation-required', authoritativeReceiptVerified: false, externalApplicationExecution: false };
  await finish({ redis, taskId: task.id, leaseToken, dataEncryptionKey, status: 'needs-human', reasonCode: failureCode, now });
  return { status: 'needs-human', authoritativeReceiptVerified: false, externalApplicationExecution: false };
}
