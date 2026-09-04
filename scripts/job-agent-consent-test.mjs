import assert from 'node:assert/strict';
import {
  activeJobAgentConsent, createJobAgentConsent, grantJobAgentConsent, jobAgentConsentPolicyConfiguration,
  publicJobAgentConsent, renewJobAgentConsent, revokeJobAgentConsent,
} from '../lib/job-agent-consent-domain.js';
import {
  decryptJobAgentConsent, deleteJobAgentConsent, encryptJobAgentConsent, readJobAgentConsent,
  jobAgentConsentGate, requireActiveJobAgentConsent, requireConfiguredJobAgentConsent,
  requireConfiguredJobAgentConsentForTenant, saveJobAgentConsent, tenantConsentKey,
} from '../lib/job-agent-consent-store.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

const env = { JOB_AGENT_COUNSEL_APPROVED: 'true', JOB_AGENT_TERMS_VERSION: 'terms-2026-08-29', JOB_AGENT_PRIVACY_VERSION: 'privacy-2026-08-29', JOB_AGENT_AUTHORIZATION_VERSION: 'authorization-2026-08-29' };
const policy = jobAgentConsentPolicyConfiguration(env);
assert.equal(policy.ready, true);
assert.equal(policy.bundle.schemaVersion, 1);
assert.match(policy.bundle.binding.bundleDigest, /^[a-f0-9]{64}$/);
assert.match(policy.bundle.documents.terms.sha256, /^[a-f0-9]{64}$/);
assert.equal(jobAgentConsentPolicyConfiguration({ ...env, JOB_AGENT_COUNSEL_APPROVED: 'false' }).ready, false);
assert.throws(() => grantJobAgentConsent({}, policy), /affirmatively accepted/);
assert.throws(() => grantJobAgentConsent({ age18OrOlder: true, termsAccepted: true, privacyAcknowledged: true, candidateAuthorizationAccepted: true }, jobAgentConsentPolicyConfiguration({})), /Counsel-approved/);

const acceptance = { age18OrOlder: true, termsAccepted: true, privacyAcknowledged: true, candidateAuthorizationAccepted: true };
let consent = grantJobAgentConsent(acceptance, policy, '2026-08-29T21:00:00.000Z');
assert.equal(activeJobAgentConsent(consent, policy).ok, true);
assert.equal(publicJobAgentConsent(consent, policy).active, true);
assert.equal(publicJobAgentConsent(consent, policy).policyBundle.binding.bundleDigest, consent.policy.bundleDigest);
assert.deepEqual(consent.policy, policy.bundle.binding);
assert.equal(Object.hasOwn(consent, 'dateOfBirth'), false);
assert.equal(JSON.stringify(consent).includes('candidate@example.com'), false);
const changedPolicy = jobAgentConsentPolicyConfiguration({ ...env, JOB_AGENT_PRIVACY_VERSION: 'privacy-2026-09-01' });
assert.equal(activeJobAgentConsent(consent, changedPolicy).code, 'JOB_AGENT_CONSENT_RENEWAL_REQUIRED');
const changedDisclosurePolicy = structuredClone(policy);
changedDisclosurePolicy.bundle.binding.disclosureDigest = 'f'.repeat(64);
assert.equal(activeJobAgentConsent(consent, changedDisclosurePolicy).code, 'JOB_AGENT_CONSENT_RENEWAL_REQUIRED');
const legacyConsent = createJobAgentConsent({
  schemaVersion: 1, status: 'active', policy: { termsVersion: policy.termsVersion, privacyVersion: policy.privacyVersion, authorizationVersion: policy.authorizationVersion },
  scopes: consent.scopes, attestations: acceptance, grantedAt: consent.grantedAt, revokedAt: null, updatedAt: consent.updatedAt, audit: [],
});
assert.equal(activeJobAgentConsent(legacyConsent, policy).code, 'JOB_AGENT_CONSENT_RENEWAL_REQUIRED');

consent = revokeJobAgentConsent(consent, { reason: 'user-request' }, '2026-08-29T21:01:00.000Z');
assert.equal(activeJobAgentConsent(consent, policy).code, 'JOB_AGENT_CONSENT_REQUIRED');
assert.throws(() => revokeJobAgentConsent(consent), /Only active/);
consent = renewJobAgentConsent(consent, acceptance, policy, '2026-08-29T21:02:00.000Z');
assert.equal(consent.status, 'active');
assert.equal(consent.audit.at(-1).type, 'CONSENT_RENEWED');
const nextPolicy = changedPolicy;
consent = renewJobAgentConsent(consent, acceptance, nextPolicy, '2026-08-29T21:03:00.000Z');
assert.equal(consent.audit.at(-1).type, 'POLICY_REACCEPTED');
assert.equal(activeJobAgentConsent(consent, nextPolicy).ok, true);

