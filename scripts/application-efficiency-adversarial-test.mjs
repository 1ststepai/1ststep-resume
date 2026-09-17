import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { grantVaultConsent, revokeVaultFact, upsertVaultFact } from '../lib/applicant-vault-domain.js';
import {
  decryptApplicantVault, encryptApplicantVault, readApplicantVault, saveApplicantVault, tenantVaultKey,
} from '../lib/applicant-vault-store.js';
import {
  forgetAnswerMemory, rememberApplicationAnswer, resolveApplicationAnswer, reuseApplicationAnswers,
} from '../lib/application-answer-memory.js';
import {
  ATOMIC_ANSWER_INTENTS, LEARNING_STATE_CLASSES, applicationEfficiencySnapshot, attachEquivalentAnswerProposals,
  classifyCanonicalIntent, classifyLearningState, createImprovementCandidate, hasImplicitEmployerScope,
  isCompoundQuestion, proposeEquivalentAnswer, publicEquivalentAnswerProposal,
} from '../lib/application-efficiency-foundation.js';

const now = new Date('2026-09-17T14:00:00.000Z');
const START_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
let rememberSeq = 0;

function sessionFor(question, input = {}) {
  rememberSeq += 1;
  const id = input.id || `application_adv_${rememberSeq}`;
  return {
    id,
    state: input.state || 'Waiting for You',
    stage: 'employer_form',
    role: { employer: input.employer || 'Example Employer' },
    actions: [{
      id: input.actionId || `action_adv_${rememberSeq}`,
      type: 'AMBIGUOUS_FACT',
      status: 'open',
      metadata: { question },
    }],
    timeline: [],
    approvals: {},
    createdAt: (input.now || now).toISOString(),
  };
}

function remember(vault, question, statement, input = {}) {
  const session = sessionFor(question, input);
  return {
    vault: rememberApplicationAnswer(vault, session, {
      actionId: session.actions[0].id,
      statement,
      scope: input.scope,
      kind: input.kind,
      sensitiveOptIn: input.sensitiveOptIn === true,
      expiresAt: input.expiresAt,
      replaceVersion: input.replaceVersion,
    }, input.now || now),
    session,
  };
}

function propose(vault, question, input = {}) {
  return proposeEquivalentAnswer(vault, {
    question,
    applicationId: input.applicationId || 'application_other',
    employer: input.employer || 'Other Employer',
    now: (input.now || now).getTime(),
  }, (input.now || now).getTime());
}

function assertUnknown(result, label) {
  assert.equal(result.factId, null, label);
  assert.equal(result.factVersion, null, label);
  assert.equal(result.class, LEARNING_STATE_CLASSES.UNKNOWN_NEEDS_USER, label);
  assert.equal(result.autoResolved, undefined);
}

function assertReviewableProposal(result, intent, label) {
  assert.ok(result.factId, `${label}: factId`);
  assert.ok(result.factVersion, `${label}: factVersion`);
  assert.equal(result.intent, intent, `${label}: intent`);
  assert.equal(result.requiresConfirmation, true, `${label}: confirmation`);
  assert.equal(result.autoResolved, false, `${label}: autoResolved`);
  assert.notEqual(result.class, LEARNING_STATE_CLASSES.CONFIRMED_FACT, `${label}: must not auto-confirm`);
  assert.equal(JSON.stringify(result).includes('@'), false, `${label}: no email in proposal`);
}

assert.equal(classifyLearningState({
  value: 'Authorized to work in the US', verificationState: 'user-confirmed',
}), LEARNING_STATE_CLASSES.CONFIRMED_FACT);
assert.equal(classifyLearningState({
  value: 'remote-first', category: 'preference', userConfirmed: true, verificationState: 'user-confirmed',
}), LEARNING_STATE_CLASSES.USER_PREFERENCE);
assert.notEqual(
  classifyLearningState({ value: 'Authorized to work in the US', verificationState: 'user-confirmed' }),
  classifyLearningState({ value: 'remote-first', category: 'preference', userConfirmed: true, verificationState: 'user-confirmed' }),
);
assert.equal(classifyLearningState({
  value: 'Likely authorized', provenance: 'model inferred from resume', inferred: true, userConfirmed: true,
}), LEARNING_STATE_CLASSES.DERIVED_BUT_REVIEWABLE);
assert.equal(classifyLearningState({
  value: 'Likely authorized', provenance: 'heuristic estimate', inferred: true,
}), LEARNING_STATE_CLASSES.UNKNOWN_NEEDS_USER);
assert.equal(classifyLearningState({
  value: 'Authorized', provenance: 'generated suggestion', verificationState: 'user-confirmed',
}), LEARNING_STATE_CLASSES.DERIVED_BUT_REVIEWABLE);

