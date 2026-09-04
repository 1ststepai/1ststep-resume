import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  confirmApplicationApproval, createApplicationSession, recordApplicationSubmissionAttempt, recordApplicationTransmission,
  preserveApplicationFormCheckpoint, recordAuthoritativeApplicationReceipt, requestApplicationSubmissionApproval,
} from '../lib/application-session-domain.js';
import { signInternalWorkerRequest, verifyInternalWorkerRequest } from '../lib/internal-worker-auth.js';

const packageInput = {
  packageRunId: 'run_receipt_fixture_1', packageQaVerified: true, documentVersion: 'resume-receipt-v1',
  employer: 'Example Employer', title: 'Procurement Manager', requisitionId: 'REQ-RECEIPT-100', directEmployerUrl: 'https://jobs.example.test/req/100',
  proposedFields: [
    { fieldKey: 'email', label: 'Email', factId: 'fact_contact_email', maskedPreview: '•••@example.test', confidence: .99, provenance: 'user-confirmed', ordinaryVerified: true },
    { fieldKey: 'first_name', label: 'First name', factId: 'fact_first_name', maskedPreview: 'J•••••', confidence: 1, provenance: 'user-confirmed', ordinaryVerified: true },
  ],
};
let session = createApplicationSession(packageInput, new Date('2026-08-29T18:00:00.000Z'));
session = confirmApplicationApproval(session, { kind: 'transmission', confirmed: true }, new Date('2026-08-29T18:01:00.000Z'));
session = preserveApplicationFormCheckpoint(session, { fieldSchemaHash: 'a'.repeat(64), stagedFieldKeys: ['first_name', 'email'], stepKey: 'final-form' }, new Date('2026-08-29T18:01:30.000Z'));
session = recordApplicationTransmission(session, {
  transmittedAt: '2026-08-29T18:02:00.000Z', scopeHash: session.approvals.transmission.scopeHash,
  documentVersion: session.documentVersion, fieldSchemaHash: 'a'.repeat(64), transmittedFieldKeys: ['first_name', 'email'],
}, new Date('2026-08-29T18:02:00.000Z'));
assert.equal(session.approvals.transmission.consumedAt, '2026-08-29T18:02:00.000Z');
assert.equal(session.transmissionAttempt.transmittedFieldKeys.length, 2);
assert.ok(!JSON.stringify(session).includes('candidate@example.test'));

session = requestApplicationSubmissionApproval(session, { confirmed: true }, new Date('2026-08-29T18:03:00.000Z'));
assert.equal(session.state, 'Waiting for You');
assert.equal(session.stage, 'submission_approval');
session = confirmApplicationApproval(session, { kind: 'submission', confirmed: true }, new Date('2026-08-29T18:04:00.000Z'));
assert.equal(session.stage, 'submission_execution');
assert.throws(() => recordApplicationSubmissionAttempt(session, {
  submittedAt: '2026-08-29T18:05:00.000Z', scopeHash: 'b'.repeat(64), documentVersion: session.documentVersion, responseFingerprint: 'c'.repeat(64),
}), /scope must match/);
session = recordApplicationSubmissionAttempt(session, {
  submittedAt: '2026-08-29T18:05:00.000Z', scopeHash: session.approvals.submission.scopeHash,
  documentVersion: session.documentVersion, responseFingerprint: 'c'.repeat(64),
}, new Date('2026-08-29T18:05:00.000Z'));
assert.equal(session.stage, 'receipt_verification');
assert.equal(session.receipt, null);
assert.equal(session.state, 'Preparing');

const evidenceHash = createHash('sha256').update('synthetic employer confirmation fixture').digest('hex');
assert.throws(() => recordAuthoritativeApplicationReceipt(session, {
  source: 'EMPLOYER_CONFIRMATION_PAGE', verificationMethod: 'exact-employer-page', evidenceHash,
  documentVersion: 'wrong-version', requisitionId: session.role.requisitionId, receivedAt: '2026-08-29T18:05:10.000Z', confirmationId: 'ABC-123456',
}), /identity must match/);
const finished = recordAuthoritativeApplicationReceipt(session, {
  source: 'EMPLOYER_CONFIRMATION_PAGE', verificationMethod: 'exact-employer-page', evidenceHash,
  documentVersion: session.documentVersion, requisitionId: session.role.requisitionId, receivedAt: '2026-08-29T18:05:10.000Z',
  confirmationId: 'ABC-123456', confirmationUrl: 'https://jobs.example.test/confirmation/ABC-123456?token=must-not-persist',
}, new Date('2026-08-29T18:06:00.000Z'));
assert.equal(finished.state, 'Finished');
assert.equal(finished.receipt.authority, 'employer-side');
assert.equal(finished.receipt.documentVersion, session.documentVersion);
assert.equal(finished.receipt.confirmationReference, '••••3456');
assert.equal(finished.receipt.confirmationUrl, 'https://jobs.example.test/confirmation/ABC-123456');
assert.ok(!JSON.stringify(finished).includes('must-not-persist'));
assert.equal(recordAuthoritativeApplicationReceipt(finished, { evidenceHash }), finished);
assert.throws(() => recordAuthoritativeApplicationReceipt(finished, { evidenceHash: 'd'.repeat(64) }), /already recorded/);

const secret = 'receipt-worker-secret-'.padEnd(48, 'x');
const body = { action: 'verify-authoritative-receipt', sessionId: 'application_fixture_1', evidence: { kind: 'page' } };
const timestamp = new Date('2026-08-29T18:06:00.000Z').getTime();
const nonce = 'nonce_receipt_fixture_1234';
const signature = signInternalWorkerRequest({ timestamp, nonce, body, secret });
const verified = verifyInternalWorkerRequest({ headers: { 'x-1ststep-worker-timestamp': String(timestamp), 'x-1ststep-worker-nonce': nonce, 'x-1ststep-worker-signature': signature }, body, secret, now: new Date(timestamp) });
assert.equal(verified.ok, true);
assert.match(verified.nonceHash, /^[a-f0-9]{64}$/);
assert.equal(verifyInternalWorkerRequest({ headers: { 'x-1ststep-worker-timestamp': String(timestamp), 'x-1ststep-worker-nonce': nonce, 'x-1ststep-worker-signature': signature }, body: { ...body, sessionId: 'tampered_session' }, secret, now: new Date(timestamp) }).ok, false);
assert.equal(verifyInternalWorkerRequest({ headers: { 'x-1ststep-worker-timestamp': String(timestamp), 'x-1ststep-worker-nonce': nonce, 'x-1ststep-worker-signature': signature }, body, secret, now: new Date(timestamp + 6 * 60_000) }).ok, false);

console.log('Exact-scope transmission, final approval, submission-attempt, authoritative-receipt, redaction, and signed-worker tests passed.');
