import assert from 'node:assert/strict';
import {
  claimStripeWebhookEvent, completeStripeWebhookEvent, publicStripeWebhookIdempotencyConfiguration,
  releaseStripeWebhookEvent, stripeWebhookIdempotencyConfiguration, STRIPE_WEBHOOK_IDEMPOTENCY_SCRIPTS,
} from '../lib/stripe-webhook-idempotency.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.keysSeen = []; }
  async eval(script, keys, args) {
    this.keysSeen.push(...keys);
    const key = keys[0];
    const existing = this.values.get(key) || null;
    if (script === STRIPE_WEBHOOK_IDEMPOTENCY_SCRIPTS.CLAIM_SCRIPT) {
      if (existing?.status === 'completed') return ['completed', JSON.stringify(existing)];
      if (existing?.status === 'processing' && existing.leaseUntil > args[0]) return ['busy', JSON.stringify(existing)];
      const record = {
        schemaVersion: 1, status: 'processing', attempts: Number(existing?.attempts || 0) + 1,
        leaseTokenHash: args[1], leaseUntil: args[3], createdAt: existing?.createdAt || args[2], updatedAt: args[2], completedAt: '',
      };
      this.values.set(key, record);
      return ['claimed', JSON.stringify(record)];
    }
    if (!existing) return ['missing'];
    if (existing.status !== 'processing' || existing.leaseTokenHash !== args[0]) return ['lease_lost'];
    if (script === STRIPE_WEBHOOK_IDEMPOTENCY_SCRIPTS.COMPLETE_SCRIPT) {
      const record = { ...existing, status: 'completed', leaseTokenHash: '', leaseUntil: '', completedAt: args[1], updatedAt: args[1] };
      this.values.set(key, record);
      return ['completed', JSON.stringify(record)];
    }
    if (script === STRIPE_WEBHOOK_IDEMPOTENCY_SCRIPTS.RELEASE_SCRIPT) {
      const record = { ...existing, status: 'retry', leaseTokenHash: '', leaseUntil: '', updatedAt: args[1] };
      this.values.set(key, record);
      return ['released', JSON.stringify(record)];
    }
    throw new Error('Unexpected script.');
  }
}

const secret = 'stripe-idempotency-secret'.padEnd(48, 'x');
const eventId = 'evt_1SafeSyntheticEvent0001';
const redis = new FakeRedis();
assert.equal(stripeWebhookIdempotencyConfiguration({}), null);
assert.equal(stripeWebhookIdempotencyConfiguration({
  UPSTASH_REDIS_REST_URL: 'https://redis.example.test', UPSTASH_REDIS_REST_TOKEN: 'token', STRIPE_WEBHOOK_IDEMPOTENCY_SECRET: 'short',
}), null);
assert.deepEqual(
  publicStripeWebhookIdempotencyConfiguration({ redis, secret, retentionSeconds: 35 * 86_400, leaseSeconds: 90 }),
  { ready: true, retentionDays: 35, leaseSeconds: 90, storesRawEventIds: false },
);

const first = await claimStripeWebhookEvent({ redis, secret, eventId, now: new Date('2026-08-30T12:00:00.000Z') });
assert.equal(first.status, 'claimed');
assert.equal(first.record.attempts, 1);
assert.doesNotMatch(redis.keysSeen.join('|'), new RegExp(eventId));
assert.doesNotMatch(JSON.stringify([...redis.values.values()]), new RegExp(eventId));

const concurrent = await claimStripeWebhookEvent({ redis, secret, eventId, now: new Date('2026-08-30T12:00:30.000Z') });
assert.deepEqual({ status: concurrent.status, duplicate: concurrent.duplicate }, { status: 'busy', duplicate: true });
assert.equal((await releaseStripeWebhookEvent({ redis, secret, eventId, leaseToken: first.leaseToken, now: new Date('2026-08-30T12:00:31.000Z') })).status, 'released');

const retry = await claimStripeWebhookEvent({ redis, secret, eventId, now: new Date('2026-08-30T12:00:32.000Z') });
assert.equal(retry.status, 'claimed');
assert.equal(retry.record.attempts, 2);
await assert.rejects(() => completeStripeWebhookEvent({ redis, secret, eventId, leaseToken: first.leaseToken, now: new Date('2026-08-30T12:00:33.000Z') }), /lost its lease/i);
assert.equal((await completeStripeWebhookEvent({ redis, secret, eventId, leaseToken: retry.leaseToken, now: new Date('2026-08-30T12:00:34.000Z') })).status, 'completed');

const duplicate = await claimStripeWebhookEvent({ redis, secret, eventId, now: new Date('2026-08-30T12:05:00.000Z') });
assert.deepEqual({ status: duplicate.status, duplicate: duplicate.duplicate }, { status: 'completed', duplicate: true });

await claimStripeWebhookEvent({ redis, secret, eventId: 'evt_1SafeSyntheticEvent0002', now: new Date('2026-08-30T12:00:00.000Z'), leaseSeconds: 10 });
const afterLease = await claimStripeWebhookEvent({ redis, secret, eventId: 'evt_1SafeSyntheticEvent0002', now: new Date('2026-08-30T12:00:11.000Z'), leaseSeconds: 10 });
assert.equal(afterLease.status, 'claimed');
assert.equal(afterLease.record.attempts, 2);
await assert.rejects(() => claimStripeWebhookEvent({ redis, secret, eventId: 'not-a-stripe-event' }), /valid Stripe event ID/i);

console.log('Durable pseudonymous Stripe webhook claim, concurrency, retry, completion, and lease-recovery tests passed.');
