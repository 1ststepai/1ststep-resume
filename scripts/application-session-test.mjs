import assert from 'node:assert/strict';
import { addApplicationAction, applicationSessionPublicSummary, assertNoApplicationSecrets, beginReservedApplicationSubmission, beginReservedApplicationTransmission, closeApplicationSessionBeforeSubmission, completeReservedApplicationSubmission, completeReservedApplicationTransmission, confirmApplicationApproval, confirmExternalApplicationStep, createApplicationSession, expireReservedApplicationTransmission, failReservedApplicationSubmission, failReservedApplicationTransmission, pauseApplicationSession, preserveApplicationFormCheckpoint, reconcileUnknownApplicationTransmission, recordPostSubmissionOutcome, refreshApplicationSubmissionApproval, refreshApplicationTransmissionApproval, requestApplicationSubmissionApproval, reserveApplicationSubmissionExecution, reserveApplicationTransmission, resumeApplicationSession } from '../lib/application-session-domain.js';
import { createDurableApplicationSession, deleteAllDurableApplicationSessions, listDurableApplicationSessionAudit, listDurableApplicationSessions, readDurableApplicationSession, updateDurableApplicationSession } from '../lib/application-session-store.js';
import { prepareEmployerBrowserTaskRecord, readEmployerBrowserTask } from '../lib/employer-browser-task-store.js';
import { prepareApplicationSubmissionTaskRecord, readApplicationSubmissionTask } from '../lib/application-submission-task-store.js';
import { prepareApplicationReceiptTaskRecord, readApplicationReceiptTask } from '../lib/application-receipt-task-store.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async del(key) { return this.values.delete(key) ? 1 : 0; }
  async zadd(key, score, member) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); this.sorted.get(key).set(member, Number(score)); return 1; }
  async zrem(key, member) { return this.sorted.get(key)?.delete(member) ? 1 : 0; }
  async zrange(key, start, end, options = {}) {
    const entries = [...(this.sorted.get(key) || new Map()).entries()].sort((a, b) => options.rev ? b[1] - a[1] : a[1] - b[1]);
    return entries.slice(start, end < 0 ? undefined : end + 1).map(([id]) => id);
  }
  async eval(script, keys, args) {
    if (script.includes("local replay = redis.call('GET', KEYS[2])")) {
      const replay = this.values.get(keys[1]); if (replay) return ['replayed', replay];
      this.values.set(keys[0], args[0]); this.values.set(keys[1], args[1]); await this.zadd(keys[2], args[4], args[1]);
      this.values.set(keys[3], args[5]); await this.zadd(keys[4], args[4], args[6]); return ['created', args[1]];
    }
    const record = JSON.parse(this.values.get(keys[0]) || 'null'); if (!record) return ['missing'];
    if (record.tenantId !== args[0]) return ['forbidden'];
    if (record.version !== Number(args[1])) return ['conflict', String(record.version)];
    if (String(record.auditHeadHash || '') !== args[11] || this.values.has(keys[2])) return ['audit-conflict'];
    record.version += 1; record.updatedAt = args[2]; record.envelope = JSON.parse(args[3]); record.auditHeadHash = args[7]; record.auditCount = Number(args[8]); record.auditHeadSignature = args[13];
    if (args[14]) {
      const replay = this.values.get(keys[5]);
      if ((replay && replay !== args[15]) || (!replay && this.values.has(keys[4]))) return ['task-conflict'];
    }
    this.values.set(keys[0], JSON.stringify(record)); await this.zadd(keys[1], args[5], args[6]); this.values.set(keys[2], args[9]); await this.zadd(keys[3], args[5], args[12]);
    if (args[14]) { this.values.set(keys[4], args[14]); this.values.set(keys[5], args[15]); await this.zadd(keys[6], args[16], args[15]); await this.zadd(keys[7], args[16], args[15]); }
    return ['updated', JSON.stringify(record)];
  }
}

const packageInput = {
  packageRunId: 'run_package_fixture_1', packageQaVerified: true, documentVersion: 'resume-v1',
  employer: 'Example Employer', title: 'Procurement Manager', requisitionId: 'REQ-100', directEmployerUrl: 'https://jobs.example.test/req/100',
  proposedFields: [{ fieldKey: 'email', label: 'Email', factId: 'fact_contact_email', maskedPreview: '•••@example.test', confidence: .99, provenance: 'user-confirmed', ordinaryVerified: true }],
};
let session = createApplicationSession(packageInput, new Date('2026-08-29T17:00:00.000Z'));
const employerClosedBeforeTransmission = closeApplicationSessionBeforeSubmission(session, { reasonCode: 'DIRECT_EMPLOYER_REQUISITION_CLOSED' }, new Date('2026-08-29T17:00:01.000Z'));
assert.equal(employerClosedBeforeTransmission.state, 'Finished');
assert.equal(employerClosedBeforeTransmission.closedBeforeSubmission.personalDataTransmitted, false);
assert.equal(employerClosedBeforeTransmission.closedBeforeSubmission.submitted, false);
assert.equal(employerClosedBeforeTransmission.actions.every(action => action.status !== 'open'), true);
assert.equal(applicationSessionPublicSummary(employerClosedBeforeTransmission).closedBeforeSubmission.source, 'direct-employer-reverification');
assert.throws(() => resumeApplicationSession(employerClosedBeforeTransmission), /paused application session/i);
assert.throws(() => closeApplicationSessionBeforeSubmission({ ...session, transmissionAttempt: { transmittedAt: '2026-08-29T17:00:00.000Z' } }, { reasonCode: 'DIRECT_EMPLOYER_REQUISITION_CLOSED' }), /cannot be closed/);
assert.equal(session.state, 'Waiting for You');

