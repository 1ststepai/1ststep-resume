import assert from 'node:assert/strict';
import {
  APPLICATION_ACTIVITY_STATUSES,
  APPLICATION_WORKFLOW_STEPS,
  REDACTED_WORKFLOW_REPLAY,
  addActionItem,
  addRole,
  advanceManagedApplicationSession,
  advanceSalesDemo,
  approveBatch,
  buildReadinessDraftFromSources,
  buildVerifiedResumeDraft,
  canAutoSubmit,
  confirmReadinessDraft,
  confirmReusableFact,
  createApprovalBatch,
  createDeskState,
  createSalesDemo,
  createTruthProfile,
  deleteReusableFact,
  exportReadinessData,
  importLegacyEntries,
  inspectAuthenticatedApplicationForm,
  normalizeJobUrl,
  pipelineCounts,
  pauseManagedApplicationSession,
  readinessStatus,
  recordGeneratedPackage,
  recordFieldAnswer,
  recordOtpAttemptOutcome,
  recordOtpChallenge,
  resolveApplicationQuestion,
  resolveActionItem,
  resolveManagedApplicationException,
  resumeManagedApplicationSession,
  roleDedupeKey,
  setAutonomyLevel,
  setStandingPolicy,
  stageReadinessDraft,
  startManagedApplicationSession,
  transitionRole,
  truthProfileGaps,
  updateTruthProfile,
} from '../lib/concierge-domain.js';

const at = '2026-08-28T04:00:00.000Z';
const qaEvidence = documentVersion => ({
  documentVersion, formats: ['DOCX', 'PDF'], humanWritten: true, docxTextOrderChecked: true,
  pdfTextExtracted: true, visualPageInspection: true, pageCount: 2, aiTemplateAvoided: true,
  aiLanguagePolicy: 'omitted-for-ordinary-role',
});
const profile = createTruthProfile({
  workHistory: ['Verified employer and role'], education: ['Verified degree'], skills: ['Procurement'],
  authorization: 'Authorized', sponsorship: 'Not required', geography: ['Remote United States'], salaryMin: 100000,
  travelTolerance: 'Up to 20%', schedulePreferences: ['Eastern Time'], disclosureChoices: ['Optional demographics unanswered'], confirmedAt: at,
});
assert.deepEqual(truthProfileGaps(profile), []);

const verifiedResumeDraft = buildVerifiedResumeDraft(createDeskState({ truthProfile: profile }), {
  firstName: 'Jordan', lastName: 'Example', email: 'jordan@example.test', phone: '555-0100', location: 'New Jersey',
});
assert.match(verifiedResumeDraft.text, /Jordan Example/);
assert.match(verifiedResumeDraft.text, /EXPERIENCE\nVerified employer and role/);
assert.match(verifiedResumeDraft.text, /SKILLS\nProcurement/);
assert.deepEqual(verifiedResumeDraft.missingSections, []);
assert.ok(!/authorized|salary|travel/i.test(verifiedResumeDraft.text));

const emptyResumeDraft = buildVerifiedResumeDraft(createDeskState(), {});
assert.equal(emptyResumeDraft.text, '');
assert.deepEqual(emptyResumeDraft.missingSections, ['name and contact', 'work history', 'education', 'skills']);

let state = createDeskState({ truthProfile: profile });
state = updateTruthProfile(state, profile, at);
const captured = addRole(state, {
  employer: 'Example Company, Inc.', title: 'Sr. Buyer', requisitionId: 'REQ-42', directEmployerUrl: 'https://jobs.example.com/req-42?utm_source=test',
  sourceType: 'direct-employer', applyPathActive: true, remoteEligibility: 'Remote US', geographyEligibility: 'New Jersey eligible',
  salaryDisclosure: 'Unknown', postedDate: 'Unknown', travel: 'Unknown', schedule: 'Unknown', materialGaps: ['ERP depth unknown'],
}, at);
state = captured.state;
assert.equal(captured.duplicate, false);
assert.equal(normalizeJobUrl('https://jobs.example.com/req-42?utm_source=x'), 'https://jobs.example.com/req-42');
assert.ok(roleDedupeKey(captured.role).includes('req:req-42'));