const blank = grantVaultConsent({}, now);
const authorized = remember(blank, 'Are you authorized to work?', 'I am legally authorized to work.');
assertReviewableProposal(
  propose(authorized.vault, 'Are you legally authorized to work?'),
  'work_authorization',
  'equivalent work-authorization wording',
);

assertUnknown(
  propose(authorized.vault, 'Will you now or in the future require visa sponsorship?'),
  'work-authorization memory must not satisfy sponsorship',
);
assertUnknown(
  propose(authorized.vault, 'Are you legally authorized to work in the United States?'),
  'work-authorization geography remainder must fail closed',
);
assertUnknown(
  propose(authorized.vault, 'Are you legally authorized to work in the United States, and will you now or in the future require visa sponsorship?'),
  'compound authorization+sponsorship must fail closed',
);
assertUnknown(
  propose(authorized.vault, 'Are you eligible to work in the US without sponsorship?'),
  'authorization-without-sponsorship is not work-authorization',
);
assertUnknown(
  propose(authorized.vault, 'Are you not authorized to work in the United States?'),
  'negative work-authorization wording',
);
assertUnknown(
  propose(authorized.vault, 'Are you unauthorized to work in the United States?'),
  'unauthorized inverts authorized',
);
assertUnknown(
  propose(authorized.vault, 'Are you ineligible to work in the United States?'),
  'ineligible inverts eligible',
);
assert.equal(classifyCanonicalIntent('Are you unauthorized to work in the United States?'), null);
assert.equal(classifyCanonicalIntent('Are you legally authorized to work in the United States and will you require visa sponsorship?'), null);

const citizenshipVault = upsertVaultFact(blank, {
  fieldKey: 'citizenship', label: 'Citizenship', value: 'US citizen',
  provenance: 'candidate confirmation', verificationState: 'user-confirmed', confidence: 1,
}, now);
assertUnknown(
  propose(citizenshipVault, 'Are you legally authorized to work in the United States?'),
  'citizenship is not work authorization',
);

const sponsorship = remember(blank, 'Will you now or in the future require visa sponsorship?', 'No, I do not require visa sponsorship.', { sensitiveOptIn: true });
assert.equal(sponsorship.vault.facts[0].versions[0].scope.kind, 'application');
assertUnknown(
  propose(sponsorship.vault, 'Are you authorized to work in the US?', { applicationId: 'application_other' }),
  'application-scoped sponsorship must not answer work-authorization',
);
assertUnknown(
  propose(sponsorship.vault, 'Will you require visa sponsorship?', { applicationId: 'application_other', employer: 'Other Employer' }),
  'application-scoped sponsorship must not generalize to another application',
);

const location = remember(blank, 'What is your current location?', 'Newark, NJ');
assertUnknown(
  propose(location.vault, 'Are you willing to relocate?'),
  'current location must not answer relocation willingness',
);
assertUnknown(
  propose(location.vault, 'Are you able to commute to this office?'),
  'current location must not answer commute',
);
assertUnknown(
  propose(location.vault, 'Are you not willing to relocate?'),
  'negative relocation wording',
);

const relocation = remember(blank, 'Are you willing to relocate?', 'Yes, I am willing to relocate.');
assertUnknown(
  propose(relocation.vault, 'What is your current location?'),
  'relocation willingness must not answer current location',
);
assertUnknown(
  propose(relocation.vault, 'What is your current city?'),
  'relocation willingness must not answer current city',
);

const locationField = upsertVaultFact(blank, {
  fieldKey: 'location', label: 'Location', value: 'Newark, NJ',
  provenance: 'candidate confirmation', verificationState: 'user-confirmed', confidence: 1, autoReuse: true,
}, now);
assertUnknown(
  propose(locationField, 'Are you willing to relocate?'),
  'location field key must not propose for relocation',
);

const salaryField = upsertVaultFact(blank, {
  fieldKey: 'salary', label: 'Salary', value: 'Currently paid 75000 per year',
  provenance: 'candidate confirmation', verificationState: 'user-confirmed', confidence: 1, autoReuse: true,
}, now);
assertUnknown(
  propose(salaryField, 'What is your salary expectation?'),
  'current salary field must not answer desired compensation',
);

const currentPay = remember(blank, 'What is your current salary?', 'I currently earn 75000 per year.');
assertUnknown(
  propose(currentPay.vault, 'What is your salary expectation?'),
  'current compensation must not answer desired compensation',
);
assertUnknown(
  propose(currentPay.vault, 'What is your desired pay?'),
  'current compensation must not answer desired pay',
);

