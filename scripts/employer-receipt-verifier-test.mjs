import assert from 'node:assert/strict';
import {
  confirmApplicationApproval, createApplicationSession, recordApplicationSubmissionAttempt, recordApplicationTransmission,
  preserveApplicationFormCheckpoint, recordAuthoritativeApplicationReceipt, requestApplicationSubmissionApproval,
} from '../lib/application-session-domain.js';
import { verifyEmployerReceiptEvidence } from '../lib/employer-receipt-verifier.js';

let session = createApplicationSession({
  packageRunId: 'run_receipt_verifier', packageQaVerified: true, documentVersion: 'receipt-verifier-v1',
  employer: 'Example Employer', title: 'Procurement Manager', requisitionId: 'REQ-VERIFY-100',
  directEmployerUrl: 'https://jobs.example.test/apply/REQ-VERIFY-100', proposedFields: [],
}, new Date('2026-08-29T20:00:00.000Z'));
session = confirmApplicationApproval(session, { kind: 'transmission', confirmed: true }, new Date('2026-08-29T20:01:00.000Z'));
session = preserveApplicationFormCheckpoint(session, { fieldSchemaHash: 'a'.repeat(64), stagedFieldKeys: [], stepKey: 'final-form' }, new Date('2026-08-29T20:01:30.000Z'));
session = recordApplicationTransmission(session, {
  transmittedAt: '2026-08-29T20:02:00.000Z', scopeHash: session.approvals.transmission.scopeHash,
  documentVersion: session.documentVersion, fieldSchemaHash: 'a'.repeat(64), transmittedFieldKeys: [],
}, new Date('2026-08-29T20:02:00.000Z'));
session = requestApplicationSubmissionApproval(session, { confirmed: true }, new Date('2026-08-29T20:03:00.000Z'));
session = confirmApplicationApproval(session, { kind: 'submission', confirmed: true }, new Date('2026-08-29T20:04:00.000Z'));
session = recordApplicationSubmissionAttempt(session, {
  submittedAt: '2026-08-29T20:05:00.000Z', scopeHash: session.approvals.submission.scopeHash,
  documentVersion: session.documentVersion, responseFingerprint: 'c'.repeat(64),
}, new Date('2026-08-29T20:05:00.000Z'));

const pageReceipt = verifyEmployerReceiptEvidence({
  session, verifiedAt: new Date('2026-08-29T20:06:00.000Z'),
  evidence: {
    kind: 'page', currentUrl: 'https://jobs.example.test/confirmation/ABC-123456?token=transient',
    pageTitle: 'Application submitted', pageText: 'Thank you for applying. Confirmation number ABC-123456.',
    responseFingerprint: 'c'.repeat(64), receivedAt: '2026-08-29T20:05:10.000Z',
  },
});
assert.equal(pageReceipt.source, 'EMPLOYER_CONFIRMATION_PAGE');
assert.equal(pageReceipt.requisitionId, session.role.requisitionId);
assert.match(pageReceipt.evidenceHash, /^[a-f0-9]{64}$/);
assert.ok(!JSON.stringify(pageReceipt).includes('Thank you for applying'));
const finished = recordAuthoritativeApplicationReceipt(session, pageReceipt, new Date('2026-08-29T20:06:00.000Z'));
assert.equal(finished.state, 'Finished');
assert.equal(finished.receipt.confirmationReference, '••••3456');
assert.equal(finished.receipt.confirmationUrl, 'https://jobs.example.test/');
assert.ok(!finished.receipt.confirmationUrl.includes('/confirmation/'));

assert.throws(() => verifyEmployerReceiptEvidence({
  session, verifiedAt: new Date('2026-08-29T20:06:00.000Z'), evidence: {
    kind: 'page', currentUrl: 'https://evil.example/confirmation/ABC-123456', pageTitle: 'Application submitted',
    pageText: 'Thank you for applying.', responseFingerprint: 'c'.repeat(64), receivedAt: '2026-08-29T20:05:10.000Z',
  },
}), /HOST_MISMATCH/);
assert.throws(() => verifyEmployerReceiptEvidence({
  session, verifiedAt: new Date('2026-08-29T20:06:00.000Z'), evidence: {
    kind: 'page', currentUrl: 'https://jobs.example.test/draft', pageTitle: 'Draft saved',
    pageText: 'Your application is incomplete and not submitted.', responseFingerprint: 'c'.repeat(64), receivedAt: '2026-08-29T20:05:10.000Z',
  },
}), /SIGNAL_MISSING/);
assert.throws(() => verifyEmployerReceiptEvidence({
  session, verifiedAt: new Date('2026-08-29T20:06:00.000Z'), evidence: {
    kind: 'page', currentUrl: 'https://jobs.example.test/confirmation/ABC-123456', pageTitle: 'Application submitted',
    pageText: 'Thank you for applying.', responseFingerprint: 'd'.repeat(64), receivedAt: '2026-08-29T20:05:10.000Z',
  },
}), /CORRELATION_INVALID/);