const receiptVerifiedSession = {
  ...createApplicationSession({ ...packageInput, packageRunId: 'run_post_submission_fixture' }, new Date('2026-08-29T12:00:00.000Z')),
  state: 'Finished', stage: 'receipt_verification', actions: [],
  receipt: { authority: 'employer-side', receivedAt: '2026-08-29T13:00:00.000Z', verifiedAt: '2026-08-29T13:01:00.000Z' },
};
assert.throws(() => recordPostSubmissionOutcome({ ...receiptVerifiedSession, receipt: null }, { outcome: 'INTERVIEW', confirmed: true }), /authoritative employer receipt/);
assert.throws(() => recordPostSubmissionOutcome(receiptVerifiedSession, { outcome: 'INTERVIEW', confirmed: false }), /explicitly confirm/);
const interviewSession = recordPostSubmissionOutcome(receiptVerifiedSession, { outcome: 'INTERVIEW', confirmed: true }, new Date('2026-08-30T12:00:00.000Z'));
assert.equal(interviewSession.postSubmission.status, 'INTERVIEW');
assert.equal(interviewSession.postSubmission.source, 'USER_CONFIRMED');
assert.equal(interviewSession.timeline.at(-1).kind, 'INTERVIEW_CONFIRMED');
let followUpSession = recordPostSubmissionOutcome(interviewSession, { outcome: 'FOLLOW_UP_SCHEDULED', dueAt: '2026-09-06T12:00:00.000Z', confirmed: true }, new Date('2026-08-30T12:01:00.000Z'));
assert.equal(followUpSession.postSubmission.followUp.status, 'SCHEDULED');
assert.match(followUpSession.timeline.at(-1).summary, /No employer message/);
followUpSession = recordPostSubmissionOutcome(followUpSession, { outcome: 'FOLLOW_UP_COMPLETED', confirmed: true }, new Date('2026-09-06T12:01:00.000Z'));
assert.equal(followUpSession.postSubmission.followUp.status, 'COMPLETED');
assert.match(followUpSession.timeline.at(-1).summary, /did not contact the employer/);
const closedSession = recordPostSubmissionOutcome(interviewSession, { outcome: 'REJECTED_CLOSED', confirmed: true }, new Date('2026-09-02T12:00:00.000Z'));
assert.equal(closedSession.postSubmission.status, 'REJECTED_CLOSED');
assert.equal(closedSession.postSubmission.followUp.status, 'NOT_SCHEDULED');
assert.throws(() => recordPostSubmissionOutcome(closedSession, { outcome: 'FOLLOW_UP_SCHEDULED', dueAt: '2026-09-10T12:00:00.000Z', confirmed: true }, new Date('2026-09-02T12:01:00.000Z')), /closed application/);
assert.throws(() => recordPostSubmissionOutcome(receiptVerifiedSession, { outcome: 'INTERVIEW', confirmed: true, password: 'unsafe' }), /not allowed/);
assert.equal(session.actions[0].type, 'TRANSMISSION_APPROVAL');
assert.equal(session.externalApplicationExecution, false);
assert.throws(() => createApplicationSession({ ...packageInput, packageQaVerified: false }), /isolated render QA/);
assert.throws(() => assertNoApplicationSecrets({ otp: '123456' }), /not allowed/);
assert.throws(() => assertNoApplicationSecrets({ note: 'The verification code is 123456' }), /not allowed/);
session = confirmApplicationApproval(session, { kind: 'transmission', confirmed: true }, new Date('2026-08-29T17:01:00.000Z'));
assert.equal(session.stage, 'employer_form');
assert.equal(session.approvals.transmission.consumedAt, null);
assert.deepEqual(session.approvals.transmission.approvedFieldKeys, ['email']);
assert.equal(refreshApplicationTransmissionApproval(session, new Date('2026-08-29T17:02:00.000Z')), session);
const expiredBeforeInspection = refreshApplicationTransmissionApproval(session, new Date('2026-08-29T17:16:01.000Z'));
assert.equal(expiredBeforeInspection.state, 'Waiting for You');
assert.equal(expiredBeforeInspection.stage, 'transmission_approval');
assert.equal(expiredBeforeInspection.actions.filter(action => action.type === 'TRANSMISSION_APPROVAL' && action.status === 'open').length, 1);
assert.equal(expiredBeforeInspection.timeline.at(-1).kind, 'TRANSMISSION_REAPPROVAL_REQUIRED');
assert.match(expiredBeforeInspection.timeline.at(-1).summary, /No employer browser or personal-data transmission started/);
const legacyApproval = { ...session, approvals: { ...session.approvals, transmission: { ...session.approvals.transmission, approvedFieldKeys: undefined } } };
assert.equal(refreshApplicationTransmissionApproval(legacyApproval, new Date('2026-08-29T17:02:00.000Z')).stage, 'transmission_approval');

