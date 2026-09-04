import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { jobAgentTenantId } from './job-agent-run-store.js';
import { readBoundedTenantIndexPage } from './tenant-index-pagination.js';

const BASE = '1ststep:employer-browser-session:v1';
const TTL_SECONDS = 24 * 60 * 60;
const SAFE_ID = /^[A-Za-z0-9:_-]{8,160}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const PROVIDERS = new Set(['synthetic-fixture', 'remote-stream']);
const MODES = new Set(['synthetic-static', 'interactive-stream']);
const STATUSES = new Set(['ready', 'waiting-for-user', 'expired', 'closed']);

const CREATE_SCRIPT = `
local replay = redis.call('GET', KEYS[2])
if replay then return {'replayed', replay} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4], 'NX')
redis.call('ZADD', KEYS[3], ARGV[3], ARGV[2])
redis.call('EXPIRE', KEYS[3], ARGV[4])
redis.call('ZADD', KEYS[4], ARGV[5], ARGV[2])
return {'created', ARGV[2]}
`;

const DELETE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  redis.call('DEL', KEYS[2])
  return {'missing'}
end
local record = cjson.decode(raw)
if record.tenantId ~= ARGV[1] then return {'forbidden'} end
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
redis.call('ZREM', KEYS[3], ARGV[2])
redis.call('ZREM', KEYS[4], ARGV[2])
return {'deleted'}
`;

const CLAIM_EXPIRED_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then redis.call('ZREM', KEYS[2], ARGV[1]); return {'missing'} end
local record = cjson.decode(raw)
if record.cleanupLeaseUntil and record.cleanupLeaseUntil ~= '' and record.cleanupLeaseUntil > ARGV[2] then return {'leased'} end
record.cleanupLeaseTokenHash = ARGV[3]
record.cleanupLeaseUntil = ARGV[4]
record.cleanupAttempts = (record.cleanupAttempts or 0) + 1
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
redis.call('ZADD', KEYS[2], ARGV[6], ARGV[1])
return {'claimed', cjson.encode(record)}
`;

const RELEASE_CLEANUP_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then redis.call('ZREM', KEYS[2], ARGV[1]); return {'missing'} end
local record = cjson.decode(raw)
if record.cleanupLeaseTokenHash ~= ARGV[2] then return {'forbidden'} end
record.cleanupLeaseTokenHash = ''
record.cleanupLeaseUntil = ''
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[4], ARGV[1])
return {'released'}
`;

const DELETE_CLAIMED_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then redis.call('ZREM', KEYS[4], ARGV[1]); return {'missing'} end
local record = cjson.decode(raw)
if record.tenantId ~= ARGV[2] or record.cleanupLeaseTokenHash ~= ARGV[3] then return {'forbidden'} end
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
redis.call('ZREM', KEYS[3], ARGV[1])
redis.call('ZREM', KEYS[4], ARGV[1])
return {'deleted'}
`;

function sessionKey(id) { return `${BASE}:session:${id}`; }
function tenantIndex(tenantId) { return `${BASE}:tenant:${tenantId}:sessions`; }
function expiryIndex() { return `${BASE}:expires`; }
function applicationHash(applicationSessionId) { return createHash('sha256').update(String(applicationSessionId || '')).digest('hex'); }
function applicationKey(tenantId, applicationSessionId) { return `${BASE}:tenant:${tenantId}:application:${applicationHash(applicationSessionId)}`; }
function parse(value) { return value ? typeof value === 'string' ? JSON.parse(value) : value : null; }

function checkedUrl(value, expectedHostname) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname.toLowerCase() !== String(expectedHostname || '').toLowerCase()) throw new Error('Browser handoff requires the exact verified HTTPS employer host.');
  url.hash = '';
  return url.href;
}

function safePayload(input, now) {
  const applicationSessionId = String(input.applicationSessionId || '').trim();
  const employerHostname = String(input.employerHostname || '').trim().toLowerCase();
  const provider = String(input.provider || '').trim();
  const providerSessionReference = String(input.providerSessionReference || '').trim();
  const viewMode = String(input.viewMode || '').trim();
  const status = String(input.status || 'ready').trim();
  const fieldSchemaHash = String(input.fieldSchemaHash || '').trim().toLowerCase();
  const createdAt = now.toISOString();
  const requestedExpiration = new Date(input.expiresAt || now.getTime() + 30 * 60_000).getTime();
  if (!Number.isFinite(requestedExpiration) || requestedExpiration <= now.getTime()) throw new Error('Browser handoff expiration is invalid.');
  const expiresAt = new Date(Math.min(now.getTime() + TTL_SECONDS * 1000, requestedExpiration)).toISOString();
  if (!SAFE_ID.test(applicationSessionId) || !employerHostname || !SAFE_ID.test(providerSessionReference) || !PROVIDERS.has(provider) || !MODES.has(viewMode) || !STATUSES.has(status) || !SHA256.test(fieldSchemaHash)) throw new Error('Safe browser handoff metadata is required.');
  return {
    applicationSessionId, employerHostname, pageUrl: checkedUrl(input.pageUrl, employerHostname), provider,
    providerSessionReference, viewMode, interactive: input.interactive === true, status, fieldSchemaHash,
    createdAt, updatedAt: createdAt, expiresAt, containsCandidateFieldValues: false,
  };
}