const desiredPay = remember(blank, 'What is your salary expectation?', 'I am targeting 95000 per year.');
assert.equal(desiredPay.vault.facts[0].versions[0].scope.category, 'preference');
const desiredProposal = propose(desiredPay.vault, 'What is your desired salary?');
assertReviewableProposal(desiredProposal, 'desired_compensation', 'equivalent desired compensation');
assert.equal(desiredProposal.class, LEARNING_STATE_CLASSES.USER_PREFERENCE);
assertUnknown(
  propose(desiredPay.vault, 'What is your current salary?'),
  'desired compensation must not answer current compensation',
);

const startRememberedAt = new Date(now.getTime() - START_STALE_AFTER_MS - 24 * 60 * 60 * 1000);
const staleStart = remember(
  blank,
  'When can you start?',
  'I can start on 2026-01-05.',
  { now: startRememberedAt, id: 'application_start_stale' },
);
assertUnknown(
  propose(staleStart.vault, 'What is your earliest start date?', { now }),
  'start-date answers older than 30 days are stale',
);
assertUnknown(
  propose(staleStart.vault, 'When can you start?', { now }),
  'exact start-date wording still cannot reuse a stale fact as an equivalent proposal',
);
const staleExactSession = sessionFor('When can you start?', {
  id: 'application_stale_exact', employer: 'Example Employer',
});
assert.equal(
  reuseApplicationAnswers(staleExactSession, staleStart.vault, now).actions[0].status,
  'open',
  'stale exact start dates must not auto-reuse',
);

const freshStart = remember(
  blank,
  'When can you start?',
  'I can start in two weeks.',
  { now, expiresAt: '2026-10-01', id: 'application_start_fresh' },
);
assertReviewableProposal(
  propose(freshStart.vault, 'What is your earliest start date?', { now }),
  'start_availability',
  'fresh start-date equivalent',
);
assertUnknown(
  propose(freshStart.vault, 'What is your notice period?', { now }),
  'notice period is not a start date',
);

const namedEmployer = remember(
  blank,
  'Are you willing to relocate to Example Employer headquarters?',
  'Yes, I will relocate to Example Employer headquarters.',
  { employer: 'Example Employer', id: 'application_acme' },
);
assert.equal(namedEmployer.vault.facts[0].versions[0].scope.kind, 'application');
assertUnknown(
  propose(namedEmployer.vault, 'Are you willing to relocate?', {
    applicationId: 'application_globex', employer: 'Globex',
  }),
  'employer-named relocation must not generalize',
);

const employerScoped = remember(
  blank,
  'Are you willing to relocate?',
  'Yes for this employer only.',
  { scope: 'employer', employer: 'Example Employer', id: 'application_employer_scope' },
);
assertUnknown(
  propose(employerScoped.vault, 'Are you willing to relocate?', {
    applicationId: 'application_other_employer', employer: 'Globex',
  }),
  'employer-scoped answers must not apply to another employer',
);

const corrected = remember(
  authorized.vault,
  'Are you authorized to work?',
  'I am not a US worker and require review of my status.',
  { replaceVersion: 1, id: authorized.session.id, actionId: authorized.session.actions[0].id },
);
const correctedProposal = propose(corrected.vault, 'Are you legally authorized to work?');
assertReviewableProposal(correctedProposal, 'work_authorization', 'corrected answer');
assert.equal(correctedProposal.factVersion, 2);
assert.notEqual(correctedProposal.factVersion, 1);

const forgotten = forgetAnswerMemory(authorized.vault, authorized.vault.facts[0].id, now);
assertUnknown(
  propose(forgotten, 'Are you legally authorized to work?'),
  'forgotten memory must stop proposing',
);
const revoked = revokeVaultFact(authorized.vault, authorized.vault.facts[0].id, now);
assertUnknown(
  propose(revoked, 'Are you legally authorized to work?'),
  'revoked vault fact must stop proposing',
);

const publicProposal = publicEquivalentAnswerProposal(propose(authorized.vault, 'Are you legally authorized to work?'));
assert.deepEqual(Object.keys(publicProposal).sort(), ['autoResolved', 'class', 'factId', 'factVersion', 'intent', 'requiresConfirmation']);
assert.equal(publicProposal.requiresConfirmation, true);
assert.equal(JSON.stringify(publicProposal).includes('I am legally authorized'), false);

