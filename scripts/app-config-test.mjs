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
const clerkReady = { ...readyEnvironment, VERCEL_ENV: 'preview', CLERK_IDENTITY_ENABLED: 'true', CLERK_SECRET_KEY: 'synthetic-clerk-secret', CLERK_JWT_KEY: 'synthetic-public-key', CLERK_PUBLISHABLE_KEY: 'pk_test_fixture' };
const expectedDiagnostics = {
  identityEnabled: true,
  publishableKeyPresent: true,
  publishableKeyPreviewPrefixValid: true,
  secretKeyPresent: true,
  jwtKeyPresent: true,
};
assert.deepEqual(publicAuthenticationConfiguration(clerkReady).clerk, { enabled: true, publishableKey: 'pk_test_fixture', diagnostics: expectedDiagnostics });
for (const [override, predicate] of [
  [{ CLERK_IDENTITY_ENABLED: 'TRUE' }, 'identityEnabled'],
  [{ CLERK_PUBLISHABLE_KEY: '' }, 'publishableKeyPresent'],
  [{ CLERK_PUBLISHABLE_KEY: 'pk_live_fixture' }, 'publishableKeyPreviewPrefixValid'],
  [{ CLERK_SECRET_KEY: '' }, 'secretKeyPresent'],
  [{ CLERK_JWT_KEY: '' }, 'jwtKeyPresent'],
]) {
  const clerk = publicAuthenticationConfiguration({ ...clerkReady, ...override }).clerk;
  assert.equal(clerk.enabled, false);
  assert.equal(clerk.diagnostics[predicate], false);
  assert.equal(clerk.publishableKey, null);
  assert.deepEqual(Object.keys(clerk.diagnostics), Object.keys(expectedDiagnostics));
  assert.equal(JSON.stringify(clerk).includes('synthetic-clerk-secret'), false);
  assert.equal(JSON.stringify(clerk).includes('synthetic-public-key'), false);
  assert.equal(JSON.stringify(clerk).includes('pk_live_fixture'), false);
}
assert.equal(JSON.stringify(publicAuthenticationConfiguration(clerkReady).clerk.diagnostics).includes('pk_test_fixture'), false);
assert.equal(JSON.stringify(publicAuthenticationConfiguration(clerkReady)).includes('synthetic-clerk-secret'), false);
assert.equal(publicAuthenticationConfiguration({ ...clerkReady, CLERK_JWT_KEY: '' }).clerk.enabled, false);
assert.equal(publicAuthenticationConfiguration({ ...clerkReady, VERCEL_ENV: 'production' }).clerk.enabled, false);
assert.equal(publicAuthenticationConfiguration({ ...clerkReady, VERCEL_ENV: 'production', CLERK_PUBLISHABLE_KEY: 'pk_live_fixture' }).clerk.enabled, true);
assert.equal(Object.hasOwn(publicAuthenticationConfiguration({ ...clerkReady, VERCEL_ENV: 'production', CLERK_PUBLISHABLE_KEY: 'pk_live_fixture' }).clerk, 'diagnostics'), false);
assert.equal(publicAuthenticationConfiguration({ ...clerkReady, CLERK_PUBLISHABLE_KEY: 'pk_live_fixture' }).clerk.enabled, false);

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
  Object.assign(process.env, readyEnvironment, { VERCEL_ENV: 'development' });
  const res = responseCapture();
  handler({ method: 'GET', headers: { origin: 'https://app.1ststep.ai' } }, res);
  assert.equal(res.capture.statusCode, 200);
  assert.deepEqual(res.capture.body.authentication, { restoreAccessAvailable: true, ...clerkDisabled });
  assert.equal(Object.hasOwn(res.capture.body, 'TIER_SECRET'), false);
  assert.equal(JSON.stringify(res.capture.body).includes('synthetic-resend-key'), false);
  Object.assign(process.env, clerkReady, { CLERK_PUBLISHABLE_KEY: 'pk_live_fixture' });
  const previewRes = responseCapture();
  handler({ method: 'GET', headers: { origin: 'https://example.vercel.app' } }, previewRes);
  assert.equal(previewRes.capture.statusCode, 200);
  assert.equal(previewRes.capture.body.authentication.clerk.enabled, false);
  assert.equal(previewRes.capture.body.authentication.clerk.publishableKey, null);
  assert.deepEqual(previewRes.capture.body.authentication.clerk.diagnostics, { ...expectedDiagnostics, publishableKeyPreviewPrefixValid: false });
  assert.equal(JSON.stringify(previewRes.capture.body).includes('pk_live_fixture'), false);
  assert.equal(JSON.stringify(previewRes.capture.body).includes('synthetic-clerk-secret'), false);
  assert.equal(JSON.stringify(previewRes.capture.body).includes('synthetic-public-key'), false);
} finally {
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(prior, key)) delete process.env[key];
  Object.assign(process.env, prior);
}

console.log('Public app configuration tests passed.');
