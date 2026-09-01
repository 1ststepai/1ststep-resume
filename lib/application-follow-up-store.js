import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { readDurableApplicationSessionForTenant } from './application-session-store.js';
import { enqueueNeedsYouNotification, jobAgentNeedsYouNotificationConfiguration } from './job-agent-notification-store.js';

const BASE = '1ststep:application-follow-up:v1';
const TTL_SECONDS = 365 * 24 * 60 * 60;
const LEASE_SECONDS = 90;
const MAX_ATTEMPTS = 4;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const SAFE_ID = /^[A-Za-z0-9:_-]{8,160}$/;

const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) then return {'not_claimable'} end
if record.status ~= 'scheduled' and record.status ~= 'retry' and not (record.status == 'leased' and record.leaseUntil <= ARGV[7]) then return {'not_claimable'} end
record.version = record.version + 1
record.status = 'leased'
record.attempt = record.attempt + 1
record.leaseTokenHash = ARGV[2]
record.leaseUntil = ARGV[3]
record.updatedAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
redis.call('ZADD', KEYS[2], ARGV[6], KEYS[1])
return {'claimed', cjson.encode(record)}
`;

const COMPLETE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.status ~= 'leased' or record.leaseTokenHash ~= ARGV[1] then return {'lease_lost'} end
record.version = record.version + 1
record.status = ARGV[2]
record.leaseTokenHash = ''
record.leaseUntil = ''
record.updatedAt = ARGV[3]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[4])
redis.call('ZREM', KEYS[2], KEYS[1])
return {ARGV[2], cjson.encode(record)}
`;