const partitionSecret = 'consent-partition-secret-at-least-32-characters';
const dataEncryptionKey = Buffer.alloc(32, 8).toString('base64');
const tenantKey = tenantConsentKey('candidate@example.com', partitionSecret);
const envelope = encryptJobAgentConsent(consent, { key: dataEncryptionKey, tenantKey });
assert.equal(decryptJobAgentConsent(envelope, { key: dataEncryptionKey, tenantKey }).status, 'active');
assert.throws(() => decryptJobAgentConsent(envelope, { key: dataEncryptionKey, tenantKey: tenantConsentKey('other@example.com', partitionSecret) }));

class FakeRedis {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async del(key) { this.values.delete(key); }
  async eval(_script, keys, args) {
    const replay = this.values.get(keys[1]);
    if (replay) return ['replayed', replay];
    const raw = this.values.get(keys[0]);
    const current = raw ? Number(JSON.parse(raw).version) || 0 : 0;
    if (current !== Number(args[0])) return ['conflict', String(current)];
    this.values.set(keys[0], args[2]); this.values.set(keys[1], args[1]);
    return ['saved', args[1]];
  }
}

const redis = new FakeRedis();
const store = { redis, subject: 'candidate@example.com', partitionSecret, dataEncryptionKey };
assert.equal((await saveJobAgentConsent({ ...store, consent, expectedVersion: 0, idempotencyKey: 'consent-save-0001' })).version, 1);
assert.equal((await readJobAgentConsent(store)).consent.status, 'active');
assert.equal((await readJobAgentConsent({ ...store, subject: 'other@example.com' })).consent, null);
assert.equal((await requireActiveJobAgentConsent(store, store.subject, env)).code, 'JOB_AGENT_CONSENT_RENEWAL_REQUIRED');
assert.equal((await requireActiveJobAgentConsent(store, store.subject, { ...env, JOB_AGENT_PRIVACY_VERSION: nextPolicy.privacyVersion })).ok, true);
const pilotTenantId = jobAgentTenantId(store.subject, partitionSecret);
const pilotEnv = {
  ...env, JOB_AGENT_PRIVACY_VERSION: nextPolicy.privacyVersion, JOB_AGENT_CONSENT_ENFORCEMENT: 'true',
  RATE_LIMIT_HASH_SECRET: partitionSecret, JOB_AGENT_PILOT_ENFORCEMENT: 'true', JOB_AGENT_PILOT_MAX_USERS: '2',
  JOB_AGENT_PILOT_ALLOWED_TENANTS: pilotTenantId,
};
assert.equal((await requireConfiguredJobAgentConsent(store, store.subject, pilotEnv)).ok, true);
assert.equal((await requireConfiguredJobAgentConsentForTenant({ redis, dataEncryptionKey }, pilotTenantId, pilotEnv)).ok, true);
const removedPilotEnv = { ...pilotEnv, JOB_AGENT_PILOT_ALLOWED_TENANTS: 'f'.repeat(40) };
const removedSubject = await jobAgentConsentGate(store, store.subject, removedPilotEnv);
assert.equal(removedSubject.status, 403);
assert.equal(removedSubject.code, 'JOB_AGENT_PILOT_INVITE_REQUIRED');
const removedTenant = await requireConfiguredJobAgentConsentForTenant({ redis, dataEncryptionKey }, pilotTenantId, removedPilotEnv);
assert.equal(removedTenant.ok, false);
assert.equal(removedTenant.code, 'JOB_AGENT_PILOT_INVITE_REQUIRED');
const invalidPilot = await jobAgentConsentGate(store, store.subject, { ...pilotEnv, JOB_AGENT_PILOT_ALLOWED_TENANTS: '' });
assert.equal(invalidPilot.status, 503);
assert.equal(invalidPilot.code, 'JOB_AGENT_PILOT_NOT_CONFIGURED');
assert.equal((await saveJobAgentConsent({ ...store, consent, expectedVersion: 0, idempotencyKey: 'consent-save-0002' })).conflict, true);
await deleteJobAgentConsent(store);
assert.equal((await readJobAgentConsent(store)).consent, null);
assert.equal(createJobAgentConsent().status, 'not-granted');

console.log('Digest-bound Job Agent consent, legacy renewal, pilot admission/removal, encryption, idempotency, revocation, and tenant-isolation tests passed.');
