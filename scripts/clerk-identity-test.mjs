import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { authenticateClerkIdentity, clerkIdentityConfiguration, clerkSessionToken } from '../lib/clerk-identity.js';

const env = {
  CLERK_IDENTITY_ENABLED: 'true',
  CLERK_SECRET_KEY: 'sk_test_fixture_only',
  CLERK_JWT_KEY: '-----BEGIN PUBLIC KEY-----\nfixture\n-----END PUBLIC KEY-----',
};
const token = 'header.payload.signature';
const req = { headers: { authorization: `Bearer ${token}` } };

assert.equal(clerkIdentityConfiguration({}).reason, 'CLERK_IDENTITY_DISABLED');
assert.equal(clerkIdentityConfiguration({ CLERK_IDENTITY_ENABLED: 'true' }).reason, 'CLERK_SECRET_KEY_MISSING');
assert.equal(clerkSessionToken(req), token);
assert.equal(clerkSessionToken({ headers: { authorization: 'Bearer not-a-jwt' } }), '');

let verificationOptions;
const identity = await authenticateClerkIdentity(req, {
  env,
  authorizedParties: ['https://app.1ststep.ai'],
  verify: async (actual, options) => {
    assert.equal(actual, token);
    verificationOptions = options;
    return { sub: 'user_fixture123', sid: 'sess_fixture123' };
  },
  clerkClient: {
    users: {
      async getUser(subject) {
        assert.equal(subject, 'user_fixture123');
        return {
          primaryEmailAddressId: 'email_fixture',
          emailAddresses: [{ id: 'email_fixture', emailAddress: 'Person@Example.test', verification: { status: 'verified' } }],
        };
      },
    },
  },
});
assert.equal(identity.ok, true);
assert.equal(identity.subject, 'person@example.test');
assert.equal(identity.providerSubject, 'user_fixture123');
assert.deepEqual(verificationOptions.authorizedParties, ['https://app.1ststep.ai']);
assert.equal('secretKey' in verificationOptions, false, 'JWT verification should use the public key, not send the Clerk secret into the verifier.');

const unverified = await authenticateClerkIdentity(req, {
  env,
  verify: async () => ({ sub: 'user_fixture123' }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddressId: 'e1', emailAddresses: [{ id: 'e1', emailAddress: 'person@example.test', verification: { status: 'unverified' } }] }) } },
});
assert.equal(unverified.ok, false);
assert.equal(unverified.code, 'CLERK_SESSION_INVALID');

const sessionApi = await readFile(new URL('../api/user-session.js', import.meta.url), 'utf8');
assert.match(sessionApi, /action\s*\|\| ''\) === 'clerk-exchange'/);
assert.match(sessionApi, /tier: 'free', entitlements: \[\]/, 'Clerk identity exchange must never manufacture paid access.');
assert.match(sessionApi, /requires-existing-stripe-resolution/);
assert.doesNotMatch(sessionApi, /CLERK[^\n]*(?:complete|job-agent-controlled-beta)/, 'Clerk configuration must not be coupled to paid entitlement.');

console.log('Clerk identity is opt-in, origin-bound, verified-email-only, and separate from paid entitlement.');
