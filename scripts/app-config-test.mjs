import assert from 'node:assert/strict';
import handler, { publicAuthenticationConfiguration } from '../api/app-config.js';

const clerkDisabled = { clerk: { enabled: false, publishableKey: null } };
assert.deepEqual(publicAuthenticationConfiguration({}), { restoreAccessAvailable: false, ...clerkDisabled });

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

assert.deepEqual(publicAuthenticationConfiguration(readyEnvironment), { restoreAccessAvailable: true, ...clerkDisabled });
assert.deepEqual(publicAuthenticationConfiguration({ ...readyEnvironment, RESEND_FROM: '' }), { restoreAccessAvailable: false, ...clerkDisabled });
assert.deepEqual(publicAuthenticationConfiguration({ ...readyEnvironment, BETA_DATA_ENCRYPTION_KEY: '' }), { restoreAccessAvailable: false, ...clerkDisabled });
const clerkReady = { ...readyEnvironment, CLERK_IDENTITY_ENABLED: 'true', CLERK_SECRET_KEY: 'synthetic-clerk-secret', CLERK_JWT_KEY: 'synthetic-public-key', CLERK_PUBLISHABLE_KEY: 'pk_live_fixture' };
assert.deepEqual(publicAuthenticationConfiguration(clerkReady).clerk, { enabled: true, publishableKey: 'pk_live_fixture' });
assert.equal(JSON.stringify(publicAuthenticationConfiguration(clerkReady)).includes('synthetic-clerk-secret'), false);
assert.equal(publicAuthenticationConfiguration({ ...clerkReady, CLERK_JWT_KEY: '' }).clerk.enabled, false);

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
  assert.deepEqual(res.capture.body.authentication, { restoreAccessAvailable: true, ...clerkDisabled });
  assert.equal(Object.hasOwn(res.capture.body, 'TIER_SECRET'), false);
  assert.equal(JSON.stringify(res.capture.body).includes('synthetic-resend-key'), false);
} finally {
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(prior, key)) delete process.env[key];
  Object.assign(process.env, prior);
}

console.log('Public app configuration tests passed.');
