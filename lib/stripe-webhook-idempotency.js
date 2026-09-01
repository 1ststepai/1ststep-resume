import { createHmac, randomBytes } from 'node:crypto';
import { Redis } from '@upstash/redis';

const BASE = '1ststep:stripe-webhook:v1';
const RETENTION_SECONDS = 35 * 24 * 60 * 60;
const LEASE_SECONDS = 90;
const EVENT_ID = /^evt_[A-Za-z0-9_]{8,200}$/;

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

function eventReference(eventId, secret) {
  if (!EVENT_ID.test(String(eventId || ''))) throw new Error('A valid Stripe event ID is required.');
  return createHmac('sha256', secret).update(`stripe-event.v1:${eventId}`).digest('hex');
}

function leaseHash(token, secret) {
  return createHmac('sha256', secret).update(`stripe-event-lease.v1:${token}`).digest('hex');
}

function decode(value) {
  if (!value) return null;
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; }
}

export function stripeWebhookIdempotencyConfiguration(env = process.env) {
  const secret = String(env.STRIPE_WEBHOOK_IDEMPOTENCY_SECRET || '');
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN || Buffer.byteLength(secret, 'utf8') < 32) return null;
  return {
    redis: new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
    secret,
    retentionSeconds: RETENTION_SECONDS,
    leaseSeconds: LEASE_SECONDS,
  };
}

export function publicStripeWebhookIdempotencyConfiguration(configuration) {
  return {
    ready: Boolean(configuration?.redis && configuration?.secret),
    retentionDays: configuration?.retentionSeconds ? Math.floor(configuration.retentionSeconds / 86_400) : null,
    leaseSeconds: Number(configuration?.leaseSeconds) || null,
    storesRawEventIds: false,
  };
}

export async function claimStripeWebhookEvent({ redis, secret, eventId, now = new Date(), retentionSeconds = RETENTION_SECONDS, leaseSeconds = LEASE_SECONDS }) {
  if (!redis || Buffer.byteLength(String(secret || ''), 'utf8') < 32) throw new Error('Durable Stripe webhook idempotency is not configured.');
  const current = at(now);
  const reference = eventReference(eventId, secret);
  const key = `${BASE}:event:${reference}`;
  const leaseToken = randomBytes(24).toString('base64url');
  const response = await redis.eval(CLAIM_SCRIPT, [key], [
    current.toISOString(), leaseHash(leaseToken, secret), current.toISOString(),
    new Date(current.getTime() + leaseSeconds * 1000).toISOString(), String(retentionSeconds),
  ]);
  const status = Array.isArray(response) ? response[0] : null;
  if (status === 'completed') return { status: 'completed', duplicate: true, eventReference: reference };
  if (status === 'busy') return { status: 'busy', duplicate: true, eventReference: reference };
  if (status !== 'claimed') throw new Error('Stripe webhook event claim failed.');
  return { status: 'claimed', duplicate: false, eventReference: reference, leaseToken, record: decode(response[1]) };
}

export async function completeStripeWebhookEvent({ redis, secret, eventId, leaseToken, now = new Date(), retentionSeconds = RETENTION_SECONDS }) {
  const current = at(now);
  const key = `${BASE}:event:${eventReference(eventId, secret)}`;
  const response = await redis.eval(COMPLETE_SCRIPT, [key], [leaseHash(leaseToken, secret), current.toISOString(), String(retentionSeconds)]);
  if (!Array.isArray(response) || response[0] !== 'completed') throw new Error('Stripe webhook event completion lost its lease.');
  return { status: 'completed', record: decode(response[1]) };
}

export async function releaseStripeWebhookEvent({ redis, secret, eventId, leaseToken, now = new Date(), retentionSeconds = RETENTION_SECONDS }) {
  const current = at(now);
  const key = `${BASE}:event:${eventReference(eventId, secret)}`;
  const response = await redis.eval(RELEASE_SCRIPT, [key], [leaseHash(leaseToken, secret), current.toISOString(), String(retentionSeconds)]);
  return { status: Array.isArray(response) ? response[0] : 'unknown' };
}

export const STRIPE_WEBHOOK_IDEMPOTENCY_SCRIPTS = Object.freeze({ CLAIM_SCRIPT, COMPLETE_SCRIPT, RELEASE_SCRIPT });