const duplicate = addRole(state, { ...captured.role, directEmployerUrl: 'https://jobs.example.com/req-42?ref=linkedin' }, at);
state = duplicate.state;
assert.equal(duplicate.duplicate, true);
assert.equal(state.roles.length, 1);

state = transitionRole(state, captured.role.id, 'Verified', {}, at);
assert.equal(pipelineCounts(state).Verified, 1);
assert.throws(() => transitionRole(state, captured.role.id, 'Submitted', {}, at), /Cannot move/);
state = recordGeneratedPackage(state, captured.role.id, { historyId: 'history-1', documentVersion: 'resume-v1', resumeText: 'Synthetic role-specific resume' }, at);
assert.equal(state.roles[0].status, 'Verified - Package Preparation');
state = transitionRole(state, captured.role.id, 'Package Ready', qaEvidence('resume-v1'), at);

let batchResult = createApprovalBatch(state, { name: 'August 28 Buyer Batch', roleIds: [captured.role.id], disclosures: ['Salary unknown', 'Travel unknown', 'No new consents authorized'] }, at);
state = approveBatch(batchResult.state, batchResult.batch.id, at);
state = transitionRole(state, captured.role.id, 'Awaiting Approval', { approvalBatchId: batchResult.batch.id }, at);
assert.throws(() => transitionRole(state, captured.role.id, 'Submitted', { receipt: { submittedAt: at, confirmationId: 'C-1', documentVersion: 'resume-v2' } }, at), /must match/);
state = transitionRole(state, captured.role.id, 'Submitted', { receipt: { submittedAt: at, confirmationId: 'C-1', confirmationUrl: 'https://jobs.example.com/confirmation/C-1', documentVersion: 'resume-v1' } }, at);
assert.equal(state.roles[0].receipt.confirmationId, 'C-1');

const second = addRole(state, { employer: 'Another Employer', title: 'Buyer', requisitionId: 'B-1', directEmployerUrl: 'https://careers.example.org/B-1' }, at);
state = second.state;
const action = addActionItem(state, { roleId: second.role.id, type: 'OTP', summary: 'Employer email verification required' }, at);
state = resolveActionItem(action.state, action.item.id, at);
assert.equal(state.actionQueue[0].status, 'resolved');
assert.ok(state.auditEvents.length >= 9);

const imported = importLegacyEntries(createDeskState(), [{ company: 'Legacy Co', title: 'Buyer', jobUrl: 'https://legacy.example/jobs/1', status: 'applied' }], [], at);
assert.equal(imported.imported, 1);
assert.equal(imported.state.roles[0].status, 'Found');
assert.match(imported.state.roles[0].materialGaps[0], /requires fresh evidence/);

let readinessState = createDeskState();
assert.equal(readinessState.autonomy.level, 'autofill_review');
assert.equal(readinessStatus(readinessState).score, 0);
assert.throws(() => confirmReusableFact(readinessState, { fieldKey: 'authorization', value: 'Authorized', confirmed: false }, at), /explicitly confirmed/);
readinessState = confirmReusableFact(readinessState, {
  fieldKey: 'authorization', value: 'Authorized to work in the United States', confirmed: true,
  verificationState: 'user-confirmed', source: 'readiness-interview', sensitivity: 'sensitive', autoReuse: true,
}, at);
assert.ok(readinessStatus(readinessState).score > 0);
const resolved = resolveApplicationQuestion(readinessState, { question: 'Are you legally authorized to work in the United States?' }, at);
assert.equal(resolved.kind, 'safe-fact');
assert.equal(resolved.value, 'Authorized to work in the United States');
assert.equal(resolveApplicationQuestion(readinessState, { question: 'Please complete this CAPTCHA' }, at).actionType, 'CAPTCHA');
assert.equal(resolveApplicationQuestion(readinessState, { question: 'Electronically certify every statement for this employer' }, at).kind, 'targeted-exception');
assert.equal(resolveApplicationQuestion(readinessState, { question: 'Have you used Coupa modules X and Y?' }, at).kind, 'ask-once');
readinessState = setStandingPolicy(readinessState, { policyKey: 'ordinary-privacy', decision: 'Accept ordinary privacy terms for in-band roles', confirmed: true }, at);
assert.equal(resolveApplicationQuestion(readinessState, { question: 'Please accept the ordinary application privacy policy' }, at).kind, 'standing-policy');
assert.equal(resolveApplicationQuestion(readinessState, { question: 'Confirm desired salary', context: { salaryMin: 70000, authorizedSalaryMin: 85000 } }, at).exceptionType, 'compensation-outside-band');
readinessState = setAutonomyLevel(readinessState, 'auto_submit', at);
assert.equal(canAutoSubmit(readinessState, captured.role, [{ kind: 'safe-fact' }]).allowed, false);
assert.match(canAutoSubmit(readinessState, captured.role, [{ kind: 'ask-once' }]).blockers.join(' '), /review/);
readinessState = recordFieldAnswer(readinessState, { roleId: captured.role.id, question: 'Are you authorized?', decisionKind: 'safe-fact', factId: resolved.factId, confidence: .94, documentVersion: 'resume-v1' }, at);
assert.equal(readinessState.auditEvents.at(-1).details.question, 'Are you authorized?');
assert.match(exportReadinessData(readinessState), /ordinary-privacy/);
readinessState = deleteReusableFact(readinessState, resolved.factId, at);
assert.equal(readinessState.reusableFacts.length, 0);

