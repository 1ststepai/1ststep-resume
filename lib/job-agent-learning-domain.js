import { createHash, randomUUID } from 'node:crypto';
import { PROHIBITED_CREDENTIAL_KEY, PROHIBITED_SECRET_VALUE } from './prohibited-secret.js';

export const JOB_AGENT_LEARNING_SCHEMA_VERSION = 1;
export const JOB_AGENT_LEARNING_POLICY_VERSION = 'learning-baseline-2026-09-01';

export const LOW_RISK_PROPOSAL_TYPES = Object.freeze([
  'query-term-weight', 'title-synonym', 'source-priority', 'retry-window', 'freshness-weight',
]);
export const HIGH_RISK_PROPOSAL_TYPES = Object.freeze([
  'candidate-fact', 'hard-filter', 'compensation-authority', 'geography-requirement', 'remote-requirement',
  'screening-answer', 'legal-certification', 'outside-employment', 'privacy-control', 'submission-authority',
  'personal-data-transmission', 'attestation', 'electronic-signature',
]);

export const SOURCE_ADAPTER_CATALOG = Object.freeze([
  { provider: 'greenhouse', mode: 'public-api', readiness: 'operational' },
  { provider: 'lever', mode: 'public-api', readiness: 'operational' },
  { provider: 'ashby', mode: 'public-api', readiness: 'operational' },
  { provider: 'smartrecruiters', mode: 'public-api', readiness: 'operational' },
  { provider: 'workday', mode: 'employer-specific-contract', readiness: 'operator-review-required' },
  { provider: 'icims', mode: 'employer-specific-contract', readiness: 'operator-review-required' },
  { provider: 'eightfold', mode: 'employer-specific-contract', readiness: 'operator-review-required' },
  { provider: 'rippling', mode: 'employer-specific-contract', readiness: 'operator-review-required' },
  { provider: 'silkroad', mode: 'employer-specific-contract', readiness: 'operator-review-required' },
]);

export const LEARNING_EVALUATION_FIXTURES = Object.freeze([
  { id: 'strong-remote-match', expected: 'qualified' },
  { id: 'false-positive-title-only', expected: 'rejected' },
  { id: 'hybrid-role', expected: 'rejected' },
  { id: 'remote-may-be-considered', expected: 'rejected' },
  { id: 'state-exclusion-new-jersey', expected: 'rejected' },
  { id: 'salary-below-floor', expected: 'rejected' },
  { id: 'category-management-exclusion', expected: 'rejected' },
  { id: 'technical-skill-gap', expected: 'rejected' },
  { id: 'stale-requisition', expected: 'rejected' },
  { id: 'duplicate-requisition', expected: 'rejected' },
  { id: 'practical-ai-implementation', expected: 'qualified' },
  { id: 'cold-calling-role', expected: 'rejected' },
]);

const ALLOWED_SIGNAL_TYPES = new Set([
  'user-approval', 'user-rejection', 'user-correction', 'qualification-gap', 'remote-failure',
  'geography-failure', 'salary-failure', 'travel-failure', 'schedule-failure', 'category-failure',
  'freshness-failure', 'duplicate', 'expired', 'source-scan', 'authoritative-submission',
  'employer-rejection', 'recruiter-response', 'interview', 'offer', 'match-rating', 'document-rating',
]);
const VERIFIED_SIGNAL_STATES = new Set(['user-confirmed', 'direct-employer-verified', 'authoritative-receipt', 'provider-confirmed']);
const PROTECTED_TRAIT = /\b(?:race|ethnicity|religion|sex|gender|pregnan(?:t|cy)|age|disability|veteran|genetic|national origin)\b/i;
const SECRET_KEY = PROHIBITED_CREDENTIAL_KEY;
const SECRET_VALUE = PROHIBITED_SECRET_VALUE;
const PROHIBITED_PRIVATE_KEY = /(?:governmentId|socialSecurity|ssn|passport|driverLicenseNumber|medical|diagnosis|healthRecord)/i;
const CHALLENGE_CONTENT = /\b(?:otp|one[- ]time (?:password|code)|captcha(?: answer)?|security code|verification code)\b/i;
const MAX = Object.freeze({ preferences: 100, corrections: 300, signals: 750, sources: 250, proposals: 100, evaluations: 200, policies: 30, events: 750, actions: 100, bytes: 900_000 });

