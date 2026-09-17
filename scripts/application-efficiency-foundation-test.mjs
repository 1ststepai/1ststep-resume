import assert from 'node:assert/strict';
import { grantVaultConsent, upsertVaultFact } from '../lib/applicant-vault-domain.js';
import { rememberApplicationAnswer, reuseApplicationAnswers } from '../lib/application-answer-memory.js';
import {
  LEARNING_STATE_CLASSES, applicationEfficiencySnapshot, attachEquivalentAnswerProposals,
  classifyCanonicalIntent, classifyLearningState, createImprovementCandidate, proposeEquivalentAnswer,
} from '../lib/application-efficiency-foundation.js';

assert.equal(classifyLearningState({ value: 'Authorized to work in the US', verificationState: 'user-confirmed' }), LEARNING_STATE_CLASSES.CONFIRMED_FACT);
assert.equal(classifyLearningState({ value: 'remote', category: 'preference', userConfirmed: true, verificationState: 'user-confirmed' }), LEARNING_STATE_CLASSES.USER_PREFERENCE);
assert.equal(classifyLearningState({ value: 'Senior Buyer', provenance: 'AI-generated draft', inferred: true, userConfirmed: true }), LEARNING_STATE_CLASSES.DERIVED_BUT_REVIEWABLE);
assert.equal(classifyLearningState({ value: 'Senior Buyer', provenance: 'model inferred title' }), LEARNING_STATE_CLASSES.UNKNOWN_NEEDS_USER);
assert.equal(classifyLearningState({}), LEARNING_STATE_CLASSES.UNKNOWN_NEEDS_USER);

assert.equal(classifyCanonicalIntent('Are you legally authorized to work?')?.id, 'work_authorization');
assert.equal(classifyCanonicalIntent('Will you now or in the future require visa sponsorship?')?.id, 'sponsorship');
assert.equal(classifyCanonicalIntent('When can you start?')?.id, 'start_availability');
assert.equal(classifyCanonicalIntent('Describe your vendor warranty experience.'), null);

const now = new Date('2026-09-17T14:00:00.000Z');
const blank = grantVaultConsent({}, now);
const authorizationSession = {
  id: 'application_auth_1', state: 'Waiting for You', stage: 'employer_form', role: { employer: 'Example Employer' },
  actions: [{ id: 'action_auth_1', type: 'AMBIGUOUS_FACT', status: 'open', metadata: { question: 'Are you authorized to work?' } }],
  timeline: [], approvals: {}, createdAt: now.toISOString(),
};
const remembered = rememberApplicationAnswer(blank, authorizationSession, {
  actionId: 'action_auth_1', statement: 'I am legally authorized to work in the United States.',
}, now);
const nextSession = {
  ...authorizationSession, id: 'application_auth_2',
  actions: [{ id: 'action_auth_2', type: 'AMBIGUOUS_FACT', status: 'open', metadata: { question: 'Are you legally authorized to work?' } }],
};
const proposal = proposeEquivalentAnswer(remembered, {
  question: nextSession.actions[0].metadata.question, applicationId: nextSession.id, employer: nextSession.role.employer, now: now.getTime(),
});
assert.equal(proposal.class, LEARNING_STATE_CLASSES.DERIVED_BUT_REVIEWABLE);
assert.equal(proposal.intent, 'work_authorization');
assert.equal(proposal.requiresConfirmation, true);
assert.equal(proposal.autoResolved, false);
assert.equal(proposal.exactMatchExists, false);
assert.ok(proposal.factId);
assert.equal(JSON.stringify(proposal).includes('I am legally authorized'), false);

const attached = attachEquivalentAnswerProposals(nextSession, remembered, now);
assert.equal(attached.actions[0].status, 'open');
assert.equal(attached.actions[0].metadata.equivalentAnswerProposal.factId, proposal.factId);
assert.equal(attached.actions[0].metadata.equivalentAnswerProposal.autoResolved, false);
assert.equal(JSON.stringify(attached).includes('I am legally authorized'), false);