const emailReceipt = verifyEmployerReceiptEvidence({
  session, allowedSenderDomains: ['mail.example-ats.test'], verifiedAt: new Date('2026-08-29T20:07:00.000Z'),
  evidence: {
    kind: 'email', from: 'Example Recruiting <no-reply@mail.example-ats.test>', dkim: 'pass', dmarc: 'pass',
    subject: 'Application received - REQ-VERIFY-100', messageText: 'Example Employer received your application for Procurement Manager. Reference ID EMAIL-987654.',
    receivedAt: '2026-08-29T20:06:30.000Z',
  },
});
assert.equal(emailReceipt.source, 'EMPLOYER_CONFIRMATION_EMAIL');
assert.ok(!JSON.stringify(emailReceipt).includes('Example Employer received'));
assert.throws(() => verifyEmployerReceiptEvidence({
  session, allowedSenderDomains: ['mail.example-ats.test'], verifiedAt: new Date('2026-08-29T20:07:00.000Z'), evidence: {
    kind: 'email', from: 'spoof@evil.test', dkim: 'pass', dmarc: 'pass', subject: 'Application received - REQ-VERIFY-100',
    messageText: 'Example Employer received your application for Procurement Manager.', receivedAt: '2026-08-29T20:06:30.000Z',
  },
}), /EMAIL_AUTHORITY_INVALID/);

const apiReceipt = verifyEmployerReceiptEvidence({
  session, allowedApiProviders: ['example-ats'], verifiedAt: new Date('2026-08-29T20:07:00.000Z'),
  evidence: {
    kind: 'api', provider: 'example-ats', signatureVerified: true, status: 'submitted', requestId: 'request_ats_123456',
    requisitionId: session.role.requisitionId, documentVersion: session.documentVersion, receivedAt: '2026-08-29T20:05:30.000Z',
  },
});
assert.equal(apiReceipt.source, 'EMPLOYER_ATS_API');
assert.throws(() => verifyEmployerReceiptEvidence({
  session, allowedApiProviders: ['example-ats'], verifiedAt: new Date('2026-08-29T20:07:00.000Z'), evidence: {
    kind: 'api', provider: 'example-ats', signatureVerified: false, status: 'submitted', requestId: 'request_ats_123456',
    requisitionId: session.role.requisitionId, documentVersion: session.documentVersion, receivedAt: '2026-08-29T20:05:30.000Z',
  },
}), /API_AUTHORITY_INVALID/);
assert.throws(() => verifyEmployerReceiptEvidence({
  session, verifiedAt: new Date('2026-08-29T20:07:00.000Z'), evidence: {
    kind: 'page', currentUrl: 'https://jobs.example.test/confirmation/ABC-123456', pageTitle: 'Application submitted',
    pageText: 'Thank you. password=hunter2', responseFingerprint: 'c'.repeat(64), receivedAt: '2026-08-29T20:05:10.000Z',
  },
}), /SECRET_FORBIDDEN/);
assert.throws(() => verifyEmployerReceiptEvidence({
  session, verifiedAt: new Date('2026-08-29T20:07:00.000Z'), evidence: {
    kind: 'page', currentUrl: 'https://jobs.example.test/confirmation/ABC-123456', pageTitle: 'Application submitted',
    pageText: 'Thank you. The verification code is 123456', responseFingerprint: 'c'.repeat(64), receivedAt: '2026-08-29T20:05:10.000Z',
  },
}), /SECRET_FORBIDDEN/);

console.log('Authoritative page, authenticated email, signed ATS API, exact-identity, timestamp, correlation, redaction, and false-positive receipt verifier tests passed.');
