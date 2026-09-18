import assert from 'node:assert/strict';
import {
  claimTallyWebhookEvent, completeTallyWebhookEvent, releaseTallyWebhookEvent,
  TALLY_WEBHOOK_IDEMPOTENCY_SCRIPTS,
} from '../lib/tally-webhook-idempotency.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.keysSeen = []; }
  async eval(script, keys, args) {
    this.keysSeen.push(...keys);
    const key = keys[0];
    const existing = this.values.get(key);
    if (script === TALLY_WEBHOOK_IDEMPOTENCY_SCRIPTS.CLAIM_SCRIPT) {
      if (existing?.status === 'completed') return ['completed', JSON.stringify(existing)];
      if (existing?.status === 'processing' && existing.leaseUntil > args[0]) return ['busy', JSON.stringify(existing)];
      const record = { status: 'processing', leaseTokenHash: args[1], leaseUntil: args[3], attempts: Number(existing?.attempts || 0) + 1 };
      this.values.set(key, record);
      return ['claimed', JSON.stringify(record)];
    }
    if (!existing) return ['missing'];
    if (existing.status !== 'processing' || existing.leaseTokenHash !== args[0]) return ['lease_lost'];
    if (script === TALLY_WEBHOOK_IDEMPOTENCY_SCRIPTS.COMPLETE_SCRIPT) {
      this.values.set(key, { ...existing, status: 'completed', leaseTokenHash: '', leaseUntil: '' });
      return ['completed', '{}'];
    }
    if (script === TALLY_WEBHOOK_IDEMPOTENCY_SCRIPTS.RELEASE_SCRIPT) {
      this.values.set(key, { ...existing, status: 'retry', leaseTokenHash: '', leaseUntil: '' });
      return ['released', '{}'];
    }
    throw new Error('Unexpected script');
  }
}

const redis = new FakeRedis();
const secret = 'tally-idempotency-secret-that-is-at-least-32-characters';
const eventId = '75f4b67e-34e8-4d09-8c91-91946bcfcf43';
const first = await claimTallyWebhookEvent({ redis, secret, eventId, now: new Date('2026-09-10T12:00:00Z') });
const concurrent = await claimTallyWebhookEvent({ redis, secret, eventId, now: new Date('2026-09-10T12:00:01Z') });
assert.equal(first.status, 'claimed');
assert.equal(concurrent.status, 'busy');
assert.doesNotMatch(redis.keysSeen.join('|'), new RegExp(eventId), 'raw Tally event IDs must not be stored in Redis keys');

await releaseTallyWebhookEvent({ redis, secret, eventId, leaseToken: first.leaseToken, now: new Date('2026-09-10T12:00:02Z') });
const retry = await claimTallyWebhookEvent({ redis, secret, eventId, now: new Date('2026-09-10T12:00:03Z') });
assert.equal(retry.status, 'claimed');
await completeTallyWebhookEvent({ redis, secret, eventId, leaseToken: retry.leaseToken, now: new Date('2026-09-10T12:00:04Z') });
assert.equal((await claimTallyWebhookEvent({ redis, secret, eventId, now: new Date('2026-09-10T12:01:00Z') })).status, 'completed');

const hashOnly = await claimTallyWebhookEvent({ redis, secret, payloadHash: 'a'.repeat(64), now: new Date('2026-09-10T12:00:00Z') });
assert.equal(hashOnly.status, 'claimed', 'a verified payload hash must be a stable fallback when Tally omits eventId');
await assert.rejects(() => claimTallyWebhookEvent({ redis, secret, eventId: 'invalid', payloadHash: 'invalid' }), /valid Tally event ID/i);

console.log('Tally durable claim, concurrency, retry, completion, and hash fallback tests passed');
