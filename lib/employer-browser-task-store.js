import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { jobAgentTenantId } from './job-agent-run-store.js';
import { readBoundedTenantIndexPage } from './tenant-index-pagination.js';

const BASE = '1ststep:employer-browser-task:v1';
const TTL_SECONDS = 30 * 24 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const SAFE_ID = /^[A-Za-z0-9:_-]{8,160}$/;
const SAFE_FIELD = /^[A-Za-z0-9:_-]{3,160}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const TERMINAL = new Set(['completed', 'waiting-for-user', 'outcome-unknown', 'cancelled']);

const CREATE_SCRIPT = `
local replay = redis.call('GET', KEYS[2])
if replay then return {'replayed', replay} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[5], 'NX')
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

const START_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) or record.status ~= 'leased' or record.leaseTokenHash ~= ARGV[2] then return {'lease-lost'} end
record.version = record.version + 1
record.status = 'executing'
record.startedAt = ARGV[3]
record.updatedAt = ARGV[3]
record.leaseUntil = ''
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[4])
redis.call('ZREM', KEYS[2], ARGV[5])
redis.call('ZADD', KEYS[3], ARGV[6], ARGV[5])
return {'started', cjson.encode(record)}
`;

const FINISH_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) or record.status ~= 'executing' or record.leaseTokenHash ~= ARGV[2] then return {'lease-lost'} end
record.version = record.version + 1
record.status = ARGV[3]
record.resultEnvelope = cjson.decode(ARGV[4])
record.completedAt = ARGV[5]
record.updatedAt = ARGV[5]
record.leaseTokenHash = ''
record.leaseUntil = ''
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[6])
redis.call('ZREM', KEYS[2], ARGV[7])
redis.call('ZREM', KEYS[3], ARGV[7])
return {'finished', cjson.encode(record)}
`;

const STALE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) or record.status ~= 'executing' or record.startedAt ~= ARGV[2] then return {'changed'} end
record.version = record.version + 1
record.status = 'outcome-unknown'
record.resultEnvelope = cjson.decode(ARGV[3])
record.completedAt = ARGV[4]
record.updatedAt = ARGV[4]
record.leaseTokenHash = ''
record.leaseUntil = ''
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
return {'unknown', cjson.encode(record)}
`;

const RECONCILE_COMPLETED_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) or record.status ~= 'outcome-unknown' then return {'changed'} end
record.version = record.version + 1
record.status = 'completed'
record.resultEnvelope = cjson.decode(ARGV[2])
record.completedAt = ARGV[3]
record.updatedAt = ARGV[3]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[4])
redis.call('ZREM', KEYS[2], ARGV[5])
return {'completed', cjson.encode(record)}
`;

const CANCEL_BEFORE_START_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) then return {'changed'} end
if record.status ~= 'queued' and record.status ~= 'leased' then return {'not-cancellable', record.status} end
record.version = record.version + 1
record.status = 'cancelled'
record.resultEnvelope = cjson.decode(ARGV[2])
record.completedAt = ARGV[3]
record.updatedAt = ARGV[3]
record.leaseTokenHash = ''
record.leaseUntil = ''
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[4])
redis.call('ZREM', KEYS[2], ARGV[5])
redis.call('ZREM', KEYS[3], ARGV[5])
return {'cancelled', cjson.encode(record)}
`;

function taskKey(id) { return `${BASE}:task:${id}`; }
function dueKey() { return `${BASE}:due`; }
function staleKey() { return `${BASE}:executing`; }
function tenantIndex(tenantId) { return `${BASE}:tenant:${tenantId}:tasks`; }
function idemKey(tenantId, value) { return `${BASE}:tenant:${tenantId}:idem:${createHash('sha256').update(String(value || '')).digest('hex')}`; }
function parse(value) { return value ? typeof value === 'string' ? JSON.parse(value) : value : null; }
function encrypt(value, dataEncryptionKey, aad) { return encryptJsonEnvelope(value, { dataEncryptionKey, aad }); }
function decrypt(value, dataEncryptionKey, aad) { return decryptJsonEnvelope(value, { dataEncryptionKey, aad }); }

