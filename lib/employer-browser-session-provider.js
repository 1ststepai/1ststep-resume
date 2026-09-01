import { createHash, randomUUID } from 'node:crypto';
import { assertNoApplicationSecrets } from './application-session-domain.js';
import { reserveConfiguredJobAgentSpend, settleConfiguredJobAgentSpend } from './job-agent-spend-ledger.js';

const SAFE_REF = /^[A-Za-z0-9:_-]{8,160}$/;
const SAFE_FIELD = /^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const REMOTE_TIMEOUT_MS = 8_000;
const MAX_PROVIDER_RESPONSE_BYTES = 120_000;

function enabled(value) { return String(value || '').toLowerCase() === 'true'; }
function xml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]); }

function httpsServiceUrl(value, { production = false, originOnly = false } = {}) {
  try {
    const url = new URL(String(value || ''));
    const hostname = url.hostname.toLowerCase();
    const privateHost = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
      || /^(?:127|10|0)\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)
      || hostname === '::1' || hostname.endsWith('.example') || hostname.endsWith('.example.test') || hostname.endsWith('.test') || hostname.endsWith('.invalid');
    if (url.protocol !== 'https:' || url.username || url.password || !hostname || (production && privateHost)) return null;
    if (originOnly && (url.pathname !== '/' || url.search || url.hash)) return null;
    url.search = '';
    url.hash = '';
    if (!originOnly) url.pathname = url.pathname.replace(/\/+$/, '');
    return url;
  } catch { return null; }
}

function remoteApiTransportConfiguration(env, production) {
  const apiBaseUrl = httpsServiceUrl(env.EMPLOYER_BROWSER_REMOTE_STREAM_API_URL, { production });
  const apiKey = String(env.EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY || '');
  if (!apiBaseUrl || apiKey.length < 32) return null;
  return { apiBaseUrl: apiBaseUrl.href.replace(/\/$/, ''), apiKey };
}

function remoteTransportConfiguration(env, production) {
  const api = remoteApiTransportConfiguration(env, production);
  const streamOrigin = httpsServiceUrl(env.EMPLOYER_BROWSER_REMOTE_STREAM_ORIGIN, { production, originOnly: true });
  if (!api || !streamOrigin) return null;
  return { ...api, streamOrigin: streamOrigin.origin, sessionSeconds: 30 * 60 };
}

export function employerBrowserSessionProviderConfiguration(env = process.env) {
  const production = String(env.VERCEL_ENV || '').toLowerCase() === 'production' || String(env.NODE_ENV || '').toLowerCase() === 'production';
  const provider = String(env.EMPLOYER_BROWSER_SESSION_PROVIDER || '').trim().toLowerCase();
  if (provider === 'synthetic-fixture' && !production && enabled(env.EMPLOYER_BROWSER_SESSION_FIXTURE_ENABLED)) {
    return { enabled: true, provider, viewMode: 'synthetic-static', interactive: false, externalNavigation: false, costMode: 'no-provider-call' };
  }
  if (provider === 'remote-stream') {
    const transport = remoteTransportConfiguration(env, production);
    if (!enabled(env.EMPLOYER_BROWSER_REMOTE_STREAM_ENABLED)) return { enabled: false, provider, reason: 'remote-stream-disabled' };
    if (!transport) return { enabled: false, provider, reason: 'remote-stream-configuration-invalid' };
    if (!enabled(env.EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVED) || !SAFE_VERSION.test(String(env.EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVAL_VERSION || ''))) {
      return { enabled: false, provider, reason: 'remote-stream-costs-not-approved' };
    }
    if (!enabled(env.EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED) || !SAFE_VERSION.test(String(env.EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVAL_VERSION || ''))
      || String(env.EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED_ORIGIN || '').replace(/\/$/, '') !== transport.streamOrigin) {
      return { enabled: false, provider, reason: 'remote-stream-csp-not-approved' };
    }
    return {
      enabled: true, provider, viewMode: 'interactive-stream', interactive: true, externalNavigation: true,
      costMode: 'metered-provider', ...transport,
    };
  }
  return { enabled: false, provider: provider || 'none', reason: production && provider === 'synthetic-fixture' ? 'fixture-forbidden-in-production' : 'disabled' };
}

function safeFixtureTarget(session) {
  const url = new URL(String(session?.role?.directEmployerUrl || ''));
  if (url.protocol !== 'https:' || !url.hostname.toLowerCase().endsWith('.example.test')) throw new Error('Synthetic browser handoff is limited to .example.test fixtures.');
  return url;
}

function fixtureFields(session) {
  return (session?.proposedFields || []).slice(0, 12).map((field, index) => ({
    fieldRef: `fixture_field_${index + 1}`, fieldKey: String(field.fieldKey || '').slice(0, 120),
    label: String(field.label || field.fieldKey || 'Application field').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 160),
    required: index < 2,
  })).filter(field => field.fieldKey && field.label);
}

