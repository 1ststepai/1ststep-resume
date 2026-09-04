import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { jobAgentTenantId } from './job-agent-run-store.js';
import { readBoundedTenantIndexPage } from './tenant-index-pagination.js';

const BASE = '1ststep:application-receipt-task:v1';
const TTL_SECONDS = 365 * 24 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const SAFE_ID = /^[A-Za-z0-9:_-]{8,160}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const TERMINAL = new Set(['completed', 'needs-human', 'cancelled']);

const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) then return {'conflict'} end
if record.status ~= 'queued' and record.status ~= 'leased' then return {'not-claimable'} end
record.version = record.version + 1
record.status = 'leased'
record.attempt = record.attempt + 1
record.leaseTokenHash = ARGV[2]
record.leaseUntil = ARGV[3]
record.updatedAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
redis.call('ZADD', KEYS[2], ARGV[6], ARGV[7])
return {'claimed', cjson.encode(record)}
`;

const RESCHEDULE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) or record.status ~= 'leased' or record.leaseTokenHash ~= ARGV[2] then return {'lease-lost'} end
record.version = record.version + 1
record.status = 'queued'
record.lastOutcomeCode = ARGV[3]
record.nextAttemptAt = ARGV[4]
record.updatedAt = ARGV[5]
record.leaseTokenHash = ''
record.leaseUntil = ''
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[6])
redis.call('ZADD', KEYS[2], ARGV[7], ARGV[8])
return {'rescheduled', cjson.encode(record)}
`;

const FINISH_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) or record.status ~= 'leased' or record.leaseTokenHash ~= ARGV[2] then return {'lease-lost'} end
record.version = record.version + 1
record.status = ARGV[3]
record.lastOutcomeCode = ARGV[4]
record.completedAt = ARGV[5]
record.updatedAt = ARGV[5]
record.leaseTokenHash = ''
record.leaseUntil = ''
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[6])
redis.call('ZREM', KEYS[2], ARGV[7])
return {'finished', cjson.encode(record)}
`;

const CANCEL_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) then return {'changed'} end
if record.status ~= 'queued' and record.status ~= 'leased' then return {'not-cancellable'} end
record.version = record.version + 1
record.status = 'cancelled'
record.lastOutcomeCode = ARGV[2]
record.completedAt = ARGV[3]
record.updatedAt = ARGV[3]
record.leaseTokenHash = ''
record.leaseUntil = ''
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[4])
redis.call('ZREM', KEYS[2], ARGV[5])
return {'cancelled', cjson.encode(record)}
`;

function taskKey(id) { return `${BASE}:task:${id}`; }
function dueKey() { return `${BASE}:due`; }
function tenantIndex(tenantId) { return `${BASE}:tenant:${tenantId}:tasks`; }
function idemKey(tenantId, value) { return `${BASE}:tenant:${tenantId}:idem:${createHash('sha256').update(String(value || '')).digest('hex')}`; }
function parse(value) { return value ? typeof value === 'string' ? JSON.parse(value) : value : null; }
function encrypt(value, key, aad) { return encryptJsonEnvelope(value, { dataEncryptionKey: key, aad }); }
function decrypt(value, key, aad) { return decryptJsonEnvelope(value, { dataEncryptionKey: key, aad }); }

function payload(input = {}) {
  const value = {
    sessionId: String(input.sessionId || ''), documentVersion: String(input.documentVersion || ''),
    scopeHash: String(input.scopeHash || '').toLowerCase(), responseFingerprint: String(input.responseFingerprint || '').toLowerCase(),
    submittedAt: new Date(input.submittedAt || ''), expectedSessionVersion: Number(input.expectedSessionVersion), kind: 'page',
  };
  if (!SAFE_ID.test(value.sessionId) || !SAFE_ID.test(value.documentVersion) || !SHA256.test(value.scopeHash) || !SHA256.test(value.responseFingerprint)
    || !Number.isFinite(value.submittedAt.getTime()) || !Number.isSafeInteger(value.expectedSessionVersion) || value.expectedSessionVersion < 1) throw new Error('A safe exact-scope receipt task payload is required.');
  return { ...value, submittedAt: value.submittedAt.toISOString() };
}

function publicTask(record, dataEncryptionKey) {
  if (!record) return null;
  return {
    id: record.id, version: Number(record.version), status: record.status, attempt: Number(record.attempt),
    createdAt: record.createdAt, updatedAt: record.updatedAt, nextAttemptAt: record.nextAttemptAt,
    leaseUntil: record.leaseUntil || null, completedAt: record.completedAt || null, lastOutcomeCode: record.lastOutcomeCode || null,
    payload: decrypt(record.payloadEnvelope, dataEncryptionKey, taskKey(record.id)),
  };
}

