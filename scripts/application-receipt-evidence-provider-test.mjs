import assert from 'node:assert/strict';
import { applicationReceiptEvidenceProviderConfiguration, collectEmployerPageReceiptEvidence, publicApplicationReceiptEvidenceProviderConfiguration } from '../lib/application-receipt-evidence-provider.js';

const env = {
  EMPLOYER_BROWSER_SESSION_PROVIDER: 'remote-stream', EMPLOYER_BROWSER_REMOTE_STREAM_ENABLED: 'true',
  EMPLOYER_BROWSER_REMOTE_STREAM_API_URL: 'https://api.browser.invalid', EMPLOYER_BROWSER_REMOTE_STREAM_ORIGIN: 'https://stream.browser.invalid/',
  EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY: 'browser-provider-key'.padEnd(48, 'x'), EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVED: 'true', EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVAL_VERSION: 'cost-v1',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED: 'true', EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVAL_VERSION: 'csp-v1', EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED_ORIGIN: 'https://stream.browser.invalid',
  JOB_AGENT_RECEIPT_CAPTURE_ENABLED: 'true', JOB_AGENT_RECEIPT_CAPTURE_APPROVED: 'true', JOB_AGENT_RECEIPT_CAPTURE_APPROVAL_VERSION: 'capture-v1',
  JOB_AGENT_RECEIPT_CAPTURE_URL: 'https://app.example.test/api/application-receipts', JOB_AGENT_RECEIPT_CAPTURE_HOST: 'app.example.test', JOB_AGENT_RECEIPT_CAPTURE_KINDS: 'page', JOB_AGENT_RECEIPT_SECRET: 'receipt-secret'.padEnd(48, 'x'),
  JOB_AGENT_RECEIPT_VERIFICATION_WORKER_ENABLED: 'true', JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVED: 'true', JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVAL_VERSION: 'receipt-worker-v1',
};
assert.equal(applicationReceiptEvidenceProviderConfiguration({}).reason, 'receipt-verification-worker-disabled');
assert.equal(applicationReceiptEvidenceProviderConfiguration({ ...env, JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVED: 'false' }).reason, 'receipt-verification-worker-not-approved');
assert.equal(applicationReceiptEvidenceProviderConfiguration({ ...env, JOB_AGENT_RECEIPT_CAPTURE_KINDS: 'email' }).reason, 'receipt-page-capture-not-ready');
const publicConfig = publicApplicationReceiptEvidenceProviderConfiguration(applicationReceiptEvidenceProviderConfiguration(env));
assert.equal(publicConfig.ready, true);
assert.equal(JSON.stringify(publicConfig).includes(env.EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY), false);

const task = { id: 'receipt_task_provider_001', attempt: 1, payload: { documentVersion: 'resume-v1', responseFingerprint: 'c'.repeat(64), submittedAt: '2026-08-30T18:00:00.000Z' } };
const session = { documentVersion: 'resume-v1', role: { requisitionId: 'REQ-1' }, submissionAttempt: { responseFingerprint: 'c'.repeat(64) } };
const browserSession = { provider: 'remote-stream', providerSessionReference: 'browser_session_receipt_001', employerHostname: 'jobs.example.test', pageUrl: 'https://jobs.example.test/apply/REQ-1' };
const spend = { ok: true, control: { id: 'spend-control' } };
let settled = null;
let request = null;
const evidence = await collectEmployerPageReceiptEvidence({
  task, session, browserSession, env, now: new Date('2026-08-30T18:01:00.000Z'), reserveSpend: async () => spend, settleSpend: async value => { settled = value; },
  fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'evidence', evidence: { kind: 'page', currentUrl: 'https://jobs.example.test/confirmation/ABC-123456?private=discarded', pageTitle: 'Application submitted', pageText: 'Thank you for applying. Confirmation number ABC-123456.', responseFingerprint: 'c'.repeat(64), receivedAt: '2026-08-30T18:00:10.000Z' } }) };
  },
});
assert.equal(evidence.status, 'evidence');
assert.equal(evidence.evidence.currentUrl.includes('private=discarded'), true, 'raw evidence stays call-scoped for the verifier');
assert.equal(request.url, 'https://api.browser.invalid/v1/sessions/browser_session_receipt_001/receipt-evidence');
assert.equal(JSON.parse(request.options.body).constraints.readOnly, true);
assert.equal(settled.providerCallStarted, true);

const pending = await collectEmployerPageReceiptEvidence({ task, session, browserSession, env, reserveSpend: async () => spend, settleSpend: async () => {}, fetchImpl: async () => ({ ok: false, status: 202, text: async () => '' }) });
assert.equal(pending.status, 'pending');
assert.equal(pending.retryable, true);
const missing = await collectEmployerPageReceiptEvidence({ task, session, browserSession, env, reserveSpend: async () => spend, settleSpend: async () => {}, fetchImpl: async () => ({ ok: false, status: 410, text: async () => '' }) });
assert.equal(missing.retryable, false);
const secret = await collectEmployerPageReceiptEvidence({ task, session, browserSession, env, reserveSpend: async () => spend, settleSpend: async () => {}, fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ status: 'evidence', evidence: { kind: 'page', currentUrl: 'https://jobs.example.test/confirmation', pageTitle: 'Submitted', pageText: 'password=hunter2', responseFingerprint: 'c'.repeat(64), receivedAt: '2026-08-30T18:00:10.000Z' } }) }) });
assert.equal(secret.status, 'unavailable');
assert.equal(secret.code, 'RECEIPT_EVIDENCE_RESPONSE_REJECTED');
assert.equal(secret.retryable, false);
assert.equal(Object.hasOwn(secret, 'evidence'), false);

console.log('Disabled-by-default receipt evidence provider, exact scope, read-only transport, raw-evidence containment, spend settlement, and retry classification tests passed.');
