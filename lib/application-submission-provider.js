import { createHash } from 'node:crypto';
import { assertNoApplicationSecrets } from './application-session-domain.js';
import { applicationReceiptCaptureConfiguration } from './application-receipt-capture-provider.js';
import { employerBrowserSessionProviderConfiguration } from './employer-browser-session-provider.js';
import { reserveConfiguredJobAgentSpend, settleConfiguredJobAgentSpend } from './job-agent-spend-ledger.js';

const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
const SAFE_REF = /^[A-Za-z0-9:_-]{8,160}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_RESPONSE_BYTES = 12_000;
const FORBIDDEN_RESPONSE_KEY = /value|answer|candidate|secret|credential|password|passcode|otp|captcha|cookie|token|receipt|evidence|page(?:text|html)|document(?:text|body)/i;

function enabled(value) { return String(value || '').toLowerCase() === 'true'; }

export function applicationSubmissionProviderConfiguration(env = process.env) {
  const active = enabled(env.JOB_AGENT_FINAL_SUBMISSION_EXECUTION_ENABLED);
  const approved = enabled(env.JOB_AGENT_FINAL_SUBMISSION_EXECUTION_APPROVED);
  const approvalVersion = String(env.JOB_AGENT_FINAL_SUBMISSION_EXECUTION_APPROVAL_VERSION || '');
  const browser = employerBrowserSessionProviderConfiguration(env);
  const receiptCapture = applicationReceiptCaptureConfiguration(env);
  let reason = null;
  if (!active) reason = 'final-submission-execution-disabled';
  else if (!approved || !SAFE_VERSION.test(approvalVersion)) reason = 'final-submission-execution-not-approved';
  else if (!browser.enabled || browser.provider !== 'remote-stream' || browser.viewMode !== 'interactive-stream' || browser.interactive !== true) reason = 'final-submission-browser-provider-not-ready';
  else if (!receiptCapture.ready) reason = 'authoritative-receipt-capture-not-ready';
  return {
    enabled: active, approved, ready: reason === null, reason,
    approvalVersion: SAFE_VERSION.test(approvalVersion) ? approvalVersion : null,
    provider: browser.provider || null, browser,
  };
}

export function publicApplicationSubmissionProviderConfiguration(configuration = {}) {
  return {
    enabled: configuration.enabled === true, approved: configuration.approved === true,
    ready: configuration.ready === true, reason: configuration.reason || null,
    approvalVersion: configuration.approvalVersion || null, provider: configuration.provider || null,
  };
}

function exactEmployerUrl(value, hostname) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname.toLowerCase() !== hostname) throw new Error('SUBMISSION_TARGET_MISMATCH');
  url.hash = '';
  return url.href;
}

function containsForbiddenResponseData(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some(item => containsForbiddenResponseData(item, seen));
  return Object.entries(value).some(([key, item]) => FORBIDDEN_RESPONSE_KEY.test(String(key).replace(/[^A-Za-z]/g, '')) || containsForbiddenResponseData(item, seen));
}

function validateExecutionScope(session, browserSession, now) {
  const execution = session?.submissionExecution;
  const approval = session?.approvals?.submission;
  const checkpoint = session?.formCheckpoint;
  if (session?.stage !== 'submission_execution' || execution?.status !== 'executing' || !execution.startedAt || !approval?.consumedAt || session.submissionAttempt) throw new Error('SUBMISSION_EXECUTION_NOT_AUTHORIZED');
  if (execution.scopeHash !== approval.scopeHash || execution.documentVersion !== session.documentVersion || execution.fieldSchemaHash !== checkpoint?.fieldSchemaHash) throw new Error('SUBMISSION_SCOPE_MISMATCH');
  if (!SAFE_REF.test(String(browserSession?.providerSessionReference || '')) || browserSession?.provider !== 'remote-stream' || browserSession?.viewMode !== 'interactive-stream' || browserSession?.interactive !== true) throw new Error('SUBMISSION_BROWSER_SESSION_INVALID');
  if (!['ready', 'waiting-for-user'].includes(String(browserSession.status || ''))) throw new Error('SUBMISSION_BROWSER_SESSION_NOT_READY');
  const expiresAt = new Date(String(browserSession.expiresAt || ''));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) throw new Error('SUBMISSION_BROWSER_SESSION_EXPIRED');
  const hostname = String(browserSession.employerHostname || '').toLowerCase();
  const employerUrl = exactEmployerUrl(session.role?.directEmployerUrl, hostname);
  const pageUrl = exactEmployerUrl(browserSession.pageUrl, hostname);
  if (pageUrl !== exactEmployerUrl(checkpoint?.pageUrl, hostname) || browserSession.fieldSchemaHash !== execution.fieldSchemaHash || checkpoint?.attachedDocumentVersion !== session.documentVersion) throw new Error('SUBMISSION_BROWSER_SCOPE_MISMATCH');
  return { execution, hostname, employerUrl, pageUrl };
}