const resolveSession = sessionFor('Are you legally authorized to work?', { id: 'application_resolve' });
assert.throws(
  () => resolveApplicationAnswer(resolveSession, authorized.vault, {
    actionId: resolveSession.actions[0].id,
    factId: publicProposal.factId,
    factVersion: publicProposal.factVersion,
    confirmed: true,
  }, now),
  /current, confirmed remembered answer/,
);
const attached = attachEquivalentAnswerProposals(resolveSession, authorized.vault, now);
assert.equal(attached.actions[0].status, 'open');
assert.equal(attached.actions[0].metadata.equivalentAnswerProposal.factId, publicProposal.factId);
assert.equal(attached.actions[0].metadata.equivalentAnswerProposal.factVersion, publicProposal.factVersion);
assert.equal(attached.actions[0].metadata.equivalentAnswerProposal.autoResolved, false);
assert.equal(reuseApplicationAnswers(resolveSession, authorized.vault, now).actions[0].status, 'open');

const otherTenant = grantVaultConsent({}, now);
assertUnknown(
  propose(otherTenant, 'Are you legally authorized to work?'),
  'a different tenant vault cannot see another user fact',
);
assert.equal(
  propose(authorized.vault, 'Are you legally authorized to work?').factId
    === propose(otherTenant, 'Are you legally authorized to work?').factId,
  false,
);

const partitionSecret = 'partition-secret-that-is-at-least-32-characters';
const dataEncryptionKey = Buffer.alloc(32, 9).toString('base64');
const tenantAKey = tenantVaultKey('worker-a@example.com', partitionSecret);
const tenantBKey = tenantVaultKey('worker-b@example.com', partitionSecret);
assert.notEqual(tenantAKey, tenantBKey);
const envelopeA = encryptApplicantVault(authorized.vault, { key: dataEncryptionKey, tenantKey: tenantAKey });
assert.throws(() => decryptApplicantVault(envelopeA, { key: dataEncryptionKey, tenantKey: tenantBKey }));
class FakeRedis {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async del(key) { this.values.delete(key); }
  async eval(_script, keys, args) {
    const replay = this.values.get(keys[1]);
    if (replay) return ['replayed', replay];
    const raw = this.values.get(keys[0]);
    const current = raw ? Number(JSON.parse(raw).version) || 0 : 0;
    if (current !== Number(args[0])) return ['conflict', String(current)];
    this.values.set(keys[0], args[2]); this.values.set(keys[1], args[1]);
    return ['saved', args[1]];
  }
}
const redis = new FakeRedis();
await saveApplicantVault({
  redis, subject: 'worker-a@example.com', partitionSecret, dataEncryptionKey,
  vault: authorized.vault, expectedVersion: 0, idempotencyKey: 'adv-tenant-a-0001', now,
});
assert.equal((await readApplicantVault({ redis, subject: 'worker-b@example.com', partitionSecret, dataEncryptionKey })).vault, null);

const currentJob = remember(blank, 'What is your current job title?', 'Buyer');
assertUnknown(
  propose(currentJob.vault, 'What job title are you applying for?'),
  'current job title must not answer desired job title',
);

const sensitiveQuestion = sessionFor('Will you now or in the future require visa sponsorship?', { id: 'application_sensitive_review' });
const sensitiveReuse = reuseApplicationAnswers(sensitiveQuestion, sponsorship.vault, now);
assert.equal(sensitiveReuse.actions[0].status, 'open', 'sensitive questions stay review-gated');

const snapshotSession = attachEquivalentAnswerProposals(sessionFor('Are you legally authorized to work?', {
  id: 'application_metrics', employer: 'Secretive Corp',
}), authorized.vault, now);
const snapshot = applicationEfficiencySnapshot(snapshotSession, { qualified: true, unansweredFieldKeys: ['veteranStatus'] });
assert.equal(snapshot.contentFree, true);
assert.equal(snapshot.containsCandidateValues, false);
const snapshotJson = JSON.stringify(snapshot);
assert.equal(snapshotJson.includes('I am legally authorized'), false);
assert.equal(snapshotJson.includes('Secretive Corp'), false);
assert.equal(snapshotJson.includes('worker-a@example.com'), false);
assert.equal(snapshotJson.includes('Newark'), false);

const dirtySnapshot = () => applicationEfficiencySnapshot({
  ...snapshotSession,
  actions: [...snapshotSession.actions, {
    type: 'EMPLOYER_ATS_FAILURE',
    metadata: { reasonCode: 'failed for jordan@example.com salary 95000' },
  }],
});
assert.throws(dirtySnapshot, /content-free|not allowed|reason/i);

