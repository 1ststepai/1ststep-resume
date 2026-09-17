import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  activeJobAgentConsent,
  grantJobAgentConsent,
  jobAgentConsentPolicyConfiguration,
  publicJobAgentConsent,
} from '../lib/job-agent-consent-domain.js';
import { jobAgentConsentGate } from '../lib/job-agent-consent-store.js';
import { jobAgentLaunchManifest } from '../lib/job-agent-launch-manifest.js';
import { documentRenderSandboxConfiguration } from '../lib/application-package-render-sandbox.js';
import { applicationReceiptCaptureConfiguration } from '../lib/application-receipt-capture-provider.js';
import { employerBrowserWorkerConfiguration } from '../lib/employer-browser-worker.js';
import { extensionApplicationHandoffConfiguration } from '../lib/extension-application-handoff.js';
import { jobAgentObjectStorageConfiguration } from '../lib/job-agent-object-storage.js';
import { jobAgentNeedsYouNotificationConfiguration } from '../lib/job-agent-notification-store.js';
import {
  activeJobAgentDataConsent,
  jobAgentDataPolicyConfiguration,
} from '../lib/job-agent-policy-levels.js';
import { jobAgentScheduleConfiguration } from '../lib/job-agent-schedule-store.js';
import {
  JOB_AGENT_OWNER_REVIEWED_POLICY_PIN,
  jobAgentOwnerReviewedPolicyConfiguration,
  ownerReviewedBundleMatchesPin,
  ownerReviewedDisclosureMatchesPin,
  ownerReviewedServedDocumentsMatchPin,
} from '../lib/job-agent-owner-reviewed-policy.js';
import { JOB_AGENT_CONSENT_DISCLOSURE, JOB_AGENT_POLICY_STATIC_DOCUMENTS } from '../lib/job-agent-policy-bundle.js';
import { jobAgentPilotAccessForSubject, jobAgentPilotConfiguration } from '../lib/job-agent-pilot-access.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

const pin = JOB_AGENT_OWNER_REVIEWED_POLICY_PIN;
const partitionSecret = 'owner-reviewed-partition-secret-32chars';
const invited = 'invited-beta@example.test';
const invitedTenant = jobAgentTenantId(invited, partitionSecret);
const extraTenants = ['1', '2', '3', '4'].map(value => value.repeat(40));

const ownerReviewedEnv = {
  JOB_AGENT_OWNER_REVIEWED_POLICY: 'true',
  JOB_AGENT_OWNER_REVIEWED_POLICY_VERSION: pin.policyVersion,
  JOB_AGENT_TERMS_VERSION: pin.termsVersion,
  JOB_AGENT_PRIVACY_VERSION: pin.privacyVersion,
  JOB_AGENT_AUTHORIZATION_VERSION: pin.authorizationVersion,
  JOB_AGENT_CONSENT_ENFORCEMENT: 'true',
  JOB_AGENT_COUNSEL_APPROVED: 'false',
  JOB_AGENT_PILOT_ENFORCEMENT: 'true',
  JOB_AGENT_PILOT_MAX_USERS: '5',
  JOB_AGENT_PILOT_ALLOWED_TENANTS: [invitedTenant, ...extraTenants].join(','),
  RATE_LIMIT_HASH_SECRET: partitionSecret,
  JOB_AGENT_ACCESS_POLICY_VERSION: 'controlled-beta-2026-09-17',
  JOB_AGENT_CONTROLLED_BETA_INCLUDED_TIERS: 'complete',
};

const ownerReviewedRuntimeEnv = {
  ...ownerReviewedEnv,
  UPSTASH_REDIS_REST_URL: 'https://synthetic-redis.example.test',
  UPSTASH_REDIS_REST_TOKEN: 'synthetic-token',
  JOB_AGENT_AUDIT_SECRET: 'a'.repeat(48),
  BETA_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  BETA_DATA_ENCRYPTION_KEY_ID: 'beta-2026-09',
};

const acceptance = {
  age18OrOlder: true, termsAccepted: true, privacyAcknowledged: true, candidateAuthorizationAccepted: true,
};