let reserved = createApplicationSession(packageInput, new Date('2026-08-29T17:00:00.000Z'));
reserved = confirmApplicationApproval(reserved, { kind: 'transmission', confirmed: true }, new Date('2026-08-29T17:01:00.000Z'));
reserved = preserveApplicationFormCheckpoint(reserved, { pageUrl: packageInput.directEmployerUrl, stepKey: 'employer-form', fieldSchemaHash: 'b'.repeat(64), stagedFieldKeys: ['email'] }, new Date('2026-08-29T17:01:10.000Z'));
assert.throws(() => reserveApplicationTransmission(reserved, { taskId: 'browser_task_scope_escape', fieldSchemaHash: 'b'.repeat(64), stagedFieldKeys: ['phone'] }, new Date('2026-08-29T17:01:30.000Z')), /exceeds the action-time/);
reserved = reserveApplicationTransmission(reserved, { taskId: 'browser_task_fixture_1', fieldSchemaHash: 'b'.repeat(64), stagedFieldKeys: ['email'] }, new Date('2026-08-29T17:02:00.000Z'));
assert.equal(reserved.workerExecution.status, 'queued');
assert.equal(reserved.worker.mode, 'isolated-worker');
assert.equal(reserved.worker.isolated, true);
assert.equal(reserved.approvals.transmission.consumedAt, null);
reserved = beginReservedApplicationTransmission(reserved, { taskId: 'browser_task_fixture_1' }, new Date('2026-08-29T17:02:10.000Z'));
assert.equal(reserved.workerExecution.status, 'executing');
assert.ok(reserved.approvals.transmission.consumedAt);
assert.throws(() => beginReservedApplicationTransmission(reserved, { taskId: 'browser_task_fixture_1' }, new Date('2026-08-29T17:02:11.000Z')), /single-use/);
const completedTransmission = completeReservedApplicationTransmission(reserved, { taskId: 'browser_task_fixture_1', transmittedFieldKeys: ['email'] }, new Date('2026-08-29T17:02:20.000Z'));
assert.equal(completedTransmission.workerExecution.status, 'completed');
assert.equal(completedTransmission.externalApplicationExecution, true);
assert.equal(applicationSessionPublicSummary(completedTransmission).externalApplicationExecution, true);
assert.deepEqual(completedTransmission.transmissionAttempt.transmittedFieldKeys, ['email']);
assert.throws(() => requestApplicationSubmissionApproval(reserved, { confirmed: true }), /completed transmission/);
assert.throws(() => requestApplicationSubmissionApproval(completedTransmission, { confirmed: false }), /Explicit confirmation/);
assert.throws(() => requestApplicationSubmissionApproval(completedTransmission, { confirmed: true, reviewedFieldKeys: ['email'] }), /value-free user confirmation/);
const finalReviewReady = requestApplicationSubmissionApproval(completedTransmission, { confirmed: true }, new Date('2026-08-29T17:02:30.000Z'));
assert.equal(finalReviewReady.stage, 'submission_approval');
assert.equal(finalReviewReady.actions[0].type, 'SUBMISSION_APPROVAL');
assert.equal(finalReviewReady.timeline.at(-1).metadata.reviewedFieldCount, 1);
let submissionAuthorized = confirmApplicationApproval(finalReviewReady, { kind: 'submission', confirmed: true }, new Date('2026-08-29T17:02:40.000Z'));
assert.equal(refreshApplicationSubmissionApproval(submissionAuthorized, new Date('2026-08-29T17:17:39.000Z')), submissionAuthorized);
assert.throws(() => refreshApplicationSubmissionApproval({ ...submissionAuthorized, submissionAttempt: { submittedAt: '2026-08-29T17:03:00.000Z' } }, new Date('2026-08-29T17:18:00.000Z')), /before submission execution starts/);
assert.throws(() => refreshApplicationSubmissionApproval({ ...submissionAuthorized, approvals: { ...submissionAuthorized.approvals, submission: { ...submissionAuthorized.approvals.submission, scopeHash: '0'.repeat(64) } } }, new Date('2026-08-29T17:18:00.000Z')), /reviewed employer form changed/);
const renewedSubmissionApproval = refreshApplicationSubmissionApproval(submissionAuthorized, new Date('2026-08-29T17:18:00.000Z'));
assert.equal(renewedSubmissionApproval.state, 'Waiting for You');
assert.equal(renewedSubmissionApproval.stage, 'submission_approval');
assert.equal(renewedSubmissionApproval.actions[0].type, 'SUBMISSION_APPROVAL');
assert.ok(renewedSubmissionApproval.approvals.submission.supersededAt);
assert.equal(renewedSubmissionApproval.timeline.at(-1).kind, 'SUBMISSION_REAPPROVAL_REQUIRED');
assert.match(renewedSubmissionApproval.timeline.at(-1).summary, /Nothing was submitted/);
submissionAuthorized = confirmApplicationApproval(renewedSubmissionApproval, { kind: 'submission', confirmed: true }, new Date('2026-08-29T17:18:30.000Z'));
assert.equal(submissionAuthorized.stage, 'submission_execution');
assert.throws(() => reserveApplicationSubmissionExecution(submissionAuthorized, { taskId: 'submit_task_scope_escape', fieldSchemaHash: 'b'.repeat(64) }, new Date('2026-08-29T17:18:40.000Z')), /only a server-generated task identifier/);
let submissionReserved = reserveApplicationSubmissionExecution(submissionAuthorized, { taskId: 'submit_task_fixture_1' }, new Date('2026-08-29T17:18:40.000Z'));
assert.equal(submissionReserved.submissionExecution.status, 'queued');
assert.equal(submissionReserved.approvals.submission.consumedAt, null);
assert.equal(reserveApplicationSubmissionExecution(submissionReserved, { taskId: 'submit_task_fixture_1' }, new Date('2026-08-29T17:18:41.000Z')), submissionReserved);
assert.throws(() => reserveApplicationSubmissionExecution(submissionReserved, { taskId: 'submit_task_fixture_2' }, new Date('2026-08-29T17:18:41.000Z')), /already has a submission execution record/);
submissionReserved = beginReservedApplicationSubmission(submissionReserved, { taskId: 'submit_task_fixture_1' }, new Date('2026-08-29T17:18:50.000Z'));
assert.equal(submissionReserved.submissionExecution.status, 'executing');
assert.ok(submissionReserved.approvals.submission.consumedAt);
assert.equal(submissionReserved.externalApplicationExecution, true);
assert.throws(() => beginReservedApplicationSubmission(submissionReserved, { taskId: 'submit_task_fixture_1' }, new Date('2026-08-29T17:18:51.000Z')), /single-use/);
assert.throws(() => completeReservedApplicationSubmission(submissionReserved, { taskId: 'submit_task_fixture_1', submittedAt: '2026-08-29T17:19:00.000Z', responseFingerprint: 'c'.repeat(64), candidateEmail: 'unsafe@example.test' }), /minimized provider evidence/);
const submissionAttempted = completeReservedApplicationSubmission(submissionReserved, { taskId: 'submit_task_fixture_1', submittedAt: '2026-08-29T17:19:00.000Z', responseFingerprint: 'c'.repeat(64), receiptTaskId: 'receipt_task_fixture_1' }, new Date('2026-08-29T17:19:01.000Z'));
assert.equal(submissionAttempted.submissionExecution.status, 'completed');
assert.equal(submissionAttempted.stage, 'receipt_verification');
assert.equal(submissionAttempted.state, 'Preparing');
assert.equal(submissionAttempted.receipt, null);
assert.equal(submissionAttempted.submissionAttempt.authoritativeReceiptVerified, false);
assert.equal(submissionAttempted.receiptVerification.id, 'receipt_task_fixture_1');
assert.match(submissionAttempted.timeline.at(-1).summary, /not counted as Submitted/);
assert.equal(applicationSessionPublicSummary(submissionAttempted).submissionExecution.status, 'completed');