assert.throws(() => createImprovementCandidate({
  type: 'unnecessary-interruption',
  expectedBenefit: 'Reuse answers for jordan@example.com',
  evidence: { unansweredFields: 2 },
}), /content-free|not allowed/i);
assert.throws(() => applicationEfficiencySnapshot({
  actions: [{ type: 'EMPLOYER_ATS_FAILURE', metadata: { reasonCode: 'callback-555-123-4567' } }],
}), /content-free|not allowed|reason/i);
assert.throws(() => createImprovementCandidate({
  type: 'unnecessary-interruption',
  expectedBenefit: 'Call the candidate at 555-123-4567 after review.',
  evidence: { unansweredFields: 1 },
}), /content-free|not allowed/i);
assert.throws(() => createImprovementCandidate({
  type: 'unnecessary-interruption',
  expectedBenefit: 'Follow up at (201) 555-0199 for blocked questions.',
  evidence: { unansweredFields: 1 },
}), /content-free|not allowed/i);
assert.throws(() => createImprovementCandidate({
  type: 'unnecessary-interruption',
  expectedBenefit: 'Candidate lives at 123 Main Street Newark.',
  evidence: { unansweredFields: 1 },
}), /content-free|not allowed/i);
assert.throws(() => createImprovementCandidate({
  type: 'repeated-ats-question',
  expectedBenefit: 'Reuse answers for Secretive Corp applications.',
  evidence: { equivalentProposalCount: 2 },
}), /content-free|not allowed/i);
assert.throws(() => createImprovementCandidate({
  type: 'unnecessary-interruption',
  expectedBenefit: 'Reuse I am legally authorized to work in the United States.',
  evidence: { unansweredFields: 1 },
}), /content-free|not allowed/i);
assert.throws(() => createImprovementCandidate({
  type: 'poor-match-discovery-source',
  expectedBenefit: 'Senior Buyer with 8 years of procurement experience at Acme.',
  evidence: { unansweredFields: 1 },
}), /content-free|not allowed/i);
assert.throws(() => createImprovementCandidate({
  type: 'repeated-ats-question',
  expectedBenefit: 'Are you authorized to work in the US?',
  evidence: { unansweredFields: 1 },
}), /content-free|not allowed/i);
assert.throws(() => createImprovementCandidate({
  type: 'slow-workflow-stage',
  expectedBenefit: 'Reduce review latency.',
  rollbackPlan: 'Call 201-555-0199 if promotion fails.',
  evidence: { unansweredFields: 1 },
}), /content-free|not allowed/i);
assert.throws(() => createImprovementCandidate({
  type: 'unnecessary-interruption',
  expectedBenefit: 'Candidate SSN 123-45-6789 appeared in extraction.',
  evidence: { unansweredFields: 1 },
}), /content-free|not allowed/i);
assert.throws(() => createImprovementCandidate({
  type: 'repeated-ats-question',
  expectedBenefit: 'reuse answers for acme.',
  evidence: { equivalentProposalCount: 1 },
}), /content-free|not allowed/i);
const candidate = createImprovementCandidate({
  type: 'repeated-ats-question',
  expectedBenefit: 'Reduce repeated ordinary exact-match interruptions.',
  evidence: { equivalentProposalCount: 4 },
});
assert.equal(candidate.autoApplied, false);
assert.equal(candidate.promoted, false);
assert.equal(candidate.status, 'proposed');
assert.throws(() => createImprovementCandidate({ type: 'repeated-ats-question', autoApplied: true }));
assert.throws(() => createImprovementCandidate({ type: 'repeated-ats-question', promoted: true }));

const memorySource = readFileSync(new URL('../lib/application-answer-memory.js', import.meta.url), 'utf8');
const foundationSource = readFileSync(new URL('../lib/application-efficiency-foundation.js', import.meta.url), 'utf8');
assert.equal(memorySource.includes('createImprovementCandidate'), false);
assert.equal(memorySource.includes('autoApplied: true'), false);
assert.match(foundationSource, /autoApplied === true/);
assert.equal(reuseApplicationAnswers.toString().includes('createImprovementCandidate'), false);

assert.equal(ATOMIC_ANSWER_INTENTS.some(intent => ['contact_details', 'employment_history', 'education', 'location_relocation'].includes(intent.id)), false);
assert.equal(new Set(ATOMIC_ANSWER_INTENTS.map(intent => intent.id)).size, ATOMIC_ANSWER_INTENTS.length);