const termsBytes = await readFile(fileURLToPath(new URL('../terms.html', import.meta.url)));
const privacyBytes = await readFile(fileURLToPath(new URL('../privacy.html', import.meta.url)));
assert.equal(createHash('sha256').update(termsBytes).digest('hex'), pin.termsSha256);
assert.doesNotMatch(termsBytes.toString('utf8'), /56:8-129/);
assert.doesNotMatch(privacyBytes.toString('utf8'), /56:8-166\.1/);
assert.doesNotMatch(termsBytes.toString('utf8'), /employment agency/i);
assert.doesNotMatch(privacyBytes.toString('utf8'), /employment agency/i);
assert.equal(createHash('sha256').update(privacyBytes).digest('hex'), pin.privacySha256);
assert.equal(JOB_AGENT_POLICY_STATIC_DOCUMENTS.terms.sha256, pin.termsSha256);
assert.equal(JOB_AGENT_POLICY_STATIC_DOCUMENTS.privacy.sha256, pin.privacySha256);
assert.equal(ownerReviewedServedDocumentsMatchPin(), true);
assert.equal(ownerReviewedServedDocumentsMatchPin({
  terms: { sha256: '0'.repeat(64) }, privacy: JOB_AGENT_POLICY_STATIC_DOCUMENTS.privacy,
}), false);
assert.equal(ownerReviewedDisclosureMatchesPin(), true);
assert.equal(ownerReviewedDisclosureMatchesPin({ ...JOB_AGENT_CONSENT_DISCLOSURE, introduction: 'changed' }), false);
assert.equal(ownerReviewedBundleMatchesPin(), true);

const ownerPolicy = jobAgentConsentPolicyConfiguration(ownerReviewedEnv);
assert.equal(ownerPolicy.ready, true);
assert.equal(ownerPolicy.ownerReviewed, true);
assert.equal(ownerPolicy.counselApproved, false);
assert.equal(ownerPolicy.approvalSource, 'owner-reviewed');
assert.match(JSON.stringify(ownerPolicy.bundle.disclosure), /do not represent that outside legal counsel has approved/i);

const publicConsent = publicJobAgentConsent(null, ownerPolicy);
assert.equal(publicConsent.counselApproved, false);
assert.equal(publicConsent.approvalSource, 'owner-reviewed');
assert.equal(publicConsent.active, false);
assert.equal(publicConsent.code, 'JOB_AGENT_CONSENT_REQUIRED');

assert.throws(() => grantJobAgentConsent({}, ownerPolicy), /affirmatively accepted/);
const granted = grantJobAgentConsent(acceptance, ownerPolicy, '2026-09-17T15:00:00.000Z');
assert.equal(activeJobAgentConsent(granted, ownerPolicy).ok, true);
assert.equal(granted.policy.termsDigest, pin.termsSha256);
assert.equal(granted.policy.privacyDigest, pin.privacySha256);
assert.equal(granted.policy.authorizationDigest, pin.authorizationSha256);
assert.equal(granted.policy.disclosureDigest, pin.disclosureSha256);
assert.equal(granted.policy.bundleDigest, pin.bundleSha256);
assert.equal(ownerReviewedBundleMatchesPin({
  binding: { ...granted.policy, termsDigest: '0'.repeat(64) },
}), false);

const counselOnly = jobAgentConsentPolicyConfiguration({
  JOB_AGENT_COUNSEL_APPROVED: 'true',
  JOB_AGENT_TERMS_VERSION: 'terms-1',
  JOB_AGENT_PRIVACY_VERSION: 'privacy-1',
  JOB_AGENT_AUTHORIZATION_VERSION: 'authorization-1',
});
assert.equal(counselOnly.ready, true);
assert.equal(counselOnly.counselApproved, true);
assert.equal(counselOnly.ownerReviewed, false);
assert.equal(counselOnly.approvalSource, 'counsel');

const masquerade = jobAgentConsentPolicyConfiguration(ownerReviewedEnv);
assert.equal(masquerade.counselApproved, false);
assert.equal(masquerade.approvalSource, 'owner-reviewed');
assert.notEqual(masquerade.approvalSource, 'counsel');

assert.equal(jobAgentConsentPolicyConfiguration({
  ...ownerReviewedEnv, JOB_AGENT_OWNER_REVIEWED_POLICY_VERSION: 'different-version',
}).ready, false);
assert.equal(jobAgentOwnerReviewedPolicyConfiguration({
  ...ownerReviewedEnv, JOB_AGENT_OWNER_REVIEWED_POLICY_VERSION: 'different-version',
}).reason, 'version-mismatch');

assert.equal(jobAgentConsentPolicyConfiguration({
  ...ownerReviewedEnv, JOB_AGENT_TERMS_VERSION: 'terms-old',
}).ownerReviewed, false);

