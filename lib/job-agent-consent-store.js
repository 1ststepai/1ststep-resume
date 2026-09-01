import { createHash, createHmac } from 'node:crypto';
import { activeJobAgentConsent, jobAgentConsentPolicyConfiguration, validateJobAgentConsent } from './job-agent-consent-domain.js';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { jobAgentPilotAccessForSubject, jobAgentPilotAccessForTenant } from './job-agent-pilot-access.js';

const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,128}$/;
const CONSENT_TTL_SECONDS = 365 * 24 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export function tenantConsentKey(subject, secret) {
  if (String(secret || '').length < 32) throw new Error('A 32-character tenant partition secret is required.');
  const tenantId = createHmac('sha256', secret).update(String(subject || '')).digest('hex').slice(0, 40);
  return `1ststep:consent:v1:${tenantId}`;
}

function consentKeyFromTenantId(tenantId) {
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || ''))) throw new Error('A valid tenant consent partition is required.');
  return `1ststep:consent:v1:${tenantId}`;
}

export function encryptJobAgentConsent(record, { key, tenantKey }) {
  return encryptJsonEnvelope(validateJobAgentConsent(record), { dataEncryptionKey: key, aad: tenantKey });
}

export function decryptJobAgentConsent(envelope, { key, tenantKey }) {
  return validateJobAgentConsent(decryptJsonEnvelope(envelope, { dataEncryptionKey: key, aad: tenantKey }));
}

function decode(raw) { return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; }

export async function readJobAgentConsent({ redis, subject, partitionSecret, dataEncryptionKey }) {
  const key = tenantConsentKey(subject, partitionSecret);
  const stored = decode(await redis.get(key));
  if (!stored) return { consent: null, version: 0, updatedAt: null };
  return { consent: decryptJobAgentConsent(stored.envelope, { key: dataEncryptionKey, tenantKey: key }), version: Number(stored.version) || 0, updatedAt: stored.updatedAt || null };
}

export async function readJobAgentConsentByTenantId({ redis, tenantId, dataEncryptionKey }) {
  const key = consentKeyFromTenantId(tenantId);
  const stored = decode(await redis.get(key));
  if (!stored) return { consent: null, version: 0, updatedAt: null };
  return { consent: decryptJobAgentConsent(stored.envelope, { key: dataEncryptionKey, tenantKey: key }), version: Number(stored.version) || 0, updatedAt: stored.updatedAt || null };
}

export async function deleteJobAgentConsent({ redis, subject, partitionSecret }) {
  await redis.del(tenantConsentKey(subject, partitionSecret));
  return { ok: true, deleted: true };
}

const CAS_SCRIPT = `
local replay = redis.call('GET', KEYS[2])
if replay then return {'replayed', replay} end
local raw = redis.call('GET', KEYS[1])
local current = 0
if raw then current = tonumber(cjson.decode(raw).version) or 0 end
if current ~= tonumber(ARGV[1]) then return {'conflict', tostring(current)} end
redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[5], 'NX')
return {'saved', ARGV[2]}
`;

export async function saveJobAgentConsent({ redis, subject, partitionSecret, dataEncryptionKey, consent, expectedVersion, idempotencyKey, now = new Date() }) {
  if (!SAFE_IDEMPOTENCY_KEY.test(String(idempotencyKey || ''))) throw new Error('A safe Idempotency-Key is required.');
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('A non-negative expected version is required.');
  const record = validateJobAgentConsent(consent);
  const key = tenantConsentKey(subject, partitionSecret);
  const version = expectedVersion + 1;
  const updatedAt = now.toISOString();
  const stored = JSON.stringify({ version, updatedAt, envelope: encryptJobAgentConsent(record, { key: dataEncryptionKey, tenantKey: key }) });
  const idemHash = createHash('sha256').update(idempotencyKey).digest('hex');
  const result = await redis.eval(CAS_SCRIPT, [key, `${key}:idem:${idemHash}`], [String(expectedVersion), String(version), stored, String(CONSENT_TTL_SECONDS), String(IDEMPOTENCY_TTL_SECONDS)]);
  const [status, resultVersion] = Array.isArray(result) ? result : ['error', '0'];
  if (status === 'conflict') return { ok: false, conflict: true, version: Number(resultVersion) || 0 };
  if (!['saved', 'replayed'].includes(status)) throw new Error('Job Agent consent write failed.');
  return { ok: true, replayed: status === 'replayed', version: Number(resultVersion), updatedAt };
}

export async function requireActiveJobAgentConsent(config, subject, env = process.env) {
  const policy = jobAgentConsentPolicyConfiguration(env);
  const stored = await readJobAgentConsent({ ...config, subject });
  return { ...activeJobAgentConsent(stored.consent, policy), version: stored.version };
}

export function jobAgentConsentEnforcementRequired(env = process.env) {
  return String(env.VERCEL_ENV || '').toLowerCase() === 'production' || String(env.JOB_AGENT_CONSENT_ENFORCEMENT || '').toLowerCase() === 'true';
}

export async function requireConfiguredJobAgentConsent(config, subject, env = process.env) {
  const pilot = jobAgentPilotAccessForSubject(subject, env);
  if (!pilot.ok) return pilot;
  if (!jobAgentConsentEnforcementRequired(env)) return { ok: true, bypassedOutsideProduction: true };
  return requireActiveJobAgentConsent(config, subject, env);
}

export async function jobAgentConsentGate(config, subject, env = process.env) {
  const result = await requireConfiguredJobAgentConsent(config, subject, env);
  if (result.ok) return result;
  const policyConfigurationFailure = ['JOB_AGENT_POLICY_NOT_CONFIGURED', 'JOB_AGENT_PILOT_NOT_CONFIGURED'].includes(result.code);
  const pilotInviteRequired = result.code === 'JOB_AGENT_PILOT_INVITE_REQUIRED';
  return {
    ...result,
    status: policyConfigurationFailure ? 503 : pilotInviteRequired ? 403 : 428,
    error: policyConfigurationFailure
      ? result.code === 'JOB_AGENT_PILOT_NOT_CONFIGURED' ? 'Controlled-beta admission is not configured.' : 'Counsel-approved Job Agent policy versions are not configured.'
      : pilotInviteRequired
        ? 'This controlled Job Agent beta is currently limited to invited members.'
      : result.code === 'JOB_AGENT_CONSENT_RENEWAL_REQUIRED'
        ? 'Review and accept the current Job Agent terms, privacy notice, and candidate authorization before continuing.'
        : 'Job Agent consent is required before starting or resuming this work.',
  };
}

export async function requireConfiguredJobAgentConsentForTenant(config, tenantId, env = process.env) {
  const pilot = jobAgentPilotAccessForTenant(tenantId, env);
  if (!pilot.ok) return pilot;
  if (!jobAgentConsentEnforcementRequired(env)) return { ok: true, bypassedOutsideProduction: true };
  const policy = jobAgentConsentPolicyConfiguration(env);
  const stored = await readJobAgentConsentByTenantId({ ...config, tenantId });
  return { ...activeJobAgentConsent(stored.consent, policy), version: stored.version };
}
