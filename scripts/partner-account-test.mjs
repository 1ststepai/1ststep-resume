import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const moduleUrl = new URL('../lib/partner-account.js', import.meta.url);
assert.equal(existsSync(moduleUrl), true, 'The encrypted partner-role store must exist.');

const {
  normalizePartnerApplication,
  deletePartnerAccount,
  exportPartnerAccount,
  partnerSubjectHash,
  readPartnerAccount,
  recordPartnerAttribution,
  reviewPartnerApplication,
  savePartnerApplication,
} = await import(moduleUrl);

class MemoryRedis {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.get(key) ?? null; }
  async set(key, value, options = {}) {
    if (options.nx && this.data.has(key)) return null;
    this.data.set(key, value);
    return 'OK';
  }
  async del(key) { return this.data.delete(key) ? 1 : 0; }
}

const redis = new MemoryRedis();
const secret = 's'.repeat(32);
const dataEncryptionKey = Buffer.alloc(32, 7);
const subject = 'person@example.test';
const context = { redis, secret, dataEncryptionKey };

assert.deepEqual(normalizePartnerApplication({
  displayName: ' Career Coach ', code: 'Career_Coach', path: 'affiliate-only', acceptedTerms: true,
}), { displayName: 'Career Coach', code: 'career-coach', path: 'affiliate-only' });
assert.throws(() => normalizePartnerApplication({ displayName: 'Coach', code: 'coach', path: 'unknown', acceptedTerms: true }), /PARTNER_PATH_INVALID/);
assert.throws(() => normalizePartnerApplication({ displayName: 'Coach', code: 'coach', path: 'existing-user' }), /PARTNER_TERMS_REQUIRED/);

const pending = await savePartnerApplication({
  displayName: 'Career Coach', code: 'career-coach', path: 'affiliate-only', acceptedTerms: true,
}, { ...context, subject, now: new Date('2026-09-10T13:00:00Z') });
assert.equal(pending.status, 'pending');
assert.equal(pending.path, 'affiliate-only');
assert.equal(pending.jobAgentEntitlementGranted, false);
assert.equal(pending.jobSeekerDataCreated, false);
assert.equal(JSON.stringify([...redis.data.values()]).includes('Career Coach'), false, 'Partner PII must be encrypted at rest.');
assert.equal((await readPartnerAccount({ ...context, subject })).displayName, 'Career Coach');

await assert.rejects(() => savePartnerApplication({
  displayName: 'Other Coach', code: 'career-coach', path: 'existing-user', acceptedTerms: true,
}, { ...context, subject: 'other@example.test' }), /PARTNER_CODE_TAKEN/);
await assert.rejects(() => recordPartnerAttribution({ ...context, subject: 'candidate@example.test', code: 'career-coach' }), /PARTNER_APPROVAL_REQUIRED/);

const approved = await reviewPartnerApplication({
  ...context, code: 'career-coach', status: 'approved', reviewerSubject: 'admin@example.test',
  idempotencyKey: 'review_12345678', now: new Date('2026-09-10T13:05:00Z'),
});
assert.equal(approved.status, 'approved');
await assert.rejects(() => recordPartnerAttribution({ ...context, subject, code: 'career-coach' }), /PARTNER_SELF_REFERRAL/);
await assert.rejects(() => reviewPartnerApplication({
  ...context, code: 'career-coach', status: 'rejected', reviewerSubject: 'admin@example.test',
  idempotencyKey: 'review_12345678',
}), /PARTNER_REVIEW_REPLAYED/);
assert.deepEqual(await recordPartnerAttribution({
  ...context, subject: 'candidate@example.test', code: 'career-coach', now: new Date('2026-09-10T13:10:00Z'),
}), { recorded: true, code: 'career-coach', commissionEligible: false });

const linked = await savePartnerApplication({
  displayName: 'Career Coach', code: 'career-coach', path: 'existing-user', acceptedTerms: true,
}, { ...context, subject, now: new Date('2026-09-10T13:15:00Z') });
assert.equal(linked.path, 'existing-user', 'A dual-role user must explicitly consent to linking the existing account path.');
assert.equal(linked.jobAgentEntitlementGranted, false);
const exported = await exportPartnerAccount({ ...context, subject });
assert.equal(exported.code, 'career-coach');
assert.equal(exported.review.reviewerHash, undefined, 'Another account identifier must not appear in a partner export.');

assert.deepEqual(await deletePartnerAccount({ ...context, subject }), { deleted: true, attributionDeleted: false });
assert.equal(await readPartnerAccount({ ...context, subject }), null);
assert.equal(await redis.get('partner:v2:code:career-coach'), null);

assert.equal(partnerSubjectHash(subject, secret).length, 64);
console.log('Partner role tests passed: encrypted isolation, explicit path consent, approval, uniqueness, replay safety, and no implicit Job Agent data.');