assert.equal(jobAgentOwnerReviewedPolicyConfiguration({
  ...ownerReviewedEnv, JOB_AGENT_PILOT_MAX_USERS: '6',
}).reason, 'pilot-not-ready');
assert.equal(jobAgentOwnerReviewedPolicyConfiguration({
  ...ownerReviewedEnv, JOB_AGENT_PILOT_MAX_USERS: '6',
}).valid, false);
assert.equal(jobAgentLaunchManifest({
  ...ownerReviewedRuntimeEnv, JOB_AGENT_PILOT_MAX_USERS: '6',
}).capabilities.ownerReviewedControlledBeta.eligible, false);

const sixTenants = jobAgentPilotConfiguration({
  ...ownerReviewedEnv,
  JOB_AGENT_PILOT_ALLOWED_TENANTS: [invitedTenant, ...extraTenants, '5'.repeat(40)].join(','),
});
assert.equal(sixTenants.ready, false);
assert.equal(sixTenants.reason, 'pilot-allowlist-invalid');

assert.equal(jobAgentPilotAccessForSubject(invited, ownerReviewedEnv).ok, true);
const outsider = jobAgentPilotAccessForSubject('not-invited@example.test', ownerReviewedEnv);
assert.equal(outsider.ok, false);
assert.equal(outsider.code, 'JOB_AGENT_PILOT_INVITE_REQUIRED');
assert.equal(outsider.status, 403);

const deniedGate = await jobAgentConsentGate({ redis: null, partitionSecret, dataEncryptionKey: 'x' }, 'not-invited@example.test', ownerReviewedEnv);
assert.equal(deniedGate.ok, false);
assert.equal(deniedGate.code, 'JOB_AGENT_PILOT_INVITE_REQUIRED');

const unsetOwner = jobAgentConsentPolicyConfiguration({
  JOB_AGENT_TERMS_VERSION: pin.termsVersion,
  JOB_AGENT_PRIVACY_VERSION: pin.privacyVersion,
  JOB_AGENT_AUTHORIZATION_VERSION: pin.authorizationVersion,
});
assert.equal(unsetOwner.ready, false);
assert.equal(unsetOwner.counselApproved, false);
assert.throws(() => grantJobAgentConsent(acceptance, unsetOwner), /Counsel-approved/);

const incompleteOwner = jobAgentConsentPolicyConfiguration({
  ...ownerReviewedEnv, JOB_AGENT_OWNER_REVIEWED_POLICY_VERSION: 'wrong',
});
assert.throws(() => grantJobAgentConsent(acceptance, incompleteOwner), /Owner-reviewed Job Agent policy is not bound/);

const staleDigestPolicy = structuredClone(ownerPolicy);
staleDigestPolicy.bundle.binding.termsDigest = 'f'.repeat(64);
assert.equal(activeJobAgentConsent(granted, staleDigestPolicy).code, 'JOB_AGENT_CONSENT_RENEWAL_REQUIRED');

const ownerManifest = jobAgentLaunchManifest(ownerReviewedRuntimeEnv);
assert.equal(ownerManifest.capabilities.ownerReviewedControlledBeta.eligible, true);
assert.equal(ownerManifest.capabilities.signedBeta.eligible, false);
assert.equal(ownerManifest.currentMode, 'owner-reviewed-controlled-beta');
assert.equal(ownerManifest.submissionsEnabled, false);
assert.equal(ownerManifest.externalApplicationExecution, false);
assert.equal(ownerManifest.extensionHandoff.submissionsEnabled, false);
assert.ok(ownerManifest.capabilities.signedBeta.blockers.includes('COUNSEL_APPROVED_CONSENT_NOT_CONFIGURED'));
assert.equal(ownerManifest.capabilities.assistedApplication.eligible, false);
assert.equal(ownerManifest.capabilities.packageReady.eligible, false);
assert.equal(ownerManifest.capabilities.finalSubmission.eligible, false);

const ownerPlusCounsel = jobAgentConsentPolicyConfiguration({
  ...ownerReviewedEnv, JOB_AGENT_COUNSEL_APPROVED: 'true',
});
assert.equal(ownerPlusCounsel.ready, false);
assert.equal(ownerPlusCounsel.ownerReviewed, false);
assert.equal(ownerPlusCounsel.counselApproved, false);
assert.equal(ownerPlusCounsel.ownerCounselConflict, true);
assert.equal(ownerPlusCounsel.approvalSource, null);
assert.notEqual(ownerPlusCounsel.approvalSource, 'counsel');
assert.throws(() => grantJobAgentConsent(acceptance, ownerPlusCounsel), /cannot be combined with counsel approval/);
const publicConflict = publicJobAgentConsent(null, ownerPlusCounsel);
assert.equal(publicConflict.counselApproved, false);
assert.notEqual(publicConflict.approvalSource, 'counsel');
assert.equal(publicConflict.policyBundle, null);
assert.doesNotMatch(JSON.stringify(publicConflict), /"approvalSource":"counsel"/);
assert.doesNotMatch(JSON.stringify(publicConflict), /"counselApproved":true/);

