import assert from 'node:assert/strict';
import {
  buildJobAgentControlledBetaReleaseRecord,
  verifyJobAgentControlledBetaReleaseRecord,
} from '../lib/job-agent-release-record.js';

const now = new Date('2026-08-30T18:00:00.000Z');
const commitSha = 'a'.repeat(40);
const runtimeSha256 = 'b'.repeat(64);
const env = {
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_SHA: commitSha,
  JOB_AGENT_RELEASE_RUNTIME_SHA256: runtimeSha256,
  JOB_AGENT_PILOT_ALLOWED_TENANTS: '1'.repeat(40),
  JOB_AGENT_CONTROLLED_BETA_INCLUDED_TIERS: 'complete',
  JOB_AGENT_SUPPORT_OWNER: 'support-owner@example.test',
  JOB_AGENT_INCIDENT_OWNER: 'incident-owner@example.test',
};
const preflight = {
  ok: true,
  issues: [],
  git: { branch: 'release-candidate', head: commitSha },
  runtime: { sha256: runtimeSha256, fileCount: 125, totalBytes: 1_000_000, keyHashes: { 'app.js': 'c'.repeat(64) } },
  ignorePolicy: { verified: true },
};
const manifest = {
  releaseClass: 'controlled-production-beta', currentMode: 'preview',
  pilot: { approved: true, maxUsers: 5, admissionEnforced: true, invitedTenantCount: 1 },
  accessPolicy: { ready: true, createsCharges: false },
  supportAndIncidentOwnership: { ready: true, supportOwnerAssigned: true, incidentOwnerAssigned: true, containsOwnerIdentifiers: false },
  assistedExecutionMode: 'greenhouse-extension', extensionHandoff: { ready: false, submissionsEnabled: false },
  monetarySpendControl: { ready: true, currency: 'USD' }, stripeWebhookIdempotency: { ready: true, storesRawEventIds: false },
  authoritativeReceiptCapture: { ready: false }, authoritativeReceiptVerification: { ready: false },
  finalSubmissionExecution: { ready: false }, finalSubmissionOrchestration: { ready: false },
  capabilities: {
    preview: { eligible: true, blockers: [] },
    signedBeta: { eligible: false, blockers: ['CONTROLLED_BETA_RELEASE_NOT_VERIFIED'] },
    packageReady: { eligible: false, blockers: ['CONTROLLED_BETA_RELEASE_NOT_VERIFIED', 'DOCUMENT_RENDER_SANDBOX_NOT_CONFIGURED'] },
    assistedApplication: { eligible: false, blockers: ['CONTROLLED_BETA_RELEASE_NOT_VERIFIED'] },
    finalSubmission: { eligible: false, blockers: ['CONTROLLED_BETA_RELEASE_NOT_VERIFIED'] },
  },
  evidence: { controlledBetaRelease: { verified: false }, notificationDelivery: { verified: true, evidenceId: 'notification-v1' } },
  externalApplicationExecution: false, submissionsEnabled: false,
};

const record = buildJobAgentControlledBetaReleaseRecord({ env, preflight, manifest, now });
assert.equal(record.ok, true);
assert.equal(record.contentFree, true);
assert.equal(record.containsCandidateValues, false);
assert.equal(record.containsOwnerIdentifiers, false);
assert.equal(record.performsWrites, false);
assert.equal(record.deploys, false);
assert.equal(record.signsEvidence, false);
assert.equal('branch' in record.candidate, false);
assert.match(record.candidate.branchDigest, /^[a-f0-9]{64}$/);
assert.deepEqual(record.prerequisiteBlockers, []);
assert.equal('controlledBetaRelease' in record.launchSnapshot.evidence, false);
const serialized = JSON.stringify(record);
assert.equal(serialized.includes(env.JOB_AGENT_SUPPORT_OWNER), false);
assert.equal(serialized.includes(env.JOB_AGENT_INCIDENT_OWNER), false);
assert.equal(serialized.includes(env.JOB_AGENT_PILOT_ALLOWED_TENANTS), false);

let verification = verifyJobAgentControlledBetaReleaseRecord(record, { env, preflight, manifest, now: new Date(now.getTime() + 60_000) });
assert.equal(verification.verified, true);
assert.equal(verification.commitSha, commitSha);
assert.equal(verification.runtimeSha256, runtimeSha256);

verification = verifyJobAgentControlledBetaReleaseRecord({ ...record, candidate: { ...record.candidate, runtimeSha256: 'd'.repeat(64) } }, { env, preflight, manifest, now });
assert.equal(verification.verified, false);
verification = verifyJobAgentControlledBetaReleaseRecord({ ...record, hiddenOwnerEmail: 'owner@example.test' }, { env, preflight, manifest, now });
assert.equal(verification.verified, false);
verification = verifyJobAgentControlledBetaReleaseRecord(record, { env: { ...env, JOB_AGENT_PILOT_ALLOWED_TENANTS: '2'.repeat(40) }, preflight, manifest, now });
assert.equal(verification.verified, false);
verification = verifyJobAgentControlledBetaReleaseRecord(record, { env, preflight: { ...preflight, ok: false, issues: ['WORKTREE_HAS_UNTRACKED_FILES'] }, manifest, now });
assert.equal(verification.verified, false);
verification = verifyJobAgentControlledBetaReleaseRecord(record, { env, preflight, manifest, now: new Date(now.getTime() + 25 * 60 * 60_000) });
assert.equal(verification.verified, false);
assert.equal(verification.reason, 'release-record-expired');

const incompleteManifest = structuredClone(manifest);
incompleteManifest.capabilities.signedBeta.blockers.push('BACKUP_RESTORE_NOT_VERIFIED');
const incomplete = buildJobAgentControlledBetaReleaseRecord({ env, preflight, manifest: incompleteManifest, now });
assert.equal(incomplete.ok, false);
assert.deepEqual(incomplete.prerequisiteBlockers, ['BACKUP_RESTORE_NOT_VERIFIED']);
assert.ok(incomplete.issues.includes('SIGNED_BETA_PREREQUISITES_INCOMPLETE'));

console.log('Deterministic controlled-beta release record generation and verification tests passed.');