let demoState = createSalesDemo(createDeskState(), 'auto_submit', at);
assert.equal(demoState.demo.simulated, true);
assert.equal(demoState.roles.length, 0);
for (let index = 1; index < 8; index++) demoState = advanceSalesDemo(demoState, `2026-08-28T04:0${index}:00.000Z`);
assert.equal(demoState.demo.simulatedReceipt.simulated, true);
assert.equal(demoState.demo.simulatedReceipt.transmission, 'none');
assert.ok(demoState.demo.trace.some(event => event.kind === 'human-required'));
assert.equal(pipelineCounts(demoState).Submitted, 0);

let generationState = addRole(createDeskState(), {
  employer: 'Resume Fixture Co', title: 'Strategic Buyer', requisitionId: 'RF-1', directEmployerUrl: 'https://careers.example.test/RF-1',
  sourceType: 'direct-employer', applyPathActive: true, remoteEligibility: 'Remote US', geographyEligibility: 'US',
  salaryDisclosure: 'Unknown', postedDate: 'Unknown', travel: 'Unknown', schedule: 'Unknown', jobDescription: 'Verified fixture description',
}, at).state;
generationState = transitionRole(generationState, generationState.roles[0].id, 'Verified', {}, at);
generationState = recordGeneratedPackage(generationState, generationState.roles[0].id, {
  historyId: 'tailor_fixture', documentVersion: 'tailor_fixture-v1', resumeText: 'Synthetic tailored resume text', atsIssues: [],
}, at);
assert.equal(generationState.roles[0].packageDraft.source, 'existing-tailor-pipeline');
assert.throws(() => transitionRole(generationState, generationState.roles[0].id, 'Package Ready', {
  ...qaEvidence('wrong-v1'),
}, at), /must match/);
generationState = transitionRole(generationState, generationState.roles[0].id, 'Package Ready', {
  ...qaEvidence('tailor_fixture-v1'),
}, at);
assert.equal(generationState.roles[0].status, 'Package Ready');

const readinessDraft = buildReadinessDraftFromSources({
  profile: { firstName: 'Jordan', lastName: 'Example', email: 'jordan@example.test' },
  resumeText: 'JORDAN EXAMPLE\n\nEXPERIENCE\nFixture Company | Buyer | 2022-Present\nManaged verified fixture purchasing work.\n\nEDUCATION\nExample University | B.A. | 2021\n\nSKILLS\nSourcing, Excel',
  truthProfile: { authorization: 'Authorized', sponsorship: 'Not required', geography: ['Remote US'], salaryMin: 85000 },
}, at);
assert.ok(readinessDraft.proposals.some(item => item.fieldKey === 'contact' && item.source === 'saved-profile'));
assert.ok(readinessDraft.proposals.some(item => item.fieldKey === 'employment' && /Fixture Company/.test(item.value)));
assert.ok(!readinessDraft.proposals.some(item => /invented/i.test(item.value)));
let stagedDraftState = stageReadinessDraft(createDeskState(), readinessDraft, at);
assert.equal(stagedDraftState.reusableFacts.length, 0);
stagedDraftState = confirmReadinessDraft(stagedDraftState, at);
assert.ok(stagedDraftState.reusableFacts.length >= 5);
assert.ok(stagedDraftState.reusableFacts.every(item => item.autoReuse));