const pinVersionsCounsel = jobAgentConsentPolicyConfiguration({
  JOB_AGENT_COUNSEL_APPROVED: 'true',
  JOB_AGENT_TERMS_VERSION: pin.termsVersion,
  JOB_AGENT_PRIVACY_VERSION: pin.privacyVersion,
  JOB_AGENT_AUTHORIZATION_VERSION: pin.authorizationVersion,
});
assert.equal(pinVersionsCounsel.ready, false);
assert.equal(pinVersionsCounsel.counselApproved, false);
assert.notEqual(pinVersionsCounsel.approvalSource, 'counsel');

const ownerPlusCounselManifest = jobAgentLaunchManifest({
  ...ownerReviewedRuntimeEnv, JOB_AGENT_COUNSEL_APPROVED: 'true',
});
assert.equal(ownerPlusCounselManifest.capabilities.ownerReviewedControlledBeta.eligible, false);
assert.equal(ownerPlusCounselManifest.capabilities.signedBeta.eligible, false);
assert.equal(ownerPlusCounselManifest.submissionsEnabled, false);

const emptyAllowlist = { ...ownerReviewedEnv, JOB_AGENT_PILOT_ALLOWED_TENANTS: '' };
assert.equal(jobAgentPilotConfiguration(emptyAllowlist).ready, false);
assert.equal(jobAgentPilotConfiguration(emptyAllowlist).invitedTenantCount, 0);
assert.equal(jobAgentOwnerReviewedPolicyConfiguration(emptyAllowlist).valid, false);
assert.equal(jobAgentConsentPolicyConfiguration(emptyAllowlist).ready, false);
assert.equal(jobAgentPilotAccessForSubject(invited, emptyAllowlist).ok, false);
assert.equal(jobAgentLaunchManifest({ ...ownerReviewedRuntimeEnv, JOB_AGENT_PILOT_ALLOWED_TENANTS: '' }).capabilities.ownerReviewedControlledBeta.eligible, false);

const ceilingEnv = {
  ...ownerReviewedRuntimeEnv,
  JOB_AGENT_SCHEDULE_ENABLED: 'true',
  JOB_AGENT_SCHEDULE_GLOBAL_DAILY_RUNS: '5',
  JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED: 'true',
  RESEND_API_KEY: 'resend'.padEnd(32, 'x'),
  RESEND_FROM: 'alerts@example.test',
  RESEND_WEBHOOK_SECRET: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
  JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS: '365',
  JOB_AGENT_EXTENSION_HANDOFF_ENABLED: 'true',
  JOB_AGENT_EXTENSION_HANDOFF_SECRET: 'h'.repeat(48),
  JOB_AGENT_RECEIPT_CAPTURE_ENABLED: 'true',
  JOB_AGENT_OBJECT_STORAGE_ENABLED: 'true',
  BLOB_READ_WRITE_TOKEN: 'b'.repeat(32),
  DOCUMENT_RENDER_SANDBOX_ENABLED: 'true',
  DOCUMENT_RENDER_SANDBOX_SNAPSHOT_ID: 'snap_owner_reviewed',
  EMPLOYER_BROWSER_WORKER_ENABLED: 'true',
};
assert.equal(jobAgentScheduleConfiguration(ceilingEnv).enabled, false);
assert.equal(jobAgentScheduleConfiguration(ceilingEnv).reason, 'OWNER_REVIEWED_CAPABILITY_CEILING');
assert.equal(jobAgentNeedsYouNotificationConfiguration(ceilingEnv).enabled, false);
assert.equal(extensionApplicationHandoffConfiguration(ceilingEnv).ready, false);
assert.equal(applicationReceiptCaptureConfiguration(ceilingEnv).ready, false);
assert.equal(jobAgentObjectStorageConfiguration(ceilingEnv).ready, false);
assert.equal(documentRenderSandboxConfiguration(ceilingEnv).enabled, false);
assert.equal(employerBrowserWorkerConfiguration(ceilingEnv).enabled, false);
const ceilingManifest = jobAgentLaunchManifest(ceilingEnv);
assert.equal(ceilingManifest.capabilities.ownerReviewedControlledBeta.eligible, true);
assert.equal(ceilingManifest.capabilities.signedBeta.eligible, false);
assert.equal(ceilingManifest.capabilities.packageReady.eligible, false);
assert.equal(ceilingManifest.capabilities.assistedApplication.eligible, false);
assert.equal(ceilingManifest.capabilities.finalSubmission.eligible, false);
assert.equal(ceilingManifest.submissionsEnabled, false);
assert.equal(ceilingManifest.extensionHandoff.ready, false);