const clone = value => JSON.parse(JSON.stringify(value));
const text = (value, max = 240) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const stamp = value => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) throw new Error('A valid learning timestamp is required.');
  return date.toISOString();
};
const event = (type, objectType, objectId, at, metadata = {}) => ({
  id: randomUUID(), type: text(type, 80), objectType: text(objectType, 60), objectId: text(objectId, 128), at: stamp(at), metadata: clone(metadata),
});

function assertNoSecrets(value, path = 'learning') {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoSecrets(item, `${path}.${index}`));
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_KEY.test(key) || PROHIBITED_PRIVATE_KEY.test(key)) throw new Error(`Credentials, government identifiers, medical data, and challenge answers are not allowed in learned state: ${path}.${key}`);
      assertNoSecrets(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && (SECRET_VALUE.test(value) || CHALLENGE_CONTENT.test(value))) throw new Error(`Credentials and challenge answers are not allowed in learned state: ${path}`);
}

function normalizedValue(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) return [...new Set(value.map(item => text(item, 160).toLowerCase()).filter(Boolean))].sort();
  return text(value, 600).toLowerCase().replace(/\s+/g, ' ');
}

function hashValue(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function createJobAgentLearningState(input = {}) {
  const state = {
    schemaVersion: JOB_AGENT_LEARNING_SCHEMA_VERSION,
    status: input.status === 'paused' ? 'paused' : 'active',
    activePolicyVersion: text(input.activePolicyVersion || JOB_AGENT_LEARNING_POLICY_VERSION, 120),
    preferences: Array.isArray(input.preferences) ? input.preferences : [],
    corrections: Array.isArray(input.corrections) ? input.corrections : [],
    sourcePerformance: Array.isArray(input.sourcePerformance) ? input.sourcePerformance : [],
    signals: Array.isArray(input.signals) ? input.signals : [],
    proposals: Array.isArray(input.proposals) ? input.proposals : [],
    evaluations: Array.isArray(input.evaluations) ? input.evaluations : [],
    policyVersions: Array.isArray(input.policyVersions) && input.policyVersions.length ? input.policyVersions : [{
      version: JOB_AGENT_LEARNING_POLICY_VERSION, parentVersion: null, status: 'active', proposalId: null,
      behavior: { queryTerms: {}, titleSynonyms: {}, sourcePriority: {}, retryWindows: {}, freshnessWeight: 1 },
      activatedAt: input.createdAt || null, rolledBackAt: null,
    }],
    humanActions: Array.isArray(input.humanActions) ? input.humanActions : [],
    events: Array.isArray(input.events) ? input.events : [],
    lastMaintenanceAt: input.lastMaintenanceAt || null,
    createdAt: input.createdAt || null,
    updatedAt: input.updatedAt || null,
  };
  return validateJobAgentLearningState(state);
}

export function setLearningStatus(inputState, status, at = new Date()) {
  const state = createJobAgentLearningState(inputState);
  if (!['active', 'paused'].includes(status)) throw new Error('Learning status must be active or paused.');
  const now = stamp(at);
  return validateJobAgentLearningState({ ...state, status, updatedAt: now, events: [...state.events, event(status === 'active' ? 'LEARNING_RESUMED' : 'LEARNING_PAUSED', 'learning-profile', 'current', now)] });
}

export function recordPreference(inputState, input = {}, at = new Date()) {
  const state = createJobAgentLearningState(inputState);
  const key = text(input.key, 80);
  const source = text(input.originalSource || input.source, 200);
  const verificationStatus = text(input.verificationStatus, 40);
  const confidence = Number(input.confidence);
  const value = normalizedValue(input.value);
  if (!key || SECRET_KEY.test(key) || PROHIBITED_PRIVATE_KEY.test(key)) throw new Error('A safe preference key is required.');
  if (value === '' || value == null || (Array.isArray(value) && !value.length)) throw new Error('A preference value is required.');
  if (!source) throw new Error('Preference provenance is required.');
  if (!VERIFIED_SIGNAL_STATES.has(verificationStatus)) throw new Error('Preference verification must come from a verified source.');
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Preference confidence must be between 0 and 1.');
  const userConfirmed = input.userConfirmed === true;
  const now = stamp(at);
  const existing = state.preferences.find(item => item.key === key && item.status === 'active');
  const differs = existing && hashValue(existing.normalizedValue) !== hashValue(value);
  if (differs && existing.userConfirmed && !userConfirmed) {
    const action = {
      id: randomUUID(), type: 'CONFLICTING_CONFIRMED_PREFERENCE', status: 'open', preferenceKey: key,
      summary: `Confirm the new ${text(input.label || key, 100)} value before it replaces your saved preference.`, createdAt: now,
    };
    return validateJobAgentLearningState({ ...state, humanActions: [action, ...state.humanActions].slice(0, MAX.actions), updatedAt: now, events: [...state.events, event('PREFERENCE_CONFLICT_QUEUED', 'preference', key, now)] });
  }
  const record = {
    id: existing?.id || randomUUID(), key, label: text(input.label || key, 120), normalizedValue: value,
    originalSource: source, recordedAt: now, confidence, verificationStatus, userConfirmed,
    usedIn: existing?.usedIn || [], correctionHistory: existing?.correctionHistory || [], status: 'active', updatedAt: now,
  };
  const preferences = existing ? state.preferences.map(item => item.id === existing.id ? record : item) : [record, ...state.preferences];
  return validateJobAgentLearningState({ ...state, preferences, updatedAt: now, events: [...state.events, event(existing ? 'PREFERENCE_UPDATED' : 'PREFERENCE_RECORDED', 'preference', record.id, now, { key, userConfirmed })] });
}

export function correctPreference(inputState, input = {}, at = new Date()) {
  const state = createJobAgentLearningState(inputState);
  const existing = state.preferences.find(item => item.id === input.id || item.key === input.key);
  if (!existing || existing.status !== 'active') throw new Error('Active preference not found.');
  if (input.userConfirmed !== true) throw new Error('A preference correction must be explicitly user-confirmed.');
  const now = stamp(at);
  const correction = {
    id: randomUUID(), preferenceId: existing.id, key: existing.key, previousValue: clone(existing.normalizedValue),
    correctedValue: normalizedValue(input.value), source: text(input.originalSource || 'user correction', 200),
    userConfirmed: true, correctedAt: now,
  };
  const updated = {
    ...existing, normalizedValue: correction.correctedValue, originalSource: correction.source, recordedAt: now,
    confidence: 1, verificationStatus: 'user-confirmed', userConfirmed: true,
    correctionHistory: [...existing.correctionHistory, correction.id], updatedAt: now,
  };
  return validateJobAgentLearningState({
    ...state,
    preferences: state.preferences.map(item => item.id === existing.id ? updated : item),
    corrections: [correction, ...state.corrections].slice(0, MAX.corrections),
    humanActions: state.humanActions.map(item => item.preferenceKey === existing.key && item.status === 'open' ? { ...item, status: 'resolved', resolvedAt: now } : item),
    updatedAt: now, events: [...state.events, event('PREFERENCE_CORRECTED', 'preference', existing.id, now, { key: existing.key })],
  });
}

export function revokePreference(inputState, preferenceId, at = new Date()) {
  const state = createJobAgentLearningState(inputState);
  const existing = state.preferences.find(item => item.id === preferenceId);
  if (!existing) throw new Error('Preference not found.');
  const now = stamp(at);
  return validateJobAgentLearningState({ ...state, preferences: state.preferences.map(item => item.id === preferenceId ? { ...item, status: 'revoked', revokedAt: now, updatedAt: now } : item), updatedAt: now, events: [...state.events, event('PREFERENCE_REVOKED', 'preference', preferenceId, now, { key: existing.key })] });
}

export function markPreferenceUsed(inputState, key, usage = {}, at = new Date()) {
  const state = createJobAgentLearningState(inputState);
  const now = stamp(at);
  const preferences = state.preferences.map(item => item.key !== key || item.status !== 'active' ? item : {
    ...item, usedIn: [...item.usedIn, { type: text(usage.type, 60), id: text(usage.id, 128), at: now }].slice(-100), updatedAt: now,
  });
  return validateJobAgentLearningState({ ...state, preferences, updatedAt: now });
}

export function recordVerifiedSignal(inputState, input = {}, at = new Date()) {
  const state = createJobAgentLearningState(inputState);
  const type = text(input.type, 60);
  const verificationStatus = text(input.verificationStatus, 40);
  if (!ALLOWED_SIGNAL_TYPES.has(type)) throw new Error('Learning signal type is not allowed.');
  if (!VERIFIED_SIGNAL_STATES.has(verificationStatus)) throw new Error('Unverified activity cannot become a learning signal.');
  if (input.simulated === true || input.demo === true) throw new Error('Demo or simulated activity cannot become a learning signal.');
  if (PROTECTED_TRAIT.test(JSON.stringify(input))) throw new Error('Protected traits cannot be used as learning signals.');
  if (type === 'authoritative-submission' && input.authoritativeReceipt !== true) throw new Error('A submission signal requires an authoritative employer receipt.');
  const now = stamp(at);
  const signal = {
    id: text(input.id, 128) || randomUUID(), type, verificationStatus, source: text(input.source, 160),
    subjectType: text(input.subjectType, 60), subjectId: text(input.subjectId, 128), outcome: text(input.outcome, 120),
    metrics: clone(input.metrics && typeof input.metrics === 'object' ? input.metrics : {}), recordedAt: now,
  };
  if (state.signals.some(item => item.id === signal.id)) return state;
  return validateJobAgentLearningState({ ...state, signals: [signal, ...state.signals].slice(0, MAX.signals), updatedAt: now, events: [...state.events, event('VERIFIED_SIGNAL_RECORDED', 'signal', signal.id, now, { type })] });
}

export function recordSourceObservation(inputState, input = {}, at = new Date()) {
  let state = createJobAgentLearningState(inputState);
  const provider = text(input.provider, 60).toLowerCase();
  const employer = text(input.employer, 120);
  if (!provider || !employer) throw new Error('A source provider and employer are required.');
  const sourceId = `${provider}:${createHash('sha256').update(employer.toLowerCase()).digest('hex').slice(0, 16)}`;
  const now = stamp(at);
  const prior = state.sourcePerformance.find(item => item.id === sourceId);
  const count = key => Math.max(0, Math.floor(Number(input[key]) || 0));
  const consecutiveFailures = input.status === 'error' ? (prior?.consecutiveFailures || 0) + 1 : 0;
  const scans = (prior?.scans || 0) + 1;
  const verified = (prior?.verifiedRequisitions || 0) + count('verifiedRequisitions');
  const failures = (prior?.failures || 0) + (input.status === 'error' ? 1 : 0);
  const nextInterviews = (prior?.interviews || 0) + count('interviews');
  const nextOffers = (prior?.offers || 0) + count('offers');
  const productive = verified + nextInterviews * 5 + nextOffers * 12;
  const penalty = failures + (prior?.expired || 0) + (prior?.duplicates || 0) * 0.25;
  const priorityScore = Math.max(5, Math.min(100, Math.round(50 + productive * 2 - penalty * 3)));
  const next = {
    id: sourceId, provider, employer, scans,
    discoveredRoles: (prior?.discoveredRoles || 0) + count('discoveredRoles'),
    verifiedRequisitions: verified, qualifiedMatches: (prior?.qualifiedMatches || 0) + count('qualifiedMatches'),
    duplicates: (prior?.duplicates || 0) + count('duplicates'), expired: (prior?.expired || 0) + count('expired'),
    inaccessible: (prior?.inaccessible || 0) + count('inaccessible'), remoteFailures: (prior?.remoteFailures || 0) + count('remoteFailures'),
    compensationFailures: (prior?.compensationFailures || 0) + count('compensationFailures'), qualificationFailures: (prior?.qualificationFailures || 0) + count('qualificationFailures'),
    packagesPrepared: (prior?.packagesPrepared || 0) + count('packagesPrepared'), confirmedSubmissions: (prior?.confirmedSubmissions || 0) + count('confirmedSubmissions'),
    interviews: nextInterviews, offers: nextOffers, failures,
    consecutiveFailures, priorityScore, lastSuccessfulScan: input.status === 'error' ? prior?.lastSuccessfulScan || null : now,
    currentError: input.status === 'error' ? text(input.error || 'source unavailable', 120) : null,
    retryAfter: input.status === 'error' ? stamp(input.retryAfter || new Date(new Date(now).getTime() + Math.min(24, 2 ** consecutiveFailures) * 60 * 60 * 1000)) : null,
    updatedAt: now,
  };
  const sourcePerformance = prior ? state.sourcePerformance.map(item => item.id === sourceId ? next : item) : [next, ...state.sourcePerformance];
  state = validateJobAgentLearningState({ ...state, sourcePerformance, updatedAt: now, events: [...state.events, event('SOURCE_OBSERVATION_RECORDED', 'job-source', sourceId, now, { status: input.status === 'error' ? 'error' : 'ok' })] });
  return state;
}

export function sourceExpansionPlan(inputState, configuredProviders = []) {
  const state = createJobAgentLearningState(inputState);
  const configured = new Set(configuredProviders.map(value => text(value, 60).toLowerCase()));
  const exhausted = state.sourcePerformance.length > 0 && state.sourcePerformance.every(source => source.consecutiveFailures >= 2 || (source.scans >= 3 && source.verifiedRequisitions === 0));
  if (!exhausted) return { exhausted: false, candidates: [] };
  return {
    exhausted: true,
    candidates: SOURCE_ADAPTER_CATALOG.filter(adapter => !configured.has(adapter.provider)).map(adapter => ({ ...adapter, activation: adapter.readiness === 'operational' ? 'eligible-after-source-identity-review' : 'operator-review-required' })),
  };
}

export function applyLearnedPreferencesToMission(inputState, inputMission = {}) {
  const state = createJobAgentLearningState(inputState);
  const mission = clone(inputMission && typeof inputMission === 'object' ? inputMission : {});
  const active = Object.fromEntries(state.preferences.filter(item => item.status === 'active' && item.userConfirmed === true).map(item => [item.key, item.normalizedValue]));
  if (active.remoteOnly === true || String(active.workMode || '').toLowerCase() === 'remote') {
    mission.workMode = 'Remote'; mission.workModes = ['Remote'];
    if (!mission.location) mission.location = 'United States';
  }
  if (active.location) mission.location = String(active.location);
  if (Number(active.salaryMin) >= 0) mission.salaryMin = Number(active.salaryMin);
  if (active.employmentType) mission.employmentTypes = Array.isArray(active.employmentType) ? active.employmentType : [String(active.employmentType)];
  if (Array.isArray(active.excludedCompanies)) mission.excludedCompanies = active.excludedCompanies;
  if (Number(active.maxTravelPercent) >= 0) mission.maxTravelPercent = Number(active.maxTravelPercent);
  return mission;
}

export function createLearningProposal(inputState, input = {}, at = new Date()) {
  const state = createJobAgentLearningState(inputState);
  const type = text(input.type, 80);
  const lowRisk = LOW_RISK_PROPOSAL_TYPES.includes(type);
  const highRisk = HIGH_RISK_PROPOSAL_TYPES.includes(type);
  if (!lowRisk && !highRisk) throw new Error('Learning proposal type is not allowed.');
  if (!Array.isArray(input.evidenceSignalIds) || !input.evidenceSignalIds.length || input.evidenceSignalIds.some(id => !state.signals.some(signal => signal.id === id))) throw new Error('A proposal requires retained verified evidence.');
  if (PROTECTED_TRAIT.test(JSON.stringify(input))) throw new Error('Protected traits cannot influence a proposal.');
  const now = stamp(at);
  const id = text(input.id, 128) || randomUUID();
  const version = `proposal-${createHash('sha256').update(`${id}:${now}`).digest('hex').slice(0, 12)}`;
  const proposal = {
    id, version, type, risk: lowRisk ? 'low' : 'high', status: 'proposed', evidenceSignalIds: input.evidenceSignalIds.slice(0, 50),
    affectedBehavior: text(input.affectedBehavior, 500), before: clone(input.before), after: clone(input.after),
    rollback: { restorePolicyVersion: state.activePolicyVersion }, evaluationId: null, createdAt: now, promotedAt: null, rejectedAt: null,
  };
  return validateJobAgentLearningState({ ...state, proposals: [proposal, ...state.proposals].slice(0, MAX.proposals), updatedAt: now, events: [...state.events, event('LEARNING_PROPOSAL_CREATED', 'learning-proposal', id, now, { type, risk: proposal.risk })] });
}

export function evaluateLearningProposal(inputState, proposalId, results = {}, at = new Date()) {
  const state = createJobAgentLearningState(inputState);
  const proposal = state.proposals.find(item => item.id === proposalId);
  if (!proposal) throw new Error('Learning proposal not found.');
  const fixtureResults = LEARNING_EVALUATION_FIXTURES.map(fixture => ({ id: fixture.id, passed: results[fixture.id] === true }));
  const safety = {
    hardFilters: results.hardFilters === true, protectedTraitsAbsent: results.protectedTraitsAbsent === true,
    falseQualifiedNotIncreased: results.falseQualifiedNotIncreased === true, duplicateSubmissionSafe: results.duplicateSubmissionSafe === true,
    noFabricatedFactsOrReceipts: results.noFabricatedFactsOrReceipts === true, remoteVerificationNotDegraded: results.remoteVerificationNotDegraded === true,
    securityPrivacy: results.securityPrivacy === true, rollbackAvailable: Boolean(proposal.rollback?.restorePolicyVersion),
  };
  const passed = fixtureResults.every(item => item.passed) && Object.values(safety).every(Boolean);
  const now = stamp(at);
  const evaluation = { id: randomUUID(), proposalId, datasetVersion: 'verified-job-agent-evals-v1', fixtureResults, safety, passed, evaluatedAt: now };
  return validateJobAgentLearningState({
    ...state,
    evaluations: [evaluation, ...state.evaluations].slice(0, MAX.evaluations),
    proposals: state.proposals.map(item => item.id === proposalId ? { ...item, evaluationId: evaluation.id, status: passed ? 'evaluated' : 'failed-evaluation' } : item),
    updatedAt: now, events: [...state.events, event(passed ? 'LEARNING_EVALUATION_PASSED' : 'LEARNING_EVALUATION_FAILED', 'evaluation', evaluation.id, now, { proposalId })],
  });
}

function applyBehavior(policy, proposal) {
  const behavior = clone(policy.behavior || {});
  if (proposal.type === 'query-term-weight') behavior.queryTerms = { ...(behavior.queryTerms || {}), ...clone(proposal.after || {}) };
  if (proposal.type === 'title-synonym') behavior.titleSynonyms = { ...(behavior.titleSynonyms || {}), ...clone(proposal.after || {}) };
  if (proposal.type === 'source-priority') behavior.sourcePriority = { ...(behavior.sourcePriority || {}), ...clone(proposal.after || {}) };
  if (proposal.type === 'retry-window') behavior.retryWindows = { ...(behavior.retryWindows || {}), ...clone(proposal.after || {}) };
  if (proposal.type === 'freshness-weight') behavior.freshnessWeight = Number(proposal.after?.weight) || behavior.freshnessWeight || 1;
  return behavior;
}

export function promoteLearningProposal(inputState, proposalId, options = {}, at = new Date()) {
  const state = createJobAgentLearningState(inputState);
  const proposal = state.proposals.find(item => item.id === proposalId);
  const evaluation = state.evaluations.find(item => item.id === proposal?.evaluationId);
  if (!proposal || !evaluation?.passed || proposal.status !== 'evaluated') throw new Error('Only a fully evaluated proposal can be promoted.');
  if (state.status !== 'active' || options.killSwitch === true) throw new Error('Learning promotion is paused by the kill switch.');
  if (proposal.risk === 'high' && options.humanApproved !== true) throw new Error('High-risk learning changes require human approval.');
  if (proposal.risk === 'low' && options.autoPromotion !== true && options.humanApproved !== true) throw new Error('Low-risk promotion is not enabled.');
  const active = state.policyVersions.find(item => item.version === state.activePolicyVersion);
  if (!active) throw new Error('Active learning policy is unavailable.');
  const now = stamp(at);
  const version = `learning-${createHash('sha256').update(`${proposal.version}:${now}`).digest('hex').slice(0, 12)}`;
  const policy = { version, parentVersion: active.version, status: 'active', proposalId, behavior: applyBehavior(active, proposal), activatedAt: now, rolledBackAt: null };
  return validateJobAgentLearningState({
    ...state, activePolicyVersion: version,
    policyVersions: [policy, ...state.policyVersions.map(item => item.version === active.version ? { ...item, status: 'superseded' } : item)].slice(0, MAX.policies),
    proposals: state.proposals.map(item => item.id === proposalId ? { ...item, status: 'promoted', promotedAt: now } : item),
    updatedAt: now, events: [...state.events, event('LEARNING_POLICY_PROMOTED', 'policy-version', version, now, { proposalId, previousVersion: active.version })],
  });
}

export function rollbackLearningPolicy(inputState, targetVersion, reason = 'user-requested', at = new Date()) {
  const state = createJobAgentLearningState(inputState);
  const target = state.policyVersions.find(item => item.version === targetVersion);
  if (!target) throw new Error('Rollback policy version not found.');
  const current = state.policyVersions.find(item => item.version === state.activePolicyVersion);
  if (!current) throw new Error('Active learning policy is unavailable.');
  const now = stamp(at);
  return validateJobAgentLearningState({
    ...state, activePolicyVersion: target.version,
    policyVersions: state.policyVersions.map(item => item.version === target.version ? { ...item, status: 'active', activatedAt: now } : item.version === current.version ? { ...item, status: 'rolled-back', rolledBackAt: now } : item),
    updatedAt: now, events: [...state.events, event('LEARNING_POLICY_ROLLED_BACK', 'policy-version', current.version, now, { restoredVersion: target.version, reason: text(reason, 160) })],
  });
}

export function automaticRollbackIfRegressed(inputState, monitoring = {}, at = new Date()) {
  const state = createJobAgentLearningState(inputState);
  const regressed = monitoring.hardFilterFailure === true || monitoring.falseQualifiedIncrease === true || monitoring.duplicateSubmissionRegression === true || monitoring.remoteVerificationDegraded === true || monitoring.securityPrivacyRegression === true;
  if (!regressed) return state;
  const current = state.policyVersions.find(item => item.version === state.activePolicyVersion);
  if (!current?.parentVersion) return setLearningStatus(state, 'paused', at);
  return setLearningStatus(rollbackLearningPolicy(state, current.parentVersion, 'automatic-safety-regression', at), 'paused', at);
}

export function completeLearningMaintenance(inputState, at = new Date()) {
  const state = createJobAgentLearningState(inputState);
  const now = stamp(at);
  return validateJobAgentLearningState({ ...state, lastMaintenanceAt: now, updatedAt: now, events: [...state.events, event('LEARNING_MAINTENANCE_COMPLETED', 'learning-profile', 'current', now)] });
}

export function validateJobAgentLearningState(input) {
  const state = input && typeof input === 'object' && !Array.isArray(input) ? clone(input) : null;
  if (!state || state.schemaVersion !== JOB_AGENT_LEARNING_SCHEMA_VERSION) throw new Error('Job Agent learning schema version 1 is required.');
  if (!['active', 'paused'].includes(state.status)) throw new Error('Job Agent learning status is invalid.');
  const collectionNames = { sources: 'sourcePerformance', policies: 'policyVersions', actions: 'humanActions' };
  for (const [key, limit] of Object.entries(MAX)) {
    if (key === 'bytes') continue;
    const collection = state[collectionNames[key] || key];
    if (!Array.isArray(collection) || collection.length > limit) throw new Error(`Job Agent learning ${key} collection is invalid or exceeds its limit.`);
  }
  if (!state.policyVersions.some(item => item.version === state.activePolicyVersion)) throw new Error('Active learning policy version is missing.');
  assertNoSecrets(state);
  if (PROTECTED_TRAIT.test(JSON.stringify(state.proposals))) throw new Error('Protected traits cannot be used in learning proposals.');
  if (Buffer.byteLength(JSON.stringify(state), 'utf8') > MAX.bytes) throw new Error('Job Agent learning state exceeds the 900 KB beta limit.');
  return state;
}

export function publicLearningSummary(inputState) {
  const state = createJobAgentLearningState(inputState);
  return {
    schemaVersion: state.schemaVersion, status: state.status, activePolicyVersion: state.activePolicyVersion,
    preferences: state.preferences, corrections: state.corrections, sourcePerformance: state.sourcePerformance,
    proposals: state.proposals, evaluations: state.evaluations, policyVersions: state.policyVersions,
    humanActions: state.humanActions.filter(item => item.status === 'open'),
    recentImprovements: state.events.filter(item => ['LEARNING_POLICY_PROMOTED', 'LEARNING_POLICY_ROLLED_BACK', 'PREFERENCE_CORRECTED'].includes(item.type)).slice(-20).reverse(),
    recentActivity: state.events.slice(-30).reverse(), lastMaintenanceAt: state.lastMaintenanceAt, updatedAt: state.updatedAt,
    sourceAdapters: SOURCE_ADAPTER_CATALOG,
  };
}
