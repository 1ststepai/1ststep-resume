import { createHash, createHmac } from 'node:crypto';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { PROHIBITED_SECRET_VALUE } from './prohibited-secret.js';

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:\+?1[\s.-])?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/;
const SECRET = PROHIBITED_SECRET_VALUE;
const PRIVATE_KEY = /^(?:firstName|lastName|fullName|email|phone|address|resume|resumeText|employmentHistory|candidateProfile|privateContext|credential|password|passcode|otp|captcha|mfa)$/i;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,128}$/;
const MAX_STATE_BYTES = 200_000;
const STATE_TTL_SECONDS = 90 * 24 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const SUBSCRIBER_RUN_STATES = new Set(['Searching', 'Preparing', 'Waiting for You', 'Paused', 'Finished']);
const SUBSCRIBER_JOB_STATUSES = new Set(['New', 'Found', 'Verified', 'Package Ready', 'Applying', 'Needs You', 'Submitted', 'Receipt Verified', 'Follow-up Due', 'Interview', 'Rejected/Closed']);
const JOB_CARD_KEYS = new Set([
  'id', 'employer', 'title', 'status', 'requisitionId', 'sourceUrl', 'sourceProvider', 'discoveryRunId', 'applyPathActive',
  'packageRunId', 'packageRunStatus', 'fitScore', 'remoteEligibility', 'salaryMin', 'salaryMax', 'geographyEligibility',
  'salaryDisclosure', 'employmentType', 'postedDate', 'travel', 'schedule', 'directEmployerUrl', 'updatedAt',
]);
const NEEDS_YOU_KEYS = new Set(['id', 'roleId', 'type', 'summary', 'status']);

function assertMetadataOnly(value, path = 'state') {
  if (Array.isArray(value)) return value.forEach((entry, index) => assertMetadataOnly(entry, `${path}.${index}`));
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (PRIVATE_KEY.test(key)) throw new Error(`Private field is not allowed in durable campaign state: ${path}.${key}`);
      assertMetadataOnly(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && (EMAIL.test(value) || PHONE.test(value) || SECRET.test(value))) {
    throw new Error(`Private or secret content is not allowed in durable campaign state: ${path}`);
  }
}

function assertExactKeys(value, allowed, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`Unsupported durable subscriber field: ${path}.${key}`);
}

function assertBoundedText(value, path, max, { required = false } = {}) {
  if (value == null && !required) return;
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max) throw new Error(`${path} must be ${required ? 'a non-empty ' : 'a '}string no longer than ${max} characters.`);
}

function assertHttpsUrl(value, path, { required = false } = {}) {
  if (!value && !required) return;
  assertBoundedText(value, path, 900, { required });
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('unsafe');
  } catch { throw new Error(`${path} must be a credential-free HTTPS URL.`); }
}

function assertSubscriberView(view) {
  if (view == null) return;
  assertExactKeys(view, new Set(['version', 'runState', 'jobCards', 'needsYou']), 'state.subscriberView');
  if (view.version !== 1) throw new Error('Durable subscriber view version 1 is required.');
  if (view.runState != null && !SUBSCRIBER_RUN_STATES.has(view.runState)) throw new Error('Durable subscriber run state is not allowed.');
  if (!Array.isArray(view.jobCards) || view.jobCards.length > 100) throw new Error('Durable subscriber job cards must contain at most 100 items.');
  if (!Array.isArray(view.needsYou) || view.needsYou.length > 100) throw new Error('Durable subscriber Needs You items must contain at most 100 items.');
  view.jobCards.forEach((card, index) => {
    const path = `state.subscriberView.jobCards.${index}`;
    assertExactKeys(card, JOB_CARD_KEYS, path);
    for (const [key, max] of Object.entries({ id: 160, employer: 160, title: 220, status: 40, requisitionId: 160, sourceProvider: 60, discoveryRunId: 160, packageRunId: 160, packageRunStatus: 40, remoteEligibility: 220, geographyEligibility: 220, salaryDisclosure: 400, employmentType: 80, postedDate: 40, travel: 220, schedule: 220, updatedAt: 40 })) {
      assertBoundedText(card[key], `${path}.${key}`, max, { required: ['id', 'employer', 'title', 'status'].includes(key) });
    }
    if (!SUBSCRIBER_JOB_STATUSES.has(card.status)) throw new Error(`${path}.status is not allowed.`);
    assertHttpsUrl(card.directEmployerUrl, `${path}.directEmployerUrl`, { required: true });
    assertHttpsUrl(card.sourceUrl, `${path}.sourceUrl`);
    if (card.applyPathActive != null && typeof card.applyPathActive !== 'boolean') throw new Error(`${path}.applyPathActive must be boolean.`);
    if (card.fitScore != null && (!Number.isFinite(card.fitScore) || card.fitScore < 0 || card.fitScore > 100)) throw new Error(`${path}.fitScore must be between 0 and 100.`);
    for (const key of ['salaryMin', 'salaryMax']) if (card[key] != null && (!Number.isFinite(card[key]) || card[key] < 0 || card[key] > 10_000_000)) throw new Error(`${path}.${key} is outside the allowed range.`);
  });
  view.needsYou.forEach((item, index) => {
    const path = `state.subscriberView.needsYou.${index}`;
    assertExactKeys(item, NEEDS_YOU_KEYS, path);
    assertBoundedText(item.id, `${path}.id`, 160, { required: true });
    assertBoundedText(item.roleId, `${path}.roleId`, 160);
    assertBoundedText(item.type, `${path}.type`, 80, { required: true });
    assertBoundedText(item.summary, `${path}.summary`, 500, { required: true });
    if (item.status !== 'open') throw new Error(`${path}.status must be open.`);
  });
}

