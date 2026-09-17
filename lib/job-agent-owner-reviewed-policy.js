import { jobAgentPilotConfiguration } from './job-agent-pilot-access.js';
import {
  JOB_AGENT_CONSENT_DISCLOSURE,
  JOB_AGENT_POLICY_STATIC_DOCUMENTS,
  jobAgentPolicyBundle,
  sha256Canonical,
} from './job-agent-policy-bundle.js';

function enabled(value) {
  return String(value || '').toLowerCase() === 'true';
}

export const JOB_AGENT_OWNER_REVIEWED_POLICY_PIN = Object.freeze({
  policyVersion: 'owner-reviewed-beta-2026-09-17',
  termsVersion: 'terms-owner-reviewed-beta-2026-09-17',
  privacyVersion: 'privacy-owner-reviewed-beta-2026-09-17',
  authorizationVersion: 'authorization-owner-reviewed-beta-2026-09-17',
  termsSha256: '399d4093b497c635a634c381e4e056ad1de70c8d0437014c8f36ce4fe8304831',
  privacySha256: 'e91a60b2a4358c00bf01661ca123c567a7dff418252905e6be23864da9b7da4b',
  authorizationSha256: '8bef2ef1ae8302caa919cca6e5dd861703aa2383fa190835037707a05d3e1d01',
  disclosureSha256: '87df5348de7dcdeae4345f6f057611e34deee973fb3c30f794220e8582fd126d',
  bundleSha256: '9c0d4647bc879c3bc5fa313d2bba4e6315ecf4afa9d3b1648a1641fa2291507f',
  maxUsers: 5,
});

export function ownerReviewedPolicyBundle() {
  return jobAgentPolicyBundle({
    termsVersion: JOB_AGENT_OWNER_REVIEWED_POLICY_PIN.termsVersion,
    privacyVersion: JOB_AGENT_OWNER_REVIEWED_POLICY_PIN.privacyVersion,
    authorizationVersion: JOB_AGENT_OWNER_REVIEWED_POLICY_PIN.authorizationVersion,
  });
}

export function ownerReviewedServedDocumentsMatchPin(documents = JOB_AGENT_POLICY_STATIC_DOCUMENTS) {
  return String(documents?.terms?.sha256) === JOB_AGENT_OWNER_REVIEWED_POLICY_PIN.termsSha256
    && String(documents?.privacy?.sha256) === JOB_AGENT_OWNER_REVIEWED_POLICY_PIN.privacySha256;
}

export function ownerReviewedDisclosureMatchesPin(disclosure = JOB_AGENT_CONSENT_DISCLOSURE) {
  return sha256Canonical(disclosure) === JOB_AGENT_OWNER_REVIEWED_POLICY_PIN.disclosureSha256;
}

export function ownerReviewedBundleMatchesPin(bundle = ownerReviewedPolicyBundle()) {
  const pin = JOB_AGENT_OWNER_REVIEWED_POLICY_PIN;
  return String(bundle?.binding?.termsDigest) === pin.termsSha256
    && String(bundle?.binding?.privacyDigest) === pin.privacySha256
    && String(bundle?.binding?.authorizationDigest) === pin.authorizationSha256
    && String(bundle?.binding?.disclosureDigest) === pin.disclosureSha256
    && String(bundle?.binding?.bundleDigest) === pin.bundleSha256;
}

export function ownerReviewedCapabilityCeilingApplies(env = process.env) {
  return enabled(env.JOB_AGENT_OWNER_REVIEWED_POLICY);
}

export function ownerReviewedPinVersionsInUse(env = process.env) {
  const pin = JOB_AGENT_OWNER_REVIEWED_POLICY_PIN;
  return String(env.JOB_AGENT_TERMS_VERSION || '').trim() === pin.termsVersion
    && String(env.JOB_AGENT_PRIVACY_VERSION || '').trim() === pin.privacyVersion
    && String(env.JOB_AGENT_AUTHORIZATION_VERSION || '').trim() === pin.authorizationVersion;
}

export function ownerReviewedCounselConflict(env = process.env) {
  return enabled(env.JOB_AGENT_COUNSEL_APPROVED)
    && (enabled(env.JOB_AGENT_OWNER_REVIEWED_POLICY) || ownerReviewedPinVersionsInUse(env));
}

export function jobAgentOwnerReviewedPolicyConfiguration(env = process.env) {
  const requested = enabled(env.JOB_AGENT_OWNER_REVIEWED_POLICY);
  const pin = JOB_AGENT_OWNER_REVIEWED_POLICY_PIN;
  const policyVersion = String(env.JOB_AGENT_OWNER_REVIEWED_POLICY_VERSION || '').trim();
  const termsVersion = String(env.JOB_AGENT_TERMS_VERSION || '').trim();
  const privacyVersion = String(env.JOB_AGENT_PRIVACY_VERSION || '').trim();
  const authorizationVersion = String(env.JOB_AGENT_AUTHORIZATION_VERSION || '').trim();
  const versionsMatch = policyVersion === pin.policyVersion
    && termsVersion === pin.termsVersion
    && privacyVersion === pin.privacyVersion
    && authorizationVersion === pin.authorizationVersion;
  const documentsMatch = ownerReviewedServedDocumentsMatchPin();
  const disclosureMatch = ownerReviewedDisclosureMatchesPin();
  const bundleMatch = ownerReviewedBundleMatchesPin();
  const counselConflict = ownerReviewedCounselConflict(env);
  const production = String(env.VERCEL_ENV || '').toLowerCase() === 'production';
  const pilot = jobAgentPilotConfiguration(env);
  const pilotReady = pilot.enforced === true && pilot.ready === true && pilot.maxUsers === pin.maxUsers;
  let reason = 'ok';
  if (!requested) reason = 'not-requested';
  else if (production) reason = 'production-not-allowed';
  else if (counselConflict) reason = 'counsel-conflict';
  else if (!versionsMatch) reason = 'version-mismatch';
  else if (!documentsMatch || !bundleMatch) reason = 'digest-mismatch';
  else if (!disclosureMatch) reason = 'disclosure-mismatch';
  else if (!pilotReady) reason = 'pilot-not-ready';
  const valid = reason === 'ok';
  return {
    requested,
    valid,
    reason,
    policyVersion,
    pin,
    binding: valid ? ownerReviewedPolicyBundle().binding : null,
    pilot: { enforced: pilot.enforced === true, ready: pilot.ready === true, maxUsers: pilot.maxUsers, invitedTenantCount: pilot.invitedTenantCount },
    counselApproved: false,
    counselConflict,
    production,
  };
}