function safePayload(input = {}) {
  const sessionId = String(input.sessionId || '').trim();
  const fieldSchemaHash = String(input.fieldSchemaHash || '').trim().toLowerCase();
  const stagedFieldKeys = [...new Set((Array.isArray(input.stagedFieldKeys) ? input.stagedFieldKeys : []).slice(0, 120).map(value => String(value || '').trim()).filter(Boolean))].sort();
  const stagedFields = Array.isArray(input.stagedFields) ? input.stagedFields.slice(0, 120).map(item => ({
    fieldRef: String(item?.fieldRef || '').trim(), fieldKey: String(item?.fieldKey || '').trim(), factId: String(item?.factId || '').trim(),
  })) : [];
  if (!SAFE_ID.test(sessionId) || !SHA256.test(fieldSchemaHash) || !stagedFieldKeys.length || stagedFieldKeys.some(key => !SAFE_FIELD.test(key))) throw new Error('A safe application session, schema hash, and staged-field scope are required.');
  if (stagedFields.length && (stagedFields.length !== stagedFieldKeys.length || stagedFields.some(item => !SAFE_FIELD.test(item.fieldRef) || !SAFE_FIELD.test(item.fieldKey) || !SAFE_ID.test(item.factId))
    || JSON.stringify([...new Set(stagedFields.map(item => item.fieldKey))].sort()) !== JSON.stringify(stagedFieldKeys))) throw new Error('Browser task field references must match the staged-field scope.');
  return { sessionId, fieldSchemaHash, stagedFieldKeys, stagedFields };
}

function safeResult(input = {}) {
  const code = String(input.code || '').trim();
  if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(code)) throw new Error('A safe browser-task outcome code is required.');
  return { code, transmittedFieldKeys: [...new Set((input.transmittedFieldKeys || []).map(value => String(value || '').trim()).filter(Boolean))].sort() };
}

function publicTask(record, dataEncryptionKey) {
  if (!record) return null;
  const aad = taskKey(record.id);
  return {
    id: record.id, status: record.status, version: Number(record.version), attempt: Number(record.attempt),
    createdAt: record.createdAt, updatedAt: record.updatedAt, leaseUntil: record.leaseUntil || null,
    startedAt: record.startedAt || null, completedAt: record.completedAt || null,
    payload: decrypt(record.payloadEnvelope, dataEncryptionKey, aad),
    result: record.resultEnvelope ? decrypt(record.resultEnvelope, dataEncryptionKey, aad) : null,
  };
}

function exportSummary(task) {
  return {
    id: task.id, status: task.status, attempt: task.attempt,
    linkedApplicationSessionId: task.payload.sessionId,
    fieldSchemaHash: task.payload.fieldSchemaHash,
    stagedFieldCount: task.payload.stagedFieldKeys.length,
    createdAt: task.createdAt, updatedAt: task.updatedAt,
    startedAt: task.startedAt, completedAt: task.completedAt,
    outcomeCode: task.result?.code || null,
    containsCandidateFieldValues: false,
  };
}

