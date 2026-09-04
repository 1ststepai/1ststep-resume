import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { JOB_AGENT_OPERATOR_ALERTS, JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST, jobAgentOperatorAlertConfiguration } from './job-agent-operator-alert.js';

const BASE = '1ststep:job-agent:alert-outbox:v1';
const TTL_SECONDS = 30 * 24 * 60 * 60;
const LEASE_SECONDS = 90;
const MAX_ATTEMPTS = 4;
const SAFE_KEY = /^1ststep:job-agent:alert-outbox:v1:record:[a-f0-9-]{36}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
const EVENT_SET = new Set(Object.keys(JOB_AGENT_OPERATOR_ALERTS));

const ENQUEUE_SCRIPT = `
local existing = redis.call('GET', KEYS[2])
if existing then return {'deduplicated', existing} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[2], KEYS[1], 'EX', ARGV[3], 'NX')
redis.call('ZADD', KEYS[3], ARGV[4], KEYS[1])
return {'queued', KEYS[1]}
`;
const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) then return {'not_claimable'} end
if record.status ~= 'queued' and record.status ~= 'retry' and not (record.status == 'leased' and record.leaseUntil <= ARGV[7]) then return {'not_claimable'} end
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
record.status = 'provider-accepted'
record.leaseTokenHash = ''
record.leaseUntil = ''
record.nextAttemptAt = ''
record.updatedAt = ARGV[2]
record.providerAcceptedAt = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[3])
redis.call('ZREM', KEYS[2], KEYS[1])
return {'provider-accepted', cjson.encode(record)}
`;
const FAIL_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.status ~= 'leased' or record.leaseTokenHash ~= ARGV[1] then return {'lease_lost'} end
record.version = record.version + 1
record.status = ARGV[2]
record.leaseTokenHash = ''
record.leaseUntil = ''
record.nextAttemptAt = ARGV[3]
record.updatedAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
redis.call('ZREM', KEYS[2], KEYS[1])
if ARGV[2] == 'retry' then redis.call('ZADD', KEYS[2], ARGV[6], KEYS[1]) else redis.call('ZADD', KEYS[3], ARGV[7], KEYS[1]) end
return {ARGV[2], cjson.encode(record)}
`;

function recordKey(id) { return `${BASE}:record:${id}`; }
function dueKey() { return `${BASE}:due`; }
function deadKey() { return `${BASE}:failed`; }
function dedupeKey(event, version, digest) { return `${BASE}:dedupe:${version}:${digest}:${event}`; }
function parse(value) { return value ? (typeof value === 'string' ? JSON.parse(value) : value) : null; }
function timestamp(value) { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error('Invalid operator alert timestamp.'); return date.toISOString(); }
function publicRecord(record) { return record ? { id: record.id, event: record.event, severity: record.severity, status: record.status, attempt: Number(record.attempt) || 0, maxAttempts: MAX_ATTEMPTS, nextAttemptAt: record.nextAttemptAt || null, providerAcceptedAt: record.providerAcceptedAt || null, contentFree: true, containsCandidateValues: false } : null; }
function valid(record) { return record?.schemaVersion === 1 && EVENT_SET.has(record.event) && record.severity === JOB_AGENT_OPERATOR_ALERTS[record.event] && SAFE_VERSION.test(String(record.contractVersion || '')) && record.contractDigest === JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST && ['queued', 'retry', 'leased', 'provider-accepted', 'failed'].includes(record.status); }

export async function enqueueJobAgentOperatorAlert(event, { redis, cooldownSeconds = 900, environment = 'development', contractVersion, contractDigest = JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST, now = new Date() } = {}) {
  if (!EVENT_SET.has(String(event || ''))) throw new Error('Unsupported Job Agent operator alert.');
  if (!redis || !SAFE_VERSION.test(String(contractVersion || '')) || contractDigest !== JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST) return { queued: false, reason: 'not-configured' };
  const id = randomUUID();
  const key = recordKey(id);
  const record = { schemaVersion: 1, id, event, severity: JOB_AGENT_OPERATOR_ALERTS[event], status: 'queued', version: 1, attempt: 0, contractVersion, contractDigest, environment: String(environment).slice(0, 24), createdAt: timestamp(now), updatedAt: timestamp(now), nextAttemptAt: timestamp(now), leaseTokenHash: '', leaseUntil: '', providerAcceptedAt: '', contentFree: true, containsCandidateValues: false };
  const response = await redis.eval(ENQUEUE_SCRIPT, [key, dedupeKey(event, contractVersion, contractDigest), dueKey()], [JSON.stringify(record), String(TTL_SECONDS), String(Math.max(60, Math.min(86_400, Number(cooldownSeconds) || 900))), String(new Date(now).getTime())]);
  if (!Array.isArray(response) || !['queued', 'deduplicated'].includes(response[0])) throw new Error('Operator alert could not be queued.');
  return response[0] === 'queued' ? { queued: true, status: 'queued', id, contentFree: true, containsCandidateValues: false } : { queued: false, status: 'deduplicated', reason: 'deduplicated', contentFree: true, containsCandidateValues: false };
}

