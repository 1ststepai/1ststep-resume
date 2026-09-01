import assert from 'node:assert/strict';
import { __resetLocalRateLimitsForTests, enforceDurableRateLimit } from '../lib/durable-rate-limit.js';

const req = { headers: { 'x-real-ip': '203.0.113.10' }, socket: {} };
const development = { NODE_ENV: 'development', TIER_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters' };

__resetLocalRateLimitsForTests();
for (let call = 0; call < 2; call += 1) {
  const result = await enforceDurableRateLimit(req, {
    scope: 'test-minute', subject: 'candidate@example.test', env: development,
    ipRule: { limit: 2, window: '1 m' },
  });
  assert.equal(result.ok, true);
}
const blocked = await enforceDurableRateLimit(req, {
  scope: 'test-minute', subject: 'candidate@example.test', env: development,
  ipRule: { limit: 2, window: '1 m' },
});
assert.equal(blocked.ok, false);
assert.equal(blocked.status, 429);
assert.equal(blocked.dimension, 'ip');
assert.ok(blocked.retryAfter > 0);

__resetLocalRateLimitsForTests();
const weighted = await enforceDurableRateLimit(req, {
  scope: 'test-cost', subject: 'candidate@example.test', env: development,
  globalRule: { limit: 5, window: '1 d', rate: 6 },
});
assert.equal(weighted.ok, false);
assert.equal(weighted.dimension, 'global');

const failClosed = await enforceDurableRateLimit(req, {
  scope: 'test-production', subject: 'candidate@example.test',
  env: { NODE_ENV: 'production', TIER_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters' },
  ipRule: { limit: 2, window: '1 m' },
});
assert.deepEqual(failClosed, { ok: false, status: 503, code: 'RATE_LIMIT_CONFIGURATION', retryAfter: 60 });

const weakHashSecret = await enforceDurableRateLimit(req, {
  scope: 'test-production-secret', subject: 'candidate@example.test',
  env: { NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://example.invalid', UPSTASH_REDIS_REST_TOKEN: 'token', TIER_SECRET: 'short' },
  ipRule: { limit: 2, window: '1 m' },
});
assert.deepEqual(weakHashSecret, { ok: false, status: 503, code: 'RATE_LIMIT_CONFIGURATION', retryAfter: 60 });

console.log('durable-rate-limit-test: all assertions passed');
