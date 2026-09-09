import { assertNoProhibitedSecretText } from './prohibited-secret.js';

const VERIFIED = new Set(['user-confirmed', 'document-verified']);
const SHORT_VALUE_KEYS = new Set(['firstName', 'lastName', 'preferredName', 'email', 'phone', 'city', 'region', 'country', 'linkedinUrl', 'portfolioUrl', 'authorization', 'sponsorship']);
const URL_KEYS = new Set(['linkedinUrl', 'portfolioUrl']);
const CONTROL_CHARACTER = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]');

const DIRECT_IDENTIFIERS = new Set([
  'firstName', 'lastName', 'preferredName', 'email', 'phone', 'city', 'region', 'country',
]);

const CAREER_EVIDENCE = new Set([
  'employment', 'education', 'skills', 'certifications', 'languages', 'linkedinUrl', 'portfolioUrl',
]);

const RESTRICTED_APPLICATION_FACTS = new Map([
  ['authorization', new Map([
    ['authorized to work in the united states', 'authorized'],
    ['not currently authorized', 'not-authorized'],
    ['unsure', 'unknown'],
  ])],
  ['sponsorship', new Map([
    ['no sponsorship required', 'not-required'],
    ['sponsorship required', 'required-or-may-be-required'],
    ['unsure', 'unknown'],
  ])],
]);

const SEPARATE_POLICY_KEYS = new Set([
  'salary', 'startDate', 'travel', 'relocation', 'remoteGeography', 'schedule', 'exclusions',
  'recruiterContact', 'accountCreation', 'privacyTerms',
]);

const RECONCILE_LEGACY_KEYS = new Set(['contact', 'address', 'location', 'licenses']);

export const CAREER_PROFILE_FACT_KEYS = Object.freeze([
  ...DIRECT_IDENTIFIERS, ...CAREER_EVIDENCE, ...RESTRICTED_APPLICATION_FACTS.keys(),
]);

export function careerProfileFactPolicy(fieldKey) {
  const key = String(fieldKey || '').trim();
  if (DIRECT_IDENTIFIERS.has(key)) return { allowed: true, category: 'direct-identifier', sensitivity: 'sensitive', reuse: 'explicit-scope-only' };
  if (CAREER_EVIDENCE.has(key)) return { allowed: true, category: 'career-evidence', sensitivity: 'standard', reuse: 'explicit-scope-only' };
  if (RESTRICTED_APPLICATION_FACTS.has(key)) return { allowed: true, category: 'restricted-application-fact', sensitivity: 'sensitive', reuse: 'manual-only' };
  if (SEPARATE_POLICY_KEYS.has(key)) return { allowed: false, category: 'separate-policy', reason: 'CAREER_PROFILE_POLICY_NOT_FACT' };
  if (RECONCILE_LEGACY_KEYS.has(key)) return { allowed: false, category: 'legacy-reconciliation', reason: 'CAREER_PROFILE_LEGACY_FACT_REQUIRES_RECONCILIATION' };
  return { allowed: false, category: 'prohibited-or-unknown', reason: 'CAREER_PROFILE_FACT_NOT_ALLOWED' };
}

export function validateCareerProfileFact(input = {}) {
  const fieldKey = String(input.fieldKey || '').trim();
  if (typeof input.value !== 'string') throw new Error('CAREER_PROFILE_FACT_VALUE_INVALID');
  const value = input.value.trim();
  const policy = careerProfileFactPolicy(fieldKey);
  if (!policy.allowed) throw new Error(policy.reason);
  if (!value) throw new Error('CAREER_PROFILE_FACT_VALUE_REQUIRED');
  if (value.length > (SHORT_VALUE_KEYS.has(fieldKey) ? 2048 : 12_000)) throw new Error('CAREER_PROFILE_FACT_VALUE_TOO_LONG');
  if (CONTROL_CHARACTER.test(value)) throw new Error('CAREER_PROFILE_FACT_VALUE_INVALID');
  assertNoProhibitedSecretText(value, 'CAREER_PROFILE_SECRET_NOT_ALLOWED');
  if (URL_KEYS.has(fieldKey)) {
    let url;
    try { url = new URL(value); } catch { throw new Error('CAREER_PROFILE_FACT_URL_INVALID'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('CAREER_PROFILE_FACT_URL_INVALID');
  }
  if (!VERIFIED.has(String(input.verificationState || ''))) throw new Error('CAREER_PROFILE_FACT_NOT_VERIFIED');
  if (policy.category === 'restricted-application-fact') {
    if (input.verificationState !== 'user-confirmed') throw new Error('CAREER_PROFILE_RESTRICTED_FACT_REQUIRES_USER_CONFIRMATION');
    const normalizedValue = RESTRICTED_APPLICATION_FACTS.get(fieldKey).get(value.toLowerCase());
    if (!normalizedValue) throw new Error('CAREER_PROFILE_RESTRICTED_FACT_VALUE_INVALID');
    return { fieldKey, normalizedValue, ...policy };
  }
  return { fieldKey, ...policy };
}

export function legacyCareerProfileImportDecision(fact = {}) {
  try {
    const policy = validateCareerProfileFact({
      fieldKey: fact.fieldKey,
      value: fact.value,
      verificationState: fact.verificationState,
    });
    return {
      action: 'import',
      fieldKey: policy.fieldKey,
      normalizedValue: policy.normalizedValue,
      sensitivity: policy.sensitivity,
      createReuseGrant: false,
      reuse: policy.reuse,
    };
  } catch (error) {
    const policy = careerProfileFactPolicy(fact.fieldKey);
    return {
      action: policy.category === 'legacy-reconciliation' ? 'reconcile' : 'exclude',
      fieldKey: String(fact.fieldKey || '').trim(),
      reason: String(error?.message || policy.reason || 'CAREER_PROFILE_FACT_NOT_ALLOWED'),
      createReuseGrant: false,
    };
  }
}