function leaseMatches(record, leaseToken) {
  const actual = Buffer.from(createHash('sha256').update(String(leaseToken || '')).digest('hex'));
  const expected = Buffer.from(String(record?.leaseTokenHash || ''));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function readApplicationReceiptTaskQueueHealth({ redis, now = new Date(), staleAfterSeconds = 2 * 60 * 60 } = {}) {
  if (!redis) return { status: 'unknown', pending: null, overdue: null, staleAfterSeconds: null, contentFree: true, containsReceiptEvidence: false };
  const threshold = Math.max(300, Math.min(24 * 60 * 60, Number(staleAfterSeconds) || 2 * 60 * 60));
  const [pending, overdue] = await Promise.all([redis.zcard(dueKey()), redis.zcount(dueKey(), 0, now.getTime() - threshold * 1000)]);
  const queued = Math.max(0, Number(pending) || 0);
  const late = Math.max(0, Number(overdue) || 0);
  return { status: late > 0 ? 'attention-required' : queued > 0 ? 'pending' : 'idle', pending: queued, overdue: late, staleAfterSeconds: threshold, contentFree: true, containsReceiptEvidence: false };
}

export function prepareApplicationReceiptTaskRecord({ tenantId, dataEncryptionKey, sessionId, documentVersion, scopeHash, responseFingerprint, submittedAt, expectedSessionVersion, idempotencyKey, taskId = `receipt_task_${randomUUID()}`, now = new Date() }) {
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || '')) || !SAFE_ID.test(String(taskId || '')) || !SAFE_ID.test(String(idempotencyKey || ''))) throw new Error('Safe tenant, receipt task, and idempotency values are required.');
  const timestamp = now.toISOString();
  const record = {
    id: taskId, tenantId, version: 1, status: 'queued', attempt: 0, createdAt: timestamp, updatedAt: timestamp,
    nextAttemptAt: timestamp, leaseTokenHash: '', leaseUntil: '', completedAt: '', lastOutcomeCode: '',
    payloadEnvelope: encrypt(payload({ sessionId, documentVersion, scopeHash, responseFingerprint, submittedAt, expectedSessionVersion }), dataEncryptionKey, taskKey(taskId)),
  };
  return { taskId, record, keys: [taskKey(taskId), idemKey(tenantId, idempotencyKey), dueKey(), tenantIndex(tenantId)], args: [JSON.stringify(record), taskId, String(now.getTime()), String(TTL_SECONDS), String(IDEMPOTENCY_TTL_SECONDS)] };
}

export async function readApplicationReceiptTask({ redis, subject, partitionSecret, dataEncryptionKey, taskId }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const record = SAFE_ID.test(String(taskId || '')) ? parse(await redis.get(taskKey(taskId))) : null;
  return record?.tenantId === tenantId ? publicTask(record, dataEncryptionKey) : null;
}

export async function cancelApplicationReceiptTask({ redis, subject, partitionSecret, dataEncryptionKey, taskId, reasonCode = 'APPLICATION_SESSION_DELETED', now = new Date() }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const record = SAFE_ID.test(String(taskId || '')) ? parse(await redis.get(taskKey(taskId))) : null;
  if (record?.tenantId !== tenantId || !['queued', 'leased'].includes(record.status) || !/^[A-Z][A-Z0-9_]{2,79}$/.test(String(reasonCode || ''))) return null;
  const response = await redis.eval(CANCEL_SCRIPT, [taskKey(taskId), dueKey()], [String(record.version), reasonCode, now.toISOString(), String(TTL_SECONDS), taskId]);
  return Array.isArray(response) && response[0] === 'cancelled' ? publicTask(parse(response[1]), dataEncryptionKey) : null;
}

export async function deleteApplicationReceiptTask({ redis, subject, partitionSecret, taskId }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const record = SAFE_ID.test(String(taskId || '')) ? parse(await redis.get(taskKey(taskId))) : null;
  if (record?.tenantId !== tenantId || !TERMINAL.has(record.status)) return false;
  const deleted = Number(await redis.del(taskKey(taskId))) > 0;
  if (deleted) await Promise.all([redis.zrem(dueKey(), taskId), redis.zrem(tenantIndex(tenantId), taskId)]);
  return deleted;
}

export async function claimNextApplicationReceiptTask({ redis, dataEncryptionKey, now = new Date(), leaseSeconds = 45 }) {
  const ids = await redis.zrange(dueKey(), 0, now.getTime(), { byScore: true, offset: 0, count: 10 });
  for (const taskId of ids || []) {
    const key = taskKey(taskId);
    const record = parse(await redis.get(key));
    if (!record || TERMINAL.has(record.status)) { await redis.zrem(dueKey(), taskId); continue; }
    if (!['queued', 'leased'].includes(record.status) || (record.status === 'leased' && new Date(record.leaseUntil).getTime() > now.getTime())) continue;
    const leaseToken = randomBytes(32).toString('base64url');
    const leaseTokenHash = createHash('sha256').update(leaseToken).digest('hex');
    const leaseUntil = new Date(now.getTime() + Math.max(15, Math.min(120, leaseSeconds)) * 1000).toISOString();
    const response = await redis.eval(CLAIM_SCRIPT, [key, dueKey()], [String(record.version), leaseTokenHash, leaseUntil, now.toISOString(), String(TTL_SECONDS), String(new Date(leaseUntil).getTime()), taskId]);
    if (Array.isArray(response) && response[0] === 'claimed') {
      const claimed = parse(response[1]);
      return { task: publicTask(claimed, dataEncryptionKey), tenantId: claimed.tenantId, leaseToken };
    }
  }
  return null;
}