let unknownSubmission = reserveApplicationSubmissionExecution(submissionAuthorized, { taskId: 'submit_task_unknown_1' }, new Date('2026-08-29T17:18:40.000Z'));
unknownSubmission = beginReservedApplicationSubmission(unknownSubmission, { taskId: 'submit_task_unknown_1' }, new Date('2026-08-29T17:18:50.000Z'));
unknownSubmission = failReservedApplicationSubmission(unknownSubmission, { taskId: 'submit_task_unknown_1', failureCode: 'SUBMISSION_PROVIDER_OUTCOME_UNKNOWN' }, new Date('2026-08-29T17:19:00.000Z'));
assert.equal(unknownSubmission.submissionExecution.status, 'outcome-unknown');
assert.equal(unknownSubmission.state, 'Waiting for You');
assert.equal(unknownSubmission.stage, 'receipt_verification');
assert.equal(unknownSubmission.submissionAttempt, null);
assert.equal(unknownSubmission.actions[0].type, 'SUBMISSION_OUTCOME_UNKNOWN');
assert.match(unknownSubmission.timeline.at(-1).summary, /Automatic resubmission is blocked/);
assert.throws(() => failReservedApplicationSubmission(submissionReserved, { taskId: 'submit_task_fixture_1', failureCode: 'unsafe-code' }), /safe submission failure code/);
assert.throws(() => reserveApplicationSubmissionExecution(submissionAuthorized, { taskId: 'submit_task_expired_1' }, new Date('2026-08-29T17:34:00.000Z')), /expired before reservation/);
let expiresAfterReservation = reserveApplicationSubmissionExecution(submissionAuthorized, { taskId: 'submit_task_expired_2' }, new Date('2026-08-29T17:18:40.000Z'));
assert.throws(() => beginReservedApplicationSubmission(expiresAfterReservation, { taskId: 'submit_task_expired_2' }, new Date('2026-08-29T17:34:00.000Z')), /expired before execution/);
assert.throws(() => requestApplicationSubmissionApproval({ ...completedTransmission, formCheckpoint: { ...completedTransmission.formCheckpoint, attachedDocumentVersion: 'wrong-version' } }, { confirmed: true }), /exact preserved employer form/);
assert.throws(() => requestApplicationSubmissionApproval({ ...completedTransmission, transmissionAttempt: { ...completedTransmission.transmissionAttempt, transmittedFieldKeys: [] } }, { confirmed: true }), /field scope/);
assert.throws(() => completeReservedApplicationTransmission(reserved, { taskId: 'browser_task_fixture_1', transmittedFieldKeys: ['phone'] }, new Date('2026-08-29T17:02:20.000Z')), /scope/);
const unknownTransmission = failReservedApplicationTransmission(reserved, { taskId: 'browser_task_fixture_1', failureCode: 'SANDBOX_TIMEOUT' }, new Date('2026-08-29T17:02:20.000Z'));
assert.equal(unknownTransmission.workerExecution.status, 'outcome-unknown');
assert.equal(unknownTransmission.state, 'Waiting for You');
assert.equal(unknownTransmission.externalApplicationExecution, true);
assert.equal(unknownTransmission.actions[0].type, 'EMPLOYER_ATS_FAILURE');
assert.equal(unknownTransmission.timeline.at(-1).summary.includes('Automatic retransmission is blocked'), true);
const failureAction = unknownTransmission.actions[0];
const reconciledPresent = reconcileUnknownApplicationTransmission(unknownTransmission, { actionId: failureAction.id, outcome: 'FIELDS_PRESENT', confirmed: true }, new Date('2026-08-29T17:03:00.000Z'));
assert.equal(reconciledPresent.workerExecution.status, 'completed-after-user-review');
assert.equal(reconciledPresent.transmissionAttempt.verificationSource, 'USER_CONFIRMED_PRESERVED_FORM');
assert.equal(reconciledPresent.transmissionAttempt.transmittedAt, null);
assert.equal(reconciledPresent.transmissionAttempt.transmissionTimeStatus, 'UNKNOWN');
assert.deepEqual(reconciledPresent.transmissionAttempt.transmittedFieldKeys, ['email']);
assert.equal(reconciledPresent.actions.find(action => action.id === failureAction.id).status, 'resolved');
assert.equal(reconciledPresent.submissionAttempt, null);
assert.equal(requestApplicationSubmissionApproval(reconciledPresent, { confirmed: true }, new Date('2026-08-29T17:03:10.000Z')).stage, 'submission_approval');
assert.throws(() => reconcileUnknownApplicationTransmission(unknownTransmission, { actionId: failureAction.id, outcome: 'FIELDS_PRESENT', confirmed: true, fieldValue: 'private' }), /value-free/);
let reconciledNotFilled = reconcileUnknownApplicationTransmission(unknownTransmission, { actionId: failureAction.id, outcome: 'FIELDS_NOT_FILLED', confirmed: true }, new Date('2026-08-29T17:03:00.000Z'));
assert.equal(reconciledNotFilled.workerExecution.status, 'reconciled-not-filled');
assert.equal(reconciledNotFilled.stage, 'transmission_approval');
assert.equal(reconciledNotFilled.approvals.transmission, null);
assert.equal(reconciledNotFilled.actions.filter(action => action.type === 'TRANSMISSION_APPROVAL' && action.status === 'open').length, 1);
reconciledNotFilled = confirmApplicationApproval(reconciledNotFilled, { kind: 'transmission', confirmed: true }, new Date('2026-08-29T17:04:00.000Z'));
reconciledNotFilled = reserveApplicationTransmission(reconciledNotFilled, { taskId: 'browser_task_reconciled_retry', fieldSchemaHash: 'b'.repeat(64), stagedFieldKeys: ['email'] }, new Date('2026-08-29T17:04:10.000Z'));
assert.equal(reconciledNotFilled.workerExecution.id, 'browser_task_reconciled_retry');
assert.equal(reconciledNotFilled.workerExecution.status, 'queued');
let expiredBeforeStart = createApplicationSession(packageInput, new Date('2026-08-29T18:00:00.000Z'));
expiredBeforeStart = confirmApplicationApproval(expiredBeforeStart, { kind: 'transmission', confirmed: true }, new Date('2026-08-29T18:01:00.000Z'));
expiredBeforeStart = reserveApplicationTransmission(expiredBeforeStart, { taskId: 'browser_task_expired_fixture', fieldSchemaHash: 'e'.repeat(64), stagedFieldKeys: ['email'] }, new Date('2026-08-29T18:02:00.000Z'));
assert.throws(() => beginReservedApplicationTransmission(expiredBeforeStart, { taskId: 'browser_task_expired_fixture' }, new Date('2026-08-29T18:16:01.000Z')), /expired before execution/);
expiredBeforeStart = expireReservedApplicationTransmission(expiredBeforeStart, { taskId: 'browser_task_expired_fixture' }, new Date('2026-08-29T18:16:01.000Z'));
assert.equal(expiredBeforeStart.state, 'Waiting for You');
assert.equal(expiredBeforeStart.stage, 'transmission_approval');
assert.equal(expiredBeforeStart.workerExecution.status, 'cancelled');
assert.equal(expiredBeforeStart.workerExecution.failureCode, 'TRANSMISSION_APPROVAL_EXPIRED');
assert.equal(expiredBeforeStart.actions.filter(action => action.type === 'TRANSMISSION_APPROVAL' && action.status === 'open').length, 1);
assert.match(expiredBeforeStart.timeline.at(-1).summary, /No personal data was transmitted/);
expiredBeforeStart = confirmApplicationApproval(expiredBeforeStart, { kind: 'transmission', confirmed: true }, new Date('2026-08-29T18:17:00.000Z'));
expiredBeforeStart = reserveApplicationTransmission(expiredBeforeStart, { taskId: 'browser_task_renewed_fixture', fieldSchemaHash: 'e'.repeat(64), stagedFieldKeys: ['email'] }, new Date('2026-08-29T18:17:10.000Z'));
assert.equal(expiredBeforeStart.workerExecution.id, 'browser_task_renewed_fixture');
assert.equal(expiredBeforeStart.workerExecution.status, 'queued');
session = preserveApplicationFormCheckpoint(session, { pageUrl: packageInput.directEmployerUrl, stepKey: 'work-history', fieldSchemaHash: 'a'.repeat(64), stagedFieldKeys: ['first_name', 'last_name'] }, new Date('2026-08-29T17:02:00.000Z'));
assert.equal(session.formCheckpoint.status, 'preserved');
session = addApplicationAction(session, { type: 'OTP', summary: 'Enter the latest code directly on the employer page.', metadata: { generation: 1 } }, new Date('2026-08-29T17:03:00.000Z'));
assert.equal(session.state, 'Waiting for You');
assert.throws(() => addApplicationAction(session, { type: 'OTP', summary: 'Code', metadata: { verificationCode: '123456' } }), /not allowed/);
const otpAction = session.actions.find(action => action.type === 'OTP' && action.status === 'open');
session = confirmExternalApplicationStep(session, { actionId: otpAction.id, confirmed: true }, new Date('2026-08-29T17:03:30.000Z'));
assert.equal(session.actions.find(action => action.id === otpAction.id).status, 'resolved');
assert.ok(!JSON.stringify(session).includes('123456'));
const unresolvedFact = addApplicationAction(session, { type: 'AMBIGUOUS_FACT', summary: 'Confirm a role-specific answer.' }, new Date('2026-08-29T17:03:40.000Z'));
const factAction = unresolvedFact.actions.find(action => action.type === 'AMBIGUOUS_FACT' && action.status === 'open');
const resolvedFact = confirmExternalApplicationStep(unresolvedFact, { actionId: factAction.id, confirmed: true }, new Date('2026-08-29T17:03:50.000Z'));
assert.equal(resolvedFact.actions.find(action => action.id === factAction.id).status, 'resolved');
assert.match(resolvedFact.timeline.at(-1).summary, /No answer, credential, identity document, or challenge value was collected/);
assert.throws(() => confirmExternalApplicationStep(unresolvedFact, { actionId: factAction.id, confirmed: true, answer: 'candidate answer' }), /not allowed/);
let employerReviewSession = resolvedFact;
for (const type of ['NONSTANDARD_CERTIFICATION', 'OUTSIDE_EMPLOYMENT_CONFLICT']) {
  employerReviewSession = addApplicationAction(employerReviewSession, { type, summary: 'Review this directly on the employer page.' }, new Date('2026-08-29T17:03:51.000Z'));
  const reviewAction = employerReviewSession.actions.find(action => action.type === type && action.status === 'open');
  employerReviewSession = confirmExternalApplicationStep(employerReviewSession, { actionId: reviewAction.id, confirmed: true }, new Date('2026-08-29T17:03:52.000Z'));
  assert.equal(employerReviewSession.actions.find(action => action.id === reviewAction.id).status, 'resolved');
}
session = unresolvedFact;
session = pauseApplicationSession(session, 'Browser worker timed out.', new Date('2026-08-29T17:04:00.000Z'));
session = resumeApplicationSession(session, new Date('2026-08-29T17:05:00.000Z'));
assert.equal(session.state, 'Waiting for You');

