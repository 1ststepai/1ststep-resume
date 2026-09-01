import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { jobAgentTenantId } from './job-agent-run-store.js';
import { readBoundedTenantIndexPage } from './tenant-index-pagination.js';

const BASE = '1ststep:application-submission-task:v1';
const TTL_SECONDS = 365 * 24 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const SAFE_ID = /^[A-Za-z0-9:_-]{8,160}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const TERMINAL = new Set(['completed', 'outcome-unknown', 'cancelled']);

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
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
return {'unknown', cjson.encode(record)}
`;

const CANCEL_SCRIPT = `
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
  const payload = {
    sessionId: String(input.sessionId || '').trim(), scopeHash: String(input.scopeHash || '').toLowerCase(),
    documentVersion: String(input.documentVersion || '').trim(), fieldSchemaHash: String(input.fieldSchemaHash || '').toLowerCase(),
  };
  if (!SAFE_ID.test(payload.sessionId) || !SAFE_ID.test(payload.documentVersion) || !SHA256.test(payload.scopeHash) || !SHA256.test(payload.fieldSchemaHash)) throw new Error('A safe exact-scope submission task payload is required.');
  return payload;
}

function safeResult(input = {}) {
  const code = String(input.code || '').trim();
  if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(code)) throw new Error('A safe submission-task outcome code is required.');
  const result = { code, submittedAt: null, responseFingerprint: null };
  if (input.submittedAt !== undefined && input.submittedAt !== null) {
    const submittedAt = new Date(input.submittedAt);
    if (!Number.isFinite(submittedAt.getTime())) throw new Error('Submission-task timestamp is invalid.');
    result.submittedAt = submittedAt.toISOString();
  }
  if (input.responseFingerprint !== undefined && input.responseFingerprint !== null) {
    if (!SHA256.test(String(input.responseFingerprint))) throw new Error('Submission-task response fingerprint is invalid.');
    result.responseFingerprint = String(input.responseFingerprint).toLowerCase();
  }
  if ((result.submittedAt === null) !== (result.responseFingerprint === null)) throw new Error('Submission-task minimized attempt evidence must be complete.');
  return result;
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
    id: task.id, status: task.status, attempt: task.attempt, linkedApplicationSessionId: task.payload.sessionId,
    documentVersion: task.payload.documentVersion, scopeHash: task.payload.scopeHash, fieldSchemaHash: task.payload.fieldSchemaHash,
    createdAt: task.createdAt, updatedAt: task.updatedAt, startedAt: task.startedAt, completedAt: task.completedAt,
    outcomeCode: task.result?.code || null, containsCandidateFieldValues: false, containsReceiptEvidence: false,
  };
}

function leaseMatches(record, leaseToken) {
  const actual = Buffer.from(createHash('sha256').update(String(leaseToken || '')).digest('hex'));
  const expected = Buffer.from(String(record?.leaseTokenHash || ''));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function readApplicationSubmissionTaskQueueHealth({ redis, now = new Date(), staleAfterSeconds = 2 * 60 * 60 } = {}) {
  if (!redis) return { status: 'unknown', pending: null, overdue: null, reconciliationPending: null, reconciliationDue: null, staleAfterSeconds: null, contentFree: true };
  const threshold = Math.max(300, Math.min(24 * 60 * 60, Number(staleAfterSeconds) || 2 * 60 * 60));
  const cutoff = now.getTime() - threshold * 1000;
  const [pending, overdue, reconciliationPending, reconciliationDue] = await Promise.all([
    redis.zcard(dueKey()), redis.zcount(dueKey(), 0, cutoff), redis.zcard(staleKey()), redis.zcount(staleKey(), 0, now.getTime()),
  ]);
  const values = [pending, overdue, reconciliationPending, reconciliationDue].map(value => Math.max(0, Number(value) || 0));
  const status = values[1] > 0 || values[3] > 0 ? 'attention-required' : values[0] > 0 || values[2] > 0 ? 'pending' : 'idle';
  return { status, pending: values[0], overdue: values[1], reconciliationPending: values[2], reconciliationDue: values[3], staleAfterSeconds: threshold, contentFree: true };
}

export function prepareApplicationSubmissionTaskRecord({ tenantId, dataEncryptionKey, sessionId, scopeHash, documentVersion, fieldSchemaHash, idempotencyKey, taskId = `submission_task_${randomUUID()}`, now = new Date() }) {
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || '')) || !SAFE_ID.test(String(idempotencyKey || '')) || !SAFE_ID.test(String(taskId || ''))) throw new Error('Safe tenant, task, and Idempotency-Key values are required.');
  const payload = safePayload({ sessionId, scopeHash, documentVersion, fieldSchemaHash });
  const timestamp = now.toISOString();
  const key = taskKey(taskId);
  const record = { id: taskId, tenantId, version: 1, status: 'queued', attempt: 0, createdAt: timestamp, updatedAt: timestamp, leaseUntil: '', leaseTokenHash: '', startedAt: '', completedAt: '', payloadEnvelope: encrypt(payload, dataEncryptionKey, key), resultEnvelope: null };
  return { taskId, record, keys: [key, idemKey(tenantId, idempotencyKey), dueKey(), tenantIndex(tenantId)], args: [JSON.stringify(record), taskId, String(now.getTime()), String(TTL_SECONDS), String(IDEMPOTENCY_TTL_SECONDS)] };
}