function restore(record, dataEncryptionKey) {
  if (!record) return null;
  return decryptJsonEnvelope(record.envelope, { dataEncryptionKey, aad: sessionKey(record.id) });
}

function publicSession(record, dataEncryptionKey, now = new Date()) {
  const payload = restore(record, dataEncryptionKey);
  if (!payload) return null;
  const expired = new Date(payload.expiresAt).getTime() <= now.getTime();
  return {
    id: record.id, applicationSessionId: payload.applicationSessionId, status: expired ? 'expired' : payload.status,
    employerHostname: payload.employerHostname, pageUrl: payload.pageUrl, viewMode: payload.viewMode,
    interactive: payload.interactive, fieldSchemaHash: payload.fieldSchemaHash, createdAt: payload.createdAt,
    updatedAt: payload.updatedAt, expiresAt: payload.expiresAt, containsCandidateFieldValues: false,
  };
}

export async function createEmployerBrowserSession({ redis, subject, partitionSecret, dataEncryptionKey, applicationSessionId, employerHostname, pageUrl, provider, providerSessionReference, viewMode, interactive = false, fieldSchemaHash, expiresAt, now = new Date() }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const id = `browser_session_${randomUUID()}`;
  const payload = safePayload({ applicationSessionId, employerHostname, pageUrl, provider, providerSessionReference, viewMode, interactive, fieldSchemaHash, expiresAt }, now);
  const key = sessionKey(id);
  const record = { id, tenantId, version: 1, applicationHash: applicationHash(applicationSessionId), cleanupLeaseTokenHash: '', cleanupLeaseUntil: '', cleanupAttempts: 0, envelope: encryptJsonEnvelope(payload, { dataEncryptionKey, aad: key }) };
  const response = await redis.eval(CREATE_SCRIPT, [key, applicationKey(tenantId, applicationSessionId), tenantIndex(tenantId), expiryIndex()], [JSON.stringify(record), id, String(now.getTime()), String(TTL_SECONDS), String(new Date(payload.expiresAt).getTime())]);
  if (!Array.isArray(response) || !['created', 'replayed'].includes(response[0])) throw new Error('Browser handoff could not be saved.');
  const stored = parse(await redis.get(sessionKey(response[1])));
  if (!stored || stored.tenantId !== tenantId) throw new Error('Browser handoff could not be restored.');
  return { session: publicSession(stored, dataEncryptionKey, now), replayed: response[0] === 'replayed' };
}

export async function readEmployerBrowserSessionForApplication({ redis, subject, partitionSecret, dataEncryptionKey, applicationSessionId, now = new Date(), includeProviderReference = false }) {
  if (!SAFE_ID.test(String(applicationSessionId || ''))) return null;
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const id = await redis.get(applicationKey(tenantId, applicationSessionId));
  if (!SAFE_ID.test(String(id || ''))) return null;
  const record = parse(await redis.get(sessionKey(id)));
  if (!record || record.tenantId !== tenantId) return null;
  const summary = publicSession(record, dataEncryptionKey, now);
  if (!includeProviderReference) return summary;
  const payload = restore(record, dataEncryptionKey);
  return { ...summary, provider: payload.provider, providerSessionReference: payload.providerSessionReference };
}

export async function readEmployerBrowserSessionForTenantApplication({ redis, tenantId, dataEncryptionKey, applicationSessionId, now = new Date() }) {
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || '')) || !SAFE_ID.test(String(applicationSessionId || ''))) return null;
  const id = await redis.get(applicationKey(tenantId, applicationSessionId));
  if (!SAFE_ID.test(String(id || ''))) return null;
  const record = parse(await redis.get(sessionKey(id)));
  if (!record || record.tenantId !== tenantId) return null;
  const summary = publicSession(record, dataEncryptionKey, now);
  const payload = restore(record, dataEncryptionKey);
  return { ...summary, provider: payload.provider, providerSessionReference: payload.providerSessionReference };
}

export async function listEmployerBrowserSessionSummaries({ redis, subject, partitionSecret, dataEncryptionKey, limit = 500, offset = 0, withPageInfo = false, now = new Date() }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const page = await readBoundedTenantIndexPage({ redis, indexKey: tenantIndex(tenantId), offset, limit, defaultLimit: 500, reverse: true, includeTotal: withPageInfo });
  const summaries = [];
  for (const id of page.ids) {
    const record = parse(await redis.get(sessionKey(id)));
    if (record?.tenantId === tenantId) summaries.push(publicSession(record, dataEncryptionKey, now));
  }
  return withPageInfo ? { items: summaries, scanned: page.scanned, offset: page.offset, limit: page.limit, total: page.total } : summaries;
}

