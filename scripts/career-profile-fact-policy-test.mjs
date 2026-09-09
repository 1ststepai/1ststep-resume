import assert from 'node:assert/strict';
import {
  CAREER_PROFILE_FACT_KEYS, careerProfileFactPolicy, legacyCareerProfileImportDecision, validateCareerProfileFact,
} from '../lib/career-profile-fact-policy.js';

assert.deepEqual(CAREER_PROFILE_FACT_KEYS, [
  'firstName', 'lastName', 'preferredName', 'email', 'phone', 'city', 'region', 'country',
  'employment', 'education', 'skills', 'certifications', 'languages', 'linkedinUrl', 'portfolioUrl',
  'authorization', 'sponsorship',
]);

assert.equal(validateCareerProfileFact({ fieldKey: 'skills', value: 'Strategic sourcing', verificationState: 'document-verified' }).category, 'career-evidence');
assert.equal(validateCareerProfileFact({ fieldKey: 'email', value: 'person@example.test', verificationState: 'user-confirmed' }).sensitivity, 'sensitive');
const authorization = validateCareerProfileFact({ fieldKey: 'authorization', value: 'Authorized to work in the United States', verificationState: 'user-confirmed' });
assert.equal(authorization.normalizedValue, 'authorized');
assert.equal(authorization.reuse, 'manual-only');
assert.throws(() => validateCareerProfileFact({ fieldKey: 'authorization', value: 'U.S. citizen', verificationState: 'user-confirmed' }), /VALUE_INVALID/);
assert.throws(() => validateCareerProfileFact({ fieldKey: 'sponsorship', value: 'No sponsorship required', verificationState: 'document-verified' }), /USER_CONFIRMATION/);
assert.throws(() => validateCareerProfileFact({ fieldKey: 'skills', value: 'Inferred', verificationState: 'unverified' }), /NOT_VERIFIED/);
assert.throws(() => validateCareerProfileFact({ fieldKey: 'skills', value: '', verificationState: 'user-confirmed' }), /VALUE_REQUIRED/);
assert.throws(() => validateCareerProfileFact({ fieldKey: 'skills', value: ['Procurement'], verificationState: 'user-confirmed' }), /VALUE_INVALID/);
assert.throws(() => validateCareerProfileFact({ fieldKey: 'skills', value: 'password is hunter2', verificationState: 'user-confirmed' }), /SECRET_NOT_ALLOWED/);
assert.throws(() => validateCareerProfileFact({ fieldKey: 'portfolioUrl', value: 'http://example.test/work', verificationState: 'user-confirmed' }), /URL_INVALID/);
assert.equal(validateCareerProfileFact({ fieldKey: 'linkedinUrl', value: 'https://www.linkedin.com/in/example', verificationState: 'user-confirmed' }).category, 'career-evidence');

for (const key of ['salary', 'travel', 'relocation', 'schedule', 'exclusions']) {
  assert.equal(careerProfileFactPolicy(key).category, 'separate-policy');
}
for (const key of ['demographics', 'disability', 'veteranStatus', 'citizenship', 'immigrationStatus', 'criminalHistory', 'drugHealth', 'background', 'socialSecurityNumber', 'password', 'memory_example']) {
  assert.equal(careerProfileFactPolicy(key).category, 'prohibited-or-unknown');
}
for (const key of ['contact', 'address', 'location', 'licenses']) {
  assert.equal(legacyCareerProfileImportDecision({ fieldKey: key, value: 'legacy', verificationState: 'user-confirmed' }).action, 'reconcile');
}

const legacy = legacyCareerProfileImportDecision({ fieldKey: 'skills', value: 'Procurement', verificationState: 'user-confirmed', autoReuse: true, scope: { global: true } });
assert.equal(legacy.action, 'import');
assert.equal(legacy.createReuseGrant, false, 'legacy autoReuse and scope must never create database reuse authority');
assert.equal(legacyCareerProfileImportDecision({ fieldKey: 'demographics', value: 'Prefer not to answer', verificationState: 'user-confirmed' }).action, 'exclude');

console.log('Career Profile minimum-safe-fact allowlist and legacy import policy passed.');
