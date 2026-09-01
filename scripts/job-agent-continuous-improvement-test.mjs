import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LEARNING_EVALUATION_FIXTURES, applyLearnedPreferencesToMission, automaticRollbackIfRegressed,
  correctPreference, createJobAgentLearningState, createLearningProposal, evaluateLearningProposal,
  promoteLearningProposal, publicLearningSummary, recordPreference, recordSourceObservation,
  recordVerifiedSignal, rollbackLearningPolicy, setLearningStatus, sourceExpansionPlan,
} from '../lib/job-agent-learning-domain.js';
import { claimNextJobAgentLearningMaintenance, completeJobAgentLearningMaintenance, readJobAgentLearningState, saveJobAgentLearningState } from '../lib/job-agent-learning-store.js';
import { jobMatchesMission } from '../lib/public-ats-discovery.js';
import { subscriberStatus } from '../client/subscriber-ui-model.js';

const at = offset => new Date(Date.parse('2026-09-01T12:00:00.000Z') + offset * 60_000);
const verified = { originalSource: 'candidate confirmation', confidence: 1, verificationStatus: 'user-confirmed', userConfirmed: true };
const allPass = Object.fromEntries([
  ...LEARNING_EVALUATION_FIXTURES.map(item => [item.id, true]), ['hardFilters', true], ['protectedTraitsAbsent', true],
  ['falseQualifiedNotIncreased', true], ['duplicateSubmissionSafe', true], ['noFabricatedFactsOrReceipts', true],
  ['remoteVerificationNotDegraded', true], ['securityPrivacy', true],
]);

let state = createJobAgentLearningState({ createdAt: at(0).toISOString(), updatedAt: at(0).toISOString() });
state = setLearningStatus(state, 'active', at(1));
state = recordPreference(state, { key: 'remoteOnly', label: 'Remote only', value: true, ...verified }, at(2));
assert.equal(applyLearnedPreferencesToMission(state, { role: 'Procurement Manager', workModes: ['Hybrid'], location: 'New Jersey' }).workModes[0], 'Remote');
assert.equal(createJobAgentLearningState(JSON.parse(JSON.stringify(state))).preferences[0].normalizedValue, true, 'confirmed preferences survive a restart');

const conflict = recordPreference(state, { key: 'remoteOnly', value: false, originalSource: 'model suggestion', confidence: .7, verificationStatus: 'provider-confirmed', userConfirmed: false }, at(3));
assert.equal(conflict.preferences[0].normalizedValue, true, 'confirmed preferences cannot be silently overwritten');
assert.equal(conflict.humanActions[0].type, 'CONFLICTING_CONFIRMED_PREFERENCE');
state = correctPreference(conflict, { id: conflict.preferences[0].id, value: false, originalSource: 'Learning Center correction', userConfirmed: true }, at(4));
assert.equal(state.corrections.length, 1);

for (let index = 0; index < 3; index += 1) state = recordSourceObservation(state, { provider: 'greenhouse', employer: 'Example Corp', status: 'error', inaccessible: 1 }, at(5 + index));
const failedSource = state.sourcePerformance[0];
assert.ok(failedSource.priorityScore < 50, 'poor sources are down-ranked');
state = recordSourceObservation(state, { provider: 'greenhouse', employer: 'Example Corp', status: 'ok', discoveredRoles: 2, verifiedRequisitions: 1 }, at(9));
assert.equal(state.sourcePerformance[0].consecutiveFailures, 0, 'one success restores retry eligibility');

let exhausted = createJobAgentLearningState({ createdAt: at(0).toISOString(), updatedAt: at(0).toISOString() });
for (let index = 0; index < 3; index += 1) exhausted = recordSourceObservation(exhausted, { provider: 'greenhouse', employer: 'Empty Employer', status: 'ok', verifiedRequisitions: 0 }, at(index));
const expansion = sourceExpansionPlan(exhausted, ['greenhouse']);
assert.equal(expansion.exhausted, true);
assert.ok(expansion.candidates.some(item => item.provider === 'lever' && item.activation === 'eligible-after-source-identity-review'));
assert.ok(expansion.candidates.some(item => item.provider === 'workday' && item.activation === 'operator-review-required'));

const remoteMission = { role: 'Procurement Manager', workModes: ['Remote'], location: 'New Jersey', employmentTypes: ['Full-time'] };
assert.equal(jobMatchesMission({ title: 'Procurement Manager', workplaceType: 'Hybrid', location: 'Newark, NJ', remote: false, employmentType: 'Full-time' }, remoteMission), false);
assert.equal(jobMatchesMission({ title: 'Procurement Manager', workplaceType: 'On-site; remote candidates may be considered', location: 'Newark, NJ', remote: false, employmentType: 'Full-time' }, remoteMission), false);
assert.equal(jobMatchesMission({ title: 'Procurement Manager', workplaceType: 'Remote', location: 'United States', remote: true, employmentType: 'Full-time', description: 'Remote role. Not available in New Jersey.' }, remoteMission), false);