export async function createApplicationSubmissionTask({ redis, subject, partitionSecret, dataEncryptionKey, sessionId, scopeHash, documentVersion, fieldSchemaHash, idempotencyKey, now = new Date() }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const prepared = prepareApplicationSubmissionTaskRecord({ tenantId, dataEncryptionKey, sessionId, scopeHash, documentVersion, fieldSchemaHash, idempotencyKey, now });
  const response = await redis.eval(CREATE_SCRIPT, prepared.keys, prepared.args);
  if (!Array.isArray(response) || !['created', 'replayed'].includes(response[0])) throw new Error('Application submission task could not be queued.');
  const stored = parse(await redis.get(taskKey(response[1])));
  if (!stored || stored.tenantId !== tenantId) throw new Error('Application submission task could not be restored.');
  return { task: publicTask(stored, dataEncryptionKey), replayed: response[0] === 'replayed' };
}

export async function readApplicationSubmissionTask({ redis, subject, partitionSecret, dataEncryptionKey, taskId }) {
  if (!SAFE_ID.test(String(taskId || ''))) return null;
  const record = parse(await redis.get(taskKey(taskId)));
  if (!record || record.tenantId !== jobAgentTenantId(subject, partitionSecret)) return null;
  return publicTask(record, dataEncryptionKey);
}

export async function listApplicationSubmissionTaskSummaries({ redis, subject, partitionSecret, dataEncryptionKey, limit = 500, offset = 0, withPageInfo = false }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const page = await readBoundedTenantIndexPage({ redis, indexKey: tenantIndex(tenantId), offset, limit, defaultLimit: 500, includeTotal: withPageInfo });
  const summaries = [];
  for (const id of page.ids) {
    const record = parse(await redis.get(taskKey(id)));
    if (record?.tenantId === tenantId) summaries.push(exportSummary(publicTask(record, dataEncryptionKey)));
  }
  return withPageInfo ? { items: summaries, scanned: page.scanned, offset: page.offset, limit: page.limit, total: page.total } : summaries;
}

