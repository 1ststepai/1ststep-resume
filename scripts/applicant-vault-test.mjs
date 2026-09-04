import assert from 'node:assert/strict';
import {
  grantVaultConsent, renewVaultConsent, revokeVaultConsent, revokeVaultDocument, revokeVaultFact,
  syncCanonicalApplicantProfile, upsertVaultDocument, upsertVaultFact,
} from '../lib/applicant-vault-domain.js';
import {
  decryptApplicantVault, deleteApplicantVault, encryptApplicantVault, readApplicantVault, saveApplicantVault, tenantVaultKey,
} from '../lib/applicant-vault-store.js';

const partitionSecret = 'partition-secret-that-is-at-least-32-characters';
const dataEncryptionKey = Buffer.alloc(32, 7).toString('base64');

let vault = grantVaultConsent({ scopes: ['confirmed-facts', 'documents'] }, '2026-08-29T12:00:00.000Z');
assert.equal(vault.consent.status, 'granted');
vault = upsertVaultFact(vault, { fieldKey: 'skills', label: 'Verified skills', value: 'Strategic sourcing; vendor management', provenance: 'candidate confirmation', confidence: 1, verificationState: 'user-confirmed', autoReuse: true }, '2026-08-29T12:01:00.000Z');
assert.equal(vault.facts[0].versions[0].autoReuse, true);
vault = upsertVaultFact(vault, { fieldKey: 'authorization', label: 'Work authorization', value: 'Candidate-confirmed authorization response', provenance: 'candidate confirmation', confidence: 1, verificationState: 'user-confirmed', autoReuse: true }, '2026-08-29T12:02:00.000Z');
assert.equal(vault.facts.find(item => item.fieldKey === 'authorization').versions[0].autoReuse, false, 'consequential answers must require review');
vault = upsertVaultFact(vault, { fieldKey: 'skills', label: 'Verified skills', value: 'Strategic sourcing; vendor management; contracts', provenance: 'candidate correction', confidence: 1, verificationState: 'user-confirmed', autoReuse: true }, '2026-08-29T12:03:00.000Z');
assert.equal(vault.facts.find(item => item.fieldKey === 'skills').currentVersion, 2);

assert.throws(() => upsertVaultFact(vault, { fieldKey: 'demographics', value: 'Specific protected trait', provenance: 'candidate', confidence: 1, verificationState: 'user-confirmed' }), /only an unanswered/i);
assert.throws(() => upsertVaultFact(vault, { fieldKey: 'citizenship', value: 'inferred', provenance: 'model inference', confidence: .8, verificationState: 'unverified' }), /user-confirmed/i);
assert.throws(() => upsertVaultFact(vault, { fieldKey: 'skills', value: 'password=hunter2', provenance: 'candidate', confidence: 1, verificationState: 'user-confirmed' }), /not allowed/i);
assert.throws(() => upsertVaultFact(vault, { fieldKey: 'skills', value: 'password is hunter2', provenance: 'candidate', confidence: 1, verificationState: 'user-confirmed' }), /not allowed/i);

vault = upsertVaultDocument(vault, { type: 'master-resume', title: 'Master resume', text: 'Verified candidate resume content. '.repeat(10), fileName: 'resume.docx', provenance: 'candidate-reviewed', qa: { atsTextExtracted: true } }, '2026-08-29T12:04:00.000Z');
assert.equal(vault.documents[0].versions[0].sha256.length, 64);
vault = upsertVaultDocument(vault, { type: 'master-resume', title: 'Master resume', text: 'Corrected verified candidate resume content. '.repeat(10), fileName: 'resume-v2.docx', provenance: 'candidate-reviewed', qa: { atsTextExtracted: true, renderedPagesReviewed: true, pageCount: 2 } }, '2026-08-29T12:05:00.000Z');
assert.equal(vault.documents[0].currentVersion, 2);

const canonicalInput = {
  facts: [
    { fieldKey: 'skills', label: 'Verified skills', value: 'Strategic sourcing; vendor management; contracts', provenance: 'candidate correction', confidence: 1, verificationState: 'user-confirmed', autoReuse: true },
    { fieldKey: 'education', label: 'Education', value: 'Candidate-confirmed education', provenance: 'candidate confirmation', confidence: 1, verificationState: 'user-confirmed', autoReuse: true },
  ],
  masterResume: { text: 'Corrected verified candidate resume content. '.repeat(10), fileName: 'resume-v2.docx', provenance: 'candidate-reviewed', qa: { atsTextExtracted: true } },
};
const canonical = syncCanonicalApplicantProfile(vault, canonicalInput, '2026-08-29T12:05:30.000Z');
assert.equal(canonical.facts.find(item => item.fieldKey === 'skills').currentVersion, 2, 'unchanged canonical facts must not create versions');
assert.equal(canonical.facts.find(item => item.fieldKey === 'education').currentVersion, 1);
assert.equal(canonical.documents[0].currentVersion, 2, 'unchanged canonical resume must not create a version');
const canonicalReplay = syncCanonicalApplicantProfile(canonical, canonicalInput, '2026-08-29T12:05:40.000Z');
assert.equal(canonicalReplay.audit.length, canonical.audit.length, 'repeated canonical sync must be semantically idempotent');

const tenantKey = tenantVaultKey('candidate@example.com', partitionSecret);
const envelope = encryptApplicantVault(vault, { key: dataEncryptionKey, tenantKey });
assert.equal(envelope.algorithm, 'A256GCM');
assert.equal(decryptApplicantVault(envelope, { key: dataEncryptionKey, tenantKey }).documents[0].currentVersion, 2);
assert.throws(() => decryptApplicantVault(envelope, { key: dataEncryptionKey, tenantKey: tenantVaultKey('other@example.com', partitionSecret) }));

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
const storeConfig = { redis, subject: 'candidate@example.com', partitionSecret, dataEncryptionKey };
const saved = await saveApplicantVault({ ...storeConfig, vault, expectedVersion: 0, idempotencyKey: 'vault-save-0001', now: new Date('2026-08-29T12:06:00.000Z') });
assert.equal(saved.version, 1);
const replayed = await saveApplicantVault({ ...storeConfig, vault, expectedVersion: 0, idempotencyKey: 'vault-save-0001' });
assert.equal(replayed.replayed, true);
assert.equal((await readApplicantVault(storeConfig)).vault.facts.length, 2);
assert.equal((await readApplicantVault({ ...storeConfig, subject: 'other@example.com' })).vault, null, 'tenant records must be isolated');
const conflict = await saveApplicantVault({ ...storeConfig, vault, expectedVersion: 0, idempotencyKey: 'vault-save-0002' });
assert.equal(conflict.conflict, true);
await deleteApplicantVault(storeConfig);
assert.equal((await readApplicantVault(storeConfig)).vault, null);

const factId = vault.facts[0].id;
vault = revokeVaultFact(vault, factId, '2026-08-29T12:07:00.000Z');
assert.equal(vault.facts.find(item => item.id === factId).status, 'revoked');
vault = revokeVaultDocument(vault, vault.documents[0].id, '2026-08-29T12:08:00.000Z');
assert.equal(vault.documents[0].status, 'revoked');
vault = revokeVaultConsent(vault, '2026-08-29T12:09:00.000Z');
assert.equal(vault.consent.status, 'revoked');
vault = renewVaultConsent(vault, {}, '2026-08-29T12:10:00.000Z');
assert.equal(vault.consent.status, 'granted');

console.log('Applicant vault domain, encryption, idempotency, concurrency, revocation, and tenant-isolation tests passed.');