assert.equal(subscriberStatus({ status: 'Submitted' }), 'Applying', 'receipt-free applications never become Submitted');
assert.equal(subscriberStatus({ status: 'Submitted', receipt: { confirmationId: 'AUTH-1', receivedAt: at(10).toISOString() } }), 'Receipt Verified');
assert.throws(() => recordVerifiedSignal(state, { type: 'authoritative-submission', verificationStatus: 'authoritative-receipt', authoritativeReceipt: false, source: 'form state' }), /authoritative employer receipt/i);

state = recordVerifiedSignal(state, { id: 'verified_interview_1', type: 'interview', verificationStatus: 'provider-confirmed', source: 'user tracker', subjectType: 'application', subjectId: 'app-1', outcome: 'interview' }, at(11));
const priorScore = state.sourcePerformance[0].priorityScore;
state = recordSourceObservation(state, { provider: 'greenhouse', employer: 'Example Corp', status: 'ok', interviews: 1 }, at(12));
assert.ok(state.sourcePerformance[0].priorityScore > priorScore, 'verified interviews improve source ranking');
assert.throws(() => recordVerifiedSignal(state, { type: 'interview', verificationStatus: 'provider-confirmed', source: 'race based ranking', subjectType: 'application', subjectId: 'app-2' }), /protected traits/i);

state = recordVerifiedSignal(state, { id: 'source_evidence_1', type: 'source-scan', verificationStatus: 'direct-employer-verified', source: 'greenhouse', subjectType: 'job-source', subjectId: 'greenhouse:Example Corp', outcome: 'error' }, at(13));
state = createLearningProposal(state, { id: 'proposal_low_1', type: 'source-priority', evidenceSignalIds: ['source_evidence_1'], affectedBehavior: 'Reduce priority after verified failures.', before: { priority: 50 }, after: { sourceId: failedSource.id, priority: 25 } }, at(14));
state = evaluateLearningProposal(state, 'proposal_low_1', { ...allPass, 'hybrid-role': false }, at(15));
assert.equal(state.proposals.find(item => item.id === 'proposal_low_1').status, 'failed-evaluation');
assert.throws(() => promoteLearningProposal(state, 'proposal_low_1', { autoPromotion: true }), /fully evaluated/i);

state = createLearningProposal(state, { id: 'proposal_low_2', type: 'source-priority', evidenceSignalIds: ['source_evidence_1'], affectedBehavior: 'Retry-safe source priority adjustment.', before: { priority: 50 }, after: { sourceId: failedSource.id, priority: 30 } }, at(16));
state = evaluateLearningProposal(state, 'proposal_low_2', allPass, at(17));
const baseline = state.activePolicyVersion;
assert.throws(() => promoteLearningProposal(state, 'proposal_low_2', { autoPromotion: true, killSwitch: true }), /kill switch/i);
state = promoteLearningProposal(state, 'proposal_low_2', { autoPromotion: true }, at(18));
const promoted = state.activePolicyVersion;
assert.notEqual(promoted, baseline);
state = rollbackLearningPolicy(state, baseline, 'test rollback', at(19));
assert.equal(state.activePolicyVersion, baseline);

state = createLearningProposal(state, { id: 'proposal_high_1', type: 'hard-filter', evidenceSignalIds: ['source_evidence_1'], affectedBehavior: 'Change remote requirement.', before: { remoteOnly: true }, after: { remoteOnly: false } }, at(20));
state = evaluateLearningProposal(state, 'proposal_high_1', allPass, at(21));
assert.throws(() => promoteLearningProposal(state, 'proposal_high_1', { autoPromotion: true }), /human approval/i);
state = promoteLearningProposal(state, 'proposal_high_1', { humanApproved: true }, at(22));
let monitored = setLearningStatus(state, 'active', at(23));
const beforeMonitor = monitored.activePolicyVersion;
monitored = automaticRollbackIfRegressed(monitored, { securityPrivacyRegression: true }, at(24));
assert.equal(monitored.status, 'paused');
assert.notEqual(monitored.activePolicyVersion, beforeMonitor);

