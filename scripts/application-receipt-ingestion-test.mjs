import assert from 'node:assert/strict';
import {
  confirmApplicationApproval, createApplicationSession, recordApplicationSubmissionAttempt,
  preserveApplicationFormCheckpoint, recordApplicationTransmission, requestApplicationSubmissionApproval,
} from '../lib/application-session-domain.js';
import { receiptAuthorityConfiguration, verifyAndRecordAuthoritativeReceipt } from '../lib/application-receipt-ingestion.js';

function receiptReadySession() {
  let session = createApplicationSession({
    packageRunId: 'run_receipt_ingestion', packageQaVerified: true, documentVersion: 'ingestion-v1',
    employer: 'Example Employer', title: 'Procurement Manager', requisitionId: 'REQ-INGEST-100', directEmployerUrl: 'https://jobs.example.test/req/100',
    proposedFields: [{ fieldKey: 'email', label: 'Email', factId: 'fact_email', maskedPreview: '•••@example.test', confidence: .99, provenance: 'user-confirmed', ordinaryVerified: true }],
  }, new Date('2026-08-29T20:00:00.000Z'));
  session = confirmApplicationApproval(session, { kind: 'transmission', confirmed: true }, new Date('2026-08-29T20:01:00.000Z'));
  session = preserveApplicationFormCheckpoint(session, { fieldSchemaHash: 'a'.repeat(64), stagedFieldKeys: ['email'], stepKey: 'final-form' }, new Date('2026-08-29T20:01:30.000Z'));
  session = recordApplicationTransmission(session, { transmittedAt: '2026-08-29T20:02:00.000Z', scopeHash: session.approvals.transmission.scopeHash, documentVersion: session.documentVersion, fieldSchemaHash: 'a'.repeat(64), transmittedFieldKeys: ['email'] }, new Date('2026-08-29T20:02:00.000Z'));
  session = requestApplicationSubmissionApproval(session, { confirmed: true }, new Date('2026-08-29T20:03:00.000Z'));
  session = confirmApplicationApproval(session, { kind: 'submission', confirmed: true }, new Date('2026-08-29T20:04:00.000Z'));
  return recordApplicationSubmissionAttempt(session, { submittedAt: '2026-08-29T20:05:00.000Z', scopeHash: session.approvals.submission.scopeHash, documentVersion: session.documentVersion, responseFingerprint: 'b'.repeat(64) }, new Date('2026-08-29T20:05:00.000Z'));
}

const config = receiptAuthorityConfiguration({ JOB_AGENT_RECEIPT_EMAIL_DOMAINS: ' Mail.Example-ATS.test,mail.example-ats.test ', JOB_AGENT_RECEIPT_API_PROVIDERS: 'Example-ATS' });
assert.deepEqual(config, { allowedSenderDomains: ['mail.example-ats.test'], allowedApiProviders: ['example-ats'] });

const rawMarker = 'candidate-private-receipt-body-marker';
const finished = verifyAndRecordAuthoritativeReceipt(receiptReadySession(), {
  kind: 'page', currentUrl: 'https://jobs.example.test/confirmation/ABC-123456?token=private',
  pageTitle: 'Application submitted', pageText: `Thank you for applying. Confirmation number ABC-123456. ${rawMarker}`,
  responseFingerprint: 'b'.repeat(64), receivedAt: '2026-08-29T20:05:05.000Z',
}, { env: {}, verifiedAt: new Date('2026-08-29T20:06:00.000Z') });
assert.equal(finished.state, 'Finished');
assert.equal(finished.receipt.authority, 'employer-side');
assert.equal(finished.receipt.confirmationUrl, 'https://jobs.example.test/');
assert.ok(!JSON.stringify(finished).includes(rawMarker));
assert.ok(!JSON.stringify(finished).includes('token=private'));
assert.ok(!JSON.stringify(finished).includes('/confirmation/ABC-123456'));

assert.throws(() => verifyAndRecordAuthoritativeReceipt(receiptReadySession(), {
  kind: 'email', from: 'jobs@mail.example-ats.test', dkim: 'pass', dmarc: 'pass', subject: 'Application received',
  messageText: 'Example Employer Procurement Manager REQ-INGEST-100 application received.', receivedAt: '2026-08-29T20:05:05.000Z',
}, { env: {}, verifiedAt: new Date('2026-08-29T20:06:00.000Z') }), /RECEIPT_EMAIL_AUTHORITY_INVALID/);

const emailFinished = verifyAndRecordAuthoritativeReceipt(receiptReadySession(), {
  kind: 'email', from: 'jobs@mail.example-ats.test', dkim: 'pass', dmarc: 'pass', subject: 'Application received',
  messageText: `Example Employer Procurement Manager REQ-INGEST-100 application received. Reference number EMAIL-123456. ${rawMarker}`, receivedAt: '2026-08-29T20:05:05.000Z',
}, { env: { JOB_AGENT_RECEIPT_EMAIL_DOMAINS: 'mail.example-ats.test' }, verifiedAt: new Date('2026-08-29T20:06:00.000Z') });
assert.equal(emailFinished.receipt.source, 'EMPLOYER_CONFIRMATION_EMAIL');
assert.ok(!JSON.stringify(emailFinished).includes(rawMarker));

console.log('Fail-closed authoritative-receipt ingestion, allowlist, correlation, and raw-evidence minimization tests passed.');
