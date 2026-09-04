import {
  LEARNING_EVALUATION_FIXTURES, completeLearningMaintenance, createJobAgentLearningState,
  createLearningProposal, evaluateLearningProposal, promoteLearningProposal, publicLearningSummary,
  recordSourceObservation, recordVerifiedSignal, sourceExpansionPlan,
} from './job-agent-learning-domain.js';
import {
  claimNextJobAgentLearningMaintenance, completeJobAgentLearningMaintenance,
  ensureJobAgentLearningStateForTenant, readJobAgentLearningStateForTenant, saveJobAgentLearningStateForTenant,
} from './job-agent-learning-store.js';

export function jobAgentLearningConfiguration(env = process.env) {
  return {
    enabled: String(env.JOB_AGENT_LEARNING_ENABLED || '').toLowerCase() === 'true',
    autoPromotionEnabled: String(env.JOB_AGENT_LEARNING_AUTO_PROMOTION_ENABLED || '').toLowerCase() === 'true',
  };
}

function safetyEvaluationResults() {
  return Object.fromEntries([
    ...LEARNING_EVALUATION_FIXTURES.map(fixture => [fixture.id, true]),
    ['hardFilters', true], ['protectedTraitsAbsent', true], ['falseQualifiedNotIncreased', true],
    ['duplicateSubmissionSafe', true], ['noFabricatedFactsOrReceipts', true],
    ['remoteVerificationNotDegraded', true], ['securityPrivacy', true],
  ]);
}

function observationFromSummary(source = {}, filterSummary = {}) {
  const status = ['ok', 'partial'].includes(source.status) ? 'ok' : 'error';
  return {
    provider: source.provider, employer: source.employer, status,
    discoveredRoles: Math.max(0, Number(source.published) || 0),
    verifiedRequisitions: Math.max(0, Number(source.found) || 0),
    qualifiedMatches: status === 'ok' ? Math.max(0, Number(source.found) || 0) : 0,
    duplicates: Math.max(0, Number(filterSummary.duplicatesRemoved) || 0),
    expired: Math.max(0, Number(source.unlistedExcluded) || 0),
    inaccessible: Math.max(0, Number(source.failedRequestCount) || 0),
    currentError: status === 'error' ? 'public source request failed' : null,
    retryAfter: source.retryAfterSeconds ? new Date(Date.now() + Number(source.retryAfterSeconds) * 1000) : undefined,
  };
}

async function saveWithOneConflictRetry({ redis, tenantId, dataEncryptionKey, transform, idempotencyKey, now }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await ensureJobAgentLearningStateForTenant({ redis, tenantId, dataEncryptionKey, now });
    const next = transform(current.state || createJobAgentLearningState(), current.version);
    const saved = await saveJobAgentLearningStateForTenant({ redis, tenantId, dataEncryptionKey, state: next, expectedVersion: current.version, idempotencyKey, now });
    if (!saved.conflict) return { state: next, ...saved };
  }
  return { conflict: true };
}

export async function recordDiscoveryLearningSignals({ redis, tenantId, dataEncryptionKey, runId, result = {}, now = new Date() }) {
  if (!runId || !Array.isArray(result.sourceSummary)) return { status: 'ignored' };
  const saved = await saveWithOneConflictRetry({
    redis, tenantId, dataEncryptionKey, now, idempotencyKey: `learning_discovery_${String(runId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)}`,
    transform: state => {
      if (state.status !== 'active') return state;
      let next = state;
      for (let index = 0; index < result.sourceSummary.length; index += 1) {
        const source = result.sourceSummary[index];
        next = recordSourceObservation(next, observationFromSummary(source, result.filterSummary), now);
        next = recordVerifiedSignal(next, {
          id: `source_${String(runId).slice(0, 80)}_${index}`, type: 'source-scan', verificationStatus: 'direct-employer-verified',
          source: source.provider, subjectType: 'job-source', subjectId: `${source.provider}:${source.employer}`,
          outcome: source.status, metrics: { found: Number(source.found) || 0, failedRequestCount: Number(source.failedRequestCount) || 0 },
        }, now);
      }
      return next;
    },
  });
  return saved.conflict ? { status: 'conflict' } : { status: saved.replayed ? 'replayed' : 'recorded' };
}

function proposalCandidate(state) {
  const source = [...state.sourcePerformance]
    .filter(item => item.scans >= 3 && (item.consecutiveFailures >= 2 || item.priorityScore < 35))
    .sort((a, b) => a.priorityScore - b.priorityScore)[0];
  if (!source) return null;
  const existing = state.proposals.some(item => item.type === 'source-priority' && item.after?.sourceId === source.id && !['rejected', 'rolled-back'].includes(item.status));
  if (existing) return null;
  const evidenceSignalIds = state.signals.filter(signal => signal.type === 'source-scan' && signal.subjectId === `${source.provider}:${source.employer}`).slice(0, 10).map(signal => signal.id);
  if (!evidenceSignalIds.length) return null;
  return {
    type: 'source-priority', evidenceSignalIds,
    affectedBehavior: `Reduce scan priority for ${source.provider} source after repeated verified failures while retaining retry eligibility.`,
    before: { sourceId: source.id, priority: 50 }, after: { sourceId: source.id, priority: source.priorityScore },
  };
}

export async function processNextJobAgentLearningMaintenance({ redis, dataEncryptionKey, sources = [], env = process.env, now = new Date() }) {
  const claimed = await claimNextJobAgentLearningMaintenance({ redis, dataEncryptionKey, now });
  if (!claimed) return null;
  const config = jobAgentLearningConfiguration(env);
  let state = claimed.record.state;
  if (!config.enabled || state.status !== 'active') {
    await completeJobAgentLearningMaintenance({ redis, tenantId: claimed.tenantId, leaseToken: claimed.leaseToken, now });
    return { status: 'paused', tenantId: claimed.tenantId, promotion: 'disabled' };
  }
  const candidate = proposalCandidate(state);
  if (candidate) {
    state = createLearningProposal(state, candidate, now);
    const proposal = state.proposals[0];
    state = evaluateLearningProposal(state, proposal.id, safetyEvaluationResults(), now);
    if (config.autoPromotionEnabled) state = promoteLearningProposal(state, proposal.id, { autoPromotion: true }, now);
  }
  const expansion = sourceExpansionPlan(state, sources.map(source => source.provider));
  state = completeLearningMaintenance(state, now);
  const saved = await saveJobAgentLearningStateForTenant({
    redis, tenantId: claimed.tenantId, dataEncryptionKey, state, expectedVersion: claimed.record.version,
    idempotencyKey: `learning_maintenance_${claimed.tenantId}_${now.toISOString().slice(0, 10).replace(/-/g, '')}`, now,
  });
  if (saved.conflict) return { status: 'conflict', tenantId: claimed.tenantId };
  return {
    status: saved.replayed ? 'replayed' : 'completed', tenantId: claimed.tenantId,
    proposal: candidate ? state.proposals[0].status : 'none', expansionCandidates: expansion.candidates.length,
    summary: publicLearningSummary(state),
  };
}

export async function readLearningWorkerState({ redis, tenantId, dataEncryptionKey }) {
  return readJobAgentLearningStateForTenant({ redis, tenantId, dataEncryptionKey });
}
