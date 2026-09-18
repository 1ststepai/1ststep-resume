import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  consumeRestoreChallenge, registerRestoreChallenge,
} from '../lib/user-session-store.js';

process.env.TIER_SECRET = 'test-tier-secret-that-is-at-least-32-characters';
const { createRestoreChallenge, redeemSubscriptionRestoreChallenge, verifyRestoreChallenge } = await import('../api/subscription.js');

class FakeRedis {
  constructor() { this.values = new Map(); }
  async set(key, value, options) {
    if (options?.nx && this.values.has(key)) return null;
    this.values.set(key, value);
    return 'OK';
  }
  async eval(_script, [key]) {
    if (!this.values.has(key)) return 'missing';
    this.values.delete(key);
    return 'consumed';
  }
}

const now = Date.parse('2026-09-10T12:00:00.000Z');
const email = 'person@example.com';
const code = '123456';
const client = 'job-agent';
const partitionSecret = 'partition-secret-that-is-at-least-32-characters';
const redis = new FakeRedis();
const challenge = createRestoreChallenge(email, code, client, now);

assert.equal(verifyRestoreChallenge(email, '000000', challenge.token, client, now + 1000), null, 'wrong codes must fail');
assert.equal(verifyRestoreChallenge(email, code, challenge.token, 'legacy', now + 1000), null, 'challenges must be client-bound');
assert.equal(verifyRestoreChallenge('other@example.com', code, challenge.token, client, now + 1000), null, 'challenges must be user-bound');
assert.equal(verifyRestoreChallenge(email, code, challenge.token, client, now + 10 * 60 * 1000 + 1), null, 'expired challenges must fail');
assert.equal(verifyRestoreChallenge(email, code, challenge.token, client, now + 1000)?.nonce, challenge.data.nonce);

await registerRestoreChallenge({ redis, subject: email, nonce: challenge.data.nonce, client, partitionSecret, ttlSeconds: 600 });
const attempts = await Promise.all([
  consumeRestoreChallenge({ redis, subject: email, nonce: challenge.data.nonce, client, partitionSecret }),
  consumeRestoreChallenge({ redis, subject: email, nonce: challenge.data.nonce, client, partitionSecret }),
]);
assert.equal(attempts.filter(result => result.consumed).length, 1, 'exactly one concurrent redemption may consume the nonce');
assert.equal((await consumeRestoreChallenge({ redis, subject: email, nonce: challenge.data.nonce, client, partitionSecret })).consumed, false, 'sequential replay must fail');

const routeRedis = new FakeRedis();
const routeChallenge = createRestoreChallenge(email, code, client, now);
await registerRestoreChallenge({ redis: routeRedis, subject: email, nonce: routeChallenge.data.nonce, client, partitionSecret, ttlSeconds: 600 });
let sessionsIssued = 0;
const routeAttempts = await Promise.all([
  redeemSubscriptionRestoreChallenge({ email, code, challenge: routeChallenge.token, client, runtime: { redis: routeRedis, partitionSecret }, now: now + 1000, onRedeemed: async () => { sessionsIssued += 1; return 'session'; } }),
  redeemSubscriptionRestoreChallenge({ email, code, challenge: routeChallenge.token, client, runtime: { redis: routeRedis, partitionSecret }, now: now + 1000, onRedeemed: async () => { sessionsIssued += 1; return 'session'; } }),
]);
assert.equal(routeAttempts.filter(result => result.status === 'redeemed').length, 1, 'the route redemption boundary must admit one concurrent request');
assert.equal(sessionsIssued, 1, 'only one concurrent verification may issue a session');

const payload = routeChallenge.token.split('.')[0];
const wrongPurposeData = { ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')), purpose: 'different-purpose' };
const wrongPurposePayload = Buffer.from(JSON.stringify(wrongPurposeData)).toString('base64url');
const wrongPurposeSignature = createHmac('sha256', process.env.TIER_SECRET).update(wrongPurposePayload).digest('hex');
assert.equal(verifyRestoreChallenge(email, code, `${wrongPurposePayload}.${wrongPurposeSignature}`, client, now + 1000), null, 'wrong-purpose tokens must fail');

const conciergeSource = await readFile(new URL('../concierge.js', import.meta.url), 'utf8');
assert.match(conciergeSource, /action=restore-code&client=job-agent&email=/, 'Job Agent challenge creation and redemption must use the same client binding');

console.log('subscription restore replay regression tests passed');