function leaseMatches(record, leaseToken) {
  const actual = Buffer.from(createHash('sha256').update(String(leaseToken || '')).digest('hex'));
  const expected = Buffer.from(String(record?.leaseTokenHash || ''));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createEmployerBrowserTask({ redis, subject, partitionSecret, dataEncryptionKey, sessionId, fieldSchemaHash, stagedFieldKeys, stagedFields, idempotencyKey, now = new Date() }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const prepared = prepareEmployerBrowserTaskRecord({ tenantId, dataEncryptionKey, sessionId, fieldSchemaHash, stagedFieldKeys, stagedFields, idempotencyKey, now });
  const result = await redis.eval(CREATE_SCRIPT, prepared.keys, prepared.args);
  if (!Array.isArray(result) || !['created', 'replayed'].includes(result[0])) throw new Error('Employer browser task could not be queued.');
  const stored = parse(await redis.get(taskKey(result[1])));
  if (!stored || stored.tenantId !== tenantId) throw new Error('Employer browser task could not be restored.');
  return { task: publicTask(stored, dataEncryptionKey), replayed: result[0] === 'replayed' };
}

export function prepareEmployerBrowserTaskRecord({ tenantId, dataEncryptionKey, sessionId, fieldSchemaHash, stagedFieldKeys, stagedFields, idempotencyKey, taskId = `browser_task_${randomUUID()}`, now = new Date() }) {
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || ''))) throw new Error('A valid tenant partition is required.');
  if (!SAFE_ID.test(String(idempotencyKey || '')) || !SAFE_ID.test(String(taskId || ''))) throw new Error('Safe task and Idempotency-Key values are required.');
  const payload = safePayload({ sessionId, fieldSchemaHash, stagedFieldKeys, stagedFields });
  const timestamp = now.toISOString();
  const key = taskKey(taskId);
  const record = { id: taskId, tenantId, version: 1, status: 'queued', attempt: 0, createdAt: timestamp, updatedAt: timestamp, leaseUntil: '', leaseTokenHash: '', startedAt: '', completedAt: '', payloadEnvelope: encrypt(payload, dataEncryptionKey, key), resultEnvelope: null };
  return {
    taskId, record,
    keys: [key, idemKey(tenantId, idempotencyKey), dueKey(), tenantIndex(tenantId)],
    args: [JSON.stringify(record), taskId, String(now.getTime()), String(TTL_SECONDS), String(IDEMPOTENCY_TTL_SECONDS)],
  };
}

export async function readEmployerBrowserTask({ redis, subject, partitionSecret, dataEncryptionKey, taskId }) {
  if (!SAFE_ID.test(String(taskId || ''))) return null;
  const record = parse(await redis.get(taskKey(taskId)));
  if (!record || record.tenantId !== jobAgentTenantId(subject, partitionSecret)) return null;
  return publicTask(record, dataEncryptionKey);
}

export async function listEmployerBrowserTaskSummaries({ redis, subject, partitionSecret, dataEncryptionKey, limit = 500, offset = 0, withPageInfo = false }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const page = await readBoundedTenantIndexPage({ redis, indexKey: tenantIndex(tenantId), offset, limit, defaultLimit: 500, includeTotal: withPageInfo });
  const summaries = [];
  for (const id of page.ids) {
    const record = parse(await redis.get(taskKey(id)));
    if (record?.tenantId === tenantId) summaries.push(exportSummary(publicTask(record, dataEncryptionKey)));
  }
  return withPageInfo ? { items: summaries, scanned: page.scanned, offset: page.offset, limit: page.limit, total: page.total } : summaries;
}