function fixtureSchemaHash(fields) {
  return createHash('sha256').update(JSON.stringify(fields.map(({ fieldRef, fieldKey, required }) => ({ fieldRef, fieldKey, inputType: 'text', required })))).digest('hex');
}

function remoteFieldSchemaHash(fields) {
  return createHash('sha256').update(JSON.stringify(fields.map(({ fieldRef, fieldKey, inputType, required }) => ({ fieldRef, fieldKey, inputType, required })))).digest('hex');
}

function remoteFields(value) {
  if (!Array.isArray(value) || value.length > 80) throw new Error('REMOTE_STREAM_FIELD_SCHEMA_INVALID');
  return value.map((field, index) => {
    if (!field || typeof field !== 'object' || Object.keys(field).some(key => /value|answer|default|candidate|secret|credential/i.test(key))) throw new Error('REMOTE_STREAM_FIELD_SCHEMA_INVALID');
    const fieldRef = String(field.fieldRef || '').trim();
    const fieldKey = String(field.fieldKey || '').trim();
    const label = String(field.label || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 160);
    const inputType = String(field.inputType || '').trim().toLowerCase();
    if (!SAFE_REF.test(fieldRef) || !SAFE_FIELD.test(fieldKey) || !label || !['text', 'email', 'tel', 'url', 'textarea', 'select', 'file'].includes(inputType)) throw new Error('REMOTE_STREAM_FIELD_SCHEMA_INVALID');
    return { fieldRef, fieldKey, label, inputType, required: field.required === true, order: index };
  });
}

function exactTargetUrl(value, expectedHostname) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname.toLowerCase() !== expectedHostname) throw new Error('REMOTE_STREAM_TARGET_MISMATCH');
  url.hash = '';
  return url.href;
}

function remoteStreamUrl(value, configuration) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== configuration.streamOrigin) throw new Error('REMOTE_STREAM_VIEW_ORIGIN_MISMATCH');
  return url.href;
}

function assertRemotePolicy(attestation, expectedHostname) {
  const hosts = Array.isArray(attestation?.networkAllowlist) ? attestation.networkAllowlist.map(value => String(value).toLowerCase()) : [];
  if (hosts.length !== 1 || hosts[0] !== expectedHostname || attestation?.submissionsBlocked !== true
    || attestation?.credentialCapture !== 'provider-only' || attestation?.recording !== false
    || attestation?.candidateValuesReturned !== false || attestation?.downloadsBlocked !== true) throw new Error('REMOTE_STREAM_POLICY_ATTESTATION_INVALID');
}

function remoteView(payload, { configuration, expectedHostname, expectedPageUrl, expectedSchemaHash = '', now = new Date() }) {
  if (!payload || typeof payload !== 'object' || !SAFE_REF.test(String(payload.providerSessionReference || ''))) throw new Error('REMOTE_STREAM_RESPONSE_INVALID');
  const fields = remoteFields(payload.fields);
  const fieldSchemaHash = remoteFieldSchemaHash(fields);
  if (!SHA256.test(String(payload.fieldSchemaHash || '')) || String(payload.fieldSchemaHash).toLowerCase() !== fieldSchemaHash
    || (expectedSchemaHash && fieldSchemaHash !== expectedSchemaHash)) throw new Error('REMOTE_STREAM_SCHEMA_ATTESTATION_INVALID');
  assertRemotePolicy(payload.policyAttestation, expectedHostname);
  const pageUrl = exactTargetUrl(payload.pageUrl, expectedHostname);
  if (expectedPageUrl && pageUrl !== exactTargetUrl(expectedPageUrl, expectedHostname)) throw new Error('REMOTE_STREAM_TARGET_MISMATCH');
  const expiresAt = new Date(String(payload.expiresAt || ''));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime() || expiresAt.getTime() > now.getTime() + configuration.sessionSeconds * 1000 + 60_000) throw new Error('REMOTE_STREAM_EXPIRATION_INVALID');
  const status = String(payload.status || 'ready');
  if (!['ready', 'waiting-for-user'].includes(status)) throw new Error('REMOTE_STREAM_STATUS_INVALID');
  return {
    status, provider: 'remote-stream', providerSessionReference: String(payload.providerSessionReference),
    viewMode: 'interactive-stream', interactive: true, externalNavigation: true, streamUrl: remoteStreamUrl(payload.streamUrl, configuration),
    pageUrl, employerHostname: expectedHostname, fieldSchemaHash, fields, expiresAt: expiresAt.toISOString(),
    containsCandidateFieldValues: false, submitted: false,
  };
}

