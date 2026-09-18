import { createHmac, randomBytes } from 'node:crypto';
import { Redis } from '@upstash/redis';

const BASE = '1ststep:tally-webhook:v1';
const RETENTION_SECONDS = 35 * 24 * 60 * 60;
const LEASE_SECONDS = 90;
const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYLOAD_HASH = /^[a-f0-9]{64}$/;

const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw then
  local record = cjson.decode(raw)
  if record.status == 'completed' then return {'completed', raw} end
  if record.status == 'processing' and record.leaseUntil > ARGV[1] then return {'busy', raw} end
end
local attempts = 0
local createdAt = ARGV[3]
if raw then
  local previous = cjson.decode(raw)
  attempts = tonumber(previous.attempts) or 0
  createdAt = previous.createdAt or createdAt
end
local record = {
  schemaVersion = 1,
  status = 'processing',
  attempts = attempts + 1,
  leaseTokenHash = ARGV[2],
  leaseUntil = ARGV[4],
  createdAt = createdAt,
  updatedAt = ARGV[3],
  completedAt = ''
}
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
return {'claimed', cjson.encode(record)}
`;

const COMPLETE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.status ~= 'processing' or record.leaseTokenHash ~= ARGV[1] then return {'lease_lost'} end
record.status = 'completed'
record.leaseTokenHash = ''
record.leaseUntil = ''
record.completedAt = ARGV[2]
record.updatedAt = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[3])
return {'completed', cjson.encode(record)}
`;

const RELEASE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.status ~= 'processing' or record.leaseTokenHash ~= ARGV[1] then return {'lease_lost'} end
record.status = 'retry'
record.leaseTokenHash = ''
record.leaseUntil = ''
record.updatedAt = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[3])
return {'released', cjson.encode(record)}
`;

function at(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) throw new Error('A valid webhook processing timestamp is required.');
  return date;
}

function stableEventIdentifier(eventId, payloadHash) {
  if (EVENT_ID.test(String(eventId || ''))) return `id:${String(eventId).toLowerCase()}`;
  if (PAYLOAD_HASH.test(String(payloadHash || ''))) return `hash:${payloadHash}`;
  throw new Error('A valid Tally event ID or verified payload hash is required.');
}

export function tallyEventReference({ eventId, payloadHash, secret }) {
  const stableId = stableEventIdentifier(eventId, payloadHash);
  return createHmac('sha256', secret).update(`tally-event.v1:${stableId}`).digest('hex');
}

function leaseHash(token, secret) {
  return createHmac('sha256', secret).update(`tally-event-lease.v1:${token}`).digest('hex');
}

export function tallyWebhookIdempotencyConfiguration(env = process.env) {
  const secret = String(env.TALLY_WEBHOOK_IDEMPOTENCY_SECRET || env.TALLY_SIGNING_SECRET || '');
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN || Buffer.byteLength(secret, 'utf8') < 32) return null;
  return {
    redis: new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
    secret,
    retentionSeconds: RETENTION_SECONDS,
    leaseSeconds: LEASE_SECONDS,
  };
}

export async function claimTallyWebhookEvent({ redis, secret, eventId, payloadHash, now = new Date(), retentionSeconds = RETENTION_SECONDS, leaseSeconds = LEASE_SECONDS }) {
  if (!redis || Buffer.byteLength(String(secret || ''), 'utf8') < 32) throw new Error('Durable Tally webhook idempotency is not configured.');
  const current = at(now);
  const eventReference = tallyEventReference({ eventId, payloadHash, secret });
  const key = `${BASE}:event:${eventReference}`;
  const leaseToken = randomBytes(24).toString('base64url');
  const response = await redis.eval(CLAIM_SCRIPT, [key], [
    current.toISOString(), leaseHash(leaseToken, secret), current.toISOString(),
    new Date(current.getTime() + leaseSeconds * 1000).toISOString(), String(retentionSeconds),
  ]);
  const status = Array.isArray(response) ? response[0] : null;
  if (status === 'completed') return { status: 'completed', duplicate: true, eventReference };
  if (status === 'busy') return { status: 'busy', duplicate: true, eventReference };
  if (status !== 'claimed') throw new Error('Tally webhook event claim failed.');
  return { status: 'claimed', duplicate: false, eventReference, leaseToken };
}

export async function completeTallyWebhookEvent({ redis, secret, eventId, payloadHash, leaseToken, now = new Date(), retentionSeconds = RETENTION_SECONDS }) {
  const current = at(now);
  const reference = tallyEventReference({ eventId, payloadHash, secret });
  const response = await redis.eval(COMPLETE_SCRIPT, [`${BASE}:event:${reference}`], [leaseHash(leaseToken, secret), current.toISOString(), String(retentionSeconds)]);
  if (!Array.isArray(response) || response[0] !== 'completed') throw new Error('Tally webhook event completion lost its lease.');
  return { status: 'completed' };
}

export async function releaseTallyWebhookEvent({ redis, secret, eventId, payloadHash, leaseToken, now = new Date(), retentionSeconds = RETENTION_SECONDS }) {
  const current = at(now);
  const reference = tallyEventReference({ eventId, payloadHash, secret });
  const response = await redis.eval(RELEASE_SCRIPT, [`${BASE}:event:${reference}`], [leaseHash(leaseToken, secret), current.toISOString(), String(retentionSeconds)]);
  return { status: Array.isArray(response) ? response[0] : 'unknown' };
}

export const TALLY_WEBHOOK_IDEMPOTENCY_SCRIPTS = Object.freeze({ CLAIM_SCRIPT, COMPLETE_SCRIPT, RELEASE_SCRIPT });
