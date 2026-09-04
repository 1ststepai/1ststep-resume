import assert from 'node:assert/strict';
import { validateJobAgentSignedCapacityEvidence } from '../lib/job-agent-signed-capacity-evidence.js';

const hash = value => String(value).repeat(64).slice(0, 64);
const commit = 'a'.repeat(40);
const runtime = hash('b');
const deploymentId = 'dpl_signedCapacityFixture';
const deploymentOrigin = 'https://signed-capacity-fixture.vercel.app';
const now = new Date('2026-09-02T06:00:00.000Z');
const containsExactValue = (value, expected) => {
  if (typeof value === 'string') return value === expected;
  if (Array.isArray(value)) return value.some(item => containsExactValue(item, expected));
  if (value && typeof value === 'object') return Object.values(value).some(item => containsExactValue(item, expected));
  return false;
};

function fixture() {
  return {
    schemaVersion: 1,
    evidenceKind: 'signed-user-capacity-fairness',
    contentFree: true,
    containsCandidateValues: false,
    productionAccessed: false,
    performsEmployerActions: false,
    sourceCommit: commit,
    runtimeSha256: runtime,
    deployment: {
      environment: 'vercel-preview', deploymentId, origin: deploymentOrigin,
      productionTarget: false, inspectedAt: '2026-09-02T05:45:00.000Z',
    },
    authorization: {
      approvalVersion: 'signed-capacity-v1', authorizedAt: '2026-09-02T05:00:00.000Z',
      ownerDigestSha256: hash('1'), currency: 'USD', costCeilingCents: 500,
      maximumTenants: 5, maximumRequests: 50, maximumConcurrency: 5, maximumDurationSeconds: 300,
      maximumP95Ms: 5000, maximumTenantP95SpreadMs: 1000, maximumQueueDepth: 20,
      maximumQueueWaitMs: 5000, maximumRetryAttempts: 3, maximumProviderUnits: 100,
      providerAllowlistDigestSha256: hash('2'),
    },
    exercise: {
      startedAt: '2026-09-02T05:10:00.000Z', completedAt: '2026-09-02T05:14:00.000Z',
      syntheticOnly: true, signedUsers: true, tenants: 5, users: 5, requests: 50,
      concurrency: 5, durationSeconds: 240, privateRawEvidenceSha256: hash('3'),
    },
    traffic: {
      successfulResponses: 40, expectedLimitedResponses: 5, expectedBackpressureResponses: 5,
      serverErrors: 0, unexpectedResponses: 0, latencyP50Ms: 400, latencyP95Ms: 1200, latencyMaxMs: 2000,
    },
    fairness: {
      tenantsMeasured: 5, starvedTenants: 0, minimumCompletedRequests: 8, maximumCompletedRequests: 8,
      maximumTenantP95SpreadMs: 200, crossTenantInterferenceDetected: false, fairnessEvidenceSha256: hash('4'),
    },
    rateLimiting: {
      durableBackendUsed: true, tenantLimitObserved: true, globalLimitObserved: true, retryAfterValid: true,
      failClosedWhenBackendUnavailable: true, tenantKeysIsolated: true, bypassCount: 0, rateLimitEvidenceSha256: hash('5'),
    },
    queue: {
      acceptedRequests: 45, backpressuredRequests: 5, peakDepth: 10, maximumWaitMs: 800,
      droppedRequests: 0, duplicateLeases: 0, staleLeasesRecovered: 1,
      explicitBackpressureObserved: true, drained: true, queueEvidenceSha256: hash('6'),
    },
    dependencyFailure: {
      syntheticFailureInjected: true, providerDigestSha256: hash('7'), circuitOpened: true,
      healthyProvidersContinued: true, retryStormDetected: false, maximumAttemptsObserved: 3,
      unboundedFanoutDetected: false, recoveryObserved: true, failureEvidenceSha256: hash('8'),
    },
    cost: {
      actualCostCents: 125, providerUnitsConsumed: 50, reservationsCreated: 5, reservationsSettled: 5,
      unsettledReservations: 0, unapprovedProviderCalls: 0, providerQuotaFailureHandled: true,
      costEvidenceSha256: hash('9'),
    },
    cleanup: {
      syntheticRecordsRemaining: 0, sessionsTerminated: true, queueDrained: true,
      cleanupVerified: true, cleanupEvidenceSha256: hash('c'),
    },
  };
}

const options = { expectedSourceCommit: commit, expectedRuntimeSha256: runtime, expectedDeploymentId: deploymentId, expectedDeploymentOrigin: deploymentOrigin, now };
const result = validateJobAgentSignedCapacityEvidence(fixture(), options);
assert.equal(result.ok, true);
assert.equal(result.zeroStarvationVerified, true);
assert.equal(result.backpressureVerified, true);
assert.equal(result.dependencyFailureContained, true);
assert.equal(result.withinApprovedCost, true);
assert.match(result.artifactSha256, /^[a-f0-9]{64}$/);
assert.equal(containsExactValue(result, deploymentOrigin), false);
assert.equal(JSON.stringify(result).includes(hash('7')), false);

const production = fixture();
production.deployment.origin = 'https://app.1ststep.ai';
assert.throws(() => validateJobAgentSignedCapacityEvidence(production, options), /SIGNED_CAPACITY_DEPLOYMENT_INVALID/);

const wrongDeployment = fixture();
wrongDeployment.deployment.deploymentId = 'dpl_wrongFixture';
assert.throws(() => validateJobAgentSignedCapacityEvidence(wrongDeployment, options), /SIGNED_CAPACITY_DEPLOYMENT_INVALID/);

const starvation = fixture();
starvation.fairness.starvedTenants = 1;
assert.throws(() => validateJobAgentSignedCapacityEvidence(starvation, options), /SIGNED_CAPACITY_FAIRNESS_INVALID/);

const unfair = fixture();
unfair.fairness.maximumCompletedRequests = 10;
assert.throws(() => validateJobAgentSignedCapacityEvidence(unfair, options), /SIGNED_CAPACITY_FAIRNESS_INVALID/);

const queueLeak = fixture();
queueLeak.queue.duplicateLeases = 1;
assert.throws(() => validateJobAgentSignedCapacityEvidence(queueLeak, options), /SIGNED_CAPACITY_QUEUE_INVALID/);

const retryStorm = fixture();
retryStorm.dependencyFailure.retryStormDetected = true;
assert.throws(() => validateJobAgentSignedCapacityEvidence(retryStorm, options), /SIGNED_CAPACITY_DEPENDENCY_FAILURE_INVALID/);

const overspend = fixture();
overspend.cost.actualCostCents = 501;
assert.throws(() => validateJobAgentSignedCapacityEvidence(overspend, options), /SIGNED_CAPACITY_COST_INVALID/);

const cleanupLeak = fixture();
cleanupLeak.cleanup.syntheticRecordsRemaining = 1;
assert.throws(() => validateJobAgentSignedCapacityEvidence(cleanupLeak, options), /SIGNED_CAPACITY_CLEANUP_INVALID/);

const candidateField = fixture();
candidateField.candidateEmail = 'person@example.com';
assert.throws(() => validateJobAgentSignedCapacityEvidence(candidateField, options), /SIGNED_CAPACITY_EVIDENCE_SCHEMA_INVALID/);

assert.throws(() => validateJobAgentSignedCapacityEvidence(fixture(), { ...options, now: new Date('2026-10-10T00:00:00.000Z') }), /SIGNED_CAPACITY_EVIDENCE_STALE/);

console.log('Content-free signed-user fairness, backpressure, rate-limit, dependency-failure, quota, cost, and cleanup evidence tests passed.');