const dataPolicy = jobAgentDataPolicyConfiguration(ownerReviewedEnv);
assert.equal(dataPolicy.ready, true);
assert.equal(dataPolicy.termsDigest, pin.termsSha256);
assert.equal(dataPolicy.privacyDigest, pin.privacySha256);
assert.equal(activeJobAgentDataConsent(granted, dataPolicy).ok, true);
assert.equal(activeJobAgentDataConsent({
  ...granted, policy: { ...granted.policy, termsDigest: 'f'.repeat(64) },
}, dataPolicy).code, 'JOB_AGENT_DATA_CONSENT_RENEWAL_REQUIRED');
assert.equal(activeJobAgentDataConsent({
  ...granted, policy: { termsVersion: granted.policy.termsVersion, privacyVersion: granted.policy.privacyVersion, authorizationVersion: granted.policy.authorizationVersion },
}, dataPolicy).code, 'JOB_AGENT_DATA_CONSENT_RENEWAL_REQUIRED');

const productionOwnerEnv = { ...ownerReviewedRuntimeEnv, VERCEL_ENV: 'production' };
assert.equal(jobAgentOwnerReviewedPolicyConfiguration(productionOwnerEnv).reason, 'production-not-allowed');
assert.equal(jobAgentOwnerReviewedPolicyConfiguration(productionOwnerEnv).valid, false);
const productionOwnerManifest = jobAgentLaunchManifest(productionOwnerEnv);
assert.equal(productionOwnerManifest.capabilities.ownerReviewedControlledBeta.eligible, false);
assert.ok(productionOwnerManifest.capabilities.ownerReviewedControlledBeta.blockers.includes('OWNER_REVIEWED_POLICY_NOT_ALLOWED_IN_PRODUCTION'));
assert.equal(productionOwnerManifest.capabilities.signedBeta.eligible, false);
assert.equal(productionOwnerManifest.submissionsEnabled, false);
assert.equal(productionOwnerManifest.currentMode, 'preview');

const previousEnv = { ...process.env };
Object.assign(process.env, {
  ...productionOwnerEnv,
  ...ceilingEnv,
  VERCEL_ENV: 'production',
  NODE_ENV: 'production',
  CRON_SECRET: 'readiness-cron-secret'.padEnd(48, 'x'),
  JOB_AGENT_MALWARE_SCANNER_ENABLED: 'true',
  JOB_AGENT_MALWARE_SCANNER_URL: 'https://scanner.example.test/scan',
  JOB_AGENT_MALWARE_SCANNER_HOST: 'scanner.example.test',
  JOB_AGENT_MALWARE_SCANNER_BEARER_TOKEN: 'm'.repeat(48),
});
try {
  const { default: readinessHandler } = await import('../api/job-agent-readiness.js');
  const response = {
    statusCode: 200, body: undefined, headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
  await readinessHandler({
    method: 'GET',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    query: {},
    socket: {},
  }, response);
  assert.equal(response.statusCode, 503);
  assert.notEqual(response.body?.status, 'ok');
  assert.equal(response.body?.submissionsEnabled === true, false);
  assert.equal(response.body?.externalApplicationExecution === true, false);
  assert.ok(['encrypted-object-storage', 'job-agent-consent-control', 'background-scheduling', 'audit-retention-archive', 'needs-you-notifications', 'controlled-beta-launch-manifest', 'not-configured'].includes(response.body?.failedStage) || response.body?.durableStore === 'not-configured');
} finally {
  for (const key of Object.keys(process.env)) {
    if (!(key in previousEnv)) delete process.env[key];
  }
  Object.assign(process.env, previousEnv);
}

const emptyManifest = jobAgentLaunchManifest({});
assert.equal(emptyManifest.capabilities.ownerReviewedControlledBeta.eligible, false);
assert.equal(emptyManifest.capabilities.signedBeta.eligible, false);
assert.equal(emptyManifest.submissionsEnabled, false);

console.log('Owner-reviewed controlled-beta policy, digest pin, 5-user allowlist, consent, and signedBeta isolation tests passed.');