export async function rescheduleApplicationReceiptTask({ redis, taskId, leaseToken, dataEncryptionKey, reasonCode, nextAttemptAt, now = new Date() }) {
  const record = parse(await redis.get(taskKey(taskId)));
  const due = new Date(nextAttemptAt);
  if (!record || record.status !== 'leased' || !leaseMatches(record, leaseToken) || !/^[A-Z][A-Z0-9_]{2,79}$/.test(String(reasonCode || '')) || !Number.isFinite(due.getTime()) || due <= now) return null;
  const response = await redis.eval(RESCHEDULE_SCRIPT, [taskKey(taskId), dueKey()], [String(record.version), record.leaseTokenHash, reasonCode, due.toISOString(), now.toISOString(), String(TTL_SECONDS), String(due.getTime()), taskId]);
  return Array.isArray(response) && response[0] === 'rescheduled' ? publicTask(parse(response[1]), dataEncryptionKey) : null;
}

export async function finishApplicationReceiptTask({ redis, taskId, leaseToken, dataEncryptionKey, status, reasonCode, now = new Date() }) {
  if (!['completed', 'needs-human', 'cancelled'].includes(status) || !/^[A-Z][A-Z0-9_]{2,79}$/.test(String(reasonCode || ''))) throw new Error('A safe receipt-task completion is required.');
  const record = parse(await redis.get(taskKey(taskId)));
  if (!record || record.status !== 'leased' || !leaseMatches(record, leaseToken)) return null;
  const response = await redis.eval(FINISH_SCRIPT, [taskKey(taskId), dueKey()], [String(record.version), record.leaseTokenHash, status, reasonCode, now.toISOString(), String(TTL_SECONDS), taskId]);
  return Array.isArray(response) && response[0] === 'finished' ? publicTask(parse(response[1]), dataEncryptionKey) : null;
}

export async function listApplicationReceiptTaskSummaries({ redis, subject, partitionSecret, dataEncryptionKey, limit = 500, offset = 0, withPageInfo = false }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const page = await readBoundedTenantIndexPage({ redis, indexKey: tenantIndex(tenantId), offset, limit, defaultLimit: 500, includeTotal: withPageInfo });
  const result = [];
  for (const id of page.ids) {
    const record = parse(await redis.get(taskKey(id)));
    if (record?.tenantId !== tenantId) continue;
    const task = publicTask(record, dataEncryptionKey);
    result.push({ id: task.id, status: task.status, attempt: task.attempt, linkedApplicationSessionId: task.payload.sessionId, documentVersion: task.payload.documentVersion, createdAt: task.createdAt, updatedAt: task.updatedAt, completedAt: task.completedAt, outcomeCode: task.lastOutcomeCode, containsCandidateValues: false, containsReceiptEvidence: false });
  }
  return withPageInfo ? { items: result, scanned: page.scanned, offset: page.offset, limit: page.limit, total: page.total } : result;
}

export async function cancelPendingApplicationReceiptTasksForTenant({ redis, tenantId, dataEncryptionKey, now = new Date() }) {
  const ids = await redis.zrange(tenantIndex(tenantId), 0, -1);
  let cancelled = 0;
  for (const id of ids || []) {
    const record = parse(await redis.get(taskKey(id)));
    if (record?.tenantId !== tenantId || !['queued', 'leased'].includes(record.status)) continue;
    const response = await redis.eval(CANCEL_SCRIPT, [taskKey(id), dueKey()], [String(record.version), 'JOB_AGENT_AUTHORIZATION_REVOKED', now.toISOString(), String(TTL_SECONDS), id]);
    if (Array.isArray(response) && response[0] === 'cancelled') cancelled += 1;
  }
  return { cancelled };
}

export async function deleteAllApplicationReceiptTasks({ redis, subject, partitionSecret }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const index = tenantIndex(tenantId);
  const ids = await redis.zrange(index, 0, -1);
  let deleted = 0;
  for (const id of ids || []) {
    const record = parse(await redis.get(taskKey(id)));
    if (record?.tenantId !== tenantId) continue;
    deleted += Number(await redis.del(taskKey(id))) || 0;
    await Promise.all([redis.zrem(dueKey(), id), redis.zrem(index, id)]);
  }
  await redis.del(index);
  let cursor = '0';
  do {
    const response = await redis.scan(cursor, { match: `${BASE}:tenant:${tenantId}:idem:*`, count: 100 });
    cursor = String(response?.[0] ?? '0');
    for (const key of response?.[1] || []) await redis.del(key);
  } while (cursor !== '0');
  return { deleted };
}