export async function deleteAllApplicationSubmissionTasks({ redis, subject, partitionSecret }) {
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

export async function deleteApplicationSubmissionTask({ redis, subject, partitionSecret, dataEncryptionKey, taskId, now = new Date() }) {
  if (!SAFE_ID.test(String(taskId || ''))) return false;
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const key = taskKey(taskId);
  let record = parse(await redis.get(key));
  if (!record || record.tenantId !== tenantId) return false;
  if (record.status === 'executing') {
    const error = new Error('A started submission task must be reconciled before deletion.');
    error.code = 'SUBMISSION_TASK_RECONCILIATION_REQUIRED';
    throw error;
  }
  if (['queued', 'leased'].includes(record.status)) {
    await cancelApplicationSubmissionTaskBeforeStart({ redis, taskId, dataEncryptionKey, reasonCode: 'APPLICATION_SESSION_DELETED', now });
    record = parse(await redis.get(key));
    if (record?.status === 'executing') {
      const error = new Error('A started submission task must be reconciled before deletion.');
      error.code = 'SUBMISSION_TASK_RECONCILIATION_REQUIRED';
      throw error;
    }
  }
  await Promise.all([redis.del(key), redis.zrem(dueKey(), taskId), redis.zrem(staleKey(), taskId), redis.zrem(tenantIndex(tenantId), taskId)]);
  return true;
}

export async function claimNextApplicationSubmissionTask({ redis, dataEncryptionKey, now = new Date(), leaseSeconds = 45 }) {
  const ids = await redis.zrange(dueKey(), 0, now.getTime(), { byScore: true, offset: 0, count: 10 });
  for (const taskId of ids || []) {
    const key = taskKey(taskId);
    const record = parse(await redis.get(key));
    if (!record || TERMINAL.has(record.status) || record.status === 'executing') { await redis.zrem(dueKey(), taskId); continue; }
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

export async function startApplicationSubmissionTask({ redis, taskId, leaseToken, dataEncryptionKey, now = new Date(), outcomeTimeoutSeconds = 180 }) {
  const key = taskKey(taskId);
  const record = parse(await redis.get(key));
  if (!record || record.status !== 'leased' || !leaseMatches(record, leaseToken)) return null;
  const staleAt = now.getTime() + Math.max(60, Math.min(600, outcomeTimeoutSeconds)) * 1000;
  const response = await redis.eval(START_SCRIPT, [key, dueKey(), staleKey()], [String(record.version), record.leaseTokenHash, now.toISOString(), String(TTL_SECONDS), taskId, String(staleAt)]);
  return Array.isArray(response) && response[0] === 'started' ? publicTask(parse(response[1]), dataEncryptionKey) : null;
}

export async function finishApplicationSubmissionTask({ redis, taskId, leaseToken, dataEncryptionKey, status, result, now = new Date() }) {
  if (!['completed', 'outcome-unknown', 'cancelled'].includes(status)) throw new Error('Unsupported submission-task completion status.');
  const key = taskKey(taskId);
  const record = parse(await redis.get(key));
  if (!record || record.status !== 'executing' || !leaseMatches(record, leaseToken)) return null;
  const safe = safeResult(result);
  if (status === 'completed' && (!safe.submittedAt || !safe.responseFingerprint)) throw new Error('Completed submission tasks require minimized attempt evidence.');
  if (status === 'outcome-unknown' && (safe.submittedAt || safe.responseFingerprint)) throw new Error('Unknown submission tasks cannot claim attempt evidence.');
  if (status === 'cancelled' && (safe.submittedAt || safe.responseFingerprint)) throw new Error('Cancelled submission tasks cannot claim attempt evidence.');
  const response = await redis.eval(FINISH_SCRIPT, [key, dueKey(), staleKey()], [String(record.version), record.leaseTokenHash, status, JSON.stringify(encrypt(safe, dataEncryptionKey, key)), now.toISOString(), String(TTL_SECONDS), taskId]);
  return Array.isArray(response) && response[0] === 'finished' ? publicTask(parse(response[1]), dataEncryptionKey) : null;
}

export async function cancelApplicationSubmissionTaskBeforeStart({ redis, taskId, dataEncryptionKey, reasonCode = 'JOB_AGENT_AUTHORIZATION_REVOKED', now = new Date() }) {
  const key = taskKey(taskId);
  const record = parse(await redis.get(key));
  if (!record || !['queued', 'leased'].includes(record.status)) return null;
  const safe = safeResult({ code: reasonCode });
  const response = await redis.eval(CANCEL_SCRIPT, [key, dueKey(), staleKey()], [String(record.version), JSON.stringify(encrypt(safe, dataEncryptionKey, key)), now.toISOString(), String(TTL_SECONDS), taskId]);
  return Array.isArray(response) && response[0] === 'cancelled' ? publicTask(parse(response[1]), dataEncryptionKey) : null;
}

export async function cancelPendingApplicationSubmissionTasksForTenant({ redis, tenantId, dataEncryptionKey, now = new Date() }) {
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || ''))) throw new Error('A valid tenant partition is required.');
  const ids = await redis.zrange(tenantIndex(tenantId), 0, -1);
  const result = { cancelled: 0, executing: 0, cancelledTaskIds: [], executingTaskIds: [], reconciliationRequired: false };
  for (const taskId of ids || []) {
    const record = parse(await redis.get(taskKey(taskId)));
    if (!record || record.tenantId !== tenantId) continue;
    if (record.status === 'executing') { result.executing += 1; result.executingTaskIds.push(taskId); continue; }
    if (!['queued', 'leased'].includes(record.status)) continue;
    if (await cancelApplicationSubmissionTaskBeforeStart({ redis, taskId, dataEncryptionKey, now })) { result.cancelled += 1; result.cancelledTaskIds.push(taskId); }
  }
  result.reconciliationRequired = result.executing > 0;
  return result;
}

export async function markNextStaleApplicationSubmissionTaskUnknown({ redis, dataEncryptionKey, now = new Date() }) {
  const ids = await redis.zrange(staleKey(), 0, now.getTime(), { byScore: true, offset: 0, count: 10 });
  for (const taskId of ids || []) {
    const key = taskKey(taskId);
    const record = parse(await redis.get(key));
    if (!record) { await redis.zrem(staleKey(), taskId); continue; }
    if (record.status === 'outcome-unknown') return { task: publicTask(record, dataEncryptionKey), tenantId: record.tenantId };
    if (record.status !== 'executing') { await redis.zrem(staleKey(), taskId); continue; }
    const safe = safeResult({ code: 'SUBMISSION_PROVIDER_OUTCOME_UNKNOWN' });
    const response = await redis.eval(STALE_SCRIPT, [key, staleKey()], [String(record.version), record.startedAt, JSON.stringify(encrypt(safe, dataEncryptionKey, key)), now.toISOString(), String(TTL_SECONDS), taskId]);
    if (Array.isArray(response) && response[0] === 'unknown') {
      const updated = parse(response[1]);
      return { task: publicTask(updated, dataEncryptionKey), tenantId: updated.tenantId };
    }
  }
  return null;
}

export async function acknowledgeApplicationSubmissionTaskReconciliation({ redis, taskId }) {
  if (!SAFE_ID.test(String(taskId || ''))) return false;
  await redis.zrem(staleKey(), taskId);
  return true;
}
