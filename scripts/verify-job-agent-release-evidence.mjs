import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { verifyReleaseEvidence } from '../lib/job-agent-release-evidence.js';
import { localReleaseIdentity } from '../lib/job-agent-release-files.js';

const artifactPath = process.argv[2];
if (!artifactPath) throw new Error('Usage: npm run release:evidence:verify -- <artifact-path>');
for (const name of ['JOB_AGENT_RELEASE_EVIDENCE_SECRET', 'VERCEL_DEPLOYMENT_ID', 'VERCEL_DEPLOYMENT_URL', 'JOB_AGENT_ROLLBACK_DEPLOYMENT_ID']) {
  if (!process.env[name]) throw new Error(`${name} is required for exact release verification.`);
}

const root = process.cwd();
const manifest = JSON.parse(await readFile(resolve(root, artifactPath), 'utf8'));
const local = await localReleaseIdentity(root);
const result = verifyReleaseEvidence(manifest, {
  secret: process.env.JOB_AGENT_RELEASE_EVIDENCE_SECRET,
  expectedCommit: local.commit,
  expectedBuildDigest: local.buildDigest,
  expectedMigrationDigest: local.migrationDigest,
  expectedExtensionVersion: local.extensionVersion,
  expectedExtensionDigest: local.extensionDigest,
  expectedDeploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  expectedDeploymentUrl: process.env.VERCEL_DEPLOYMENT_URL,
  expectedRollbackDeploymentId: process.env.JOB_AGENT_ROLLBACK_DEPLOYMENT_ID,
});
if (local.dirty && !result.blockers.includes('DIRTY_WORKTREE')) result.blockers.push('DIRTY_WORKTREE');
result.ready = result.blockers.length === 0;
console.log(JSON.stringify(result, null, 2));
if (!result.ready) process.exitCode = 1;
