import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createJobAgentRunForTenant, jobAgentTenantId, validateJobAgentMission } from './job-agent-run-store.js';
import { requireConfiguredJobAgentConsentForTenant } from './job-agent-consent-store.js';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';

const BASE = '1ststep:job-agent-schedule:v1';
const SCHEDULE_TTL_SECONDS = 365 * 24 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const LEASE_SECONDS = 120;
const TENANT_ID = /^[a-f0-9]{40}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,128}$/;

const SAVE_SCRIPT = `
local replay = redis.call('GET', KEYS[3])
if replay then return {'replayed', replay} end
local raw = redis.call('GET', KEYS[1])
local current = 0
if raw then current = tonumber(cjson.decode(raw).version) or 0 end
if current ~= tonumber(ARGV[1]) then return {'conflict', tostring(current)} end
redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[5])
redis.call('SET', KEYS[3], ARGV[2], 'EX', ARGV[6], 'NX')
redis.call('ZREM', KEYS[2], ARGV[4])
if ARGV[7] == 'active' then redis.call('ZADD', KEYS[2], ARGV[8], ARGV[4]) end
return {'saved', ARGV[2]}
`;

const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) or record.status ~= 'active' then return {'not_claimable'} end
if record.leaseUntil ~= '' and record.leaseUntil > ARGV[2] then return {'leased'} end
record.version = record.version + 1
record.leaseTokenHash = ARGV[3]
record.leaseUntil = ARGV[4]
record.updatedAt = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
redis.call('ZADD', KEYS[2], ARGV[6], ARGV[7])
return {'claimed', cjson.encode(record)}
`;

const COMPLETE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.leaseTokenHash ~= ARGV[1] then return {'lease_lost'} end
record.version = record.version + 1
record.lastRunAt = ARGV[2]
record.lastRunId = ARGV[3]
record.lastResult = ARGV[4]
record.nextRunAt = ARGV[5]
record.leaseTokenHash = ''
record.leaseUntil = ''
record.updatedAt = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[6])
redis.call('ZREM', KEYS[2], ARGV[7])
if record.status == 'active' then redis.call('ZADD', KEYS[2], ARGV[8], ARGV[7]) end
return {'updated', cjson.encode(record)}
`;

