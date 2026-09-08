import assert from 'node:assert/strict';
import { sendVerifiedSubscriptionSession, verifyTierToken } from '../api/subscription.js';
import { publicAuthenticationConfiguration } from '../lib/public-authentication-configuration.js';

process.env.TIER_SECRET = 'isolated-clerk-test-secret-at-least-32-characters';
process.env.OWNER_ACCESS_EMAILS = '';
process.env.BETA_EMAILS = '';
const email = 'verified@example.test';
function response() {
  return { headers: {}, status(code) { this.code = code; return this; }, setHeader(k,v) { this.headers[k] = v; }, json(value) { this.body = value; return this; } };
}
const req = { query: {}, headers: {} };
for (const status of ['active', 'trialing']) {
  const res = response();
  await sendVerifiedSubscriptionSession(req, res, email, { signedIn: true }, {
    customers: { list: async (input) => { assert.equal(input.email, email); return { data: [{ id: 'cus_fixture' }] }; } },
    subscriptions: { list: async (input) => ({ data: input.status === status ? [{ status, current_period_end: Math.floor(Date.now()/1000)+86400, items: { data: [{ price: { product: { name: 'Job Hunt Pass' } } }] } }] : [] }) },
  });
  assert.equal(res.code, 200);
  assert.equal(res.body.tier, 'complete');
  assert.equal(res.body.status, status);
  assert.equal(verifyTierToken(res.body.tierToken).email, email);
}
const free = response();
await sendVerifiedSubscriptionSession(req, free, email, {}, { customers: { list: async () => ({ data: [] }) } });
assert.equal(free.body.tier, 'free');
const outage = response();
await sendVerifiedSubscriptionSession(req, outage, email, {}, { customers: { list: async () => { throw new Error('fixture outage'); } } });
assert.equal(outage.code, 503);
assert.equal(outage.headers['Set-Cookie'], undefined, 'An outage cannot replace an existing paid cookie with free access.');
const config = publicAuthenticationConfiguration({ CLERK_SECRET_KEY: 'never-public', CLERK_PUBLISHABLE_KEY: 'pk_live_fixture' });
assert.equal(config.clerk.enabled, false);
assert.equal(JSON.stringify(config).includes('never-public'), false);
assert.equal(config.clerk.publishableKey, null);
console.log('Clerk exchange preserves verified active/trial access, grants free only after a successful lookup, and preserves sessions on outages.');
