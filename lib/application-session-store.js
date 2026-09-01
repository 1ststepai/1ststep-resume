import { createHash, createHmac } from 'node:crypto';
import { applicationSessionPublicSummary, assertNoApplicationSecrets } from './application-session-domain.js';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { readBoundedTenantIndexPage } from './tenant-index-pagination.js';

const BASE = '1ststep:application-session:v1';
const TTL_SECONDS = 365 * 24 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const AUDIT_TTL_SECONDS = 365 * 24 * 60 * 60;
const MAX_AUDIT_ENTRIES = 500;
const SAFE_ID = /^[A-Za-z0-9:_-]{8,160}$/;
const MAX_BYTES = 260_000;

const CREATE_SCRIPT = `
local replay = redis.call('GET', KEYS[2])
if replay then return {'replayed', replay} end
if redis.call('EXISTS', KEYS[4]) == 1 then return {'audit-conflict'} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4], 'NX')
redis.call('ZADD', KEYS[3], ARGV[5], ARGV[2])
redis.call('EXPIRE', KEYS[3], ARGV[3])
redis.call('SET', KEYS[4], ARGV[6], 'EX', ARGV[8], 'NX')
redis.call('ZADD', KEYS[5], ARGV[5], ARGV[7])
redis.call('EXPIRE', KEYS[5], ARGV[8])
return {'created', ARGV[2]}
`;

const UPDATE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.tenantId ~= ARGV[1] then return {'forbidden'} end
if record.version ~= tonumber(ARGV[2]) then return {'conflict', tostring(record.version)} end
local previousAuditHash = record.auditHeadHash or ''
if previousAuditHash ~= ARGV[12] then return {'audit-conflict'} end
if redis.call('EXISTS', KEYS[3]) == 1 then return {'audit-conflict'} end
if ARGV[15] and ARGV[15] ~= '' then
  local taskReplay = redis.call('GET', KEYS[6])
  if taskReplay and taskReplay ~= ARGV[16] then return {'task-conflict'} end
  if not taskReplay and redis.call('EXISTS', KEYS[5]) == 1 then return {'task-conflict'} end
end
record.version = record.version + 1
record.updatedAt = ARGV[3]
record.envelope = cjson.decode(ARGV[4])
record.auditHeadHash = ARGV[8]
record.auditCount = tonumber(ARGV[9])
record.auditHeadSignature = ARGV[14]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
redis.call('ZADD', KEYS[2], ARGV[6], ARGV[7])
redis.call('SET', KEYS[3], ARGV[10], 'EX', ARGV[11], 'NX')
redis.call('ZADD', KEYS[4], ARGV[6], ARGV[13])
redis.call('EXPIRE', KEYS[4], ARGV[11])
if ARGV[15] and ARGV[15] ~= '' then
  redis.call('SET', KEYS[5], ARGV[15], 'EX', ARGV[18], 'NX')
  redis.call('SET', KEYS[6], ARGV[16], 'EX', ARGV[19], 'NX')
  redis.call('ZADD', KEYS[7], ARGV[17], ARGV[16])
  redis.call('ZADD', KEYS[8], ARGV[17], ARGV[16])
  redis.call('EXPIRE', KEYS[8], ARGV[18])
end
if ARGV[20] == 'schedule' then
  redis.call('SET', KEYS[5], ARGV[21], 'EX', ARGV[22])
  redis.call('ZADD', KEYS[6], ARGV[23], KEYS[5])
  redis.call('ZADD', KEYS[7], ARGV[23], KEYS[5])
  redis.call('EXPIRE', KEYS[7], ARGV[22])
elseif ARGV[20] == 'remove' then
  redis.call('DEL', KEYS[5])
  redis.call('ZREM', KEYS[6], KEYS[5])
  redis.call('ZREM', KEYS[7], KEYS[5])