const contactQuestions = {
  legal_first_name: 'Legal first name',
  legal_last_name: 'Legal last name',
  email: 'Email address',
  phone: 'Phone number',
};
const contactFacts = {
  legal_first_name: upsertVaultFact(blank, { fieldKey: 'firstName', label: 'First name', value: 'Jordan', provenance: 'candidate confirmation', verificationState: 'user-confirmed', confidence: 1 }, now),
  legal_last_name: upsertVaultFact(blank, { fieldKey: 'lastName', label: 'Last name', value: 'Lee', provenance: 'candidate confirmation', verificationState: 'user-confirmed', confidence: 1 }, now),
  email: upsertVaultFact(blank, { fieldKey: 'email', label: 'Email', value: 'jordan@example.com', provenance: 'candidate confirmation', verificationState: 'user-confirmed', confidence: 1 }, now),
  phone: upsertVaultFact(blank, { fieldKey: 'phone', label: 'Phone', value: '555-0100', provenance: 'candidate confirmation', verificationState: 'user-confirmed', confidence: 1 }, now),
};
for (const [sourceIntent, vault] of Object.entries(contactFacts)) {
  for (const [targetIntent, question] of Object.entries(contactQuestions)) {
    if (sourceIntent === targetIntent) {
      assertReviewableProposal(propose(vault, question), targetIntent, `atomic ${targetIntent}`);
      continue;
    }
    assertUnknown(propose(vault, question), `${sourceIntent} must not answer ${targetIntent}`);
  }
}

const employmentMemories = {
  current_employer: remember(blank, 'What is your current employer?', 'Example Company'),
  current_job_title: remember(blank, 'What is your current job title?', 'Buyer'),
  previous_employer: remember(blank, 'What is your previous employer?', 'Prior Company'),
  previous_job_title: remember(blank, 'What is your previous job title?', 'Analyst'),
};
const employmentQuestions = {
  current_employer: 'What is your current employer?',
  current_job_title: 'What is your current job title?',
  previous_employer: 'What is your previous employer?',
  previous_job_title: 'What is your previous job title?',
};
for (const [sourceIntent, saved] of Object.entries(employmentMemories)) {
  for (const [targetIntent, question] of Object.entries(employmentQuestions)) {
    if (sourceIntent === targetIntent) {
      const equivalent = {
        current_employer: 'What is your current company?',
        current_job_title: 'What is your current title?',
        previous_employer: 'What is your former employer?',
        previous_job_title: 'What is your former title?',
      }[sourceIntent];
      assertReviewableProposal(propose(saved.vault, equivalent), sourceIntent, `atomic ${sourceIntent}`);
      continue;
    }
    assertUnknown(propose(saved.vault, question), `${sourceIntent} must not answer ${targetIntent}`);
  }
}

const educationMemories = {
  highest_education_level: remember(blank, 'What is your highest level of education?', 'Bachelor degree'),
  degree_type: remember(blank, 'What is your degree type?', 'Bachelor of Science'),
  degree_field: remember(blank, 'What is your field of study?', 'Supply chain'),
  school_name: remember(blank, 'What school attended?', 'State University'),
};
const educationQuestions = {
  highest_education_level: 'What is your highest level of education?',
  degree_type: 'What is your degree type?',
  degree_field: 'What is your field of study?',
  school_name: 'What school name?',
};
for (const [sourceIntent, saved] of Object.entries(educationMemories)) {
  for (const [targetIntent, question] of Object.entries(educationQuestions)) {
    if (sourceIntent === targetIntent) continue;
    assertUnknown(propose(saved.vault, question), `${sourceIntent} must not answer ${targetIntent}`);
  }
}

assert.equal(isCompoundQuestion('Are you authorized to work in the US and do you have a driver license?'), true);
assertUnknown(
  propose(authorized.vault, 'Are you authorized to work in the US and do you have a driver license?'),
  'recognized intent plus unresolved extra request must fail closed',
);
assertUnknown(
  propose(authorized.vault, 'Are you legally authorized to work in the United States? Please also list your certifications.'),
  'recognized intent plus additional request must fail closed',
);
assertUnknown(
  propose(location.vault, 'Are you willing to relocate or commute?'),
  'relocate or commute is compound',
);
assertUnknown(
  propose(freshStart.vault, 'When can you start and what is your notice period?'),
  'start date and notice period is compound',
);
assertUnknown(
  propose(currentJob.vault, 'What is your current job title and current employer?'),
  'current title and employer is compound',
);

assert.equal(classifyCanonicalIntent("Aren't you authorized to work in the United States?"), null);
assert.equal(classifyCanonicalIntent("Don't you require visa sponsorship?"), null);
assert.equal(classifyCanonicalIntent("Can't you relocate?"), null);
assert.equal(classifyCanonicalIntent("Isn't this your current location?"), null);
assertUnknown(propose(authorized.vault, "Aren't you authorized to work in the United States?"), 'contraction polarity');
assertUnknown(propose(authorized.vault, "Don't you require visa sponsorship?"), 'sponsorship contraction polarity');
assertUnknown(propose(relocation.vault, "Can't you relocate?"), 'relocation contraction polarity');
assertUnknown(propose(authorized.vault, 'Is it true that you are not authorized to work in the United States?'), 'inverted polarity');
assertUnknown(propose(authorized.vault, 'Have you lost work authorization?'), 'lost polarity');
assertUnknown(propose(authorized.vault, 'Has your work authorization expired?'), 'expired polarity');
assertUnknown(propose(sponsorship.vault, 'Do you lack sponsorship needs?'), 'lack polarity');

