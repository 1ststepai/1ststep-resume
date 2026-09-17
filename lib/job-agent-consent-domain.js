import { randomUUID } from 'node:crypto';
import { jobAgentPolicyBundle } from './job-agent-policy-bundle.js';
import { jobAgentOwnerReviewedPolicyConfiguration } from './job-agent-owner-reviewed-policy.js';

export const JOB_AGENT_CONSENT_SCHEMA_VERSION = 1;
export const REQUIRED_JOB_AGENT_CONSENT_SCOPES = Object.freeze([
  'direct-employer-discovery', 'confirmed-profile-storage', 'ai-document-preparation', 'application-workspace',
]);

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REVOKE_REASON = /^(?:user-request|policy-declined|account-closure|support-assisted)$/;

const iso = value => {
  const date = new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) throw new Error('A valid consent timestamp is required.');
  return date.toISOString();
};
const clone = value => JSON.parse(JSON.stringify(value));

function policyNotReadyError(policy) {
  if (policy?.ownerCounselConflict) {
    return 'Owner-reviewed Job Agent policy cannot be combined with counsel approval.';
  }
  if (policy?.ownerReviewedRequested && !policy?.counselApproved) {
    return 'Owner-reviewed Job Agent policy is not bound to the exact served documents.';
  }
  return 'Counsel-approved Job Agent policy versions are not configured.';
}

export function jobAgentConsentPolicyConfiguration(env = process.env) {
  const versions = {
    termsVersion: String(env.JOB_AGENT_TERMS_VERSION || '').trim(),
    privacyVersion: String(env.JOB_AGENT_PRIVACY_VERSION || '').trim(),
    authorizationVersion: String(env.JOB_AGENT_AUTHORIZATION_VERSION || '').trim(),
  };
  const versionsReady = Object.values(versions).every(value => VERSION.test(value));
  const ownerReviewed = jobAgentOwnerReviewedPolicyConfiguration(env);
  const ownerCounselConflict = ownerReviewed.counselConflict === true;
  const counselApproved = String(env.JOB_AGENT_COUNSEL_APPROVED || '').toLowerCase() === 'true'
    && !ownerCounselConflict
    && ownerReviewed.requested !== true;
  const bundle = versionsReady ? jobAgentPolicyBundle(versions) : null;
  const ready = versionsReady && !ownerCounselConflict && (counselApproved || ownerReviewed.valid);
  return {
    ready,
    counselApproved,
    ownerCounselConflict,
    ownerReviewedRequested: ownerReviewed.requested,
    ownerReviewed: ownerReviewed.valid,
    ownerReviewedReason: ownerReviewed.reason,
    approvalSource: counselApproved ? 'counsel' : ownerReviewed.valid ? 'owner-reviewed' : null,
    ...versions,
    bundle,
  };
}

function policyBinding(policy) {
  return policy?.bundle?.binding ? clone(policy.bundle.binding) : null;
}

function validPolicyBinding(policy) {
  return policy && VERSION.test(String(policy.termsVersion)) && VERSION.test(String(policy.privacyVersion))
    && VERSION.test(String(policy.authorizationVersion))
    && ['termsDigest', 'privacyDigest', 'authorizationDigest', 'disclosureDigest', 'bundleDigest'].every(key => SHA256.test(String(policy[key] || '')));
}

function audit(type, at, metadata = {}) {
  return { id: randomUUID(), type, at: iso(at), metadata: clone(metadata) };
}

export function createJobAgentConsent(input = {}) {
  const record = {
    schemaVersion: JOB_AGENT_CONSENT_SCHEMA_VERSION,
    status: input.status || 'not-granted',
    policy: input.policy || null,
    scopes: Array.isArray(input.scopes) ? input.scopes : [],
    attestations: input.attestations || null,
    grantedAt: input.grantedAt || null,
    revokedAt: input.revokedAt || null,
    audit: Array.isArray(input.audit) ? input.audit : [],
    updatedAt: input.updatedAt || null,
  };
  return validateJobAgentConsent(record);
}

export function grantJobAgentConsent(input = {}, policy, at) {
  if (!policy?.ready) throw new Error(policyNotReadyError(policy));
  const attestations = {
    age18OrOlder: input.age18OrOlder === true,
    termsAccepted: input.termsAccepted === true,
    privacyAcknowledged: input.privacyAcknowledged === true,
    candidateAuthorizationAccepted: input.candidateAuthorizationAccepted === true,
  };
  if (Object.values(attestations).some(value => value !== true)) throw new Error('Every Job Agent eligibility and consent attestation must be affirmatively accepted.');
  const requested = new Set(Array.isArray(input.scopes) ? input.scopes.map(String) : REQUIRED_JOB_AGENT_CONSENT_SCOPES);
  if (REQUIRED_JOB_AGENT_CONSENT_SCOPES.some(scope => !requested.has(scope))) throw new Error('All required Job Agent consent scopes must be accepted.');
  const stamp = iso(at);
  const policyVersions = policyBinding(policy);
  if (!validPolicyBinding(policyVersions)) throw new Error('The exact Job Agent policy bundle is not configured.');
  return createJobAgentConsent({
    status: 'active', policy: policyVersions, scopes: [...REQUIRED_JOB_AGENT_CONSENT_SCOPES], attestations,
    grantedAt: stamp, revokedAt: null, updatedAt: stamp,
    audit: [audit('CONSENT_GRANTED', stamp, { policy: policyVersions, scopes: REQUIRED_JOB_AGENT_CONSENT_SCOPES })],
  });
}

