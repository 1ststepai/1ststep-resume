import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJobAgentSignedCapacityEvidence } from '../lib/job-agent-signed-capacity-evidence.js';
import { buildJobAgentReleasePreflight } from '../lib/job-agent-release-preflight.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

try {
  const artifact = argument('artifact');
  const deploymentId = argument('deployment-id');
  const deploymentOrigin = argument('deployment-origin');
  if (!artifact || !deploymentId || !deploymentOrigin) throw new Error('SIGNED_CAPACITY_ARGUMENTS_REQUIRED');
  const [artifactText, release] = await Promise.all([
    readFile(path.resolve(process.cwd(), artifact), 'utf8'),
    buildJobAgentReleasePreflight({ root }),
  ]);
  if (!release.ok) throw new Error('SIGNED_CAPACITY_CURRENT_RELEASE_NOT_CLEAN');
  const result = validateJobAgentSignedCapacityEvidence(JSON.parse(artifactText), {
    expectedSourceCommit: release.git.head,
    expectedRuntimeSha256: release.runtime.sha256,
    expectedDeploymentId: deploymentId,
    expectedDeploymentOrigin: deploymentOrigin,
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const allowed = new Set([
    'SIGNED_CAPACITY_ARGUMENTS_REQUIRED', 'SIGNED_CAPACITY_CURRENT_RELEASE_NOT_CLEAN',
    'SIGNED_CAPACITY_EVIDENCE_SCHEMA_INVALID', 'SIGNED_CAPACITY_BOUNDARY_INVALID',
    'SIGNED_CAPACITY_SOURCE_COMMIT_INVALID', 'SIGNED_CAPACITY_SOURCE_COMMIT_MISMATCH',
    'SIGNED_CAPACITY_RUNTIME_DIGEST_INVALID', 'SIGNED_CAPACITY_EXPECTED_RUNTIME_INVALID', 'SIGNED_CAPACITY_RUNTIME_MISMATCH',
    'SIGNED_CAPACITY_DEPLOYMENT_INVALID', 'SIGNED_CAPACITY_EXPECTED_DEPLOYMENT_INVALID',
    'SIGNED_CAPACITY_AUTHORIZATION_INVALID', 'SIGNED_CAPACITY_EXERCISE_INVALID', 'SIGNED_CAPACITY_TRAFFIC_INVALID',
    'SIGNED_CAPACITY_FAIRNESS_INVALID', 'SIGNED_CAPACITY_RATE_LIMIT_INVALID', 'SIGNED_CAPACITY_QUEUE_INVALID',
    'SIGNED_CAPACITY_DEPENDENCY_FAILURE_INVALID', 'SIGNED_CAPACITY_COST_INVALID', 'SIGNED_CAPACITY_CLEANUP_INVALID',
    'SIGNED_CAPACITY_EVIDENCE_STALE',
  ]);
  const code = allowed.has(error?.message) ? error.message : 'SIGNED_CAPACITY_EVIDENCE_UNREADABLE';
  console.error(JSON.stringify({
    ok: false, contentFree: true, containsCandidateValues: false, performsWrites: false,
    deploys: false, productionAccessed: false, performsEmployerActions: false, error: code,
  }));
  process.exit(1);
}