const FAIL_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.status ~= 'leased' or record.leaseTokenHash ~= ARGV[1] then return {'lease_lost'} end
record.version = record.version + 1
record.status = ARGV[2]
record.nextAttemptAt = ARGV[3]
record.leaseTokenHash = ''
record.leaseUntil = ''
record.updatedAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
redis.call('ZREM', KEYS[2], KEYS[1])
if ARGV[2] == 'retry' then redis.call('ZADD', KEYS[2], ARGV[6], KEYS[1]) end
return {ARGV[2], cjson.encode(record)}
`;

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) throw new Error('A valid follow-up timestamp is required.');
  return date.toISOString();
}

function recordKey(tenantId, sessionId) {
  return `${BASE}:tenant:${tenantId}:session:${createHash('sha256').update(String(sessionId)).digest('hex')}`;
}

function dueIndexKey() { return `${BASE}:due`; }
function tenantIndexKey(tenantId) { return `${BASE}:tenant:${tenantId}:reminders`; }
function decode(value) { return value ? (typeof value === 'string' ? JSON.parse(value) : value) : null; }

export function prepareApplicationFollowUpReminderReservation({ tenantId, subject, sessionId, dueAt = null, recordVersion = 1, dataEncryptionKey, now = new Date() }) {
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || '')) || !SAFE_ID.test(String(sessionId || ''))) throw new Error('A tenant-bound application session is required for a follow-up reminder.');
  if (!Number.isSafeInteger(Number(recordVersion)) || Number(recordVersion) < 1) throw new Error('A positive follow-up reminder record version is required.');
  const key = recordKey(tenantId, sessionId);
  if (!dueAt) return { mode: 'remove', tenantId, sessionId, reminderKey: key, keys: [key, dueIndexKey(), tenantIndexKey(tenantId)], args: ['remove', '', String(TTL_SECONDS), '0'] };
  if (!EMAIL.test(String(subject || ''))) throw new Error('A signed account identity is required for a follow-up reminder.');
  const due = new Date(dueAt);
  if (!Number.isFinite(due.getTime()) || due <= now) throw new Error('The follow-up reminder must be scheduled in the future.');
  const actionId = `follow_up_${sessionId}`;
  if (!SAFE_ID.test(actionId)) throw new Error('The follow-up reminder action identity is invalid.');
  const payload = { schemaVersion: 1, subject: String(subject).toLowerCase(), sessionId, actionId, dueAt: due.toISOString() };
  const at = timestamp(now);
  const record = {
    version: Number(recordVersion), tenantId, status: 'scheduled', attempt: 0, nextAttemptAt: due.toISOString(), leaseTokenHash: '', leaseUntil: '',
    envelope: encryptJsonEnvelope(payload, { dataEncryptionKey, aad: key }), createdAt: at, updatedAt: at,
  };
  return { mode: 'schedule', tenantId, sessionId, reminderKey: key, record, keys: [key, dueIndexKey(), tenantIndexKey(tenantId)], args: ['schedule', JSON.stringify(record), String(TTL_SECONDS), String(due.getTime())] };
}

function publicReminder(record) {
  return { status: record.status, attempt: Number(record.attempt) || 0, nextAttemptAt: record.nextAttemptAt || null, containsEmployerData: false, externalApplicationExecution: false };
}

export async function claimNextApplicationFollowUpReminder({ redis, dataEncryptionKey, now = new Date() }) {
  const keys = await redis.zrange(dueIndexKey(), 0, now.getTime(), { byScore: true, offset: 0, count: 10 });
  for (const key of keys || []) {
    if (!/^1ststep:application-follow-up:v1:tenant:[a-f0-9]{40}:session:[a-f0-9]{64}$/.test(String(key))) { await redis.zrem(dueIndexKey(), key); continue; }
    const raw = decode(await redis.get(key));
    const expiredLease = raw?.status === 'leased' && raw.leaseUntil && new Date(raw.leaseUntil) <= now;
    if (!raw || (!['scheduled', 'retry'].includes(raw.status) && !expiredLease)) { await redis.zrem(dueIndexKey(), key); continue; }
    if (raw.nextAttemptAt && new Date(raw.nextAttemptAt) > now) continue;
    const leaseToken = randomBytes(32).toString('base64url');
    const leaseUntil = new Date(now.getTime() + LEASE_SECONDS * 1000);
    const response = await redis.eval(CLAIM_SCRIPT, [key, dueIndexKey()], [
      String(raw.version), createHash('sha256').update(leaseToken).digest('hex'), leaseUntil.toISOString(), timestamp(now), String(TTL_SECONDS), String(leaseUntil.getTime()), timestamp(now),
    ]);
    if (!Array.isArray(response) || response[0] !== 'claimed') continue;
    const claimed = decode(response[1]);
    const payload = decryptJsonEnvelope(claimed.envelope, { dataEncryptionKey, aad: key });
    if (payload?.schemaVersion !== 1 || !EMAIL.test(String(payload.subject || '')) || !SAFE_ID.test(String(payload.sessionId || '')) || !SAFE_ID.test(String(payload.actionId || '')) || !Number.isFinite(new Date(payload.dueAt).getTime())) throw new Error('Encrypted follow-up reminder payload is invalid.');
    return { key, tenantId: claimed.tenantId, leaseToken, record: publicReminder(claimed), ...payload };
  }
  return null;
}

async function completeApplicationFollowUpReminder({ redis, key, leaseToken, status, now }) {
  const leaseTokenHash = createHash('sha256').update(String(leaseToken || '')).digest('hex');
  const response = await redis.eval(COMPLETE_SCRIPT, [key, dueIndexKey()], [leaseTokenHash, status, timestamp(now), String(TTL_SECONDS)]);
  return Array.isArray(response) && response[0] === status ? publicReminder(decode(response[1])) : null;
}

async function failApplicationFollowUpReminder({ redis, key, leaseToken, now = new Date() }) {
  const record = decode(await redis.get(key));
  const leaseTokenHash = createHash('sha256').update(String(leaseToken || '')).digest('hex');
  const expected = Buffer.from(String(record?.leaseTokenHash || ''));
  const actual = Buffer.from(leaseTokenHash);
  if (!record || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const terminal = Number(record.attempt) >= MAX_ATTEMPTS;
  const nextAttemptAt = terminal ? '' : new Date(now.getTime() + Math.min(6 * 60 * 60_000, 60_000 * (2 ** Math.max(0, Number(record.attempt) - 1)))).toISOString();
  const status = terminal ? 'failed' : 'retry';
  const response = await redis.eval(FAIL_SCRIPT, [key, dueIndexKey()], [leaseTokenHash, status, nextAttemptAt, timestamp(now), String(TTL_SECONDS), String(nextAttemptAt ? new Date(nextAttemptAt).getTime() : 0)]);
  return Array.isArray(response) && response[0] === status ? publicReminder(decode(response[1])) : null;
}

export async function processNextApplicationFollowUpReminder({ redis, partitionSecret, dataEncryptionKey, env = process.env, now = new Date(), enqueueNotification = enqueueNeedsYouNotification }) {
  if (!jobAgentNeedsYouNotificationConfiguration(env).enabled) return { status: 'not-configured' };
  const claimed = await claimNextApplicationFollowUpReminder({ redis, dataEncryptionKey, now });
  if (!claimed) return null;
  try {
    const session = await readDurableApplicationSessionForTenant({ redis, tenantId: claimed.tenantId, dataEncryptionKey, sessionId: claimed.sessionId });
    const followUp = session?.postSubmission?.followUp;
    if (followUp?.status !== 'SCHEDULED' || followUp.dueAt !== claimed.dueAt || new Date(followUp.dueAt) > now) {
      return { ...(await completeApplicationFollowUpReminder({ redis, key: claimed.key, leaseToken: claimed.leaseToken, status: 'stale', now })), status: 'stale' };
    }
    const queued = await enqueueNotification({ redis, subject: claimed.subject, partitionSecret, dataEncryptionKey, actionId: claimed.actionId, env, now });
    if (['queued', 'replayed', 'skipped'].includes(queued.status)) {
      const status = queued.status === 'skipped' ? 'skipped' : 'enqueued';
      return { ...(await completeApplicationFollowUpReminder({ redis, key: claimed.key, leaseToken: claimed.leaseToken, status, now })), status, notificationStatus: queued.status };
    }
    const failed = await failApplicationFollowUpReminder({ redis, key: claimed.key, leaseToken: claimed.leaseToken, now });
    return { ...failed, status: failed?.status || 'retry' };
  } catch {
    const failed = await failApplicationFollowUpReminder({ redis, key: claimed.key, leaseToken: claimed.leaseToken, now });
    return { ...failed, status: failed?.status || 'retry' };
  }
}

export async function deleteApplicationFollowUpReminder({ redis, tenantId, sessionId }) {
  const key = recordKey(tenantId, sessionId);
  await Promise.all([redis.zrem(dueIndexKey(), key), redis.zrem(tenantIndexKey(tenantId), key)]);
  await redis.del(key);
  return { deleted: true };
}

export async function deleteAllApplicationFollowUpRemindersForTenant({ redis, tenantId }) {
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || ''))) throw new Error('A valid tenant partition is required.');
  const index = tenantIndexKey(tenantId);
  const keys = [...new Set(await redis.zrange(index, 0, -1) || [])];
  const prefix = `${BASE}:tenant:${tenantId}:session:`;
  if (keys.some(key => !String(key).startsWith(prefix))) throw new Error('Follow-up reminder tenant index is invalid.');
  for (const key of keys) {
    await Promise.all([redis.del(key), redis.zrem(dueIndexKey(), key)]);
  }
  await redis.del(index);
  return { deleted: keys.length };
}