assert.equal(hasImplicitEmployerScope('Are you willing to relocate to our office?'), true);
assert.equal(hasImplicitEmployerScope('Are you authorized to work in the US?'), false);
const implicitRelocation = remember(blank, 'Are you willing to relocate to our headquarters?', 'Yes, I will relocate to this office.');
assert.equal(implicitRelocation.vault.facts[0].versions[0].scope.kind, 'application');
assertUnknown(
  propose(implicitRelocation.vault, 'Are you willing to relocate?', { applicationId: 'application_other_hq', employer: 'Globex' }),
  'implicit employer language must stay application-scoped',
);
assertUnknown(
  propose(relocation.vault, 'Are you willing to relocate to our office?'),
  'candidate relocation must not fill implicit employer questions',
);
assertUnknown(
  propose(relocation.vault, 'Are you willing to relocate for this role?'),
  'this-role language is application-scoped',
);

const inferredConfirmed = upsertVaultFact(blank, {
  fieldKey: 'authorization', label: 'Work authorization', value: 'Authorized to work',
  provenance: 'model inferred from resume', verificationState: 'user-confirmed', confidence: 1,
}, now);
assert.equal(classifyLearningState({
  value: 'Authorized to work', provenance: 'model inferred from resume', verificationState: 'user-confirmed', userConfirmed: true,
}), LEARNING_STATE_CLASSES.DERIVED_BUT_REVIEWABLE);
assertUnknown(
  propose(inferredConfirmed, 'Are you legally authorized to work?'),
  'inferred provenance cannot source equivalent proposals',
);
const predicted = upsertVaultFact(blank, {
  fieldKey: 'firstName', label: 'First name', value: 'Jordan',
  provenance: 'predicted from generated draft', verificationState: 'user-confirmed', confidence: 1,
}, now);
assertUnknown(propose(predicted, 'Legal first name'), 'predicted provenance cannot source equivalent proposals');

assertUnknown(propose(contactFacts.legal_first_name, 'Legal first name, last name'), 'legal first name plus last name');
assertUnknown(propose(contactFacts.legal_first_name, 'Legal first name last name'), 'juxtaposed first and last name');
assertUnknown(propose(contactFacts.legal_first_name, 'What is your first name or nickname?'), 'first name or nickname');
assertUnknown(propose(contactFacts.legal_first_name, 'What is your first name / preferred name?'), 'first name slash preferred');
assertUnknown(propose(contactFacts.legal_first_name, 'What is your preferred first name?'), 'preferred first name remainder');
assertUnknown(propose(contactFacts.legal_last_name, 'Legal last name and suffix'), 'last name and suffix');
assertUnknown(propose(contactFacts.legal_last_name, 'What is your last name / suffix?'), 'last name slash suffix');
assertUnknown(propose(contactFacts.email, 'What is your work email?'), 'work email is not email');
assertUnknown(propose(contactFacts.email, 'What is your personal email?'), 'personal email is not email');
assertUnknown(propose(contactFacts.email, 'What is your secondary email?'), 'secondary email is not email');
assertUnknown(propose(contactFacts.phone, 'What is your work phone?'), 'work phone is not phone');
assertUnknown(propose(contactFacts.phone, 'What is your home phone?'), 'home phone is not phone');
assertUnknown(propose(authorized.vault, 'Are you a US citizen authorized to work?'), 'citizen plus authorized without conjunction');
assertUnknown(propose(authorized.vault, 'Are you authorized to work in US/Canada?'), 'US/Canada slash remainder');
assertUnknown(propose(location.vault, 'What is your current location in the UK/EU?'), 'UK/EU slash remainder');
assertUnknown(propose(location.vault, 'What is your current location in CA/NY?'), 'CA/NY slash remainder');
assertUnknown(propose(relocation.vault, 'Are you willing to relocate, commute?'), 'relocate comma commute');
assertUnknown(propose(relocation.vault, 'Are you willing to relocate; commute?'), 'relocate semicolon commute');
assertUnknown(propose(relocation.vault, 'Are you willing to relocate: commute?'), 'relocate colon commute');
assertUnknown(propose(relocation.vault, 'Are you willing to relocate – commute?'), 'relocate en-dash commute');
assertUnknown(propose(relocation.vault, 'Are you willing to relocate — commute?'), 'relocate em-dash commute');
assertUnknown(propose(relocation.vault, 'Are you willing to relocate/commute?'), 'relocate slash commute');
assert.equal(hasImplicitEmployerScope('Are you willing to relocate to this location?'), true);
assert.equal(hasImplicitEmployerScope('Can you work at this facility?'), true);
assert.equal(hasImplicitEmployerScope('Are you available at this campus?'), true);
assert.equal(hasImplicitEmployerScope('Why this opportunity?'), true);
assertUnknown(propose(relocation.vault, 'Are you willing to relocate to this location?'), 'this location is application-scoped');
assertUnknown(propose(relocation.vault, 'Are you willing to relocate to this facility?'), 'this facility is application-scoped');
assertUnknown(propose(relocation.vault, 'Are you willing to relocate to this campus?'), 'this campus is application-scoped');
assertUnknown(propose(relocation.vault, 'Are you willing to relocate for this opportunity?'), 'this opportunity is application-scoped');
assertUnknown(propose(freshStart.vault, 'When can you start, notice period?'), 'start date comma notice period');
assertUnknown(propose(freshStart.vault, 'Start date: notice period'), 'start date colon notice period');
assertUnknown(propose(freshStart.vault, 'When can you start / notice period?'), 'start date slash notice period');
assertUnknown(propose(educationMemories.highest_education_level.vault, 'What is your highest level of education and school attended?'), 'education plus school');
assertUnknown(propose(educationMemories.highest_education_level.vault, 'What is your highest level of education, school name?'), 'education comma school');
assertUnknown(propose(authorized.vault, 'Are you authorized to work, certifications?'), 'authorization comma certifications');
assertUnknown(propose(authorized.vault, 'Are you authorized to work and list certifications?'), 'authorization plus certifications');
assert.equal(classifyCanonicalIntent('Is it false that you are authorized to work?'), null);
assertUnknown(propose(authorized.vault, 'Is it false that you are authorized to work?'), 'false that polarity');
assertUnknown(propose(authorized.vault, 'Has your work authorization been revoked?'), 'revoked authorization');
assertUnknown(propose(authorized.vault, 'Is your work authorization pending?'), 'pending authorization');

