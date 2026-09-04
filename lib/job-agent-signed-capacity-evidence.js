import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,99}$/;
const PRODUCTION_HOSTS = new Set(['1ststep.ai', 'www.1ststep.ai', 'app.1ststep.ai']);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw new Error(code);
}

function digest(value, code) {
  const normalized = String(value || '').toLowerCase();
  if (!SHA256.test(normalized)) throw new Error(code);
  return normalized;
}

function integer(value, { min = 0, max = Number.MAX_SAFE_INTEGER, code }) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(code);
  return value;
}

function instant(value, code) {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error(code);
  return date;
}

function previewOrigin(value, code) {
  let origin;
  try { origin = new URL(String(value || '')); } catch { throw new Error(code); }
  const hostname = origin.hostname.toLowerCase();
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash
    || origin.pathname !== '/' || PRODUCTION_HOSTS.has(hostname) || !hostname.endsWith('.vercel.app')) throw new Error(code);
  return origin.origin;
}

export function validateJobAgentSignedCapacityEvidence(value, {
  expectedSourceCommit,
  expectedRuntimeSha256,
  expectedDeploymentId,
  expectedDeploymentOrigin,
  now = new Date(),
} = {}) {
  exactKeys(value, [
    'schemaVersion', 'evidenceKind', 'contentFree', 'containsCandidateValues', 'productionAccessed',
    'performsEmployerActions', 'sourceCommit', 'runtimeSha256', 'deployment', 'authorization',
    'exercise', 'traffic', 'fairness', 'rateLimiting', 'queue', 'dependencyFailure', 'cost', 'cleanup',
  ], 'SIGNED_CAPACITY_EVIDENCE_SCHEMA_INVALID');
  if (value.schemaVersion !== 1 || value.evidenceKind !== 'signed-user-capacity-fairness'
    || value.contentFree !== true || value.containsCandidateValues !== false || value.productionAccessed !== false
    || value.performsEmployerActions !== false) throw new Error('SIGNED_CAPACITY_BOUNDARY_INVALID');

  const expectedCommit = String(expectedSourceCommit || '').toLowerCase();
  if (!COMMIT.test(expectedCommit) || !COMMIT.test(String(value.sourceCommit || '').toLowerCase())) {
    throw new Error('SIGNED_CAPACITY_SOURCE_COMMIT_INVALID');
  }
  if (String(value.sourceCommit).toLowerCase() !== expectedCommit) throw new Error('SIGNED_CAPACITY_SOURCE_COMMIT_MISMATCH');
  const runtime = digest(value.runtimeSha256, 'SIGNED_CAPACITY_RUNTIME_DIGEST_INVALID');
  if (runtime !== digest(expectedRuntimeSha256, 'SIGNED_CAPACITY_EXPECTED_RUNTIME_INVALID')) {
    throw new Error('SIGNED_CAPACITY_RUNTIME_MISMATCH');
  }

  exactKeys(value.deployment, ['environment', 'deploymentId', 'origin', 'productionTarget', 'inspectedAt'], 'SIGNED_CAPACITY_DEPLOYMENT_INVALID');
  if (value.deployment.environment !== 'vercel-preview' || value.deployment.productionTarget !== false
    || !SAFE_ID.test(String(value.deployment.deploymentId || ''))
    || value.deployment.deploymentId !== expectedDeploymentId
    || previewOrigin(value.deployment.origin, 'SIGNED_CAPACITY_DEPLOYMENT_INVALID')
      !== previewOrigin(expectedDeploymentOrigin, 'SIGNED_CAPACITY_EXPECTED_DEPLOYMENT_INVALID')) {
    throw new Error('SIGNED_CAPACITY_DEPLOYMENT_INVALID');
  }
  const inspectedAt = instant(value.deployment.inspectedAt, 'SIGNED_CAPACITY_DEPLOYMENT_INVALID');

  exactKeys(value.authorization, [
    'approvalVersion', 'authorizedAt', 'ownerDigestSha256', 'currency', 'costCeilingCents', 'maximumTenants',
    'maximumRequests', 'maximumConcurrency', 'maximumDurationSeconds', 'maximumP95Ms',
    'maximumTenantP95SpreadMs', 'maximumQueueDepth', 'maximumQueueWaitMs', 'maximumRetryAttempts',
    'maximumProviderUnits', 'providerAllowlistDigestSha256',
  ], 'SIGNED_CAPACITY_AUTHORIZATION_INVALID');
  if (!SAFE_ID.test(String(value.authorization.approvalVersion || '')) || value.authorization.currency !== 'USD') {
    throw new Error('SIGNED_CAPACITY_AUTHORIZATION_INVALID');
  }
  const authorizedAt = instant(value.authorization.authorizedAt, 'SIGNED_CAPACITY_AUTHORIZATION_INVALID');
  digest(value.authorization.ownerDigestSha256, 'SIGNED_CAPACITY_AUTHORIZATION_INVALID');
  digest(value.authorization.providerAllowlistDigestSha256, 'SIGNED_CAPACITY_AUTHORIZATION_INVALID');
  integer(value.authorization.costCeilingCents, { min: 0, max: 10_000_000, code: 'SIGNED_CAPACITY_AUTHORIZATION_INVALID' });
  integer(value.authorization.maximumTenants, { min: 2, max: 25, code: 'SIGNED_CAPACITY_AUTHORIZATION_INVALID' });
  integer(value.authorization.maximumRequests, { min: 2, max: 1_000, code: 'SIGNED_CAPACITY_AUTHORIZATION_INVALID' });
  integer(value.authorization.maximumConcurrency, { min: 1, max: 25, code: 'SIGNED_CAPACITY_AUTHORIZATION_INVALID' });
  integer(value.authorization.maximumDurationSeconds, { min: 1, max: 900, code: 'SIGNED_CAPACITY_AUTHORIZATION_INVALID' });
  integer(value.authorization.maximumP95Ms, { min: 1, max: 120_000, code: 'SIGNED_CAPACITY_AUTHORIZATION_INVALID' });
  integer(value.authorization.maximumTenantP95SpreadMs, { min: 0, max: 120_000, code: 'SIGNED_CAPACITY_AUTHORIZATION_INVALID' });
  integer(value.authorization.maximumQueueDepth, { min: 0, max: 10_000, code: 'SIGNED_CAPACITY_AUTHORIZATION_INVALID' });
  integer(value.authorization.maximumQueueWaitMs, { min: 0, max: 900_000, code: 'SIGNED_CAPACITY_AUTHORIZATION_INVALID' });
  integer(value.authorization.maximumRetryAttempts, { min: 1, max: 10, code: 'SIGNED_CAPACITY_AUTHORIZATION_INVALID' });
  integer(value.authorization.maximumProviderUnits, { min: 0, max: 10_000_000, code: 'SIGNED_CAPACITY_AUTHORIZATION_INVALID' });

  exactKeys(value.exercise, [
    'startedAt', 'completedAt', 'syntheticOnly', 'signedUsers', 'tenants', 'users', 'requests',
    'concurrency', 'durationSeconds', 'privateRawEvidenceSha256',
  ], 'SIGNED_CAPACITY_EXERCISE_INVALID');
  const startedAt = instant(value.exercise.startedAt, 'SIGNED_CAPACITY_EXERCISE_INVALID');
  const completedAt = instant(value.exercise.completedAt, 'SIGNED_CAPACITY_EXERCISE_INVALID');
  if (value.exercise.syntheticOnly !== true || value.exercise.signedUsers !== true || authorizedAt > startedAt
    || startedAt >= completedAt || completedAt > inspectedAt) throw new Error('SIGNED_CAPACITY_EXERCISE_INVALID');
  digest(value.exercise.privateRawEvidenceSha256, 'SIGNED_CAPACITY_EXERCISE_INVALID');
  integer(value.exercise.tenants, { min: 2, max: value.authorization.maximumTenants, code: 'SIGNED_CAPACITY_EXERCISE_INVALID' });
  integer(value.exercise.users, { min: value.exercise.tenants, max: value.authorization.maximumTenants, code: 'SIGNED_CAPACITY_EXERCISE_INVALID' });
  integer(value.exercise.requests, { min: value.exercise.tenants, max: value.authorization.maximumRequests, code: 'SIGNED_CAPACITY_EXERCISE_INVALID' });
  integer(value.exercise.concurrency, { min: 1, max: value.authorization.maximumConcurrency, code: 'SIGNED_CAPACITY_EXERCISE_INVALID' });
  integer(value.exercise.durationSeconds, { min: 1, max: value.authorization.maximumDurationSeconds, code: 'SIGNED_CAPACITY_EXERCISE_INVALID' });
  if (Math.ceil((completedAt - startedAt) / 1000) > value.authorization.maximumDurationSeconds) throw new Error('SIGNED_CAPACITY_EXERCISE_INVALID');

  exactKeys(value.traffic, [
    'successfulResponses', 'expectedLimitedResponses', 'expectedBackpressureResponses', 'serverErrors',
    'unexpectedResponses', 'latencyP50Ms', 'latencyP95Ms', 'latencyMaxMs',
  ], 'SIGNED_CAPACITY_TRAFFIC_INVALID');
  for (const field of ['successfulResponses', 'expectedLimitedResponses', 'expectedBackpressureResponses', 'serverErrors', 'unexpectedResponses']) {
    integer(value.traffic[field], { min: 0, max: value.exercise.requests, code: 'SIGNED_CAPACITY_TRAFFIC_INVALID' });
  }
  for (const field of ['latencyP50Ms', 'latencyP95Ms', 'latencyMaxMs']) {
    integer(value.traffic[field], { min: 0, max: 900_000, code: 'SIGNED_CAPACITY_TRAFFIC_INVALID' });
  }
  if (value.traffic.successfulResponses + value.traffic.expectedLimitedResponses + value.traffic.expectedBackpressureResponses
      + value.traffic.serverErrors + value.traffic.unexpectedResponses !== value.exercise.requests
    || value.traffic.serverErrors !== 0 || value.traffic.unexpectedResponses !== 0
    || value.traffic.latencyP50Ms > value.traffic.latencyP95Ms || value.traffic.latencyP95Ms > value.traffic.latencyMaxMs
    || value.traffic.latencyP95Ms > value.authorization.maximumP95Ms) throw new Error('SIGNED_CAPACITY_TRAFFIC_INVALID');

  exactKeys(value.fairness, [
    'tenantsMeasured', 'starvedTenants', 'minimumCompletedRequests', 'maximumCompletedRequests',
    'maximumTenantP95SpreadMs', 'crossTenantInterferenceDetected', 'fairnessEvidenceSha256',
  ], 'SIGNED_CAPACITY_FAIRNESS_INVALID');
  integer(value.fairness.tenantsMeasured, { min: 2, max: value.exercise.tenants, code: 'SIGNED_CAPACITY_FAIRNESS_INVALID' });
  integer(value.fairness.starvedTenants, { min: 0, max: value.exercise.tenants, code: 'SIGNED_CAPACITY_FAIRNESS_INVALID' });
  integer(value.fairness.minimumCompletedRequests, { min: 0, max: value.exercise.requests, code: 'SIGNED_CAPACITY_FAIRNESS_INVALID' });
  integer(value.fairness.maximumCompletedRequests, { min: 0, max: value.exercise.requests, code: 'SIGNED_CAPACITY_FAIRNESS_INVALID' });
  integer(value.fairness.maximumTenantP95SpreadMs, { min: 0, max: 900_000, code: 'SIGNED_CAPACITY_FAIRNESS_INVALID' });
  digest(value.fairness.fairnessEvidenceSha256, 'SIGNED_CAPACITY_FAIRNESS_INVALID');
  if (value.fairness.tenantsMeasured !== value.exercise.tenants || value.fairness.starvedTenants !== 0
    || value.fairness.minimumCompletedRequests < 1
    || value.fairness.maximumCompletedRequests - value.fairness.minimumCompletedRequests > 1
    || value.fairness.maximumTenantP95SpreadMs > value.authorization.maximumTenantP95SpreadMs
    || value.fairness.crossTenantInterferenceDetected !== false) throw new Error('SIGNED_CAPACITY_FAIRNESS_INVALID');

  exactKeys(value.rateLimiting, [
    'durableBackendUsed', 'tenantLimitObserved', 'globalLimitObserved', 'retryAfterValid',
    'failClosedWhenBackendUnavailable', 'tenantKeysIsolated', 'bypassCount', 'rateLimitEvidenceSha256',
  ], 'SIGNED_CAPACITY_RATE_LIMIT_INVALID');
  digest(value.rateLimiting.rateLimitEvidenceSha256, 'SIGNED_CAPACITY_RATE_LIMIT_INVALID');
  if (value.rateLimiting.durableBackendUsed !== true || value.rateLimiting.tenantLimitObserved !== true
    || value.rateLimiting.globalLimitObserved !== true || value.rateLimiting.retryAfterValid !== true
    || value.rateLimiting.failClosedWhenBackendUnavailable !== true || value.rateLimiting.tenantKeysIsolated !== true
    || value.rateLimiting.bypassCount !== 0) throw new Error('SIGNED_CAPACITY_RATE_LIMIT_INVALID');

  exactKeys(value.queue, [
    'acceptedRequests', 'backpressuredRequests', 'peakDepth', 'maximumWaitMs', 'droppedRequests',
    'duplicateLeases', 'staleLeasesRecovered', 'explicitBackpressureObserved', 'drained', 'queueEvidenceSha256',
  ], 'SIGNED_CAPACITY_QUEUE_INVALID');
  for (const field of ['acceptedRequests', 'backpressuredRequests', 'peakDepth', 'maximumWaitMs', 'droppedRequests', 'duplicateLeases', 'staleLeasesRecovered']) {
    integer(value.queue[field], { min: 0, max: field === 'maximumWaitMs' ? 900_000 : 10_000, code: 'SIGNED_CAPACITY_QUEUE_INVALID' });
  }
  digest(value.queue.queueEvidenceSha256, 'SIGNED_CAPACITY_QUEUE_INVALID');
  if (value.queue.acceptedRequests + value.queue.backpressuredRequests !== value.exercise.requests
    || value.queue.peakDepth > value.authorization.maximumQueueDepth
    || value.queue.maximumWaitMs > value.authorization.maximumQueueWaitMs
    || value.queue.droppedRequests !== 0 || value.queue.duplicateLeases !== 0
    || value.queue.explicitBackpressureObserved !== true || value.queue.drained !== true) throw new Error('SIGNED_CAPACITY_QUEUE_INVALID');

  exactKeys(value.dependencyFailure, [
    'syntheticFailureInjected', 'providerDigestSha256', 'circuitOpened', 'healthyProvidersContinued',
    'retryStormDetected', 'maximumAttemptsObserved', 'unboundedFanoutDetected', 'recoveryObserved',
    'failureEvidenceSha256',
  ], 'SIGNED_CAPACITY_DEPENDENCY_FAILURE_INVALID');
  digest(value.dependencyFailure.providerDigestSha256, 'SIGNED_CAPACITY_DEPENDENCY_FAILURE_INVALID');
  digest(value.dependencyFailure.failureEvidenceSha256, 'SIGNED_CAPACITY_DEPENDENCY_FAILURE_INVALID');
  integer(value.dependencyFailure.maximumAttemptsObserved, { min: 1, max: 100, code: 'SIGNED_CAPACITY_DEPENDENCY_FAILURE_INVALID' });
  if (value.dependencyFailure.syntheticFailureInjected !== true || value.dependencyFailure.circuitOpened !== true
    || value.dependencyFailure.healthyProvidersContinued !== true || value.dependencyFailure.retryStormDetected !== false
    || value.dependencyFailure.maximumAttemptsObserved > value.authorization.maximumRetryAttempts
    || value.dependencyFailure.unboundedFanoutDetected !== false || value.dependencyFailure.recoveryObserved !== true) {
    throw new Error('SIGNED_CAPACITY_DEPENDENCY_FAILURE_INVALID');
  }

  exactKeys(value.cost, [
    'actualCostCents', 'providerUnitsConsumed', 'reservationsCreated', 'reservationsSettled',
    'unsettledReservations', 'unapprovedProviderCalls', 'providerQuotaFailureHandled', 'costEvidenceSha256',
  ], 'SIGNED_CAPACITY_COST_INVALID');
  integer(value.cost.actualCostCents, { min: 0, max: 10_000_000, code: 'SIGNED_CAPACITY_COST_INVALID' });
  integer(value.cost.providerUnitsConsumed, { min: 0, max: 10_000_000, code: 'SIGNED_CAPACITY_COST_INVALID' });
  for (const field of ['reservationsCreated', 'reservationsSettled', 'unsettledReservations', 'unapprovedProviderCalls']) {
    integer(value.cost[field], { min: 0, max: 10_000, code: 'SIGNED_CAPACITY_COST_INVALID' });
  }
  digest(value.cost.costEvidenceSha256, 'SIGNED_CAPACITY_COST_INVALID');
  if (value.cost.actualCostCents > value.authorization.costCeilingCents
    || value.cost.providerUnitsConsumed > value.authorization.maximumProviderUnits
    || value.cost.reservationsCreated !== value.cost.reservationsSettled || value.cost.unsettledReservations !== 0
    || value.cost.unapprovedProviderCalls !== 0 || value.cost.providerQuotaFailureHandled !== true) {
    throw new Error('SIGNED_CAPACITY_COST_INVALID');
  }

  exactKeys(value.cleanup, [
    'syntheticRecordsRemaining', 'sessionsTerminated', 'queueDrained', 'cleanupVerified', 'cleanupEvidenceSha256',
  ], 'SIGNED_CAPACITY_CLEANUP_INVALID');
  digest(value.cleanup.cleanupEvidenceSha256, 'SIGNED_CAPACITY_CLEANUP_INVALID');
  if (value.cleanup.syntheticRecordsRemaining !== 0 || value.cleanup.sessionsTerminated !== true
    || value.cleanup.queueDrained !== true || value.cleanup.cleanupVerified !== true) throw new Error('SIGNED_CAPACITY_CLEANUP_INVALID');

  const current = new Date(now);
  if (!Number.isFinite(current.getTime()) || inspectedAt > new Date(current.getTime() + 5 * 60_000)
    || current.getTime() - inspectedAt.getTime() > 30 * 86_400_000) throw new Error('SIGNED_CAPACITY_EVIDENCE_STALE');

  return {
    schemaVersion: 1,
    ok: true,
    contentFree: true,
    containsCandidateValues: false,
    performsWrites: false,
    deploys: false,
    productionAccessed: false,
    performsEmployerActions: false,
    exactPreviewVerified: true,
    signedUsersVerified: true,
    syntheticOnlyVerified: true,
    tenantsMeasured: value.fairness.tenantsMeasured,
    requestsMeasured: value.exercise.requests,
    zeroStarvationVerified: true,
    backpressureVerified: true,
    dependencyFailureContained: true,
    withinApprovedLatency: true,
    withinApprovedCost: true,
    cleanupVerified: true,
    artifactSha256: createHash('sha256').update(canonical(value)).digest('hex'),
  };
}