assert.throws(() => startManagedApplicationSession(createDeskState(), {
  role: { employer: 'Fixture Employer', title: 'Buyer', directEmployerUrl: 'https://careers.example.test/jobs/1' },
}), /simulation-only/);
let managedState = startManagedApplicationSession(createDeskState(), {
  simulated: true, autonomyLevel: 'autofill_review', documentVersion: 'synthetic-resume-v3',
  role: { employer: 'Fixture Employer', title: 'Buyer', requisitionId: 'FIX-1', directEmployerUrl: 'https://careers.example.test/jobs/FIX-1' },
}, at);
let managedSession = managedState.applicationSessions[0];
assert.equal(managedSession.step, APPLICATION_WORKFLOW_STEPS[0]);
assert.ok(managedSession.suggestions.every(item => !/fixture-person@|555-01/i.test(item.value)));
for (let index = 1; index <= APPLICATION_WORKFLOW_STEPS.indexOf('review_exception'); index++) {
  managedState = advanceManagedApplicationSession(managedState, managedSession.id, `2026-08-28T05:0${index}:00.000Z`);
  managedSession = managedState.applicationSessions[0];
}
assert.equal(managedSession.status, 'paused');
assert.throws(() => advanceManagedApplicationSession(managedState, managedSession.id, at), /Resolve or resume/);
managedState = resolveManagedApplicationException(managedState, managedSession.id, at);
managedState = pauseManagedApplicationSession(managedState, managedSession.id, 'browser-timeout', at);
assert.equal(managedState.applicationSessions[0].status, 'paused');
managedState = resumeManagedApplicationSession(managedState, managedSession.id, at);
assert.equal(managedState.applicationSessions[0].step, 'review_exception');
while (managedState.applicationSessions[0].status !== 'complete') {
  managedState = managedState.applicationSessions[0].status === 'paused'
    ? resolveManagedApplicationException(managedState, managedSession.id, at)
    : advanceManagedApplicationSession(managedState, managedSession.id, at);
}
managedSession = managedState.applicationSessions[0];
assert.equal(managedSession.receipt.simulated, true);
assert.equal(managedSession.receipt.transmission, 'none');
assert.equal(pipelineCounts(managedState).Submitted, 0);
assert.ok(managedSession.timeline.every(event => !/@example\.com|555-01|123 Main/i.test(event.summary)));

const replayStatuses = new Set(REDACTED_WORKFLOW_REPLAY.map(event => event.status));
['Verified - Package Preparation', 'Closed by direct page', 'Location Unverified', 'Duplicate/In Process', 'Login Required / Retry', 'Transmission Confirmation Required', 'ATS Configuration Blocked', 'Human Action Required - password/reset', 'Human Action Required - latest OTP', 'Human Action Required - latest email code', 'Password Reset Requested - Outcome Pending', 'Human Action Required - form review', 'Blocked - employer ATS configuration']
  .forEach(status => assert.ok(replayStatuses.has(status)));
REDACTED_WORKFLOW_REPLAY.forEach(event => assert.ok(APPLICATION_ACTIVITY_STATUSES.includes(event.status)));

