import { createHash } from 'node:crypto';

const BASE = '1ststep:job-agent:circuit:v1';
const TTL_SECONDS = 7 * 24 * 60 * 60;
const FAILURE_THRESHOLD = 3;
const MAX_OPEN_MS = 60 * 60 * 1000;

const RECORD_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local record = raw and cjson.decode(raw) or {failureCount=0,status='closed',openedUntil=''}
if ARGV[1] == 'success' then
  record.failureCount = 0
  record.status = 'closed'
  record.openedUntil = ''
  record.lastErrorClass = ''
else
  record.failureCount = record.failureCount + 1
  record.lastErrorClass = ARGV[4]
  if record.failureCount >= tonumber(ARGV[5]) then
    record.status = 'open'
    record.openedUntil = ARGV[3]
  end
end
record.updatedAt = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[6])
return cjson.encode(record)
`;

function safeIdentity(value) { return createHash('sha256').update(String(value || '')).digest('hex'); }
function key(tenantId, source) { return `${BASE}:${tenantId}:${safeIdentity(`${source.provider}:${source.employer}`)}`; }
function parse(value) { if (!value) return null; return typeof value === 'string' ? JSON.parse(value) : value; }

export async function sourceCircuitDecision({ redis, tenantId, source, now = new Date() }) {
  try {
    const record = parse(await redis.get(key(tenantId, source)));
    if (!record || record.status !== 'open') return { allowed: true, status: 'closed', retryAt: null };
    const retryAt = new Date(record.openedUntil);
    if (!Number.isFinite(retryAt.getTime()) || retryAt.getTime() <= now.getTime()) return { allowed: true, status: 'half-open', retryAt: record.openedUntil || null };
    return { allowed: false, status: 'open', retryAt: retryAt.toISOString() };
  } catch { return { allowed: true, status: 'unknown', retryAt: null }; }
}

export async function recordSourceCircuitOutcome({ redis, tenantId, source, succeeded, errorClass = '', now = new Date() }) {
  const existing = parse(await redis.get(key(tenantId, source))) || { failureCount: 0 };
  const failures = succeeded ? 0 : Math.max(0, Number(existing.failureCount) || 0) + 1;
  const openMs = Math.min(MAX_OPEN_MS, 5 * 60 * 1000 * (2 ** Math.max(0, failures - FAILURE_THRESHOLD)));
  const openedUntil = new Date(now.getTime() + openMs).toISOString();
  const raw = await redis.eval(RECORD_SCRIPT, [key(tenantId, source)], [succeeded ? 'success' : 'failure', now.toISOString(), openedUntil, String(errorClass || 'provider-error').slice(0, 60), String(FAILURE_THRESHOLD), String(TTL_SECONDS)]);
  const record = parse(raw);
  return { status: record.status, failureCount: Number(record.failureCount) || 0, retryAt: record.openedUntil || null };
}
