import assert from 'node:assert/strict';
import { applicationReceiptCaptureConfiguration, captureAuthoritativeApplicationReceipt, publicApplicationReceiptCaptureConfiguration } from '../lib/application-receipt-capture-provider.js';
import { verifyInternalWorkerRequest } from '../lib/internal-worker-auth.js';

const env = {
  JOB_AGENT_RECEIPT_CAPTURE_ENABLED: 'true', JOB_AGENT_RECEIPT_CAPTURE_APPROVED: 'true',
  JOB_AGENT_RECEIPT_CAPTURE_APPROVAL_VERSION: 'receipt-capture-v1', JOB_AGENT_RECEIPT_CAPTURE_URL: 'https://app.example.test/api/application-receipts',
  JOB_AGENT_RECEIPT_CAPTURE_HOST: 'app.example.test', JOB_AGENT_RECEIPT_CAPTURE_KINDS: 'page,email,api',
  JOB_AGENT_RECEIPT_SECRET: 'receipt-capture-secret'.padEnd(48, 'x'), JOB_AGENT_RECEIPT_EMAIL_DOMAINS: 'mail.ats.example.test',
  JOB_AGENT_RECEIPT_API_PROVIDERS: 'example-ats',
};

assert.equal(applicationReceiptCaptureConfiguration({}).reason, 'receipt-capture-disabled');
assert.equal(applicationReceiptCaptureConfiguration({ ...env, JOB_AGENT_RECEIPT_CAPTURE_APPROVED: 'false' }).reason, 'receipt-capture-not-approved');
assert.equal(applicationReceiptCaptureConfiguration({ ...env, JOB_AGENT_RECEIPT_CAPTURE_URL: 'http://app.example.test/api/application-receipts' }).reason, 'receipt-capture-destination-invalid');
assert.equal(applicationReceiptCaptureConfiguration({ ...env, JOB_AGENT_RECEIPT_CAPTURE_URL: 'https://other.example.test/api/application-receipts' }).reason, 'receipt-capture-destination-invalid');
assert.equal(applicationReceiptCaptureConfiguration({ ...env, JOB_AGENT_RECEIPT_CAPTURE_URL: 'https://app.example.test/api/application-receipts?subject=private' }).reason, 'receipt-capture-destination-invalid');
assert.equal(applicationReceiptCaptureConfiguration({ ...env, JOB_AGENT_RECEIPT_EMAIL_DOMAINS: '' }).reason, 'receipt-email-authority-not-configured');
const publicConfiguration = publicApplicationReceiptCaptureConfiguration(applicationReceiptCaptureConfiguration(env));
assert.equal(publicConfiguration.ready, true);
assert.equal(JSON.stringify(publicConfiguration).includes(env.JOB_AGENT_RECEIPT_SECRET), false);
assert.equal(Object.hasOwn(publicConfiguration, 'destination'), false);

const evidenceMarker = 'private-receipt-marker';
const evidence = {
  kind: 'page', currentUrl: 'https://jobs.example.test/confirmation/ABC-123456', pageTitle: 'Application submitted',
  pageText: `Thank you for applying. Confirmation ABC-123456. ${evidenceMarker}`,
  responseFingerprint: 'a'.repeat(64), receivedAt: '2026-08-30T12:00:01.000Z',
};
let calls = 0;
let capturedRequest = null;
const verified = await captureAuthoritativeApplicationReceipt({
  subject: 'candidate@example.test', sessionId: 'application_receipt_capture_001', version: 7, evidence, env,
  now: new Date('2026-08-30T12:00:02.000Z'), nonce: 'receipt_capture_nonce_1234',
  fetchImpl: async (url, options) => {
    calls += 1; capturedRequest = { url, options };
    return { ok: true, status: 200, text: async () => JSON.stringify({ authoritativeReceiptVerified: true, session: { version: 8, receipt: { source: 'EMPLOYER_CONFIRMATION_PAGE' } } }) };
  },
});
assert.equal(calls, 1);
assert.equal(capturedRequest.url, env.JOB_AGENT_RECEIPT_CAPTURE_URL);
assert.equal(capturedRequest.options.redirect, 'error');
const signedBody = JSON.parse(capturedRequest.options.body);
assert.equal(signedBody.evidence.pageText.includes(evidenceMarker), true);
const workerAuth = verifyInternalWorkerRequest({
  headers: {
    'x-1ststep-worker-timestamp': capturedRequest.options.headers['X-1stStep-Worker-Timestamp'],
    'x-1ststep-worker-nonce': capturedRequest.options.headers['X-1stStep-Worker-Nonce'],
    'x-1ststep-worker-signature': capturedRequest.options.headers['X-1stStep-Worker-Signature'],
  }, body: signedBody, secret: env.JOB_AGENT_RECEIPT_SECRET, now: new Date('2026-08-30T12:00:02.000Z'),
});
assert.equal(workerAuth.ok, true);
assert.deepEqual(verified, { ok: true, verified: true, outcome: 'verified', sessionVersion: 8, containsReceiptEvidence: false, externalApplicationExecution: false });
assert.equal(JSON.stringify(verified).includes(evidenceMarker), false);

