import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { createJobAgentLearningState, validateJobAgentLearningState } from './job-agent-learning-domain.js';
import { jobAgentTenantId } from './job-agent-run-store.js';

const BASE = '1ststep:job-agent-learning:v1';
const TTL_SECONDS = 365 * 24 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const LEASE_SECONDS = 120;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,128}$/;
const TENANT_ID = /^[a-f0-9]{40}$/;

const SAVE_SCRIPT = `
local replay = redis.call('GET', KEYS[2])
if replay then return {'replayed', replay} end
local raw = redis.call('GET', KEYS[1])
local current = 0
if raw then current = tonumber(cjson.decode(raw).version) or 0 end
if current ~= tonumber(ARGV[1]) then return {'conflict', tostring(current)} end
redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[5], 'NX')
redis.call('ZADD', KEYS[3], ARGV[6], ARGV[7])
return {'saved', ARGV[2]}
`;

const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.leaseUntil and record.leaseUntil ~= '' and record.leaseUntil > ARGV[1] then return {'leased'} end
record.leaseTokenHash = ARGV[2]
record.leaseUntil = ARGV[3]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[4])
redis.call('ZADD', KEYS[2], ARGV[5], ARGV[6])
return {'claimed', cjson.encode(record)}
`;

const COMPLETE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.leaseTokenHash ~= ARGV[1] then return {'lease_lost'} end
record.leaseTokenHash = ''
record.leaseUntil = ''
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[4])
return {'completed'}
`;

const DELETE_SCRIPT = `
redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1
`;

function stateKey(tenantId) { return `${BASE}:tenant:${tenantId}`; }
function dueKey() { return `${BASE}:due`; }
function idemKey(tenantId, value) { return `${BASE}:tenant:${tenantId}:idem:${createHash('sha256').update(value).digest('hex')}`; }
function decode(value) { return value ? (typeof value === 'string' ? JSON.parse(value) : value) : null; }

function encrypt(state, dataEncryptionKey, tenantId) {
  return encryptJsonEnvelope(validateJobAgentLearningState(state), { dataEncryptionKey, aad: stateKey(tenantId) });
}

function decrypt(envelope, dataEncryptionKey, tenantId) {
  return validateJobAgentLearningState(decryptJsonEnvelope(envelope, { dataEncryptionKey, aad: stateKey(tenantId) }));
}

function publicRecord(record, dataEncryptionKey, tenantId) {
  if (!record) return { state: null, version: 0, updatedAt: null };
  return { state: decrypt(record.envelope, dataEncryptionKey, tenantId), version: Number(record.version) || 0, updatedAt: record.updatedAt || null };
}

export async function readJobAgentLearningStateForTenant({ redis, tenantId, dataEncryptionKey }) {
  if (!TENANT_ID.test(String(tenantId || ''))) throw new Error('A valid tenant partition is required.');
  return publicRecord(decode(await redis.get(stateKey(tenantId))), dataEncryptionKey, tenantId);
}

export async function readJobAgentLearningState({ redis, subject, partitionSecret, dataEncryptionKey }) {
  return readJobAgentLearningStateForTenant({ redis, tenantId: jobAgentTenantId(subject, partitionSecret), dataEncryptionKey });
}

