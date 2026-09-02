import { READINESS_DRILL_CONFIRMATION } from './job-agent-readiness-drill-contract.js';

const REQUIRED_LIFECYCLES = Object.freeze([
  'signedUserSessionLifecycle',
  'notificationPreferenceLifecycle',
  'applicationAuditLifecycle',
  'auditHeadExportLifecycle',
  'durableRunLifecycle',
  'applicantVaultLifecycle',
  'applicationPackageLifecycle',
  'applicationPackageArtifactLifecycle',
  'applicationSessionLifecycle',
]);

function productionReadinessUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error('JOB_AGENT_READINESS_URL must be the production readiness URL.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'app.1ststep.ai' || url.pathname !== '/api/job-agent-readiness'
    || url.username || url.password || url.search || url.hash) {
    throw new Error('JOB_AGENT_READINESS_URL must be exactly https://app.1ststep.ai/api/job-agent-readiness.');
  }
  for (const key of ['session', 'notification', 'audit', 'deep']) url.searchParams.set(key, '1');
  return url;
}

function safeCode(value, fallback) {
  const cleaned = String(value || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
  return cleaned || fallback;
}

function validateResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('READINESS_RESPONSE_INVALID');
  if (body.status !== 'ready' || body.durableStore !== 'reachable' || body.encryptionConfigured !== true || body.tenantPartitioningConfigured !== true) {
    throw new Error('CONTROL_PLANE_NOT_READY');
  }
  if (body.launchManifest?.capabilities?.signedBeta?.eligible !== true || !['signed-beta', 'package-ready', 'assisted-application'].includes(body.readyFor)) {
    throw new Error('SIGNED_BETA_NOT_READY');
  }
  if (!['healthy', 'running'].includes(body.backgroundWorker?.status) || body.backgroundWorker?.executionMode !== 'durable-work-cycle') throw new Error('BACKGROUND_WORKER_EXECUTION_NOT_HEALTHY');
  for (const key of REQUIRED_LIFECYCLES) {
    if (body[key] !== 'verified') throw new Error(`LIFECYCLE_NOT_VERIFIED_${key}`);
  }
  if (body.externalApplicationExecution !== false || body.submissionsEnabled !== false || body.launchManifest?.submissionsEnabled !== false) {
    throw new Error('UNSAFE_EXECUTION_STATE');
  }
}

export async function runProductionReadinessDrill({ env = process.env, fetchImpl = fetch, now = new Date(), timeoutMs = 35_000 } = {}) {
  if (String(env.JOB_AGENT_READINESS_DRILL_CONFIRMATION || '') !== READINESS_DRILL_CONFIRMATION) {
    throw new Error(`JOB_AGENT_READINESS_DRILL_CONFIRMATION=${READINESS_DRILL_CONFIRMATION} is required.`);
  }
  const cronSecret = String(env.CRON_SECRET || '');
  if (Buffer.byteLength(cronSecret, 'utf8') < 32) throw new Error('CRON_SECRET must be configured with at least 32 bytes.');
  const url = productionReadinessUrl(env.JOB_AGENT_READINESS_URL);
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'application/json', Authorization: `Bearer ${cronSecret}`,
        'X-Job-Agent-Readiness-Drill': READINESS_DRILL_CONFIRMATION,
      },
    });
  } catch (error) {
    const uncertain = error?.name === 'AbortError' || error?.name === 'TimeoutError';
    const failure = new Error(uncertain ? 'READINESS_DRILL_OUTCOME_UNKNOWN_DO_NOT_RETRY' : 'READINESS_DRILL_REQUEST_FAILED');
    failure.outcomeUnknown = uncertain;
    failure.requestAttempts = 1;
    throw failure;
  }
  let body;
  try { body = await response.json(); } catch {
    const failure = new Error('READINESS_RESPONSE_INVALID');
    failure.requestAttempts = 1;
    throw failure;
  }
  if (!response.ok) {
    const failure = new Error(`READINESS_HTTP_${response.status}_${safeCode(body?.failedStage || body?.code, 'UNAVAILABLE')}`);
    failure.requestAttempts = 1;
    throw failure;
  }
  try { validateResponse(body); } catch (error) {
    error.requestAttempts = 1;
    throw error;
  }
  return {
    schemaVersion: 1, ok: true, synthetic: true, contentFree: true, containsCandidateValues: false,
    checkedAt: new Date(now).toISOString(), endpointOrigin: url.origin, readyFor: body.readyFor,
    durableStoreReachable: true, encryptionConfigured: true, tenantPartitioningConfigured: true,
    backgroundWorker: body.backgroundWorker.status,
    lifecycles: Object.fromEntries(REQUIRED_LIFECYCLES.map(key => [key, 'verified'])),
    externalApplicationExecution: false, submissionsEnabled: false, requestAttempts: 1,
  };
}

export const JOB_AGENT_READINESS_DRILL_LIFECYCLES = REQUIRED_LIFECYCLES;
