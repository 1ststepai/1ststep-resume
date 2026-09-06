import { createHash } from 'node:crypto';

export const JOB_AGENT_POLICY_BUNDLE_SCHEMA_VERSION = 1;

// These digests bind consent to the exact checked-in documents. The verification
// script fails whenever either file changes without an intentional digest update.
export const JOB_AGENT_POLICY_STATIC_DOCUMENTS = Object.freeze({
  terms: Object.freeze({ href: '/terms', sha256: 'c3d393ded7a8fdc246f47fd80362d0d30300e23bb6884a843d0714175fc4c87c' }),
  privacy: Object.freeze({ href: '/privacy', sha256: '5391d01205fe3337e84fdb023f07aa4b8a17ef167e5bf3fa041bb4e7323982eb' }),
});

export const JOB_AGENT_CONSENT_DISCLOSURE = Object.freeze({
  heading: 'Before your Job Agent starts',
  introduction: 'Confirm four items once. You can pause the agent and revoke this authorization at any time.',
  scopeHeading: 'What this enables',
  scope: Object.freeze([
    'Direct-employer job discovery, encrypted storage of facts you confirm, AI-assisted document preparation, and a supervised application workspace.',
    'It never authorizes final submission or personal-data transmission. Those consequential steps still require a separate action-time confirmation.',
  ]),
  attestations: Object.freeze([
    Object.freeze({ id: 'age18OrOlder', statement: 'I confirm I am 18 or older.' }),
    Object.freeze({ id: 'termsAccepted', statement: 'I accept the Terms.', link: Object.freeze({ label: 'Terms', href: '/terms' }) }),
    Object.freeze({ id: 'privacyAcknowledged', statement: 'I acknowledge the Privacy Policy.', link: Object.freeze({ label: 'Privacy Policy', href: '/privacy' }) }),
    Object.freeze({ id: 'candidateAuthorizationAccepted', statement: 'I authorize the Job Agent activities described above for my own job search.' }),
  ]),
  safetyNotice: 'No date of birth, employer password, OTP, or CAPTCHA answer is requested or stored here.',
});

const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

export const sha256Canonical = value => createHash('sha256').update(canonical(value)).digest('hex');

export function jobAgentPolicyBundle(versions) {
  const disclosureDigest = sha256Canonical(JOB_AGENT_CONSENT_DISCLOSURE);
  const authorizationContentDigest = sha256Canonical({
    scope: JOB_AGENT_CONSENT_DISCLOSURE.scope,
    authorization: JOB_AGENT_CONSENT_DISCLOSURE.attestations.find(item => item.id === 'candidateAuthorizationAccepted'),
  });
  const documents = {
    terms: { version: versions.termsVersion, ...JOB_AGENT_POLICY_STATIC_DOCUMENTS.terms },
    privacy: { version: versions.privacyVersion, ...JOB_AGENT_POLICY_STATIC_DOCUMENTS.privacy },
    authorization: { version: versions.authorizationVersion, sha256: authorizationContentDigest },
  };
  const binding = {
    termsVersion: versions.termsVersion,
    privacyVersion: versions.privacyVersion,
    authorizationVersion: versions.authorizationVersion,
    termsDigest: documents.terms.sha256,
    privacyDigest: documents.privacy.sha256,
    authorizationDigest: documents.authorization.sha256,
    disclosureDigest,
  };
  return {
    schemaVersion: JOB_AGENT_POLICY_BUNDLE_SCHEMA_VERSION,
    documents,
    disclosure: JOB_AGENT_CONSENT_DISCLOSURE,
    binding: { ...binding, bundleDigest: sha256Canonical({ schemaVersion: JOB_AGENT_POLICY_BUNDLE_SCHEMA_VERSION, binding }) },
  };
}
