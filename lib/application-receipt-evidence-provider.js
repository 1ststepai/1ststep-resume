import { createHash } from 'node:crypto';
import { applicationReceiptCaptureConfiguration } from './application-receipt-capture-provider.js';
import { employerBrowserSessionProviderConfiguration } from './employer-browser-session-provider.js';
import { PROHIBITED_SECRET_VALUE } from './prohibited-secret.js';
import { reserveConfiguredJobAgentSpend, settleConfiguredJobAgentSpend } from './job-agent-spend-ledger.js';

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
const SAFE_REF = /^[A-Za-z0-9:_-]{8,160}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const RAW_SECRET = PROHIBITED_SECRET_VALUE;
const MAX_BYTES = 25_000;

function enabled(value) { return String(value || '').toLowerCase() === 'true'; }

export function applicationReceiptEvidenceProviderConfiguration(env = process.env) {
  const active = enabled(env.JOB_AGENT_RECEIPT_VERIFICATION_WORKER_ENABLED);
  const approved = enabled(env.JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVED);
  const approvalVersion = String(env.JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVAL_VERSION || '');
  const browser = employerBrowserSessionProviderConfiguration(env);
  const capture = applicationReceiptCaptureConfiguration(env);
  let reason = null;
  if (!active) reason = 'receipt-verification-worker-disabled';
  else if (!approved || !VERSION.test(approvalVersion)) reason = 'receipt-verification-worker-not-approved';
  else if (!browser.enabled || browser.provider !== 'remote-stream' || browser.interactive !== true) reason = 'receipt-evidence-browser-provider-not-ready';
  else if (!capture.ready || !capture.kinds.includes('page')) reason = 'receipt-page-capture-not-ready';
  return { enabled: active, approved, ready: reason === null, reason, approvalVersion: VERSION.test(approvalVersion) ? approvalVersion : null, browser, captureReady: capture.ready === true };
}

export function publicApplicationReceiptEvidenceProviderConfiguration(value = {}) {
  return { enabled: value.enabled === true, approved: value.approved === true, ready: value.ready === true, reason: value.reason || null, approvalVersion: value.approvalVersion || null, provider: value.browser?.provider || null, captureReady: value.captureReady === true };
}

function exactUrl(value, hostname) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname.toLowerCase() !== hostname) throw new Error('RECEIPT_EVIDENCE_HOST_MISMATCH');
  url.hash = '';
  return url.href;
}

function safeEvidence(value, { hostname, responseFingerprint, submittedAt, now }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('RECEIPT_EVIDENCE_RESPONSE_INVALID');
  const keys = Object.keys(value).sort();
  const allowed = ['currentUrl', 'kind', 'pageText', 'pageTitle', 'receivedAt', 'responseFingerprint'].sort();
  if (keys.join('|') !== allowed.join('|') || value.kind !== 'page') throw new Error('RECEIPT_EVIDENCE_RESPONSE_INVALID');
  const pageTitle = String(value.pageTitle || '');
  const pageText = String(value.pageText || '');
  if (!pageTitle || pageTitle.length > 300 || !pageText || pageText.length > 20_000 || RAW_SECRET.test(`${pageTitle} ${pageText}`)) throw new Error('RECEIPT_EVIDENCE_SECRET_OR_SIZE_INVALID');
  if (String(value.responseFingerprint || '').toLowerCase() !== responseFingerprint) throw new Error('RECEIPT_RESPONSE_CORRELATION_INVALID');
  const receivedAt = new Date(String(value.receivedAt || ''));
  if (!Number.isFinite(receivedAt.getTime()) || receivedAt < submittedAt || receivedAt > new Date(now.getTime() + 60_000)) throw new Error('RECEIPT_TIMESTAMP_ORDER_INVALID');
  return { kind: 'page', currentUrl: exactUrl(value.currentUrl, hostname), pageTitle, pageText, responseFingerprint, receivedAt: receivedAt.toISOString() };
}

