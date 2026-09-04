import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { jobAgentTenantId } from './job-agent-run-store.js';

const BASE = '1ststep:account-export:v1';
const TTL_SECONDS = 24 * 60 * 60;
const LEASE_SECONDS = 120;
const MAX_ATTEMPTS = 4;
const MAX_EXPORT_BYTES = 20 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9_-]{8,100}$/;

const CREATE_SCRIPT = `
local active = redis.call('GET', KEYS[2])
if active then return {'replayed', active} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4])
redis.call('ZADD', KEYS[3], ARGV[3], ARGV[2])
redis.call('ZADD', KEYS[4], ARGV[3], ARGV[2])
redis.call('EXPIRE', KEYS[4], ARGV[4])
return {'created', ARGV[2]}
`;

const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) then return {'conflict'} end
if record.status ~= 'queued' and record.status ~= 'processing' then return {'not_claimable'} end
record.version = record.version + 1
record.status = 'processing'
record.attempt = record.attempt + 1
record.leaseTokenHash = ARGV[2]
record.leaseUntil = ARGV[3]
record.updatedAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
redis.call('ZADD', KEYS[2], ARGV[6], ARGV[7])
return {'claimed', cjson.encode(record)}
`;

const COMPLETE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) or record.status ~= 'processing' or record.leaseTokenHash ~= ARGV[2] then return {'lease_lost'} end
record.version = record.version + 1
record.status = 'ready'
record.updatedAt = ARGV[3]
record.completedAt = ARGV[3]
record.expiresAt = ARGV[4]
record.result = cjson.decode(ARGV[5])
record.leaseTokenHash = ''
record.leaseUntil = ''
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[6])
redis.call('ZREM', KEYS[2], ARGV[7])
redis.call('DEL', KEYS[3])
return {'completed', cjson.encode(record)}
`;

