import { createHash } from 'node:crypto';

export const JOB_AGENT_POLICY_BUNDLE_SCHEMA_VERSION = 1;

// These digests bind consent to the exact checked-in documents. The verification
// script fails whenever either file changes without an intentional digest update.
export const JOB_AGENT_POLICY_STATIC_DOCUMENTS = Object.freeze({
  terms: Object.freeze({ href: '/terms', sha256: '399d4093b497c635a634c381e4e056ad1de70c8d0437014c8f36ce4fe8304831' }),
  privacy: Object.freeze({ href: '/privacy', sha256: 'e91a60b2a4358c00bf01661ca123c567a7dff418252905e6be23864da9b7da4b' }),
});

export const JOB_AGENT_CONSENT_DISCLOSURE = Object.freeze({
  heading: 'Before this controlled Job Agent beta starts',
  introduction: 'This is an invitation-only experimental beta. Confirm four items once. You can pause and revoke this authorization at any time. These screens are owner-reviewed for consistency with the product as offered. They do not represent that outside legal counsel has approved the product.',
  scopeHeading: 'What this beta enables',
  scope: Object.freeze([
    'On-demand job discovery, encrypted storage of facts you confirm, Chrome extension capture into My Jobs, AI-assisted text résumé and cover-letter drafts, match assistance, and a review workspace.',
    'AI-generated content may contain errors. You must review every generated draft and any remembered answer before you use it. Match scores are assistance, not a guarantee of fit, interviews, pay, or any other outcome.',
    'This beta does not automatically submit employer applications and does not transmit your personal data to an employer. 1stStep will not press an employer submit control. Those steps are not part of this invite.',
    'Access is limited to invited users, initially a maximum of five. 1stStep may suspend, revoke, or discontinue beta access.',
  ]),
  attestations: Object.freeze([
    Object.freeze({ id: 'age18OrOlder', statement: 'I confirm I am 18 or older.' }),
    Object.freeze({ id: 'termsAccepted', statement: 'I accept the Terms.', link: Object.freeze({ label: 'Terms', href: '/terms' }) }),
    Object.freeze({ id: 'privacyAcknowledged', statement: 'I acknowledge the Privacy Policy.', link: Object.freeze({ label: 'Privacy Policy', href: '/privacy' }) }),
    Object.freeze({
      id: 'candidateAuthorizationAccepted',
      statement: 'I authorize the controlled-beta Job Agent activities described above for my own job search. I remain responsible for reviewing drafts and for any decision to apply on an employer site myself.',
    }),
  ]),
  safetyNotice: 'No date of birth, employer password, OTP, or CAPTCHA answer is requested or stored here. Saving a confirmed answer does not send it to an employer.',
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