let batch32State = createDeskState();
const batch32Roles = [
  { employer: 'Modine', title: 'Buyer', requisitionId: '9112', directEmployerUrl: 'https://careers.example.test/modine/9112' },
  { employer: 'Holley Performance Brands', title: 'Buyer', requisitionId: '1552', directEmployerUrl: 'https://careers.example.test/holley/1552', preferredGaps: ['Rubber/plastics experience'], requiredGaps: [] },
];
for (const roleFixture of batch32Roles) {
  const added = addRole(batch32State, {
    ...roleFixture, sourceType: 'direct-employer', applyPathActive: true, remoteEligibility: 'Remote US',
    geographyEligibility: 'New Jersey eligible', salaryDisclosure: 'Unknown', postedDate: 'Unknown', travel: 'Unknown',
    schedule: 'Unknown', jobDescription: 'Verified redacted direct-employer fixture.',
  }, at);
  batch32State = transitionRole(added.state, added.role.id, 'Verified', {}, at);
  batch32State = recordGeneratedPackage(batch32State, added.role.id, {
    historyId: `history-${added.role.requisitionId}`, documentVersion: `resume-${added.role.requisitionId}-v1`, resumeText: 'Redacted human-written fixture resume.',
  }, at);
  batch32State = transitionRole(batch32State, added.role.id, 'Package Ready', qaEvidence(`resume-${added.role.requisitionId}-v1`), at);
}
const modineRole = batch32State.roles.find(role => role.requisitionId === '9112');
const holleyRole = batch32State.roles.find(role => role.requisitionId === '1552');
batch32State = setStandingPolicy(batch32State, { policyKey: 'ordinary-privacy', decision: 'Accept semantically matching ordinary application privacy terms', confirmed: true }, at);
batch32State = startManagedApplicationSession(batch32State, { id: 'session-modine', roleId: modineRole.id, simulated: true, batchAuthorizationName: 'Batch 32 named profile/resume transmission' }, at);
batch32State = startManagedApplicationSession(batch32State, { id: 'session-holley', roleId: holleyRole.id, simulated: true, batchAuthorizationName: 'Batch 32 named profile/resume transmission' }, at);
batch32State = pauseManagedApplicationSession(batch32State, 'session-modine', 'invalid-credentials', at);
assert.equal(batch32State.applicationSessions.find(session => session.id === 'session-modine').blockers.at(-1).type, 'PASSWORD_RESET');
assert.equal(batch32State.applicationSessions.find(session => session.id === 'session-holley').status, 'active');
batch32State = pauseManagedApplicationSession(batch32State, 'session-modine', 'password-reset-requested', at);
const modineSession = batch32State.applicationSessions.find(session => session.id === 'session-modine');
assert.equal(modineSession.checkpointStatus, 'Password Reset Requested - Outcome Pending');
assert.equal(modineSession.blockers.at(-1).type, 'PASSWORD_RESET_PENDING');
assert.match(modineSession.blockers.at(-1).summary, /does not prove an account exists or that an email was delivered/);
batch32State = pauseManagedApplicationSession(batch32State, 'session-holley', 'otp-delivery', at);
const holleySession = batch32State.applicationSessions.find(session => session.id === 'session-holley');
assert.equal(holleySession.checkpointStatus, 'Human Action Required - latest OTP');
assert.equal(holleySession.blockers.at(-1).type, 'OTP');
assert.equal(holleySession.verificationSession.generation, 1);
assert.match(holleySession.blockers.at(-1).summary, /never store or display it/);
assert.throws(() => recordOtpChallenge(batch32State, 'session-holley', { code: '123456', recreated: true }, at), /must never enter/);
batch32State = recordOtpChallenge(batch32State, 'session-holley', { recreated: true, delivery: 'masked-email', provider: 'ADP' }, '2026-08-28T06:30:00.000Z');
const recreatedHolleySession = batch32State.applicationSessions.find(session => session.id === 'session-holley');
assert.equal(recreatedHolleySession.checkpointStatus, 'Human Action Required - latest OTP');
assert.equal(recreatedHolleySession.verificationSession.generation, 2);
assert.deepEqual(recreatedHolleySession.verificationSession.supersededGenerations.map(item => [item.generation, item.status]), [[1, 'unusable']]);
assert.equal(recreatedHolleySession.blockers.filter(item => item.type === 'OTP' && item.status === 'open').length, 1);
assert.equal(recreatedHolleySession.blockers.filter(item => item.type === 'OTP' && item.status === 'unusable').length, 1);
assert.match(recreatedHolleySession.blockers.find(item => item.type === 'OTP' && item.status === 'open').summary, /request only the latest code/);
assert.ok(!JSON.stringify(recreatedHolleySession).includes('123456'));
assert.throws(() => recordOtpAttemptOutcome(batch32State, 'session-holley', { outcome: 'incorrect', code: '654321' }, at), /must never enter/);
batch32State = recordOtpAttemptOutcome(batch32State, 'session-holley', { outcome: 'incorrect' }, '2026-08-28T06:35:00.000Z');
const incorrectHolleySession = batch32State.applicationSessions.find(session => session.id === 'session-holley');
assert.equal(incorrectHolleySession.checkpointStatus, 'Human Action Required - latest email code');
assert.equal(incorrectHolleySession.verificationSession.lastAttemptedGeneration, 2);
assert.throws(() => recordOtpAttemptOutcome(batch32State, 'session-holley', { outcome: 'incorrect' }, at), /already attempted once/);
assert.ok(!JSON.stringify(incorrectHolleySession).includes('654321'));
assert.throws(() => inspectAuthenticatedApplicationForm(batch32State, 'session-modine', { authenticationRecovered: true, password: 'never-store-this' }, at), /must never enter/);
batch32State = inspectAuthenticatedApplicationForm(batch32State, 'session-modine', { authenticationRecovered: true }, '2026-08-28T06:45:00.000Z');
const reviewedModineSession = batch32State.applicationSessions.find(session => session.id === 'session-modine');
assert.equal(reviewedModineSession.checkpointStatus, 'Human Action Required - form review');
assert.equal(reviewedModineSession.draft.status, 'preserved');
assert.equal(reviewedModineSession.draft.resumeAttached, true);
assert.equal(reviewedModineSession.draft.unresolvedCount, 8);
assert.ok(reviewedModineSession.documents.some(document => document.kind === 'Resume'));
assert.equal(reviewedModineSession.postAuthFormReview.items.find(item => item.key === 'ordinary-privacy').classification, 'ordinary-privacy');
assert.equal(reviewedModineSession.postAuthFormReview.items.find(item => item.key === 'ordinary-privacy').resolved, true);
assert.ok(reviewedModineSession.postAuthFormReview.items.filter(item => item.classification === 'employer-specific-material').every(item => item.priorBatchCoverage === 'not-covered'));
assert.deepEqual(reviewedModineSession.blockers.filter(item => item.source === 'post-auth-form-review' && item.status === 'open').map(item => item.formItemKey).sort(), [
  'consumer-reporting', 'drug-testing', 'employment-dates', 'exact-address', 'family-at-employer', 'final-certification', 'international-sharing', 'verification-authorizations',
]);
assert.ok(reviewedModineSession.blockers.filter(item => ['PASSWORD_RESET', 'PASSWORD_RESET_PENDING'].includes(item.type)).every(item => item.status === 'resolved'));
assert.ok(batch32State.roles.every(role => role.status === 'Package Ready'));
assert.equal(pipelineCounts(batch32State).Submitted, 0);
batch32State = pauseManagedApplicationSession(batch32State, 'session-modine', 'ats-invalid-field-ids', '2026-08-28T06:50:00.000Z');
const terminalModineSession = batch32State.applicationSessions.find(session => session.id === 'session-modine');
assert.equal(terminalModineSession.status, 'blocked');
assert.equal(terminalModineSession.checkpointStatus, 'Blocked - employer ATS configuration');
assert.equal(terminalModineSession.draft.status, 'preserved');
assert.equal(batch32State.roles.find(role => role.id === modineRole.id).status, 'Blocked');
assert.equal(pipelineCounts(batch32State).Submitted, 0);
assert.throws(() => resumeManagedApplicationSession(batch32State, 'session-modine', at), /terminally blocked/);
assert.ok(batch32State.applicationSessions.flatMap(session => session.timeline).every(event => !/password\s*=|otp\s*=|verification code\s+\d/i.test(event.summary)));
assert.deepEqual(holleyRole.requiredGaps, []);
assert.deepEqual(holleyRole.preferredGaps, ['Rubber/plastics experience']);

console.log('Concierge domain tests passed.');