const FAIL_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) or record.status ~= 'processing' or record.leaseTokenHash ~= ARGV[2] then return {'lease_lost'} end
record.version = record.version + 1
record.status = ARGV[3]
record.updatedAt = ARGV[4]
record.lastErrorCode = ARGV[5]
record.leaseTokenHash = ''
record.leaseUntil = ''
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[6])
redis.call('ZREM', KEYS[2], ARGV[7])
if ARGV[8] == 'retry' then redis.call('ZADD', KEYS[2], ARGV[9], ARGV[7]) end
if ARGV[8] ~= 'retry' then redis.call('DEL', KEYS[3]) end
return {'failed', cjson.encode(record)}
`;

function taskKey(id) { return `${BASE}:task:${id}`; }
function dueKey() { return `${BASE}:due`; }
function tenantIndex(tenantId) { return `${BASE}:tenant:${tenantId}:tasks`; }
function activeKey(tenantId) { return `${BASE}:tenant:${tenantId}:active`; }
function objectDueKey() { return `${BASE}:objects:due`; }
function tenantObjectIndex(tenantId) { return `${BASE}:tenant:${tenantId}:objects`; }
function parse(value) { return value ? (typeof value === 'string' ? JSON.parse(value) : value) : null; }
function digest(value) { return createHash('sha256').update(String(value)).digest('hex'); }
function objectPath(tenantId, taskId) { return `job-agent-account-exports/v1/${tenantId}/${digest(taskId)}.json.enc`; }
function tenantFromObjectPath(pathname) {
  const match = /^job-agent-account-exports\/v1\/([a-f0-9]{40})\/[a-f0-9]{64}\.json\.enc$/.exec(String(pathname || ''));
  if (!match) throw new Error('ACCOUNT_EXPORT_OBJECT_REFERENCE_INVALID');
  return match[1];
}
function aad(tenantId, taskId) { return `account-export:v1:${tenantId}:${taskId}`; }
function validTenant(value) { return /^[a-f0-9]{40}$/.test(String(value || '')); }
function publicTask(record) {
  return record ? { id: record.id, status: record.status, attempt: Number(record.attempt), maxAttempts: MAX_ATTEMPTS, createdAt: record.createdAt, updatedAt: record.updatedAt, completedAt: record.completedAt || null, expiresAt: record.expiresAt || null, lastErrorCode: record.lastErrorCode || null, ready: record.status === 'ready' } : null;
}
function leaseMatches(record, token) {
  const left = Buffer.from(createHash('sha256').update(String(token || '')).digest('hex'));
  const right = Buffer.from(String(record?.leaseTokenHash || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createAccountDataExportTask({ redis, subject, partitionSecret, dataEncryptionKey, now = new Date() }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const taskId = `account_export_${randomUUID()}`;
  const timestamp = now.toISOString();
  const record = { id: taskId, tenantId, version: 1, status: 'queued', attempt: 0, createdAt: timestamp, updatedAt: timestamp, completedAt: '', expiresAt: '', leaseUntil: '', leaseTokenHash: '', lastErrorCode: '', subjectEnvelope: encryptJsonEnvelope({ subject }, { dataEncryptionKey, aad: taskKey(taskId) }), result: null };
  const response = await redis.eval(CREATE_SCRIPT, [taskKey(taskId), activeKey(tenantId), dueKey(), tenantIndex(tenantId)], [JSON.stringify(record), taskId, String(now.getTime()), String(TTL_SECONDS)]);
  const id = Array.isArray(response) ? String(response[1] || '') : '';
  const stored = SAFE_ID.test(id) ? parse(await redis.get(taskKey(id))) : null;
  if (!stored || stored.tenantId !== tenantId) throw new Error('ACCOUNT_EXPORT_CREATE_FAILED');
  return { task: publicTask(stored), replayed: response[0] === 'replayed' };
}

export async function readAccountDataExportTask({ redis, subject, partitionSecret, taskId }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const record = SAFE_ID.test(String(taskId || '')) ? parse(await redis.get(taskKey(taskId))) : null;
  return record?.tenantId === tenantId ? publicTask(record) : null;
}

export async function readAccountDataExportQueueHealth({ redis, now = new Date(), overdueAfterSeconds = 5 * 60 } = {}) {
  if (!redis || typeof redis.zcard !== 'function' || typeof redis.zcount !== 'function') {
    return { status: 'unknown', pending: null, overdue: null, overdueAfterSeconds: null, contentFree: true, containsCandidateValues: false, containsAccountIdentifiers: false };
  }
  const threshold = Math.max(60, Math.min(60 * 60, Number(overdueAfterSeconds) || 5 * 60));
  const [pendingValue, overdueValue] = await Promise.all([
    redis.zcard(dueKey()), redis.zcount(dueKey(), 0, now.getTime() - threshold * 1000),
  ]);
  const pending = Math.max(0, Number(pendingValue) || 0);
  const overdue = Math.max(0, Number(overdueValue) || 0);
  return {
    status: overdue > 0 ? 'attention-required' : pending > 0 ? 'pending' : 'idle', pending, overdue,
    overdueAfterSeconds: threshold, contentFree: true, containsCandidateValues: false, containsAccountIdentifiers: false,
  };
}

export async function claimNextAccountDataExportTask({ redis, dataEncryptionKey, now = new Date() }) {
  const ids = await redis.zrange(dueKey(), 0, now.getTime(), { byScore: true, offset: 0, count: 10 });
  for (const id of ids || []) {
    const record = parse(await redis.get(taskKey(id)));
    if (!record || !validTenant(record.tenantId) || ['ready', 'failed'].includes(record.status)) { await redis.zrem(dueKey(), id); continue; }
    if (record.status === 'processing' && new Date(record.leaseUntil).getTime() > now.getTime()) continue;
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const leaseUntil = new Date(now.getTime() + LEASE_SECONDS * 1000);
    const response = await redis.eval(CLAIM_SCRIPT, [taskKey(id), dueKey()], [String(record.version), tokenHash, leaseUntil.toISOString(), now.toISOString(), String(TTL_SECONDS), String(leaseUntil.getTime()), id]);
    if (Array.isArray(response) && response[0] === 'claimed') {
      const claimed = parse(response[1]);
      const privatePayload = decryptJsonEnvelope(claimed.subjectEnvelope, { dataEncryptionKey, aad: taskKey(id) });
      return { task: publicTask(claimed), tenantId: claimed.tenantId, subject: privatePayload.subject, leaseToken: token };
    }
  }
  return null;
}

export async function processNextAccountDataExportTask({ config, buildExport, now = new Date() }) {
  const claimed = await claimNextAccountDataExportTask({ redis: config.redis, dataEncryptionKey: config.dataEncryptionKey, now });
  if (!claimed) return { status: 'idle' };
  const { task, tenantId, subject, leaseToken } = claimed;
  let providerCallStarted = false;
  let storedPath = '';
  try {
    const payload = await buildExport({ config, subject, now });
    const json = JSON.stringify(payload, null, 2);
    if (Buffer.byteLength(json) > MAX_EXPORT_BYTES) throw Object.assign(new Error('Account export is too large for self-service delivery.'), { code: 'ACCOUNT_EXPORT_TOO_LARGE' });
    const storage = config.objectStorage;
    if (!storage?.ready || storage.mode !== 'vercel-blob-private') throw Object.assign(new Error('Private export storage is unavailable.'), { code: 'ACCOUNT_EXPORT_STORAGE_NOT_CONFIGURED' });
    const pathname = objectPath(tenantId, task.id);
    const envelope = encryptJsonEnvelope({ schemaVersion: 1, json }, { dataEncryptionKey: config.dataEncryptionKey, aad: aad(tenantId, task.id) });
    providerCallStarted = true;
    const result = await storage.blobClient.put(pathname, Buffer.from(JSON.stringify(envelope)), { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/octet-stream', token: storage.token });
    storedPath = result.pathname || pathname;
    if (storedPath !== pathname) throw new Error('ACCOUNT_EXPORT_OBJECT_REFERENCE_INVALID');
    const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000);
    await Promise.all([
      config.redis.zadd(objectDueKey(), expiresAt.getTime(), pathname),
      config.redis.zadd(tenantObjectIndex(tenantId), expiresAt.getTime(), pathname),
    ]);
    const record = parse(await config.redis.get(taskKey(task.id)));
    if (!record || !leaseMatches(record, leaseToken)) throw new Error('ACCOUNT_EXPORT_LEASE_LOST');
    const completed = await config.redis.eval(COMPLETE_SCRIPT, [taskKey(task.id), dueKey(), activeKey(tenantId)], [String(record.version), record.leaseTokenHash, now.toISOString(), expiresAt.toISOString(), JSON.stringify({ pathname, bytes: Buffer.byteLength(json), sha256: digest(json) }), String(TTL_SECONDS), task.id]);
    if (!Array.isArray(completed) || completed[0] !== 'completed') throw new Error('ACCOUNT_EXPORT_LEASE_LOST');
    return { status: 'ready', taskId: task.id, providerCallStarted };
  } catch (error) {
    if (storedPath) {
      await config.objectStorage?.blobClient?.del(storedPath, { token: config.objectStorage.token }).catch(() => {});
      await Promise.all([config.redis.zrem(objectDueKey(), storedPath), config.redis.zrem(tenantObjectIndex(tenantId), storedPath)]).catch(() => {});
    }
    const record = parse(await config.redis.get(taskKey(task.id)));
    const retry = record && leaseMatches(record, leaseToken) && Number(record.attempt) < MAX_ATTEMPTS && !['ACCOUNT_EXPORT_TOO_LARGE', 'ACCOUNT_EXPORT_COLLECTION_INCOMPLETE'].includes(error?.code);
    if (record && leaseMatches(record, leaseToken)) await config.redis.eval(FAIL_SCRIPT, [taskKey(task.id), dueKey(), activeKey(tenantId)], [String(record.version), record.leaseTokenHash, retry ? 'queued' : 'failed', now.toISOString(), String(error?.code || 'ACCOUNT_EXPORT_FAILED').slice(0, 80), String(TTL_SECONDS), task.id, retry ? 'retry' : 'stop', String(now.getTime() + 60_000)]);
    return { status: retry ? 'retry' : 'failed', taskId: task.id, code: error?.code || 'ACCOUNT_EXPORT_FAILED' };
  }
}

async function streamBuffer(stream) { return Buffer.from(await new Response(stream).arrayBuffer()); }

export async function readAccountDataExportDownload({ redis, subject, partitionSecret, dataEncryptionKey, objectStorage, taskId }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const record = SAFE_ID.test(String(taskId || '')) ? parse(await redis.get(taskKey(taskId))) : null;
  if (record?.tenantId !== tenantId || record.status !== 'ready' || !record.result) return null;
  const expected = objectPath(tenantId, taskId);
  if (record.result.pathname !== expected || !objectStorage?.ready || objectStorage.mode !== 'vercel-blob-private') throw new Error('ACCOUNT_EXPORT_STORAGE_NOT_CONFIGURED');
  const result = await objectStorage.blobClient.get(expected, { access: 'private', token: objectStorage.token, useCache: false });
  if (!result || result.statusCode !== 200) throw new Error('ACCOUNT_EXPORT_NOT_FOUND');
  const envelope = parse((await streamBuffer(result.stream)).toString('utf8'));
  const payload = decryptJsonEnvelope(envelope, { dataEncryptionKey, aad: aad(tenantId, taskId) });
  if (payload?.schemaVersion !== 1 || digest(payload.json) !== record.result.sha256) throw new Error('ACCOUNT_EXPORT_INTEGRITY_FAILED');
  return payload.json;
}

export async function processExpiredAccountDataExports({ redis, objectStorage, now = new Date(), limit = 10 }) {
  if (!redis || !objectStorage?.ready || objectStorage.mode !== 'vercel-blob-private') return { status: 'not-configured', deleted: 0 };
  const paths = await redis.zrange(objectDueKey(), 0, now.getTime(), { byScore: true, offset: 0, count: Math.max(1, Math.min(50, Number(limit) || 10)) }) || [];
  let deleted = 0;
  for (const pathname of paths) {
    const tenantId = tenantFromObjectPath(pathname);
    await objectStorage.blobClient.del(pathname, { token: objectStorage.token });
    await Promise.all([redis.zrem(objectDueKey(), pathname), redis.zrem(tenantObjectIndex(tenantId), pathname)]);
    deleted += 1;
  }
  return { status: 'completed', deleted };
}

export async function deleteAllAccountDataExportTasks({ redis, subject, partitionSecret, objectStorage }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const index = tenantIndex(tenantId);
  const ids = await redis.zrange(index, 0, -1) || [];
  const paths = [...(await redis.zrange(tenantObjectIndex(tenantId), 0, -1) || [])];
  for (const id of ids) {
    const record = parse(await redis.get(taskKey(id)));
    if (record?.tenantId !== tenantId) continue;
    if (record.result?.pathname === objectPath(tenantId, id)) paths.push(record.result.pathname);
    await redis.del(taskKey(id)); await redis.zrem(dueKey(), id);
  }
  if (objectStorage?.ready && objectStorage.mode === 'vercel-blob-private') {
    if (typeof objectStorage.blobClient?.list !== 'function') throw new Error('ACCOUNT_EXPORT_STORAGE_LIST_NOT_CONFIGURED');
    const prefix = `job-agent-account-exports/v1/${tenantId}/`;
    let cursor;
    let pages = 0;
    do {
      const page = await objectStorage.blobClient.list({ prefix, cursor, limit: 1000, mode: 'expanded', token: objectStorage.token });
      if (!page || !Array.isArray(page.blobs) || ++pages > 20) throw new Error('ACCOUNT_EXPORT_STORAGE_LIST_INVALID');
      for (const blob of page.blobs) {
        const pathname = String(blob?.pathname || '');
        if (!pathname.startsWith(prefix) || !/\.json\.enc$/.test(pathname)) throw new Error('ACCOUNT_EXPORT_STORAGE_TENANT_BOUNDARY_INVALID');
        paths.push(pathname);
      }
      if (page.hasMore === true && !page.cursor) throw new Error('ACCOUNT_EXPORT_STORAGE_CURSOR_INVALID');
      cursor = page.hasMore === true ? page.cursor : undefined;
    } while (cursor);
    const uniquePaths = [...new Set(paths)];
    if (uniquePaths.length) await objectStorage.blobClient.del(uniquePaths, { token: objectStorage.token });
    paths.length = 0; paths.push(...uniquePaths);
  }
  if (paths.length) await Promise.all(paths.flatMap(pathname => [redis.zrem(objectDueKey(), pathname), redis.zrem(tenantObjectIndex(tenantId), pathname)]));
  await Promise.all([redis.del(index), redis.del(activeKey(tenantId)), redis.del(tenantObjectIndex(tenantId))]);
  return { deleted: ids.length, deletedObjects: paths.length };
}
