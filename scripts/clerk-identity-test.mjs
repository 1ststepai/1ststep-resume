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

const diagnostics = [];
const unverified = await authenticateClerkIdentity(req, {
  env,
  reportFailure: event => diagnostics.push(event),
  verify: async () => ({ sub: 'user_fixture123' }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddressId: 'e1', emailAddresses: [{ id: 'e1', emailAddress: 'person@example.test', verification: { status: 'unverified' } }] }) } },
});
assert.equal(unverified.ok, false);
assert.equal(unverified.code, 'CLERK_SESSION_INVALID');
assert.deepEqual(diagnostics, [{ type: 'clerk-identity-rejected', stage: 'verified-primary-email' }]);
for (const stage of ['token-verification', 'subject-validation', 'identity-lookup']) {
  const result = await authenticateClerkIdentity(req, {
    env,
    verify: async () => { if (stage === 'token-verification') throw new Error(`private ${token}`); return { sub: stage === 'subject-validation' ? 'private@example.test' : 'user_fixture123' }; },
    clerkClient: { users: { getUser: async () => { throw new Error('private@example.test sk_test_private'); } } },
    reportFailure: event => diagnostics.push(event),
  });
  assert.deepEqual(result, { ok: false, status: 401, code: 'CLERK_SESSION_INVALID' });
  assert.deepEqual(diagnostics.at(-1), { type: 'clerk-identity-rejected', stage });
}
assert.doesNotMatch(JSON.stringify(diagnostics), /private|header|signature|sk_test|@/);
assert.equal((await authenticateClerkIdentity(req, { env, verify: async () => { throw new Error('rejected'); }, reportFailure: () => { throw new Error('logger unavailable'); } })).ok, false);

const sessionApi = await readFile(new URL('../api/user-session.js', import.meta.url), 'utf8');
assert.match(sessionApi, /action\s*\|\| ''\) === 'clerk-exchange'/);
assert.match(sessionApi, /sendVerifiedSubscriptionSession\([\s\S]*res, identity.subject/, 'Use the server-verified email with the shared Stripe resolver.');
assert.doesNotMatch(sessionApi, /tier: 'complete'/, 'Clerk identity alone must not grant a paid tier.');
assert.doesNotMatch(sessionApi, /CLERK[^\n]*(?:complete|job-agent-controlled-beta)/, 'Clerk configuration must not be coupled to paid entitlement.');

console.log('Clerk identity is opt-in, origin-bound, verified-email-only, and separate from paid entitlement.');