export async function saveJobAgentLearningStateForTenant({ redis, tenantId, dataEncryptionKey, state, expectedVersion, idempotencyKey, now = new Date(), nextMaintenanceAt }) {
  if (!TENANT_ID.test(String(tenantId || ''))) throw new Error('A valid tenant partition is required.');
  if (!SAFE_IDEMPOTENCY_KEY.test(String(idempotencyKey || ''))) throw new Error('A safe Idempotency-Key is required.');
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('A non-negative expected version is required.');
  const safeState = validateJobAgentLearningState(state);
  const version = expectedVersion + 1;
  const updatedAt = now.toISOString();
  const record = JSON.stringify({ version, updatedAt, leaseTokenHash: '', leaseUntil: '', envelope: encrypt(safeState, dataEncryptionKey, tenantId) });
  const dueAt = new Date(nextMaintenanceAt || (now.getTime() + 24 * 60 * 60 * 1000));
  const result = await redis.eval(SAVE_SCRIPT, [stateKey(tenantId), idemKey(tenantId, idempotencyKey), dueKey()], [String(expectedVersion), String(version), record, String(TTL_SECONDS), String(IDEMPOTENCY_TTL_SECONDS), String(dueAt.getTime()), tenantId]);
  const [status, resultVersion] = Array.isArray(result) ? result : ['error', '0'];
  if (status === 'conflict') return { ok: false, conflict: true, version: Number(resultVersion) || 0 };
  if (!['saved', 'replayed'].includes(status)) throw new Error('Job Agent learning state could not be saved.');
  return { ok: true, replayed: status === 'replayed', version: Number(resultVersion), updatedAt };
}

export async function saveJobAgentLearningState({ subject, partitionSecret, ...input }) {
  return saveJobAgentLearningStateForTenant({ ...input, tenantId: jobAgentTenantId(subject, partitionSecret) });
}

export async function ensureJobAgentLearningStateForTenant({ redis, tenantId, dataEncryptionKey, now = new Date() }) {
  const current = await readJobAgentLearningStateForTenant({ redis, tenantId, dataEncryptionKey });
  if (current.state) return current;
  const state = createJobAgentLearningState({ createdAt: now.toISOString(), updatedAt: now.toISOString() });
  await saveJobAgentLearningStateForTenant({ redis, tenantId, dataEncryptionKey, state, expectedVersion: 0, idempotencyKey: `learning_init_${tenantId}`, now });
  return readJobAgentLearningStateForTenant({ redis, tenantId, dataEncryptionKey });
}

export async function deleteJobAgentLearningState({ redis, subject, partitionSecret }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  await redis.eval(DELETE_SCRIPT, [stateKey(tenantId), dueKey()], [tenantId]);
  return { deleted: true };
}

export async function claimNextJobAgentLearningMaintenance({ redis, dataEncryptionKey, now = new Date() }) {
  const ids = await redis.zrange(dueKey(), 0, now.getTime(), { byScore: true, offset: 0, count: 10 });
  for (const tenantId of ids || []) {
    if (!TENANT_ID.test(String(tenantId))) { await redis.zrem(dueKey(), tenantId); continue; }
    const record = decode(await redis.get(stateKey(tenantId)));
    if (!record) { await redis.zrem(dueKey(), tenantId); continue; }
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const leaseUntil = new Date(now.getTime() + LEASE_SECONDS * 1000);
    const result = await redis.eval(CLAIM_SCRIPT, [stateKey(tenantId), dueKey()], [now.toISOString(), tokenHash, leaseUntil.toISOString(), String(TTL_SECONDS), String(leaseUntil.getTime()), tenantId]);
    if (Array.isArray(result) && result[0] === 'claimed') return { tenantId, leaseToken: token, record: publicRecord(decode(result[1]), dataEncryptionKey, tenantId) };
  }
  return null;
}

export async function completeJobAgentLearningMaintenance({ redis, tenantId, leaseToken, now = new Date(), delayMs = 24 * 60 * 60 * 1000 }) {
  const record = decode(await redis.get(stateKey(tenantId)));
  if (!record) return false;
  const actual = Buffer.from(createHash('sha256').update(String(leaseToken || '')).digest('hex'));
  const expected = Buffer.from(String(record.leaseTokenHash || ''));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  const result = await redis.eval(COMPLETE_SCRIPT, [stateKey(tenantId), dueKey()], [record.leaseTokenHash, String(TTL_SECONDS), String(now.getTime() + Math.max(60_000, delayMs)), tenantId]);
  return Array.isArray(result) && result[0] === 'completed';
}