end
return {'updated', cjson.encode(record)}
`;

function tenant(subject, secret) {
  if (String(secret || '').length < 32) throw new Error('A tenant partition secret is required.');
  return createHmac('sha256', String(secret)).update(String(subject || '')).digest('hex').slice(0, 40);
}

function sessionKey(id) { return `${BASE}:session:${id}`; }
function tenantIndex(tenantId) { return `${BASE}:tenant:${tenantId}:sessions`; }
function auditEntryKey(id, sequence) { return `${BASE}:audit:${id}:${sequence}`; }
function auditIndex(id) { return `${BASE}:audit:${id}:entries`; }
function idemKey(tenantId, value) { return `${BASE}:tenant:${tenantId}:idem:${createHmac('sha256', tenantId).update(String(value || '')).digest('hex')}`; }
function followUpReminderKey(tenantId, sessionId) { return `1ststep:application-follow-up:v1:tenant:${tenantId}:session:${createHash('sha256').update(String(sessionId)).digest('hex')}`; }
function followUpDueIndex() { return '1ststep:application-follow-up:v1:due'; }
function followUpTenantIndex(tenantId) { return `1ststep:application-follow-up:v1:tenant:${tenantId}:reminders`; }
function parse(value) { return value ? typeof value === 'string' ? JSON.parse(value) : value : null; }

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function encrypt(session, dataEncryptionKey, aad) {
  assertNoApplicationSecrets(session);
  const serialized = JSON.stringify(session);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) throw new Error('Application session exceeds the encrypted storage limit.');
  return encryptJsonEnvelope(session, { dataEncryptionKey, aad });
}

function decrypt(envelope, dataEncryptionKey, aad) {
  return decryptJsonEnvelope(envelope, { dataEncryptionKey, aad });
}

function publicRecord(record, dataEncryptionKey) {
  if (!record) return null;
  return { version: Number(record.version), audit: { count: Number(record.auditCount || 0), headHash: String(record.auditHeadHash || ''), headSignature: String(record.auditHeadSignature || '') }, ...applicationSessionPublicSummary(decrypt(record.envelope, dataEncryptionKey, sessionKey(record.id))) };
}

function auditSignature({ tenantId, sessionId, sequence, previousHash, eventHash, auditSigningSecret }) {
  if (String(auditSigningSecret || '').length < 32) throw new Error('A separate audit signing secret is required.');
  return createHmac('sha256', auditSigningSecret).update(`${tenantId}.${sessionId}.${sequence}.${previousHash}.${eventHash}`).digest('hex');
}

function auditRecord({ session, tenantId, sequence, previousHash = '', version, dataEncryptionKey, auditSigningSecret, now }) {
  const timelineEvent = session?.timeline?.[session.timeline.length - 1];
  if (!timelineEvent?.id || !timelineEvent?.kind || !timelineEvent?.at) throw new Error('Every durable application-session mutation requires an audit event.');
  const payload = { sessionId: session.id, sequence, version, previousHash, sessionDigest: createHash('sha256').update(canonical(session)).digest('hex'), state: session.state, stage: session.stage, event: timelineEvent };
  assertNoApplicationSecrets(payload, 'audit');
  const eventHash = createHash('sha256').update(canonical(payload)).digest('hex');
  const signature = auditSignature({ tenantId, sessionId: session.id, sequence, previousHash, eventHash, auditSigningSecret });
  const id = `${session.id}:${sequence}`;
  const aad = auditEntryKey(session.id, sequence);
  return {
    id, eventHash, signature,
    record: { id, sessionId: session.id, tenantId, sequence, version, previousHash, eventHash, signature, at: now.toISOString(), envelope: encrypt(payload, dataEncryptionKey, aad) },
  };
}

function restoreAuditRecord(record, dataEncryptionKey, auditSigningSecret) {
  const payload = decrypt(record.envelope, dataEncryptionKey, auditEntryKey(record.sessionId, record.sequence));
  const expected = createHash('sha256').update(canonical(payload)).digest('hex');
  const expectedSignature = auditSignature({ tenantId: record.tenantId, sessionId: record.sessionId, sequence: record.sequence, previousHash: record.previousHash, eventHash: record.eventHash, auditSigningSecret });
  if (expected !== record.eventHash || expectedSignature !== record.signature || payload.previousHash !== record.previousHash || payload.sequence !== record.sequence || payload.sessionId !== record.sessionId) throw new Error('Application audit integrity verification failed.');
  return { sequence: record.sequence, version: record.version, previousHash: record.previousHash, eventHash: record.eventHash, signature: record.signature, sessionDigest: payload.sessionDigest, at: record.at, state: payload.state, stage: payload.stage, event: payload.event };
}

export async function createDurableApplicationSession({ redis, subject, partitionSecret, dataEncryptionKey, auditSigningSecret, session, idempotencyKey, now = new Date() }) {
  if (!SAFE_ID.test(String(session?.id || '')) || !SAFE_ID.test(String(idempotencyKey || ''))) throw new Error('Safe session and Idempotency-Key values are required.');
  const tenantId = tenant(subject, partitionSecret);
  const timestamp = now.toISOString();
  const audit = auditRecord({ session, tenantId, sequence: 1, version: 1, dataEncryptionKey, auditSigningSecret, now });
  const record = { version: 1, id: session.id, tenantId, createdAt: timestamp, updatedAt: timestamp, auditHeadHash: audit.eventHash, auditHeadSignature: audit.signature, auditCount: 1, envelope: encrypt(session, dataEncryptionKey, sessionKey(session.id)) };
  const result = await redis.eval(CREATE_SCRIPT, [sessionKey(session.id), idemKey(tenantId, idempotencyKey), tenantIndex(tenantId), auditEntryKey(session.id, 1), auditIndex(session.id)], [JSON.stringify(record), session.id, String(TTL_SECONDS), String(IDEMPOTENCY_TTL_SECONDS), String(now.getTime()), JSON.stringify(audit.record), audit.id, String(AUDIT_TTL_SECONDS)]);
  const [status, returnedId] = Array.isArray(result) ? result : [];
  if (!['created', 'replayed'].includes(status) || !returnedId) throw new Error('Application session could not be created.');
  const stored = parse(await redis.get(sessionKey(returnedId)));
  if (!stored || stored.tenantId !== tenantId) throw new Error('Application session could not be restored.');
  return { session: publicRecord(stored, dataEncryptionKey), replayed: status === 'replayed' };
}

export async function readDurableApplicationSession({ redis, subject, partitionSecret, dataEncryptionKey, sessionId }) {
  if (!SAFE_ID.test(String(sessionId || ''))) return null;
  const record = parse(await redis.get(sessionKey(sessionId)));
  if (!record || record.tenantId !== tenant(subject, partitionSecret)) return null;
  return publicRecord(record, dataEncryptionKey);
}

export async function listDurableApplicationSessions({ redis, subject, partitionSecret, dataEncryptionKey, limit = 30, offset = 0, withPageInfo = false }) {
  const tenantId = tenant(subject, partitionSecret);
  const page = await readBoundedTenantIndexPage({ redis, indexKey: tenantIndex(tenantId), offset, limit, defaultLimit: 30, reverse: true, includeTotal: withPageInfo });
  const sessions = [];
  for (const id of page.ids) {
    const record = parse(await redis.get(sessionKey(id)));
    if (record?.tenantId === tenantId) sessions.push(publicRecord(record, dataEncryptionKey));
  }
  return withPageInfo ? { items: sessions, scanned: page.scanned, offset: page.offset, limit: page.limit, total: page.total } : sessions;
}

async function updateDurableApplicationSessionForTenant({ redis, tenantId, dataEncryptionKey, auditSigningSecret, sessionId, expectedVersion, session, browserTaskReservation = null, submissionTaskReservation = null, receiptTaskReservation = null, followUpReminderReservation = null, now = new Date() }) {
  if (!SAFE_ID.test(String(sessionId || '')) || session?.id !== sessionId) throw new Error('Application session identity cannot change.');
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || ''))) throw new Error('A valid tenant partition is required.');
  const record = parse(await redis.get(sessionKey(sessionId)));
  if (!record || record.tenantId !== tenantId) return null;
  if (Number(expectedVersion) !== Number(record.version)) throw new Error('Application session changed. Refresh and retry.');
  const sequence = Number(record.auditCount || 0) + 1;
  if (sequence > MAX_AUDIT_ENTRIES) throw new Error('Application audit retention limit reached; archive the signed ledger before continuing.');
  const previousHash = String(record.auditHeadHash || '');
  const audit = auditRecord({ session, tenantId, sequence, previousHash, version: Number(record.version) + 1, dataEncryptionKey, auditSigningSecret, now });
  if (browserTaskReservation) {
    if (browserTaskReservation.record?.tenantId !== tenantId || browserTaskReservation.taskId !== session?.workerExecution?.id || browserTaskReservation.keys?.length !== 4 || browserTaskReservation.args?.length !== 5) throw new Error('Browser task reservation does not match the application session.');
  }
  if (submissionTaskReservation) {
    if (browserTaskReservation || receiptTaskReservation || submissionTaskReservation.record?.tenantId !== tenantId || submissionTaskReservation.taskId !== session?.submissionExecution?.id || submissionTaskReservation.keys?.length !== 4 || submissionTaskReservation.args?.length !== 5) throw new Error('Submission task reservation does not match the application session.');
  }
  if (receiptTaskReservation) {
    if (browserTaskReservation || submissionTaskReservation || receiptTaskReservation.record?.tenantId !== tenantId || receiptTaskReservation.taskId !== session?.receiptVerification?.id || receiptTaskReservation.keys?.length !== 4 || receiptTaskReservation.args?.length !== 5) throw new Error('Receipt task reservation does not match the application session.');
  }
  if (followUpReminderReservation) {
    if (browserTaskReservation || submissionTaskReservation || receiptTaskReservation || followUpReminderReservation.tenantId !== tenantId || followUpReminderReservation.sessionId !== sessionId || followUpReminderReservation.keys?.length !== 3 || followUpReminderReservation.args?.length !== 4 || !['schedule', 'remove'].includes(followUpReminderReservation.mode)) throw new Error('Follow-up reminder reservation does not match the application session.');
  }
  const taskReservation = browserTaskReservation || submissionTaskReservation || receiptTaskReservation;
  const keys = [sessionKey(sessionId), tenantIndex(tenantId), auditEntryKey(sessionId, sequence), auditIndex(sessionId), ...(taskReservation?.keys || followUpReminderReservation?.keys || [])];
  const taskArgs = taskReservation ? [taskReservation.args[0], taskReservation.taskId, taskReservation.args[2], taskReservation.args[3], taskReservation.args[4]] : ['', '', '0', '0', '0'];
  const followUpArgs = followUpReminderReservation?.args || ['', '', '0', '0'];
  const response = await redis.eval(UPDATE_SCRIPT, keys, [tenantId, String(record.version), now.toISOString(), JSON.stringify(encrypt(session, dataEncryptionKey, sessionKey(sessionId))), String(TTL_SECONDS), String(now.getTime()), sessionId, audit.eventHash, String(sequence), JSON.stringify(audit.record), String(AUDIT_TTL_SECONDS), previousHash, audit.id, audit.signature, ...taskArgs, ...followUpArgs]);
  if (!Array.isArray(response) || response[0] !== 'updated') throw new Error(['conflict', 'audit-conflict', 'task-conflict'].includes(response?.[0]) ? 'Application session changed. Refresh and retry.' : 'Application session could not be updated.');
  return publicRecord(parse(response[1]), dataEncryptionKey);
}

export async function updateDurableApplicationSession({ subject, partitionSecret, ...input }) {
  return updateDurableApplicationSessionForTenant({ ...input, tenantId: tenant(subject, partitionSecret) });
}

export async function readDurableApplicationSessionForTenant({ redis, tenantId, dataEncryptionKey, sessionId }) {
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || '')) || !SAFE_ID.test(String(sessionId || ''))) return null;
  const record = parse(await redis.get(sessionKey(sessionId)));
  if (!record || record.tenantId !== tenantId) return null;
  return publicRecord(record, dataEncryptionKey);
}

export async function updateDurableApplicationSessionAsWorker(input) {
  return updateDurableApplicationSessionForTenant(input);
}

export async function listDurableApplicationSessionAudit({ redis, subject, partitionSecret, dataEncryptionKey, auditSigningSecret, sessionId, limit = 200 }) {
  if (!SAFE_ID.test(String(sessionId || ''))) return null;
  const tenantId = tenant(subject, partitionSecret);
  const sessionRecord = parse(await redis.get(sessionKey(sessionId)));
  if (!sessionRecord || sessionRecord.tenantId !== tenantId) return null;
  const ids = await redis.zrange(auditIndex(sessionId), 0, Math.max(0, Math.min(500, Number(limit) || 200) - 1));
  const entries = [];
  let previousHash = '';
  let headSignature = '';
  for (const id of ids || []) {
    const sequence = Number(String(id).split(':').pop());
    const stored = parse(await redis.get(auditEntryKey(sessionId, sequence)));
    if (!stored || stored.tenantId !== tenantId || stored.previousHash !== previousHash) throw new Error('Application audit chain is incomplete or invalid.');
    const restored = restoreAuditRecord(stored, dataEncryptionKey, auditSigningSecret);
    entries.push(restored);
    previousHash = restored.eventHash;
    headSignature = restored.signature;
  }
  const complete = entries.length === Number(sessionRecord.auditCount || 0) && previousHash === String(sessionRecord.auditHeadHash || '') && headSignature === String(sessionRecord.auditHeadSignature || '');
  if (!complete && Number(sessionRecord.auditCount || 0) > 0) throw new Error('Application audit head does not match the retained ledger.');
  return { sessionId, retentionDays: AUDIT_TTL_SECONDS / (24 * 60 * 60), count: entries.length, headHash: previousHash, headSignature, integrityVerified: true, entries };
}

export async function deleteDurableApplicationSession({ redis, subject, partitionSecret, sessionId }) {
  const tenantId = tenant(subject, partitionSecret);
  const record = parse(await redis.get(sessionKey(sessionId)));
  if (!record || record.tenantId !== tenantId) return false;
  const auditIds = await redis.zrange(auditIndex(sessionId), 0, -1);
  const auditKeys = (auditIds || []).map(id => auditEntryKey(sessionId, Number(String(id).split(':').pop())));
  const reminderKey = followUpReminderKey(tenantId, sessionId);
  await Promise.all([redis.del(sessionKey(sessionId)), redis.zrem(tenantIndex(tenantId), sessionId), redis.del(auditIndex(sessionId)), redis.del(reminderKey), redis.zrem(followUpDueIndex(), reminderKey), redis.zrem(followUpTenantIndex(tenantId), reminderKey), ...auditKeys.map(key => redis.del(key))]);
  return true;
}

export async function deleteAllDurableApplicationSessions({ redis, subject, partitionSecret }) {
  const tenantId = tenant(subject, partitionSecret);
  const indexKey = tenantIndex(tenantId);
  const ids = await redis.zrange(indexKey, 0, -1);
  let deleted = 0;
  for (const sessionId of ids || []) {
    const record = parse(await redis.get(sessionKey(sessionId)));
    if (!record || record.tenantId !== tenantId) continue;
    const auditIds = await redis.zrange(auditIndex(sessionId), 0, -1);
    const auditKeys = (auditIds || []).map(id => auditEntryKey(sessionId, Number(String(id).split(':').pop())));
    const reminderKey = followUpReminderKey(tenantId, sessionId);
    await Promise.all([redis.del(sessionKey(sessionId)), redis.del(auditIndex(sessionId)), redis.del(reminderKey), redis.zrem(followUpDueIndex(), reminderKey), redis.zrem(followUpTenantIndex(tenantId), reminderKey), ...auditKeys.map(key => redis.del(key))]);
    deleted += 1;
  }
  await redis.del(indexKey);
  await redis.del(followUpTenantIndex(tenantId));
  return { deleted };
}