const redis = new FakeRedis();
const config = { redis, subject: 'candidate@example.test', partitionSecret: 'p'.repeat(48), dataEncryptionKey: Buffer.alloc(32, 7).toString('base64'), auditSigningSecret: 'a'.repeat(48) };
const created = await createDurableApplicationSession({ ...config, session, idempotencyKey: 'application_session_fixture_1', now: new Date('2026-08-29T17:06:00.000Z') });
assert.equal(created.session.role.employer, 'Example Employer');
assert.equal(created.session.audit.count, 1);
assert.match(created.session.audit.headHash, /^[a-f0-9]{64}$/);
assert.match(created.session.audit.headSignature, /^[a-f0-9]{64}$/);
assert.equal(await readDurableApplicationSession({ ...config, subject: 'other@example.test', sessionId: session.id }), null);
assert.ok(![...redis.values.values()].some(value => String(value).includes('Example Employer')));
assert.equal((await listDurableApplicationSessions(config)).length, 1);
let audit = await listDurableApplicationSessionAudit({ ...config, sessionId: session.id });
assert.equal(audit.integrityVerified, true);
assert.equal(audit.count, 1);
assert.equal(audit.entries[0].event.kind, 'SESSION_RESUMED');
assert.equal(await listDurableApplicationSessionAudit({ ...config, subject: 'other@example.test', sessionId: session.id }), null);
const { version, ...editable } = created.session;
const paused = pauseApplicationSession(editable, 'Candidate paused.', new Date('2026-08-29T17:07:00.000Z'));
const saved = await updateDurableApplicationSession({ ...config, sessionId: session.id, expectedVersion: version, session: paused, now: new Date('2026-08-29T17:07:00.000Z') });
assert.equal(saved.state, 'Paused');
assert.equal(saved.audit.count, 2);
audit = await listDurableApplicationSessionAudit({ ...config, sessionId: session.id });
assert.equal(audit.count, 2);
assert.equal(audit.entries[1].event.kind, 'SESSION_PAUSED');
assert.match(audit.headSignature, /^[a-f0-9]{64}$/);
await assert.rejects(() => listDurableApplicationSessionAudit({ ...config, auditSigningSecret: 'b'.repeat(48), sessionId: session.id }), /integrity verification/);
const auditEntryKey = [...redis.values.keys()].find(key => key.endsWith(`:audit:${session.id}:2`));
const originalAuditEntry = redis.values.get(auditEntryKey);
const tamperedAuditEntry = JSON.parse(originalAuditEntry);
tamperedAuditEntry.eventHash = '0'.repeat(64);
redis.values.set(auditEntryKey, JSON.stringify(tamperedAuditEntry));
await assert.rejects(() => listDurableApplicationSessionAudit({ ...config, sessionId: session.id }), /integrity verification/);
redis.values.set(auditEntryKey, originalAuditEntry);
const storedSessionKey = [...redis.values.keys()].find(key => key.endsWith(`:session:${session.id}`));
const originalStoredSession = redis.values.get(storedSessionKey);
const tamperedStoredSession = JSON.parse(originalStoredSession);
tamperedStoredSession.auditHeadSignature = '0'.repeat(64);
redis.values.set(storedSessionKey, JSON.stringify(tamperedStoredSession));
await assert.rejects(() => listDurableApplicationSessionAudit({ ...config, sessionId: session.id }), /audit head/);
redis.values.set(storedSessionKey, originalStoredSession);
await assert.rejects(() => updateDurableApplicationSession({ ...config, sessionId: session.id, expectedVersion: version, session: paused }), /changed/);
const secondSession = createApplicationSession({ ...packageInput, requisitionId: 'REQ-200' }, new Date('2026-08-29T17:08:00.000Z'));
await createDurableApplicationSession({ ...config, session: secondSession, idempotencyKey: 'application_session_fixture_2', now: new Date('2026-08-29T17:08:00.000Z') });
let queuedSession = createApplicationSession({ ...packageInput, packageRunId: 'run_package_fixture_3', requisitionId: 'REQ-300' }, new Date('2026-08-29T17:09:00.000Z'));
const queuedCreated = await createDurableApplicationSession({ ...config, session: queuedSession, idempotencyKey: 'application_session_fixture_3', now: new Date('2026-08-29T17:09:00.000Z') });
queuedSession = confirmApplicationApproval(queuedSession, { kind: 'transmission', confirmed: true }, new Date('2026-08-29T17:09:10.000Z'));
queuedSession = reserveApplicationTransmission(queuedSession, { taskId: 'browser_task_atomic_fixture', fieldSchemaHash: 'c'.repeat(64), stagedFieldKeys: ['email'] }, new Date('2026-08-29T17:09:20.000Z'));
const browserTaskReservation = prepareEmployerBrowserTaskRecord({
  tenantId: jobAgentTenantId(config.subject, config.partitionSecret), dataEncryptionKey: config.dataEncryptionKey,
  sessionId: queuedSession.id, fieldSchemaHash: 'c'.repeat(64), stagedFieldKeys: ['email'], taskId: 'browser_task_atomic_fixture',
  idempotencyKey: 'browser_task_atomic_idem', now: new Date('2026-08-29T17:09:20.000Z'),
});
const queuedSaved = await updateDurableApplicationSession({ ...config, sessionId: queuedSession.id, expectedVersion: queuedCreated.session.version, session: queuedSession, browserTaskReservation, now: new Date('2026-08-29T17:09:20.000Z') });
assert.equal(queuedSaved.workerExecution.id, 'browser_task_atomic_fixture');
const queuedTask = await readEmployerBrowserTask({ ...config, taskId: 'browser_task_atomic_fixture' });
assert.equal(queuedTask.payload.sessionId, queuedSession.id);
assert.deepEqual(queuedTask.payload.stagedFieldKeys, ['email']);
const submissionCreated = await createDurableApplicationSession({ ...config, session: submissionAuthorized, idempotencyKey: 'application_submission_atomic_fixture', now: new Date('2026-08-29T17:20:00.000Z') });
const submissionQueued = reserveApplicationSubmissionExecution(submissionAuthorized, { taskId: 'submission_task_atomic_fixture' }, new Date('2026-08-29T17:20:01.000Z'));
const submissionTaskReservation = prepareApplicationSubmissionTaskRecord({
  tenantId: jobAgentTenantId(config.subject, config.partitionSecret), dataEncryptionKey: config.dataEncryptionKey,
  sessionId: submissionQueued.id, scopeHash: submissionQueued.submissionExecution.scopeHash, documentVersion: submissionQueued.documentVersion,
  fieldSchemaHash: submissionQueued.submissionExecution.fieldSchemaHash, taskId: 'submission_task_atomic_fixture',
  idempotencyKey: 'submission_task_atomic_idem', now: new Date('2026-08-29T17:20:01.000Z'),
});
const submissionSaved = await updateDurableApplicationSession({ ...config, sessionId: submissionQueued.id, expectedVersion: submissionCreated.session.version, session: submissionQueued, submissionTaskReservation, now: new Date('2026-08-29T17:20:01.000Z') });
assert.equal(submissionSaved.submissionExecution.status, 'queued');
const durableSubmissionTask = await readApplicationSubmissionTask({ ...config, taskId: 'submission_task_atomic_fixture' });
assert.equal(durableSubmissionTask.payload.sessionId, submissionQueued.id);
assert.equal(durableSubmissionTask.payload.scopeHash, submissionQueued.submissionExecution.scopeHash);
const submissionExecuting = beginReservedApplicationSubmission(submissionSaved, { taskId: 'submission_task_atomic_fixture' }, new Date('2026-08-29T17:20:02.000Z'));
const receiptTaskReservation = prepareApplicationReceiptTaskRecord({
  tenantId: jobAgentTenantId(config.subject, config.partitionSecret), dataEncryptionKey: config.dataEncryptionKey,
  sessionId: submissionQueued.id, documentVersion: submissionQueued.documentVersion,
  scopeHash: submissionQueued.submissionExecution.scopeHash, responseFingerprint: 'd'.repeat(64),
  submittedAt: '2026-08-29T17:20:03.000Z', expectedSessionVersion: submissionSaved.version + 1,
  taskId: 'receipt_task_atomic_fixture', idempotencyKey: 'receipt_task_atomic_idem', now: new Date('2026-08-29T17:20:03.000Z'),
});
const receiptQueued = completeReservedApplicationSubmission(submissionExecuting, {
  taskId: 'submission_task_atomic_fixture', submittedAt: '2026-08-29T17:20:03.000Z', responseFingerprint: 'd'.repeat(64), receiptTaskId: 'receipt_task_atomic_fixture',
}, new Date('2026-08-29T17:20:03.000Z'));
const receiptSaved = await updateDurableApplicationSession({ ...config, sessionId: submissionQueued.id, expectedVersion: submissionSaved.version, session: receiptQueued, receiptTaskReservation, now: new Date('2026-08-29T17:20:03.000Z') });
assert.equal(receiptSaved.receiptVerification.status, 'queued');
const durableReceiptTask = await readApplicationReceiptTask({ ...config, taskId: 'receipt_task_atomic_fixture' });
assert.equal(durableReceiptTask.payload.sessionId, submissionQueued.id);
assert.equal(durableReceiptTask.payload.expectedSessionVersion, receiptSaved.version);
assert.equal((await listDurableApplicationSessions({ ...config, limit: 500 })).length, 4);
assert.equal((await deleteAllDurableApplicationSessions(config)).deleted, 4);
assert.equal(await listDurableApplicationSessionAudit({ ...config, sessionId: session.id }), null);
assert.equal((await listDurableApplicationSessions({ ...config, limit: 500 })).length, 0);
console.log('Durable application-session approval expiry/renewal, receipt-preserving post-submission outcomes, reminders, secret rejection, encryption, append-only audit integrity, deletion, concurrency, and tenant-isolation tests passed.');