const PAUSE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
record.version = record.version + 1
record.status = 'paused'
record.leaseTokenHash = ''
record.leaseUntil = ''
record.updatedAt = ARGV[1]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[2])
redis.call('ZREM', KEYS[2], ARGV[3])
return {'paused', cjson.encode(record)}
`;

function scheduleKey(tenantId) { return `${BASE}:tenant:${tenantId}`; }
function dueKey() { return `${BASE}:due`; }
function idemKey(tenantId, value) { return `${BASE}:tenant:${tenantId}:idem:${createHash('sha256').update(String(value)).digest('hex')}`; }
function parse(value) { return value ? (typeof value === 'string' ? JSON.parse(value) : value) : null; }
function tomorrow(now) { return new Date(now.getTime() + 24 * 60 * 60 * 1000); }

function encryptMission(mission, dataEncryptionKey, tenantId) {
  const safe = validateJobAgentMission(mission);
  return encryptJsonEnvelope(safe, { dataEncryptionKey, aad: scheduleKey(tenantId) });
}

function decryptMission(envelope, dataEncryptionKey, tenantId) {
  return validateJobAgentMission(decryptJsonEnvelope(envelope, { dataEncryptionKey, aad: scheduleKey(tenantId) }));
}

function publicSchedule(record, dataEncryptionKey) {
  if (!record) return null;
  return {
    version: Number(record.version) || 0, status: record.status, cadence: 'daily',
    mission: decryptMission(record.missionEnvelope, dataEncryptionKey, record.tenantId),
    nextRunAt: record.nextRunAt || null, lastRunAt: record.lastRunAt || null,
    lastRunId: record.lastRunId || null, lastResult: record.lastResult || null,
    createdAt: record.createdAt, updatedAt: record.updatedAt,
  };
}

export function jobAgentScheduleConfiguration(env = process.env) {
  const enabled = String(env.JOB_AGENT_SCHEDULE_ENABLED || '').toLowerCase() === 'true';
  const globalDailyRuns = Math.floor(Number(env.JOB_AGENT_SCHEDULE_GLOBAL_DAILY_RUNS));
  if (!enabled) return { enabled: false, reason: 'disabled', globalDailyRuns: 0 };
  if (!Number.isSafeInteger(globalDailyRuns) || globalDailyRuns < 1 || globalDailyRuns > 10_000) return { enabled: false, reason: 'budget-not-configured', globalDailyRuns: 0 };
  return { enabled: true, reason: null, globalDailyRuns };
}

export async function readJobAgentSchedule({ redis, subject, partitionSecret, dataEncryptionKey }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const record = parse(await redis.get(scheduleKey(tenantId)));
  if (!record) return { schedule: null, version: 0 };
  if (record.tenantId !== tenantId) throw new Error('Job Agent schedule tenant mismatch.');
  return { schedule: publicSchedule(record, dataEncryptionKey), version: Number(record.version) || 0 };
}

export async function saveJobAgentSchedule({ redis, subject, partitionSecret, dataEncryptionKey, mission, status = 'active', expectedVersion, idempotencyKey, now = new Date() }) {
  if (!['active', 'paused'].includes(status)) throw new Error('Job Agent schedule status must be active or paused.');
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('A non-negative schedule version is required.');
  if (!SAFE_IDEMPOTENCY_KEY.test(String(idempotencyKey || ''))) throw new Error('A safe Idempotency-Key is required.');
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const existing = parse(await redis.get(scheduleKey(tenantId)));
  const timestamp = now.toISOString();
  const nextRunAt = existing?.nextRunAt && new Date(existing.nextRunAt) > now ? existing.nextRunAt : tomorrow(now).toISOString();
  const version = expectedVersion + 1;
  const record = {
    version, tenantId, status, cadence: 'daily', missionEnvelope: encryptMission(mission, dataEncryptionKey, tenantId),
    nextRunAt, lastRunAt: existing?.lastRunAt || '', lastRunId: existing?.lastRunId || '', lastResult: existing?.lastResult || '',
    leaseTokenHash: '', leaseUntil: '', createdAt: existing?.createdAt || timestamp, updatedAt: timestamp,
  };
  const result = await redis.eval(SAVE_SCRIPT, [scheduleKey(tenantId), dueKey(), idemKey(tenantId, idempotencyKey)], [
    String(expectedVersion), String(version), JSON.stringify(record), tenantId, String(SCHEDULE_TTL_SECONDS), String(IDEMPOTENCY_TTL_SECONDS), status, String(new Date(nextRunAt).getTime()),
  ]);
  const [resultStatus, resultVersion] = Array.isArray(result) ? result : ['error', '0'];
  if (resultStatus === 'conflict') return { conflict: true, version: Number(resultVersion) || 0 };
  if (!['saved', 'replayed'].includes(resultStatus)) throw new Error('Job Agent schedule could not be saved.');
  const stored = parse(await redis.get(scheduleKey(tenantId)));
  return { schedule: publicSchedule(stored, dataEncryptionKey), version: Number(resultVersion), replayed: resultStatus === 'replayed' };
}

export async function deleteJobAgentSchedule({ redis, subject, partitionSecret }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  await Promise.all([redis.del(scheduleKey(tenantId)), redis.zrem(dueKey(), tenantId)]);
  return { deleted: true };
}

export async function pauseJobAgentScheduleForTenant({ redis, tenantId, dataEncryptionKey, now = new Date() }) {
  if (!TENANT_ID.test(String(tenantId || ''))) return null;
  const response = await redis.eval(PAUSE_SCRIPT, [scheduleKey(tenantId), dueKey()], [now.toISOString(), String(SCHEDULE_TTL_SECONDS), tenantId]);
  return Array.isArray(response) && response[0] === 'paused' ? publicSchedule(parse(response[1]), dataEncryptionKey) : null;
}

export async function claimNextJobAgentSchedule({ redis, dataEncryptionKey, now = new Date() }) {
  const tenantIds = await redis.zrange(dueKey(), 0, now.getTime(), { byScore: true, offset: 0, count: 10 });
  for (const tenantId of tenantIds || []) {
    if (!TENANT_ID.test(String(tenantId))) { await redis.zrem(dueKey(), tenantId); continue; }
    const key = scheduleKey(tenantId);
    const record = parse(await redis.get(key));
    if (!record || record.status !== 'active') { await redis.zrem(dueKey(), tenantId); continue; }
    const leaseToken = randomBytes(32).toString('base64url');
    const leaseTokenHash = createHash('sha256').update(leaseToken).digest('hex');
    const leaseUntil = new Date(now.getTime() + LEASE_SECONDS * 1000);
    const result = await redis.eval(CLAIM_SCRIPT, [key, dueKey()], [String(record.version), now.toISOString(), leaseTokenHash, leaseUntil.toISOString(), String(SCHEDULE_TTL_SECONDS), String(leaseUntil.getTime()), tenantId]);
    if (Array.isArray(result) && result[0] === 'claimed') return { tenantId, leaseToken, schedule: publicSchedule(parse(result[1]), dataEncryptionKey) };
  }
  return null;
}

function sameLease(record, leaseToken) {
  const actual = Buffer.from(createHash('sha256').update(String(leaseToken || '')).digest('hex'));
  const expected = Buffer.from(String(record?.leaseTokenHash || ''));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function completeJobAgentSchedule({ redis, tenantId, leaseToken, dataEncryptionKey, runId = '', result = 'enqueued', now = new Date(), delayMs = 24 * 60 * 60 * 1000 }) {
  const key = scheduleKey(tenantId);
  const record = parse(await redis.get(key));
  if (!record || !sameLease(record, leaseToken)) return null;
  const nextRunAt = new Date(now.getTime() + Math.max(60_000, delayMs));
  const response = await redis.eval(COMPLETE_SCRIPT, [key, dueKey()], [record.leaseTokenHash, now.toISOString(), String(runId).slice(0, 128), String(result).slice(0, 80), nextRunAt.toISOString(), String(SCHEDULE_TTL_SECONDS), tenantId, String(nextRunAt.getTime())]);
  return Array.isArray(response) && response[0] === 'updated' ? publicSchedule(parse(response[1]), dataEncryptionKey) : null;
}

async function reserveGlobalDailyRun(redis, limit, now) {
  const day = now.toISOString().slice(0, 10);
  const key = `${BASE}:budget:${day}`;
  const used = Number(await redis.incr(key));
  if (used === 1) await redis.expire(key, 2 * 24 * 60 * 60);
  return { ok: used <= limit, used, limit };
}

export async function processNextJobAgentSchedule({ redis, partitionSecret, dataEncryptionKey, env = process.env, now = new Date() }) {
  const configuration = jobAgentScheduleConfiguration(env);
  if (!configuration.enabled) return { status: 'not-configured', reason: configuration.reason };
  const claimed = await claimNextJobAgentSchedule({ redis, dataEncryptionKey, now });
  if (!claimed) return null;
  const consent = await requireConfiguredJobAgentConsentForTenant({ redis, dataEncryptionKey }, claimed.tenantId, env);
  if (!consent.ok) {
    await pauseJobAgentScheduleForTenant({ redis, tenantId: claimed.tenantId, dataEncryptionKey, now });
    return { status: 'paused', reason: consent.code };
  }
  const budget = await reserveGlobalDailyRun(redis, configuration.globalDailyRuns, now);
  if (!budget.ok) {
    const nextUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5);
    await completeJobAgentSchedule({ redis, tenantId: claimed.tenantId, leaseToken: claimed.leaseToken, dataEncryptionKey, result: 'global-budget-deferred', now, delayMs: Math.max(60_000, nextUtcDay - now.getTime()) });
    return { status: 'deferred', reason: 'GLOBAL_DAILY_SCHEDULE_BUDGET' };
  }
  try {
    const day = now.toISOString().slice(0, 10).replace(/-/g, '');
    const created = await createJobAgentRunForTenant({
      redis, tenantId: claimed.tenantId, dataEncryptionKey, mission: claimed.schedule.mission,
      taskType: 'direct_employer_discovery', idempotencyKey: `scheduled_${day}_${claimed.tenantId}`, now,
    });
    await completeJobAgentSchedule({ redis, tenantId: claimed.tenantId, leaseToken: claimed.leaseToken, dataEncryptionKey, runId: created.run.id, result: created.replayed ? 'replayed' : 'enqueued', now });
    return { status: 'enqueued', runId: created.run.id, replayed: created.replayed };
  } catch {
    await completeJobAgentSchedule({ redis, tenantId: claimed.tenantId, leaseToken: claimed.leaseToken, dataEncryptionKey, result: 'enqueue-retry', now, delayMs: 60 * 60 * 1000 });
    return { status: 'deferred', reason: 'SCHEDULE_ENQUEUE_RETRY' };
  }
}
