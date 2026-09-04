import { randomBytes } from 'node:crypto';
import { signInternalWorkerRequest } from './internal-worker-auth.js';
import { PROHIBITED_CREDENTIAL_KEY, PROHIBITED_SECRET_VALUE } from './prohibited-secret.js';

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SUBJECT = /^(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|dev:[A-Za-z0-9:._-]{1,120})$/;
const TENANT_ID = /^[a-f0-9]{40}$/;
const SESSION_ID = /^[A-Za-z0-9_-]{8,160}$/;
const SECRET_KEY = PROHIBITED_CREDENTIAL_KEY;
const RAW_SECRET = PROHIBITED_SECRET_VALUE;
const SUPPORTED_KINDS = new Set(['page', 'email', 'api']);
const SAFE_RESPONSE_CODES = new Set(['APPLICATION_SESSION_CONFLICT', 'WORKER_REQUEST_REPLAYED']);

function enabled(value) { return String(value || '').toLowerCase() === 'true'; }
function csv(value) { return [...new Set(String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean))]; }
function responseCode(value, fallback) { const code = String(value || ''); return SAFE_RESPONSE_CODES.has(code) ? code : fallback; }

function validatedDestination(env) {
  const expectedHost = String(env.JOB_AGENT_RECEIPT_CAPTURE_HOST || '').trim().toLowerCase();
  if (!HOST.test(expectedHost)) return null;
  try {
    const url = new URL(String(env.JOB_AGENT_RECEIPT_CAPTURE_URL || ''));
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== expectedHost || url.port || url.username || url.password || url.pathname !== '/api/application-receipts' || url.search || url.hash) return null;
    return url;
  } catch { return null; }
}

export function applicationReceiptCaptureConfiguration(env = process.env) {
  const active = enabled(env.JOB_AGENT_RECEIPT_CAPTURE_ENABLED);
  const approved = enabled(env.JOB_AGENT_RECEIPT_CAPTURE_APPROVED);
  const approvalVersion = String(env.JOB_AGENT_RECEIPT_CAPTURE_APPROVAL_VERSION || '');
  const kinds = csv(env.JOB_AGENT_RECEIPT_CAPTURE_KINDS).filter(kind => SUPPORTED_KINDS.has(kind));
  const destination = validatedDestination(env);
  const secret = String(env.JOB_AGENT_RECEIPT_SECRET || '');
  let reason = null;
  if (!active) reason = 'receipt-capture-disabled';
  else if (!approved || !VERSION.test(approvalVersion)) reason = 'receipt-capture-not-approved';
  else if (!destination) reason = 'receipt-capture-destination-invalid';
  else if (secret.length < 32) reason = 'receipt-capture-signing-not-configured';
  else if (!kinds.length) reason = 'receipt-capture-kinds-not-configured';
  else if (kinds.includes('email') && !csv(env.JOB_AGENT_RECEIPT_EMAIL_DOMAINS).length) reason = 'receipt-email-authority-not-configured';
  else if (kinds.includes('api') && !csv(env.JOB_AGENT_RECEIPT_API_PROVIDERS).length) reason = 'receipt-api-authority-not-configured';
  return {
    enabled: active, ready: reason === null, reason, approved, approvalVersion: VERSION.test(approvalVersion) ? approvalVersion : null,
    host: destination?.hostname || null, kinds, destination, secret,
  };
}

export function publicApplicationReceiptCaptureConfiguration(configuration = {}) {
  return {
    enabled: configuration.enabled === true, ready: configuration.ready === true, reason: configuration.reason || null,
    approved: configuration.approved === true, approvalVersion: configuration.approvalVersion || null,
    host: configuration.host || null, kinds: Array.isArray(configuration.kinds) ? [...configuration.kinds] : [],
  };
}

function containsSecret(value, seen = new Set()) {
  if (typeof value === 'string') return RAW_SECRET.test(value);
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some(item => containsSecret(item, seen));
  return Object.entries(value).some(([key, item]) => SECRET_KEY.test(String(key).replace(/[^A-Za-z]/g, '')) || containsSecret(item, seen));
}

export async function captureAuthoritativeApplicationReceipt({ subject, tenantId, sessionId, version, evidence, env = process.env, fetchImpl = globalThis.fetch, now = new Date(), nonce = randomBytes(18).toString('base64url'), timeoutMs = 8_000 } = {}) {
  const configuration = applicationReceiptCaptureConfiguration(env);
  if (!configuration.ready) throw new Error('AUTHORITATIVE_RECEIPT_CAPTURE_NOT_CONFIGURED');
  const normalizedSubject = String(subject || '').trim().toLowerCase();
  const normalizedTenantId = String(tenantId || '').trim().toLowerCase();
  if ((SUBJECT.test(normalizedSubject) === TENANT_ID.test(normalizedTenantId)) || !SESSION_ID.test(String(sessionId || '')) || !Number.isSafeInteger(version) || version < 1) throw new Error('RECEIPT_CAPTURE_SCOPE_INVALID');
  const kind = String(evidence?.kind || '').trim().toLowerCase();
  if (!configuration.kinds.includes(kind)) throw new Error('RECEIPT_CAPTURE_KIND_NOT_APPROVED');
  if (containsSecret(evidence)) throw new Error('RECEIPT_EVIDENCE_SECRET_FORBIDDEN');
  const body = { action: 'verify-authoritative-receipt', ...(normalizedTenantId ? { tenantId: normalizedTenantId } : { subject: normalizedSubject }), sessionId: String(sessionId), version, evidence };
  const serialized = JSON.stringify(body);
  if (serialized.length > 30_000) throw new Error('RECEIPT_CAPTURE_PAYLOAD_TOO_LARGE');
  const timestamp = now.getTime();
  const signature = signInternalWorkerRequest({ timestamp, nonce, body, secret: configuration.secret });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, Math.min(Number(timeoutMs) || 8_000, 20_000)));
  try {
    const response = await fetchImpl(configuration.destination.href, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: {
        'Content-Type': 'application/json', 'X-1stStep-Worker-Timestamp': String(timestamp),
        'X-1stStep-Worker-Nonce': nonce, 'X-1stStep-Worker-Signature': signature,
      },
      body: serialized,
    });
    const responseText = String(await response.text()).slice(0, 20_000);
    let payload = {};
    try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = {}; }
    if (response.ok && payload.authoritativeReceiptVerified === true) {
      return { ok: true, verified: true, outcome: 'verified', sessionVersion: Number(payload.session?.version) || null, containsReceiptEvidence: false, externalApplicationExecution: false };
    }
    if (response.status === 409) return { ok: false, verified: false, outcome: 'reconciliation-required', code: responseCode(payload.code, 'RECEIPT_CAPTURE_CONFLICT'), containsReceiptEvidence: false, externalApplicationExecution: false };
    if (response.status >= 500) return { ok: false, verified: false, outcome: 'unknown', code: 'RECEIPT_CAPTURE_PROVIDER_UNAVAILABLE', retryableAfterReconciliation: true, containsReceiptEvidence: false, externalApplicationExecution: false };
    return { ok: false, verified: false, outcome: 'rejected', code: 'RECEIPT_CAPTURE_REJECTED', containsReceiptEvidence: false, externalApplicationExecution: false };
  } catch {
    return { ok: false, verified: false, outcome: 'unknown', code: 'RECEIPT_CAPTURE_OUTCOME_UNKNOWN', retryableAfterReconciliation: true, containsReceiptEvidence: false, externalApplicationExecution: false };
  } finally { clearTimeout(timeout); }
}