const llmDraft = upsertVaultFact(blank, {
  fieldKey: 'authorization', label: 'Work authorization', value: 'Authorized to work',
  provenance: 'llm draft extracted from resume parser', verificationState: 'user-confirmed', confidence: 1,
}, now);
assert.equal(classifyLearningState({
  value: 'Authorized to work', provenance: 'llm draft extracted from resume parser', verificationState: 'user-confirmed', userConfirmed: true,
}), LEARNING_STATE_CLASSES.DERIVED_BUT_REVIEWABLE);
assertUnknown(propose(llmDraft, 'Are you legally authorized to work?'), 'allowlist rejects llm draft extracted from resume parser');

assert.throws(() => applicationEfficiencySnapshot({
  actions: [{ type: 'EMPLOYER_ATS_FAILURE', metadata: { reasonCode: 'https://example.test/reuse' } }],
}), /content-free|not allowed|reason/i);
assert.throws(() => applicationEfficiencySnapshot({
  actions: [{ type: 'EMPLOYER_ATS_FAILURE', metadata: { reasonCode: 'JordanLee' } }],
}), /content-free|not allowed|reason/i);
assert.throws(() => applicationEfficiencySnapshot({
  actions: [{ type: 'EMPLOYER_ATS_FAILURE', metadata: { reasonCode: 'SecretiveCorp' } }],
}), /content-free|not allowed|reason/i);
assert.throws(() => applicationEfficiencySnapshot({
  actions: [{ type: 'EMPLOYER_ATS_FAILURE', metadata: { reasonCode: 'SANDBOX_TIMEOUT' } }],
}), /content-free|not allowed|reason/i);
assert.throws(() => createImprovementCandidate({
  type: 'repeated-ats-question',
  expectedBenefit: 'See https://example.test after review.',
  evidence: { equivalentProposalCount: 1 },
}), /content-free|not allowed/i);
const allowedReason = applicationEfficiencySnapshot({
  actions: [{ type: 'EMPLOYER_ATS_FAILURE', metadata: { reasonCode: 'http_429' } }],
});
assert.equal(allowedReason.atsFailurePoints[0].reasonCode, 'http_429');
assert.equal(applicationEfficiencySnapshot({
  actions: [{ type: 'EMPLOYER_ATS_FAILURE', metadata: { reasonCode: 'ats_timeout' } }],
}).atsFailurePoints[0].reasonCode, 'ats_timeout');

console.log('Application efficiency adversarial assertions passed. No employer calls.');