async function remoteRequest(configuration, path, { method = 'GET', body, fetchImpl = fetch, timeoutMs = REMOTE_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, Math.min(15_000, Number(timeoutMs) || REMOTE_TIMEOUT_MS)));
  try {
    const response = await fetchImpl(`${configuration.apiBaseUrl}${path}`, {
      method, redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', Authorization: `Bearer ${configuration.apiKey}`, 'Content-Type': 'application/json', 'X-1stStep-Contract-Version': 'employer-browser-v1' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 404) return { status: 'missing' };
    if (!response.ok) throw new Error(`REMOTE_STREAM_PROVIDER_HTTP_${response.status}`);
    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_PROVIDER_RESPONSE_BYTES) throw new Error('REMOTE_STREAM_RESPONSE_TOO_LARGE');
    try { return JSON.parse(raw); } catch { throw new Error('REMOTE_STREAM_RESPONSE_INVALID'); }
  } finally { clearTimeout(timeout); }
}

function remoteIdempotencyKey(session, now) {
  const bucket = Math.floor(now.getTime() / (30 * 60_000));
  return `handoff_${createHash('sha256').update(`${session.id}.${session.updatedAt || ''}.${bucket}.remote-stream-v1`).digest('hex')}`;
}

async function createRemoteHandoff({ session, configuration, env, redis, now, fetchImpl }) {
  const target = new URL(String(session?.role?.directEmployerUrl || ''));
  if (target.protocol !== 'https:' || target.username || target.password) throw new Error('A verified HTTPS employer target is required.');
  target.hash = '';
  const hostname = target.hostname.toLowerCase();
  const idempotencyKey = remoteIdempotencyKey(session, now);
  const request = {
    idempotencyKey, targetUrl: target.href, allowedHostname: hostname, expiresInSeconds: configuration.sessionSeconds,
    policy: { networkAllowlist: [hostname], submissionsBlocked: true, credentialCapture: 'provider-only', recording: false, candidateValuesReturned: false, downloadsBlocked: true },
  };
  const spend = await reserveConfiguredJobAgentSpend({ category: 'employer-browser', operationId: `browser:${idempotencyKey}`, env, redis, now });
  if (!spend.ok) throw new Error(spend.code || 'MONETARY_SPEND_CONTROL_NOT_CONFIGURED');
  let payload;
  let providerCallStarted = false;
  try {
    try {
      providerCallStarted = true;
      payload = await remoteRequest(configuration, '/v1/sessions', { method: 'POST', body: request, fetchImpl });
    } catch (error) {
      try { payload = await remoteRequest(configuration, `/v1/sessions/by-idempotency/${encodeURIComponent(idempotencyKey)}`, { fetchImpl }); }
      catch { throw error; }
      if (payload?.status === 'missing') throw error;
    }
    return remoteView(payload, { configuration, expectedHostname: hostname, expectedPageUrl: target.href, now });
  } finally {
    await settleConfiguredJobAgentSpend({ control: spend.control, providerCallStarted }).catch(error => {
      console.error(JSON.stringify({ type: 'monetary-spend-settlement-error', category: 'employer-browser', name: error?.name || 'unknown' }));
    });
  }
}

async function resumeRemoteHandoff({ session, browserSession, configuration, now, fetchImpl }) {
  const target = new URL(String(session?.role?.directEmployerUrl || ''));
  if (target.protocol !== 'https:' || target.username || target.password || target.hostname.toLowerCase() !== browserSession.employerHostname) return { status: 'schema-changed', containsCandidateFieldValues: false, submitted: false };
  const payload = await remoteRequest(configuration, `/v1/sessions/${encodeURIComponent(browserSession.providerSessionReference)}`, { fetchImpl });
  if (payload?.status === 'missing') return { status: 'expired', containsCandidateFieldValues: false, submitted: false };
  return remoteView(payload, { configuration, expectedHostname: browserSession.employerHostname, expectedPageUrl: browserSession.pageUrl, expectedSchemaHash: browserSession.fieldSchemaHash, now });
}

