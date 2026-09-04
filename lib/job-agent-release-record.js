import { createHash, timingSafeEqual } from 'node:crypto';
import { jobAgentLaunchEvidenceScopeDigest } from './job-agent-launch-evidence.js';
import { jobAgentLaunchManifest } from './job-agent-launch-manifest.js';

const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_RECORD_AGE_MS = 24 * 60 * 60_000;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function exactCanonical(left, right) {
  const leftBytes = Buffer.from(canonical(left));
  const rightBytes = Buffer.from(canonical(right));
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function withoutReleaseEvidence(evidence = {}) {
  const { controlledBetaRelease: _controlledBetaRelease, ...rest } = evidence;
  return rest;
}

function safeLaunchSnapshot(manifest = {}) {
  return {
    releaseClass: manifest.releaseClass || null,
    currentMode: manifest.currentMode || 'preview',
    pilot: manifest.pilot || null,
    accessPolicy: manifest.accessPolicy || null,
    supportAndIncidentOwnership: manifest.supportAndIncidentOwnership || null,
    assistedExecutionMode: manifest.assistedExecutionMode || null,
    extensionHandoff: manifest.extensionHandoff || null,
    monetarySpendControl: manifest.monetarySpendControl || null,
    stripeWebhookIdempotency: manifest.stripeWebhookIdempotency || null,
    authoritativeReceiptCapture: manifest.authoritativeReceiptCapture || null,
    authoritativeReceiptVerification: manifest.authoritativeReceiptVerification || null,
    finalSubmissionExecution: manifest.finalSubmissionExecution || null,
    finalSubmissionOrchestration: manifest.finalSubmissionOrchestration || null,
    capabilities: manifest.capabilities || null,
    evidence: withoutReleaseEvidence(manifest.evidence),
    externalApplicationExecution: manifest.externalApplicationExecution === true,
    submissionsEnabled: manifest.submissionsEnabled === true,
  };
}

function releasePrerequisiteBlockers(manifest = {}) {
  return [...new Set((manifest.capabilities?.signedBeta?.blockers || [])
    .filter(blocker => blocker !== 'CONTROLLED_BETA_RELEASE_NOT_VERIFIED'))].sort();
}

export function buildJobAgentControlledBetaReleaseRecord({
  env = process.env,
  preflight,
  manifest,
  now = new Date(),
} = {}) {
  if (!preflight || typeof preflight !== 'object') throw new Error('A release preflight result is required.');
  const generatedAt = new Date(now);
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('Release record time is invalid.');
  const evaluatedManifest = manifest || jobAgentLaunchManifest(env, { now: generatedAt });
  const commitSha = String(env.VERCEL_GIT_COMMIT_SHA || '').trim().toLowerCase();
  const configuredRuntimeSha256 = String(env.JOB_AGENT_RELEASE_RUNTIME_SHA256 || '').trim().toLowerCase();
  const preflightCommitSha = String(preflight.git?.head || '').trim().toLowerCase();
  const preflightRuntimeSha256 = String(preflight.runtime?.sha256 || '').trim().toLowerCase();
  const prerequisiteBlockers = releasePrerequisiteBlockers(evaluatedManifest);
  const issues = [];
  if (preflight.ok !== true) issues.push(...(Array.isArray(preflight.issues) && preflight.issues.length ? preflight.issues : ['RELEASE_PREFLIGHT_NOT_CLEAN']));
  if (!COMMIT.test(commitSha) || commitSha !== preflightCommitSha) issues.push('RELEASE_COMMIT_MISMATCH');
  if (!SHA256.test(configuredRuntimeSha256) || configuredRuntimeSha256 !== preflightRuntimeSha256) issues.push('RELEASE_RUNTIME_DIGEST_MISMATCH');
  if (String(env.VERCEL_ENV || '').trim().toLowerCase() !== 'production') issues.push('RELEASE_ENVIRONMENT_NOT_PRODUCTION');
  if (prerequisiteBlockers.length) issues.push('SIGNED_BETA_PREREQUISITES_INCOMPLETE');
  const uniqueIssues = [...new Set(issues)];

  return {
    schemaVersion: 1,
    kind: 'controlled-beta-release-review',
    generatedAt: generatedAt.toISOString(),
    ok: uniqueIssues.length === 0,
    contentFree: true,
    containsCandidateValues: false,
    containsOwnerIdentifiers: false,
    performsExternalCalls: false,
    performsWrites: false,
    deploys: false,
    signsEvidence: false,
    ownerReviewRequired: true,
    candidate: {
      branchDigest: sha256(preflight.git?.branch || 'unknown'),
      commitSha: preflightCommitSha || null,
      runtimeSha256: preflightRuntimeSha256 || null,
      runtimeFileCount: Math.max(0, Number(preflight.runtime?.fileCount) || 0),
      runtimeTotalBytes: Math.max(0, Number(preflight.runtime?.totalBytes) || 0),
      keyHashes: preflight.runtime?.keyHashes || {},
      ignorePolicyVerified: preflight.ignorePolicy?.verified === true,
    },
    releaseScopeDigest: jobAgentLaunchEvidenceScopeDigest('controlled-beta-release', env),
    prerequisiteBlockers,
    launchSnapshot: safeLaunchSnapshot(evaluatedManifest),
    issues: uniqueIssues,
  };
}

export function verifyJobAgentControlledBetaReleaseRecord(value, {
  env = process.env,
  preflight,
  manifest,
  now = new Date(),
} = {}) {
  const unavailable = { verified: false, reason: 'release-record-invalid', contentFree: true, performsWrites: false };
  let record;
  try { record = typeof value === 'string' || Buffer.isBuffer(value) ? JSON.parse(String(value)) : value; } catch { return unavailable; }
  if (!record || typeof record !== 'object' || Array.isArray(record)) return unavailable;
  const recordedAt = new Date(String(record.generatedAt || ''));
  const current = new Date(now);
  if (!Number.isFinite(recordedAt.getTime()) || !Number.isFinite(current.getTime()) || recordedAt.toISOString() !== record.generatedAt
    || recordedAt.getTime() > current.getTime() + 5 * 60_000 || current.getTime() - recordedAt.getTime() > MAX_RECORD_AGE_MS) {
    return { ...unavailable, reason: 'release-record-expired' };
  }
  let expected;
  try { expected = buildJobAgentControlledBetaReleaseRecord({ env, preflight, manifest, now: current }); } catch { return unavailable; }
  const { generatedAt: _recordedGeneratedAt, ...recordComparable } = record;
  const { generatedAt: _expectedGeneratedAt, ...expectedComparable } = expected;
  if (!expected.ok || record.ok !== true || !exactCanonical(recordComparable, expectedComparable)) return unavailable;
  return {
    verified: true,
    reason: null,
    contentFree: true,
    performsWrites: false,
    generatedAt: record.generatedAt,
    commitSha: record.candidate.commitSha,
    runtimeSha256: record.candidate.runtimeSha256,
    releaseScopeDigest: record.releaseScopeDigest,
  };
}