export async function deleteAllEmployerBrowserTasks({ redis, subject, partitionSecret }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const index = tenantIndex(tenantId);
  const ids = await redis.zrange(index, 0, -1);
  let deleted = 0;
  for (const id of ids || []) {
    const record = parse(await redis.get(taskKey(id)));
    if (record?.tenantId !== tenantId) continue;
    deleted += Number(await redis.del(taskKey(id))) || 0;
    await Promise.all([redis.zrem(dueKey(), id), redis.zrem(staleKey(), id), redis.zrem(index, id)]);
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

export async function claimEmployerBrowserTask({ redis, taskId, dataEncryptionKey, now = new Date(), leaseSeconds = 45 }) {
  if (!SAFE_ID.test(String(taskId || ''))) return null;
  const key = taskKey(taskId);
  const record = parse(await redis.get(key));
  if (!record || !['queued', 'leased'].includes(record.status)) return null;
  if (record.status === 'leased' && new Date(record.leaseUntil).getTime() > now.getTime()) return null;
  const leaseToken = randomBytes(32).toString('base64url');
  const leaseTokenHash = createHash('sha256').update(leaseToken).digest('hex');
  const leaseUntil = new Date(now.getTime() + Math.max(15, Math.min(120, leaseSeconds)) * 1000).toISOString();
  const result = await redis.eval(CLAIM_SCRIPT, [key, dueKey()], [String(record.version), leaseTokenHash, leaseUntil, now.toISOString(), String(TTL_SECONDS), String(new Date(leaseUntil).getTime()), taskId]);
  if (!Array.isArray(result) || result[0] !== 'claimed') return null;
  const claimed = parse(result[1]);
  return { task: publicTask(claimed, dataEncryptionKey), tenantId: claimed.tenantId, leaseToken };
}

export async function claimNextEmployerBrowserTask({ redis, dataEncryptionKey, now = new Date(), leaseSeconds = 45 }) {
  const ids = await redis.zrange(dueKey(), 0, now.getTime(), { byScore: true, offset: 0, count: 10 });
  for (const id of ids || []) {
    const claimed = await claimEmployerBrowserTask({ redis, taskId: id, dataEncryptionKey, now, leaseSeconds });
    if (claimed) return claimed;
    const record = parse(await redis.get(taskKey(id)));
    if (!record || TERMINAL.has(record.status) || record.status === 'executing') await redis.zrem(dueKey(), id);
  }
  return null;
}

export async function startEmployerBrowserTask({ redis, taskId, leaseToken, dataEncryptionKey, now = new Date(), outcomeTimeoutSeconds = 300 }) {
  const key = taskKey(taskId);
  const record = parse(await redis.get(key));
  if (!record || !leaseMatches(record, leaseToken) || record.status !== 'leased') return null;
  const staleAt = now.getTime() + Math.max(120, Math.min(900, outcomeTimeoutSeconds)) * 1000;
  const result = await redis.eval(START_SCRIPT, [key, dueKey(), staleKey()], [String(record.version), record.leaseTokenHash, now.toISOString(), String(TTL_SECONDS), taskId, String(staleAt)]);
  return Array.isArray(result) && result[0] === 'started' ? publicTask(parse(result[1]), dataEncryptionKey) : null;
}

export async function finishEmployerBrowserTask({ redis, taskId, leaseToken, dataEncryptionKey, status, result, now = new Date() }) {
  if (!TERMINAL.has(status) || status === 'cancelled') throw new Error('Unsupported browser-task completion status.');
  const key = taskKey(taskId);
  const record = parse(await redis.get(key));
  if (!record || !leaseMatches(record, leaseToken) || record.status !== 'executing') return null;
  const safe = safeResult(result);
  if (status === 'completed' && JSON.stringify(safe.transmittedFieldKeys) !== JSON.stringify(publicTask(record, dataEncryptionKey).payload.stagedFieldKeys)) throw new Error('Completed browser-task scope does not match its queued field scope.');
  const response = await redis.eval(FINISH_SCRIPT, [key, dueKey(), staleKey()], [String(record.version), record.leaseTokenHash, status, JSON.stringify(encrypt(safe, dataEncryptionKey, key)), now.toISOString(), String(TTL_SECONDS), taskId]);
  return Array.isArray(response) && response[0] === 'finished' ? publicTask(parse(response[1]), dataEncryptionKey) : null;
}

export async function cancelEmployerBrowserTaskBeforeStart({ redis, taskId, dataEncryptionKey, reasonCode = 'JOB_AGENT_AUTHORIZATION_REVOKED', now = new Date() }) {
  if (!SAFE_ID.test(String(taskId || ''))) return null;
  const key = taskKey(taskId);
  const record = parse(await redis.get(key));
  if (!record || !['queued', 'leased'].includes(record.status)) return null;
  const safe = safeResult({ code: reasonCode, transmittedFieldKeys: [] });
  const response = await redis.eval(CANCEL_BEFORE_START_SCRIPT, [key, dueKey(), staleKey()], [
    String(record.version), JSON.stringify(encrypt(safe, dataEncryptionKey, key)), now.toISOString(), String(TTL_SECONDS), taskId,
  ]);
  return Array.isArray(response) && response[0] === 'cancelled' ? publicTask(parse(response[1]), dataEncryptionKey) : null;
}

export async function cancelPendingEmployerBrowserTasksForTenant({ redis, tenantId, dataEncryptionKey, now = new Date() }) {
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || ''))) throw new Error('A valid tenant partition is required.');
  const ids = await redis.zrange(tenantIndex(tenantId), 0, -1);
  let cancelled = 0;
  let executing = 0;
  const cancelledTaskIds = [];
  const executingTaskIds = [];
  for (const taskId of ids || []) {
    const record = parse(await redis.get(taskKey(taskId)));
    if (!record || record.tenantId !== tenantId) continue;
    if (record.status === 'executing') { executing += 1; executingTaskIds.push(taskId); continue; }
    if (!['queued', 'leased'].includes(record.status)) continue;
    if (await cancelEmployerBrowserTaskBeforeStart({ redis, taskId, dataEncryptionKey, now })) {
      cancelled += 1;
      cancelledTaskIds.push(taskId);
    }
    else {
      const changed = parse(await redis.get(taskKey(taskId)));
      if (changed?.tenantId === tenantId && changed.status === 'executing') {
        executing += 1;
        executingTaskIds.push(taskId);
      }
    }
  }
  return { cancelled, executing, cancelledTaskIds, executingTaskIds, reconciliationRequired: executing > 0 };
}

