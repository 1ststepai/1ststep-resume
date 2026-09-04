import assert from 'node:assert/strict';
import handler, { publicAuthenticationConfiguration } from '../api/app-config.js';

assert.deepEqual(publicAuthenticationConfiguration({}), { restoreAccessAvailable: false });

const readyEnvironment = {
  TIER_SECRET: 'tier-secret-that-is-at-least-thirty-two-characters',
  RESEND_API_KEY: 'synthetic-resend-key',
  RESEND_FROM: 'synthetic@example.invalid',
  UPSTASH_REDIS_REST_URL: 'https://synthetic-redis.example.invalid',
  UPSTASH_REDIS_REST_TOKEN: 'synthetic-redis-token',
  RATE_LIMIT_HASH_SECRET: 'partition-secret-that-is-at-least-thirty-two-characters',
  BETA_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  BETA_DATA_ENCRYPTION_KEY_ID: 'synthetic-key-v1',
};

assert.deepEqual(publicAuthenticationConfiguration(readyEnvironment), { restoreAccessAvailable: true });
assert.deepEqual(publicAuthenticationConfiguration({ ...readyEnvironment, RESEND_FROM: '' }), { restoreAccessAvailable: false });
assert.deepEqual(publicAuthenticationConfiguration({ ...readyEnvironment, BETA_DATA_ENCRYPTION_KEY: '' }), { restoreAccessAvailable: false });

function responseCapture() {
  const capture = { statusCode: null, headers: {}, body: null };
  return {
    capture,
    status(code) { capture.statusCode = code; return this; },
    set(headers) { Object.assign(capture.headers, headers); return this; },
    setHeader(key, value) { capture.headers[key] = value; return this; },
    json(body) { capture.body = body; return this; },
    end() { return this; },
  };
}

const prior = { ...process.env };
try {
  Object.assign(process.env, readyEnvironment);
  const res = responseCapture();
  handler({ method: 'GET', headers: { origin: 'https://app.1ststep.ai' } }, res);
  assert.equal(res.capture.statusCode, 200);
  assert.deepEqual(res.capture.body.authentication, { restoreAccessAvailable: true });
  assert.equal(Object.hasOwn(res.capture.body, 'TIER_SECRET'), false);
  assert.equal(JSON.stringify(res.capture.body).includes('synthetic-resend-key'), false);
} finally {
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(prior, key)) delete process.env[key];
  Object.assign(process.env, prior);
}

console.log('Public app configuration tests passed.');