export async function claimNextJobAgentOperatorAlert({ redis, now = new Date() } = {}) {
  const keys = await redis.zrange(dueKey(), 0, new Date(now).getTime(), { byScore: true, offset: 0, count: 10 });
  for (const key of keys || []) {
    if (!SAFE_KEY.test(String(key))) { await redis.zrem(dueKey(), key); continue; }
    const record = parse(await redis.get(key));
    const expiredLease = record?.status === 'leased' && new Date(record.leaseUntil) <= now;
    if (!valid(record) || (!['queued', 'retry'].includes(record.status) && !expiredLease)) { await redis.zrem(dueKey(), key); continue; }
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const leaseUntil = new Date(new Date(now).getTime() + LEASE_SECONDS * 1000);
    const response = await redis.eval(CLAIM_SCRIPT, [key, dueKey()], [String(record.version), tokenHash, leaseUntil.toISOString(), timestamp(now), String(TTL_SECONDS), String(leaseUntil.getTime()), timestamp(now)]);
    if (Array.isArray(response) && response[0] === 'claimed') return { key, leaseToken: token, record: parse(response[1]) };
  }
  return null;
}

async function finish({ redis, claimed, accepted, retryable = true, now = new Date() }) {
  const record = parse(await redis.get(claimed.key));
  const actual = Buffer.from(createHash('sha256').update(String(claimed.leaseToken)).digest('hex'));
  const expected = Buffer.from(String(record?.leaseTokenHash || ''));
  if (!record || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  if (accepted) {
    const response = await redis.eval(COMPLETE_SCRIPT, [claimed.key, dueKey()], [actual.toString(), timestamp(now), String(TTL_SECONDS)]);
    return Array.isArray(response) && response[0] === 'provider-accepted' ? publicRecord(parse(response[1])) : null;
  }
  const terminal = retryable !== true || Number(record.attempt) >= MAX_ATTEMPTS;
  const delaySeconds = Math.min(6 * 60 * 60, 60 * (2 ** Math.max(0, Number(record.attempt) - 1)));
  const next = terminal ? '' : new Date(new Date(now).getTime() + delaySeconds * 1000).toISOString();
  const status = terminal ? 'failed' : 'retry';
  const response = await redis.eval(FAIL_SCRIPT, [claimed.key, dueKey(), deadKey()], [actual.toString(), status, next, timestamp(now), String(TTL_SECONDS), String(next ? new Date(next).getTime() : 0), String(new Date(now).getTime())]);
  return Array.isArray(response) && response[0] === status ? publicRecord(parse(response[1])) : null;
}

export async function processNextJobAgentOperatorAlert({ env = process.env, redis, now = new Date(), fetchImpl = fetch } = {}) {
  const configuration = jobAgentOperatorAlertConfiguration(env);
  if (!configuration) return { status: 'not-configured' };
  const store = redis || configuration.redis;
  const claimed = await claimNextJobAgentOperatorAlert({ redis: store, now });
  if (!claimed) return { status: 'idle' };
  try {
    const response = await fetchImpl(configuration.url, { method: 'POST', signal: AbortSignal.timeout(5_000), redirect: 'error', headers: { Authorization: `Bearer ${configuration.bearerToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': `alert-${claimed.record.id}` }, body: JSON.stringify({ schemaVersion: 1, service: '1ststep-job-agent', contractVersion: claimed.record.contractVersion, contractDigest: claimed.record.contractDigest, event: claimed.record.event, severity: claimed.record.severity, occurredAt: claimed.record.createdAt, environment: claimed.record.environment, contentFree: true, containsCandidateValues: false }) });
    if (response.ok) return (await finish({ redis: store, claimed, accepted: true, now })) || { status: 'lease-lost' };
    return (await finish({ redis: store, claimed, accepted: false, retryable: response.status === 408 || response.status === 429 || response.status >= 500, now })) || { status: 'lease-lost' };
  } catch {
    return (await finish({ redis: store, claimed, accepted: false, retryable: true, now })) || { status: 'lease-lost' };
  }
}

export async function readJobAgentOperatorAlertQueueHealth({ redis, now = new Date(), overdueAfterSeconds = 300 } = {}) {
  if (!redis || typeof redis.zcard !== 'function' || typeof redis.zcount !== 'function') return { status: 'unknown', pending: null, overdue: null, failed: null, contentFree: true, containsCandidateValues: false };
  const threshold = new Date(now).getTime() - Math.max(60, Number(overdueAfterSeconds) || 300) * 1000;
  const [pendingValue, overdueValue, failedValue] = await Promise.all([redis.zcard(dueKey()), redis.zcount(dueKey(), 0, threshold), redis.zcard(deadKey())]);
  const pending = Math.max(0, Number(pendingValue) || 0); const overdue = Math.max(0, Number(overdueValue) || 0); const failed = Math.max(0, Number(failedValue) || 0);
  return { status: failed || overdue ? 'attention-required' : pending ? 'pending' : 'idle', pending, overdue, failed, contentFree: true, containsCandidateValues: false };
}