let tenantSignedBody;
await captureAuthoritativeApplicationReceipt({
  tenantId: 'a'.repeat(40), sessionId: 'application_receipt_capture_001', version: 7, evidence, env,
  now: new Date('2026-08-30T12:00:03.000Z'), nonce: 'receipt_capture_tenant_nonce_1',
  fetchImpl: async (_url, options) => { tenantSignedBody = JSON.parse(options.body); return { ok: true, status: 200, text: async () => JSON.stringify({ authoritativeReceiptVerified: true, session: { version: 8 } }) }; },
});
assert.equal(tenantSignedBody.tenantId, 'a'.repeat(40));
assert.equal(Object.hasOwn(tenantSignedBody, 'subject'), false);
await assert.rejects(() => captureAuthoritativeApplicationReceipt({ subject: 'candidate@example.test', tenantId: 'a'.repeat(40), sessionId: 'application_receipt_capture_001', version: 7, evidence, env }), /RECEIPT_CAPTURE_SCOPE_INVALID/);
await assert.rejects(() => captureAuthoritativeApplicationReceipt({ sessionId: 'application_receipt_capture_001', version: 7, evidence, env }), /RECEIPT_CAPTURE_SCOPE_INVALID/);

await assert.rejects(() => captureAuthoritativeApplicationReceipt({ subject: 'candidate@example.test', sessionId: 'application_receipt_capture_001', version: 7, evidence: { ...evidence, password: 'must-not-travel' }, env, fetchImpl: async () => { throw new Error('must not call'); } }), /RECEIPT_EVIDENCE_SECRET_FORBIDDEN/);
await assert.rejects(() => captureAuthoritativeApplicationReceipt({ subject: 'candidate@example.test', sessionId: 'application_receipt_capture_001', version: 7, evidence: { ...evidence, pageText: 'Application received. The OTP is 123456' }, env, fetchImpl: async () => { throw new Error('must not call'); } }), /RECEIPT_EVIDENCE_SECRET_FORBIDDEN/);
await assert.rejects(() => captureAuthoritativeApplicationReceipt({ subject: 'candidate@example.test', sessionId: 'application_receipt_capture_001', version: 7, evidence: { ...evidence, kind: 'unsupported' }, env, fetchImpl: async () => { throw new Error('must not call'); } }), /RECEIPT_CAPTURE_KIND_NOT_APPROVED/);

calls = 0;
const unavailable = await captureAuthoritativeApplicationReceipt({
  subject: 'candidate@example.test', sessionId: 'application_receipt_capture_001', version: 7, evidence, env,
  fetchImpl: async () => { calls += 1; return { ok: false, status: 503, text: async () => 'temporary failure body must not escape' }; },
});
assert.equal(calls, 1);
assert.equal(unavailable.outcome, 'unknown');
assert.equal(unavailable.retryableAfterReconciliation, true);
assert.equal(JSON.stringify(unavailable).includes('temporary failure'), false);

const conflict = await captureAuthoritativeApplicationReceipt({
  subject: 'candidate@example.test', sessionId: 'application_receipt_capture_001', version: 7, evidence, env,
  fetchImpl: async () => ({ ok: false, status: 409, text: async () => JSON.stringify({ code: 'APPLICATION_SESSION_CONFLICT' }) }),
});
assert.equal(conflict.outcome, 'reconciliation-required');
assert.equal(conflict.code, 'APPLICATION_SESSION_CONFLICT');

const echoedConflict = await captureAuthoritativeApplicationReceipt({
  subject: 'candidate@example.test', sessionId: 'application_receipt_capture_001', version: 7, evidence, env,
  fetchImpl: async () => ({ ok: false, status: 409, text: async () => JSON.stringify({ code: evidenceMarker }) }),
});
assert.equal(echoedConflict.code, 'RECEIPT_CAPTURE_CONFLICT');
assert.equal(JSON.stringify(echoedConflict).includes(evidenceMarker), false);

calls = 0;
const timedOut = await captureAuthoritativeApplicationReceipt({
  subject: 'candidate@example.test', sessionId: 'application_receipt_capture_001', version: 7, evidence, env, timeoutMs: 1,
  fetchImpl: async (_url, options) => {
    calls += 1;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  },
});
assert.equal(calls, 1);
assert.equal(timedOut.outcome, 'unknown');
assert.equal(timedOut.code, 'RECEIPT_CAPTURE_OUTCOME_UNKNOWN');

console.log('Exact-host receipt capture activation, HMAC transport, raw-evidence containment, one-attempt ambiguity, and reconciliation tests passed.');