export async function listEmployerBrowserSessionsInternal({ redis, subject, partitionSecret, dataEncryptionKey, limit = 2000, now = new Date() }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const boundedLimit = Math.max(1, Math.min(2000, Number(limit) || 2000));
  const ids = await redis.zrange(tenantIndex(tenantId), 0, boundedLimit, { rev: true });
  if ((ids || []).length > boundedLimit) throw new Error('Browser handoff session count exceeds the safe lifecycle limit.');
  const sessions = [];
  for (const id of ids || []) {
    const record = parse(await redis.get(sessionKey(id)));
    if (record?.tenantId !== tenantId) continue;
    const summary = publicSession(record, dataEncryptionKey, now);
    const payload = restore(record, dataEncryptionKey);
    sessions.push({ ...summary, provider: payload.provider, providerSessionReference: payload.providerSessionReference });
  }
  return sessions;
}

export async function deleteEmployerBrowserSessionMetadataAfterProviderClose({ redis, subject, partitionSecret, applicationSessionId }) {
  if (!SAFE_ID.test(String(applicationSessionId || ''))) return false;
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const mapping = applicationKey(tenantId, applicationSessionId);
  const id = await redis.get(mapping);
  if (!SAFE_ID.test(String(id || ''))) { await redis.del(mapping); return false; }
  const response = await redis.eval(DELETE_SCRIPT, [sessionKey(id), mapping, tenantIndex(tenantId), expiryIndex()], [tenantId, id]);
  return Array.isArray(response) && response[0] === 'deleted';
}

export async function claimNextExpiredEmployerBrowserSession({ redis, dataEncryptionKey, now = new Date(), leaseSeconds = 45 }) {
  const ids = await redis.zrange(expiryIndex(), 0, now.getTime(), { byScore: true, offset: 0, count: 10 });
  for (const id of ids || []) {
    if (!SAFE_ID.test(String(id || ''))) { await redis.zrem(expiryIndex(), id); continue; }
    const leaseToken = randomBytes(32).toString('base64url');
    const leaseTokenHash = createHash('sha256').update(leaseToken).digest('hex');
    const leaseUntil = new Date(now.getTime() + Math.max(15, Math.min(120, Number(leaseSeconds) || 45)) * 1000);
    const response = await redis.eval(CLAIM_EXPIRED_SCRIPT, [sessionKey(id), expiryIndex()], [id, now.toISOString(), leaseTokenHash, leaseUntil.toISOString(), String(TTL_SECONDS), String(leaseUntil.getTime())]);
    if (!Array.isArray(response) || response[0] !== 'claimed') continue;
    const record = parse(response[1]);
    const payload = restore(record, dataEncryptionKey);
    return {
      id, tenantId: record.tenantId, leaseToken,
      browserSession: { ...publicSession(record, dataEncryptionKey, now), provider: payload.provider, providerSessionReference: payload.providerSessionReference },
      cleanupAttempt: Math.max(1, Number(record.cleanupAttempts) || 1),
    };
  }
  return null;
}

export async function releaseExpiredEmployerBrowserSessionCleanup({ redis, id, leaseToken, cleanupAttempt = 1, now = new Date() }) {
  if (!SAFE_ID.test(String(id || '')) || !leaseToken) return false;
  const leaseTokenHash = createHash('sha256').update(String(leaseToken)).digest('hex');
  const delaySeconds = Math.min(6 * 60 * 60, 30 * (2 ** Math.min(8, Math.max(0, Number(cleanupAttempt) - 1))));
  const response = await redis.eval(RELEASE_CLEANUP_SCRIPT, [sessionKey(id), expiryIndex()], [id, leaseTokenHash, String(TTL_SECONDS), String(now.getTime() + delaySeconds * 1000)]);
  return Array.isArray(response) && response[0] === 'released';
}

export async function deleteClaimedExpiredEmployerBrowserSession({ redis, id, tenantId, applicationSessionId, leaseToken }) {
  if (!SAFE_ID.test(String(id || '')) || !SAFE_ID.test(String(applicationSessionId || '')) || !/^[a-f0-9]{40}$/.test(String(tenantId || '')) || !leaseToken) return false;
  const leaseTokenHash = createHash('sha256').update(String(leaseToken)).digest('hex');
  const response = await redis.eval(DELETE_CLAIMED_SCRIPT, [sessionKey(id), applicationKey(tenantId, applicationSessionId), tenantIndex(tenantId), expiryIndex()], [id, tenantId, leaseTokenHash]);
  return Array.isArray(response) && ['deleted', 'missing'].includes(response[0]);
}