export async function markNextStaleEmployerBrowserTaskUnknown({ redis, dataEncryptionKey, now = new Date() }) {
  const ids = await redis.zrange(staleKey(), 0, now.getTime(), { byScore: true, offset: 0, count: 10 });
  for (const taskId of ids || []) {
    const key = taskKey(taskId);
    const record = parse(await redis.get(key));
    if (!record) { await redis.zrem(staleKey(), taskId); continue; }
    if (record.status === 'outcome-unknown') return { task: publicTask(record, dataEncryptionKey), tenantId: record.tenantId };
    if (record.status !== 'executing') { await redis.zrem(staleKey(), taskId); continue; }
    const safe = safeResult({ code: 'EMPLOYER_WORKER_OUTCOME_UNKNOWN', transmittedFieldKeys: [] });
    const response = await redis.eval(STALE_SCRIPT, [key, staleKey()], [String(record.version), record.startedAt, JSON.stringify(encrypt(safe, dataEncryptionKey, key)), now.toISOString(), String(TTL_SECONDS), taskId]);
    if (Array.isArray(response) && response[0] === 'unknown') {
      const updated = parse(response[1]);
      return { task: publicTask(updated, dataEncryptionKey), tenantId: updated.tenantId };
    }
  }
  return null;
}

export async function acknowledgeEmployerBrowserTaskReconciliation({ redis, taskId }) {
  if (!SAFE_ID.test(String(taskId || ''))) return false;
  await redis.zrem(staleKey(), taskId);
  return true;
}

export async function reconcileEmployerBrowserTaskCompleted({ redis, taskId, dataEncryptionKey, transmittedFieldKeys, now = new Date() }) {
  if (!SAFE_ID.test(String(taskId || ''))) return null;
  const key = taskKey(taskId);
  const record = parse(await redis.get(key));
  if (!record || record.status !== 'outcome-unknown') return null;
  const task = publicTask(record, dataEncryptionKey);
  const safe = safeResult({ code: 'FILLED_WITHOUT_SUBMIT', transmittedFieldKeys });
  if (JSON.stringify(safe.transmittedFieldKeys) !== JSON.stringify(task.payload.stagedFieldKeys)) throw new Error('Reconciled browser-task scope does not match its queued field scope.');
  const response = await redis.eval(RECONCILE_COMPLETED_SCRIPT, [key, staleKey()], [String(record.version), JSON.stringify(encrypt(safe, dataEncryptionKey, key)), now.toISOString(), String(TTL_SECONDS), taskId]);
  return Array.isArray(response) && response[0] === 'completed' ? publicTask(parse(response[1]), dataEncryptionKey) : null;
}