function fixturePreview({ hostname, fields, expiresAt }) {
  const rows = fields.slice(0, 7).map((field, index) => {
    const y = 172 + index * 54;
    return `<text x="66" y="${y}" fill="#526176" font-family="Arial,sans-serif" font-size="12">${xml(field.label)}</text><rect x="66" y="${y + 10}" width="548" height="28" rx="6" fill="#f7f9fc" stroke="#d8e0ea"/><text x="78" y="${y + 29}" fill="#9aa7b7" font-family="Arial,sans-serif" font-size="11">Verified answer remains masked until action-time approval</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="600" viewBox="0 0 680 600"><rect width="680" height="600" fill="#eef2f7"/><rect x="30" y="28" width="620" height="544" rx="14" fill="#fff" stroke="#d7e0eb"/><circle cx="56" cy="52" r="5" fill="#ec6a5f"/><circle cx="74" cy="52" r="5" fill="#f4bf4f"/><circle cx="92" cy="52" r="5" fill="#61c554"/><rect x="118" y="40" width="492" height="25" rx="7" fill="#f3f6fa"/><text x="132" y="57" fill="#718096" font-family="Arial,sans-serif" font-size="11">https://${xml(hostname)}</text><text x="66" y="108" fill="#172033" font-family="Arial,sans-serif" font-size="22" font-weight="700">Application form preview</text><text x="66" y="132" fill="#6d7c8f" font-family="Arial,sans-serif" font-size="12">Synthetic local fixture · read-only · no employer contacted</text>${rows}<text x="66" y="548" fill="#7b8797" font-family="Arial,sans-serif" font-size="10">Expires ${xml(expiresAt)} · passwords, OTPs and CAPTCHA answers are never captured</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function createEmployerBrowserHandoff({ session, env = process.env, redis, now = new Date(), fetchImpl = fetch } = {}) {
  assertNoApplicationSecrets(session, 'browserHandoffSession');
  const configuration = employerBrowserSessionProviderConfiguration(env);
  if (!configuration.enabled) return { status: 'not-configured', reason: configuration.reason, configuration };
  if (configuration.provider === 'remote-stream') return createRemoteHandoff({ session, configuration, env, redis, now, fetchImpl });
  const target = safeFixtureTarget(session);
  const fields = fixtureFields(session);
  const fieldSchemaHash = fixtureSchemaHash(fields);
  const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();
  const providerSessionReference = `fixture_session_${randomUUID()}`;
  return {
    status: 'ready', provider: configuration.provider, providerSessionReference, viewMode: configuration.viewMode,
    interactive: false, externalNavigation: false, pageUrl: target.href, employerHostname: target.hostname.toLowerCase(),
    fieldSchemaHash, fields, expiresAt, previewImageDataUrl: fixturePreview({ hostname: target.hostname, fields, expiresAt }),
    containsCandidateFieldValues: false, submitted: false,
  };
}

export async function resumeEmployerBrowserHandoff({ session, browserSession, env = process.env, now = new Date(), fetchImpl = fetch } = {}) {
  if (!SAFE_REF.test(String(browserSession?.providerSessionReference || ''))) throw new Error('Browser handoff reference is invalid.');
  const configuration = employerBrowserSessionProviderConfiguration(env);
  if (!configuration.enabled || browserSession.provider !== configuration.provider) return { status: 'not-configured', reason: configuration.reason || 'provider-changed', configuration };
  if (configuration.provider === 'remote-stream') return resumeRemoteHandoff({ session, browserSession, configuration, now, fetchImpl });
  const target = safeFixtureTarget(session);
  const fields = fixtureFields(session);
  if (fixtureSchemaHash(fields) !== browserSession.fieldSchemaHash || target.hostname.toLowerCase() !== browserSession.employerHostname) return { status: 'schema-changed', containsCandidateFieldValues: false, submitted: false };
  return {
    status: browserSession.status === 'expired' ? 'expired' : 'ready', viewMode: configuration.viewMode, interactive: false,
    pageUrl: target.href, employerHostname: target.hostname.toLowerCase(), fieldSchemaHash: browserSession.fieldSchemaHash,
    fields, expiresAt: browserSession.expiresAt, previewImageDataUrl: fixturePreview({ hostname: target.hostname, fields, expiresAt: browserSession.expiresAt }),
    containsCandidateFieldValues: false, submitted: false,
  };
}

export async function closeEmployerBrowserHandoff({ browserSession, env = process.env, fetchImpl = fetch } = {}) {
  if (!SAFE_REF.test(String(browserSession?.providerSessionReference || ''))) return { status: 'missing' };
  const configuration = employerBrowserSessionProviderConfiguration(env);
  if (browserSession.provider === 'synthetic-fixture') return { status: 'closed', externalAction: false };
  if (browserSession.provider === 'remote-stream') {
    const production = String(env.VERCEL_ENV || '').toLowerCase() === 'production' || String(env.NODE_ENV || '').toLowerCase() === 'production';
    const teardownConfiguration = remoteApiTransportConfiguration(env, production);
    if (!teardownConfiguration) return { status: 'not-configured', reason: 'remote-stream-teardown-configuration-invalid', externalAction: false };
    const response = await remoteRequest(teardownConfiguration, `/v1/sessions/${encodeURIComponent(browserSession.providerSessionReference)}`, { method: 'DELETE', fetchImpl });
    if (response?.status === 'missing') return { status: 'missing', externalAction: true };
    if (response?.status !== 'closed') return { status: 'not-confirmed', externalAction: true };
    return { status: 'closed', externalAction: true };
  }
  return { status: 'not-configured', reason: configuration.reason || 'provider-changed', externalAction: false };
}