function idempotencyKey(session, execution) {
  return `submission_${createHash('sha256').update(`${session.id}.${execution.id}.${execution.scopeHash}.${session.approvals.submission.id}`).digest('hex')}`;
}

async function providerRequest(configuration, browserSession, body, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, Math.min(15_000, Number(timeoutMs) || 8_000)));
  try {
    const response = await fetchImpl(`${configuration.browser.apiBaseUrl}/v1/sessions/${encodeURIComponent(browserSession.providerSessionReference)}/submissions`, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', Authorization: `Bearer ${configuration.browser.apiKey}`, 'Content-Type': 'application/json', 'X-1stStep-Contract-Version': 'application-submission-v1' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`SUBMISSION_PROVIDER_HTTP_${response.status}`);
    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('SUBMISSION_PROVIDER_RESPONSE_TOO_LARGE');
    let payload;
    try { payload = JSON.parse(raw); } catch { throw new Error('SUBMISSION_PROVIDER_RESPONSE_INVALID'); }
    if (containsForbiddenResponseData(payload)) throw new Error('SUBMISSION_PROVIDER_RESPONSE_CONTAINS_FORBIDDEN_DATA');
    return payload;
  } finally { clearTimeout(timeout); }
}

export async function executeApplicationSubmissionProvider({ session, browserSession, env = process.env, redis, fetchImpl = globalThis.fetch, now = new Date(), timeoutMs = 8_000 } = {}) {
  assertNoApplicationSecrets(session, 'submissionProviderSession');
  assertNoApplicationSecrets(browserSession, 'submissionProviderBrowserSession');
  const configuration = applicationSubmissionProviderConfiguration(env);
  if (!configuration.ready) return { status: 'not-configured', reason: configuration.reason, submitted: false, externalApplicationExecution: false, retryable: false };
  const instant = new Date(now);
  if (!Number.isFinite(instant.getTime())) throw new Error('SUBMISSION_EXECUTION_TIME_INVALID');
  const { execution, hostname, pageUrl } = validateExecutionScope(session, browserSession, instant);
  const request = {
    idempotencyKey: idempotencyKey(session, execution), expectedHostname: hostname, pageUrl,
    fieldSchemaHash: execution.fieldSchemaHash, documentVersion: execution.documentVersion,
    requisitionId: String(session.role?.requisitionId || ''), scopeHash: execution.scopeHash,
    constraints: { singleAttempt: true, finalSubmissionAuthorized: true, candidateValuesReturned: false, rawEvidenceReturned: false },
  };
  assertNoApplicationSecrets(request, 'submissionProviderRequest');
  const spend = await reserveConfiguredJobAgentSpend({ category: 'employer-browser', operationId: `submission:${request.idempotencyKey}`, env, redis, now: instant });
  if (!spend.ok) return { status: 'not-started', code: spend.code || 'MONETARY_SPEND_CONTROL_NOT_CONFIGURED', submitted: false, externalApplicationExecution: false, retryable: false };
  let providerCallStarted = false;
  try {
    providerCallStarted = true;
    const payload = await providerRequest(configuration, browserSession, request, { fetchImpl, timeoutMs });
    const submittedAt = new Date(String(payload?.submittedAt || ''));
    if (payload?.status !== 'attempt-recorded' || payload?.submissionAttempted !== true || !Number.isFinite(submittedAt.getTime())
      || submittedAt < new Date(execution.startedAt) || submittedAt > instant.getTime() + 60_000
      || !SHA256.test(String(payload.responseFingerprint || '')) || exactEmployerUrl(payload.pageUrl, hostname) !== pageUrl) throw new Error('SUBMISSION_PROVIDER_ATTESTATION_INVALID');
    return {
      status: 'attempt-recorded', submitted: true, submittedAt: submittedAt.toISOString(), responseFingerprint: String(payload.responseFingerprint).toLowerCase(),
      externalApplicationExecution: true, retryable: false, containsCandidateValues: false, containsReceiptEvidence: false,
    };
  } catch {
    return {
      status: 'outcome-unknown', submitted: 'unknown', code: 'SUBMISSION_PROVIDER_OUTCOME_UNKNOWN',
      externalApplicationExecution: true, retryable: false, containsCandidateValues: false, containsReceiptEvidence: false,
    };
  } finally {
    await settleConfiguredJobAgentSpend({ control: spend.control, providerCallStarted }).catch(error => {
      console.error(JSON.stringify({ type: 'monetary-spend-settlement-error', category: 'employer-browser', operation: 'final-submission', name: error?.name || 'unknown' }));
    });
  }
}