export function validateDurableCampaignState(input) {
  const state = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
  if (!state || state.version !== 1) throw new Error('Campaign state version 1 is required.');
  for (const key of ['campaigns', 'runs', 'items', 'humanActions', 'evidence', 'transitions']) {
    if (!Array.isArray(state[key])) throw new Error(`Campaign state ${key} must be an array.`);
  }
  assertMetadataOnly(state);
  assertSubscriberView(state.subscriberView);
  const serialized = JSON.stringify(state);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_STATE_BYTES) throw new Error('Campaign state exceeds the 200 KB beta limit.');
  return JSON.parse(serialized);
}

export function tenantCampaignKey(subject, secret) {
  const safeSecret = String(secret || '');
  if (safeSecret.length < 32) throw new Error('A 32-character tenant partition secret is required.');
  const tenantId = createHmac('sha256', safeSecret).update(String(subject || '')).digest('hex').slice(0, 40);
  return tenantCampaignKeyForTenant(tenantId);
}

export function tenantCampaignKeyForTenant(tenantId) {
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || ''))) throw new Error('A valid tenant partition is required.');
  return `1ststep:beta:v1:${tenantId}:campaign`;
}

export function encryptCampaignState(state, { key, tenantKey }) {
  return encryptJsonEnvelope(state, { dataEncryptionKey: key, aad: tenantKey });
}

export function decryptCampaignState(envelope, { key, tenantKey }) {
  return validateDurableCampaignState(decryptJsonEnvelope(envelope, { dataEncryptionKey: key, aad: tenantKey }));
}

function decodeRecord(raw) {
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

export async function readTenantCampaignState({ redis, subject, partitionSecret, dataEncryptionKey }) {
  const key = tenantCampaignKey(subject, partitionSecret);
  return readTenantCampaignStateAtKey({ redis, key, dataEncryptionKey });
}

async function readTenantCampaignStateAtKey({ redis, key, dataEncryptionKey }) {
  const record = decodeRecord(await redis.get(key));
  if (!record) return { state: null, version: 0, updatedAt: null };
  return {
    state: decryptCampaignState(record.envelope, { key: dataEncryptionKey, tenantKey: key }),
    version: Number(record.version) || 0,
    updatedAt: record.updatedAt || null,
  };
}

export async function readTenantCampaignStateForTenant({ redis, tenantId, dataEncryptionKey }) {
  return readTenantCampaignStateAtKey({ redis, key: tenantCampaignKeyForTenant(tenantId), dataEncryptionKey });
}

export async function deleteTenantCampaignState({ redis, subject, partitionSecret }) {
  const key = tenantCampaignKey(subject, partitionSecret);
  await redis.del(key);
  return { ok: true, revoked: true };
}

const CAS_SCRIPT = `
local replay = redis.call('GET', KEYS[2])
if replay then return {'replayed', replay} end
local raw = redis.call('GET', KEYS[1])
local current = 0
if raw then
  local decoded = cjson.decode(raw)
  current = tonumber(decoded.version) or 0
end
if current ~= tonumber(ARGV[1]) then return {'conflict', tostring(current)} end
redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[5], 'NX')
return {'saved', ARGV[2]}
`;

export async function saveTenantCampaignState({ redis, subject, partitionSecret, dataEncryptionKey, state, expectedVersion, idempotencyKey, now = new Date() }) {
  return saveTenantCampaignStateAtKey({ redis, key: tenantCampaignKey(subject, partitionSecret), dataEncryptionKey, state, expectedVersion, idempotencyKey, now });
}

async function saveTenantCampaignStateAtKey({ redis, key, dataEncryptionKey, state, expectedVersion, idempotencyKey, now = new Date() }) {
  if (!SAFE_IDEMPOTENCY_KEY.test(String(idempotencyKey || ''))) throw new Error('A safe Idempotency-Key is required.');
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('A non-negative expected version is required.');
  const safeState = validateDurableCampaignState(state);
  const version = expectedVersion + 1;
  const updatedAt = now.toISOString();
  const record = JSON.stringify({
    version,
    updatedAt,
    envelope: encryptCampaignState(safeState, { key: dataEncryptionKey, tenantKey: key }),
  });
  const idemHash = createHash('sha256').update(idempotencyKey).digest('hex');
  const result = await redis.eval(CAS_SCRIPT, [key, `${key}:idem:${idemHash}`], [String(expectedVersion), String(version), record, String(STATE_TTL_SECONDS), String(IDEMPOTENCY_TTL_SECONDS)]);
  const [status, resultVersion] = Array.isArray(result) ? result : ['error', '0'];
  if (status === 'conflict') return { ok: false, conflict: true, version: Number(resultVersion) || 0 };
  if (!['saved', 'replayed'].includes(status)) throw new Error('Durable campaign write failed.');
  return { ok: true, replayed: status === 'replayed', version: Number(resultVersion), updatedAt };
}

export async function saveTenantCampaignStateForTenant({ redis, tenantId, dataEncryptionKey, state, expectedVersion, idempotencyKey, now = new Date() }) {
  return saveTenantCampaignStateAtKey({ redis, key: tenantCampaignKeyForTenant(tenantId), dataEncryptionKey, state, expectedVersion, idempotencyKey, now });
}