export function renewJobAgentConsent(existing, input, policy, at) {
  const current = createJobAgentConsent(existing);
  const staleActive = current.status === 'active' && activeJobAgentConsent(current, policy).code === 'JOB_AGENT_CONSENT_RENEWAL_REQUIRED';
  if (current.status !== 'revoked' && current.status !== 'superseded' && !staleActive) throw new Error('Only revoked, superseded, or out-of-date Job Agent consent can be renewed.');
  const fresh = grantJobAgentConsent(input, policy, at);
  return createJobAgentConsent({ ...fresh, audit: [...current.audit, audit(staleActive ? 'POLICY_REACCEPTED' : 'CONSENT_RENEWED', fresh.grantedAt, { policy: fresh.policy, scopes: fresh.scopes })] });
}

export function revokeJobAgentConsent(existing, input = {}, at) {
  const current = createJobAgentConsent(existing);
  if (current.status !== 'active') throw new Error('Only active Job Agent consent can be revoked.');
  const reason = String(input.reason || 'user-request');
  if (!REVOKE_REASON.test(reason)) throw new Error('A supported consent revocation reason is required.');
  const stamp = iso(at);
  return createJobAgentConsent({
    ...current, status: 'revoked', revokedAt: stamp, updatedAt: stamp,
    audit: [...current.audit, audit('CONSENT_REVOKED', stamp, { reason })],
  });
}

export function activeJobAgentConsent(existing, policy) {
  const record = existing ? createJobAgentConsent(existing) : null;
  if (!policy?.ready || record?.status !== 'active') {
    const unconfigured = policy?.ownerCounselConflict
      ? 'JOB_AGENT_OWNER_COUNSEL_POLICY_CONFLICT'
      : policy?.ownerReviewedRequested && !policy?.counselApproved
        ? 'JOB_AGENT_OWNER_REVIEWED_POLICY_NOT_CONFIGURED'
        : 'JOB_AGENT_POLICY_NOT_CONFIGURED';
    return { ok: false, code: policy?.ready ? 'JOB_AGENT_CONSENT_REQUIRED' : unconfigured };
  }
  const requiredBinding = policyBinding(policy);
  const current = validPolicyBinding(record.policy) && validPolicyBinding(requiredBinding)
    && Object.keys(requiredBinding).every(key => record.policy?.[key] === requiredBinding[key]);
  if (!current) return { ok: false, code: 'JOB_AGENT_CONSENT_RENEWAL_REQUIRED' };
  if (REQUIRED_JOB_AGENT_CONSENT_SCOPES.some(scope => !record.scopes.includes(scope))) return { ok: false, code: 'JOB_AGENT_CONSENT_SCOPE_MISSING' };
  if (Object.values(record.attestations || {}).some(value => value !== true)) return { ok: false, code: 'JOB_AGENT_CONSENT_INVALID' };
  return { ok: true, grantedAt: record.grantedAt, policy: record.policy };
}

export function validateJobAgentConsent(input) {
  const record = input && typeof input === 'object' && !Array.isArray(input) ? clone(input) : null;
  if (!record || record.schemaVersion !== JOB_AGENT_CONSENT_SCHEMA_VERSION) throw new Error('Job Agent consent schema version 1 is required.');
  if (!['not-granted', 'active', 'revoked', 'superseded'].includes(record.status)) throw new Error('Job Agent consent status is invalid.');
  if (!Array.isArray(record.scopes) || !Array.isArray(record.audit) || record.audit.length > 100) throw new Error('Job Agent consent history is invalid.');
  if (record.status === 'active') {
    if (!record.policy || !VERSION.test(String(record.policy.termsVersion)) || !VERSION.test(String(record.policy.privacyVersion)) || !VERSION.test(String(record.policy.authorizationVersion))) throw new Error('Active Job Agent consent requires valid policy versions.');
    if (!record.attestations || Object.values(record.attestations).some(value => value !== true)) throw new Error('Active Job Agent consent requires affirmative attestations.');
    if (!record.grantedAt) throw new Error('Active Job Agent consent requires a grant timestamp.');
  }
  return record;
}

export function publicJobAgentConsent(existing, policy) {
  const record = existing ? createJobAgentConsent(existing) : createJobAgentConsent();
  const active = activeJobAgentConsent(record, policy);
  return {
    status: record.status, policy: record.policy, requiredPolicy: policy?.ready ? policyBinding(policy) : null,
    policyBundle: policy?.ready ? policy.bundle : null,
    approvalSource: policy?.approvalSource === 'counsel' && policy?.counselApproved === true ? 'counsel' : policy?.approvalSource || null,
    counselApproved: policy?.approvalSource === 'counsel' && policy?.counselApproved === true,
    scopes: record.scopes, grantedAt: record.grantedAt, revokedAt: record.revokedAt,
    active: active.ok, code: active.ok ? null : active.code,
  };
}
