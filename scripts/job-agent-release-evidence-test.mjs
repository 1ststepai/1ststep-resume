import assert from 'node:assert/strict';
import { createReleaseEvidence, verifyReleaseEvidence } from '../lib/job-agent-release-evidence.js';

const secret = 'release-evidence-test-secret'.padEnd(48, 'x');
const now = '2026-09-08T18:00:00.000Z';
const digest = character => character.repeat(64);
const input = {
  commit: 'a'.repeat(40),
  dirty: false,
  buildDigest: digest('b'),
  migrationDigest: digest('c'),
  extensionVersion: '1.5.0',
  extensionDigest: digest('d'),
  deploymentId: 'dpl_exact_candidate',
  deploymentUrl: 'https://candidate.example.test',
  rollbackDeploymentId: 'dpl_previous_production',
  featureFlags: { JOB_AGENT_RELEASE_MANIFEST: true, JOB_AGENT_SUBMIT: false },
  tests: [{ name: 'browser-harness', sha256: digest('e'), passedAt: now }],
};

const manifest = createReleaseEvidence(input, { secret, now });
assert.equal(manifest.source.clean, true);
assert.equal(JSON.stringify(manifest).includes(secret), false);
assert.deepEqual(verifyReleaseEvidence(manifest, {
  secret,
  now: '2026-09-08T19:00:00.000Z',
  expectedCommit: input.commit,
  expectedBuildDigest: input.buildDigest,
  expectedMigrationDigest: input.migrationDigest,
  expectedExtensionVersion: input.extensionVersion,
  expectedExtensionDigest: input.extensionDigest,
  expectedDeploymentId: input.deploymentId,
  expectedDeploymentUrl: input.deploymentUrl,
  expectedRollbackDeploymentId: input.rollbackDeploymentId,
}), { ready: true, blockers: [] });

assert.throws(() => createReleaseEvidence({ ...input, dirty: true }, { secret, now }), /DIRTY_WORKTREE/);
assert.throws(() => createReleaseEvidence({ ...input, featureFlags: { API_SECRET: 'nope' } }, { secret, now }), /Sensitive/);

let result = verifyReleaseEvidence(manifest, { secret, now: '2026-09-10T18:00:00.000Z' });
assert.equal(result.ready, false);
assert.ok(result.blockers.includes('EVIDENCE_STALE'));

result = verifyReleaseEvidence(manifest, { secret, now, expectedDeploymentId: 'dpl_wrong' });
assert.ok(result.blockers.includes('WRONG_DEPLOYMENT'));

result = verifyReleaseEvidence(manifest, { secret, now, expectedBuildDigest: digest('f') });
assert.ok(result.blockers.includes('BUILD_HASH_MISMATCH'));

const tampered = structuredClone(manifest);
tampered.featureFlags.JOB_AGENT_SUBMIT = true;
result = verifyReleaseEvidence(tampered, { secret, now });
assert.ok(result.blockers.includes('SIGNATURE_INVALID'));
assert.ok(result.blockers.includes('FEATURE_FLAGS_HASH_MISMATCH'));

console.log('Job Agent release evidence tests passed.');