export async function collectEmployerPageReceiptEvidence({ task, session, browserSession, redis, env = process.env, fetchImpl = globalThis.fetch, reserveSpend = reserveConfiguredJobAgentSpend, settleSpend = settleConfiguredJobAgentSpend, now = new Date(), timeoutMs = 8_000 } = {}) {
  const configuration = applicationReceiptEvidenceProviderConfiguration(env);
  if (!configuration.ready) return { status: 'not-configured', code: configuration.reason, retryable: false, externalApplicationExecution: false };
  const fingerprint = String(task?.payload?.responseFingerprint || '').toLowerCase();
  const submittedAt = new Date(String(task?.payload?.submittedAt || ''));
  const hostname = String(browserSession?.employerHostname || '').toLowerCase();
  if (!SAFE_REF.test(String(browserSession?.providerSessionReference || '')) || browserSession.provider !== 'remote-stream' || !hostname || !SHA256.test(fingerprint)
    || !Number.isFinite(submittedAt.getTime()) || session?.submissionAttempt?.responseFingerprint !== fingerprint || session?.documentVersion !== task?.payload?.documentVersion) throw new Error('RECEIPT_EVIDENCE_SCOPE_INVALID');
  exactUrl(browserSession.pageUrl, hostname);
  const request = { responseFingerprint: fingerprint, expectedHostname: hostname, documentVersion: session.documentVersion, requisitionId: session.role.requisitionId, submittedAt: submittedAt.toISOString(), constraints: { readOnly: true, rawEvidenceReturnedToServerOnly: true, candidateValuesReturned: false, credentialsReturned: false } };
  const operationId = `receipt-check:${createHash('sha256').update(`${task.id}.${task.attempt}.${fingerprint}`).digest('hex')}`;
  const spend = await reserveSpend({ category: 'employer-browser', operationId, env, redis, now });
  if (!spend.ok) return { status: 'deferred', code: spend.code || 'MONETARY_SPEND_CONTROL_NOT_CONFIGURED', retryable: true, externalApplicationExecution: false };
  let providerCallStarted = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, Math.min(15_000, Number(timeoutMs) || 8_000)));
  try {
    providerCallStarted = true;
    const response = await fetchImpl(`${configuration.browser.apiBaseUrl}/v1/sessions/${encodeURIComponent(browserSession.providerSessionReference)}/receipt-evidence`, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', Authorization: `Bearer ${configuration.browser.apiKey}`, 'Content-Type': 'application/json', 'X-1stStep-Contract-Version': 'application-receipt-evidence-v1' },
      body: JSON.stringify(request),
    });
    if (response.status === 202) return { status: 'pending', code: 'AUTHORITATIVE_RECEIPT_NOT_YET_AVAILABLE', retryable: true, externalApplicationExecution: false };
    if (response.status === 404 || response.status === 410) return { status: 'unavailable', code: 'RECEIPT_BROWSER_SESSION_UNAVAILABLE', retryable: false, externalApplicationExecution: false };
    if (!response.ok) return { status: 'unavailable', code: response.status >= 500 ? 'RECEIPT_EVIDENCE_PROVIDER_UNAVAILABLE' : 'RECEIPT_EVIDENCE_PROVIDER_REJECTED', retryable: response.status >= 500, externalApplicationExecution: false };
    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) throw new Error('RECEIPT_EVIDENCE_RESPONSE_TOO_LARGE');
    let payload;
    try { payload = JSON.parse(raw); } catch { throw new Error('RECEIPT_EVIDENCE_RESPONSE_INVALID'); }
    if (payload?.status === 'pending') return { status: 'pending', code: 'AUTHORITATIVE_RECEIPT_NOT_YET_AVAILABLE', retryable: true, externalApplicationExecution: false };
    if (payload?.status !== 'evidence') throw new Error('RECEIPT_EVIDENCE_RESPONSE_INVALID');
    const evidence = safeEvidence(payload.evidence, { hostname, responseFingerprint: fingerprint, submittedAt, now });
    return { status: 'evidence', evidence, retryable: false, externalApplicationExecution: false, containsCandidateValues: false };
  } catch (error) {
    if (/^RECEIPT_(?:EVIDENCE|RESPONSE|TIMESTAMP)/.test(String(error?.message || ''))) {
      return { status: 'unavailable', code: 'RECEIPT_EVIDENCE_RESPONSE_REJECTED', retryable: false, externalApplicationExecution: false };
    }
    return { status: 'unavailable', code: 'RECEIPT_EVIDENCE_PROVIDER_OUTCOME_UNKNOWN', retryable: true, externalApplicationExecution: false };
  } finally {
    clearTimeout(timeout);
    await settleSpend({ control: spend.control, providerCallStarted }).catch(error => console.error(JSON.stringify({ type: 'monetary-spend-settlement-error', category: 'employer-browser', operation: 'receipt-check', name: error?.name || 'unknown' })));
  }
}