for (const prohibited of [{ key: 'password', value: 'hunter2' }, { key: 'loginNote', value: 'OTP 123456' }, { key: 'securityCode', value: '9999' }, { key: 'captchaAnswer', value: 'traffic lights' }]) {
  assert.throws(() => recordPreference(state, { ...prohibited, ...verified }), /not allowed|safe preference/i);
}
assert.throws(() => recordVerifiedSignal(state, { type: 'source-scan', verificationStatus: 'direct-employer-verified', demo: true, source: 'fixture', subjectType: 'source', subjectId: 'demo' }), /demo or simulated/i);
assert.ok(publicLearningSummary(state).recentActivity.every(item => item.id && item.at), 'dashboard activity is persisted evidence');

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async zrem(key, member) { return this.sorted.get(key)?.delete(member) ? 1 : 0; }
  zadd(key, score, member) { const map = this.sorted.get(key) || new Map(); map.set(member, Number(score)); this.sorted.set(key, map); }
  async zrange(key, start, stop, options = {}) { const rows = [...(this.sorted.get(key) || new Map()).entries()].sort((a, b) => a[1] - b[1]); return options.byScore ? rows.filter(([, score]) => score >= Number(start) && score <= Number(stop)).slice(options.offset || 0, (options.offset || 0) + (options.count || rows.length)).map(([id]) => id) : rows.map(([id]) => id); }
  async eval(script, keys, args) {
    if (script.includes("return {'saved', ARGV[2]}") && script.includes('ZADD')) { const replay = this.values.get(keys[1]); if (replay) return ['replayed', replay]; const raw = this.values.get(keys[0]); const current = raw ? Number(JSON.parse(raw).version) || 0 : 0; if (current !== Number(args[0])) return ['conflict', String(current)]; this.values.set(keys[0], args[2]); this.values.set(keys[1], args[1]); this.zadd(keys[2], args[5], args[6]); return ['saved', args[1]]; }
    if (script.includes("return {'claimed', cjson.encode(record)}")) { const raw = this.values.get(keys[0]); if (!raw) return ['missing']; const record = JSON.parse(raw); if (record.leaseUntil && record.leaseUntil > args[0]) return ['leased']; record.leaseTokenHash = args[1]; record.leaseUntil = args[2]; this.values.set(keys[0], JSON.stringify(record)); this.zadd(keys[1], args[4], args[5]); return ['claimed', JSON.stringify(record)]; }
    if (script.includes("return {'completed'}")) { const record = JSON.parse(this.values.get(keys[0])); if (record.leaseTokenHash !== args[0]) return ['lease_lost']; record.leaseTokenHash = ''; record.leaseUntil = ''; this.values.set(keys[0], JSON.stringify(record)); this.zadd(keys[1], args[2], args[3]); return ['completed']; }
    throw new Error('Unexpected learning store script.');
  }
}

const redis = new FakeRedis();
const store = { redis, subject: 'tenant-a@example.test', partitionSecret: 'partition-secret-for-learning-tests-000000', dataEncryptionKey: Buffer.alloc(32, 9).toString('base64') };
const saved = await saveJobAgentLearningState({ ...store, state, expectedVersion: 0, idempotencyKey: 'learning_save_0001', now: at(24), nextMaintenanceAt: at(25) });
assert.equal(saved.version, 1);
assert.equal((await readJobAgentLearningState(store)).state.preferences.length, state.preferences.length);
assert.equal((await readJobAgentLearningState({ ...store, subject: 'tenant-b@example.test' })).state, null, 'cross-tenant reads fail closed');
assert.equal((await saveJobAgentLearningState({ ...store, state, expectedVersion: 0, idempotencyKey: 'learning_save_0001', now: at(24), nextMaintenanceAt: at(25) })).replayed, true);
const claimed = await claimNextJobAgentLearningMaintenance({ ...store, now: at(26) });
assert.ok(claimed?.leaseToken, 'background work is claimed without a user prompt');
assert.equal(await completeJobAgentLearningMaintenance({ redis, tenantId: claimed.tenantId, leaseToken: 'wrong', now: at(27) }), false);
assert.equal(await completeJobAgentLearningMaintenance({ redis, tenantId: claimed.tenantId, leaseToken: claimed.leaseToken, now: at(27) }), true, 'interrupted workers resume from a retained lease');

const migration = await readFile(new URL('../migrations/002_job_agent_continuous_improvement.sql', import.meta.url), 'utf8');
for (const table of ['candidate_preferences', 'fact_corrections', 'source_performance', 'learning_signals', 'learning_proposals', 'evaluation_runs', 'policy_versions']) assert.match(migration, new RegExp(`create table if not exists ${table}`));
assert.match(migration, /enable row level security/);

console.log('Continuous-improvement verified memory, source learning, evaluation, rollback, persistence, tenant-isolation, and scheduling tests passed.');