const reusedEquivalent = reuseApplicationAnswers(nextSession, remembered, now);
assert.equal(reusedEquivalent.actions[0].status, 'open');
assert.deepEqual(reusedEquivalent.actions[0].metadata.equivalentAnswerProposal, attached.actions[0].metadata.equivalentAnswerProposal);

const exactReuse = reuseApplicationAnswers(authorizationSession, remembered, now);
assert.equal(exactReuse.actions[0].status, 'resolved');
assert.equal(exactReuse.actions[0].metadata.equivalentAnswerProposal, undefined);

const fieldVault = upsertVaultFact(blank, {
  fieldKey: 'firstName', label: 'First name', value: 'Jordan', provenance: 'candidate confirmation',
  verificationState: 'user-confirmed', confidence: 1, autoReuse: true,
}, now);
const contactSession = {
  id: 'application_contact_1', state: 'Waiting for You', role: { employer: 'Other Co' },
  actions: [{ id: 'action_contact_1', type: 'AMBIGUOUS_FACT', status: 'open', metadata: { question: 'Legal first name' } }],
  timeline: [], createdAt: now.toISOString(),
};
const contactProposal = proposeEquivalentAnswer(fieldVault, {
  question: 'Legal first name', applicationId: contactSession.id, employer: 'Other Co', now: now.getTime(),
});
assert.equal(contactProposal.intent, 'legal_first_name');
assert.equal(contactProposal.class, LEARNING_STATE_CLASSES.DERIVED_BUT_REVIEWABLE);
assert.equal(reuseApplicationAnswers(contactSession, fieldVault, now).actions[0].status, 'open');

assert.equal(proposeEquivalentAnswer(remembered, { question: 'What is your favorite color?' }).class, LEARNING_STATE_CLASSES.UNKNOWN_NEEDS_USER);
assert.equal(proposeEquivalentAnswer({ consent: { status: 'revoked' } }, { question: 'When can you start?' }).class, LEARNING_STATE_CLASSES.UNKNOWN_NEEDS_USER);

const snapshot = applicationEfficiencySnapshot(attached, { qualified: true, unansweredFieldKeys: ['veteranStatus'] });
assert.equal(snapshot.contentFree, true);
assert.equal(snapshot.containsCandidateValues, false);
assert.equal(snapshot.unansweredFields, 2);
assert.equal(snapshot.equivalentProposalCount, 1);
assert.equal(snapshot.confirmedFactReuseCount, 0);
assert.equal(JSON.stringify(snapshot).includes('Example Employer'), false);
assert.equal(JSON.stringify(snapshot).includes('authorized'), false);

const reviewReady = applicationEfficiencySnapshot({
  ...attached, createdAt: '2026-09-17T14:00:00.000Z', stage: 'final_review',
  timeline: [{ kind: 'FINAL_REVIEW_READY', at: '2026-09-17T14:12:00.000Z' }],
  actions: [{ type: 'AMBIGUOUS_FACT', status: 'resolved', metadata: { answerReference: { factId: 'fact_1', factVersion: 2 } } }],
});
assert.equal(reviewReady.timeToReviewReadyMs, 12 * 60 * 1000);
assert.equal(reviewReady.confirmedFactReuseCount, 1);
assert.equal(reviewReady.duplicateReworkCount, 1);
assert.equal(reviewReady.stages.humanReviewReady, true);

const candidate = createImprovementCandidate({
  type: 'unnecessary-interruption',
  expectedBenefit: 'Reuse confirmed work-authorization answers after one review.',
  evidence: { unansweredFields: 4, equivalentProposalCount: 3 },
});
assert.equal(candidate.status, 'proposed');
assert.equal(candidate.autoApplied, false);
assert.equal(candidate.promoted, false);
assert.throws(() => createImprovementCandidate({ type: 'unnecessary-interruption', autoApplied: true }), /auto-apply/);
assert.throws(() => createImprovementCandidate({ type: 'not-a-type' }), /not allowed/);

console.log('Application efficiency foundation assertions passed. No employer calls.');
