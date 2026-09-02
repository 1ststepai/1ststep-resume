import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJobAgentDatabaseRuntimeEvidence } from '../lib/job-agent-database-runtime-evidence.js';
import { buildJobAgentReleasePreflight } from '../lib/job-agent-release-preflight.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(root, 'supabase', 'migrations', '20260901195545_job_agent_canonical_baseline.sql');
const index = process.argv.indexOf('--artifact');

try {
  if (index < 0 || !process.argv[index + 1]) throw new Error('DATABASE_RUNTIME_ARTIFACT_REQUIRED');
  const artifactPath = path.resolve(process.cwd(), process.argv[index + 1]);
  const [artifactText, migration, release] = await Promise.all([
    readFile(artifactPath, 'utf8'), readFile(migrationPath), buildJobAgentReleasePreflight({ root }),
  ]);
  if (!release.ok) throw new Error('DATABASE_RUNTIME_CURRENT_RELEASE_NOT_CLEAN');
  const result = validateJobAgentDatabaseRuntimeEvidence(JSON.parse(artifactText), {
    expectedSourceCommit: release.git.head,
    expectedRuntimeSha256: release.runtime.sha256,
    expectedMigrationSha256: createHash('sha256').update(migration).digest('hex'),
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const allowed = new Set([
    'DATABASE_RUNTIME_ARTIFACT_REQUIRED', 'DATABASE_RUNTIME_CURRENT_RELEASE_NOT_CLEAN',
    'DATABASE_RUNTIME_EVIDENCE_SCHEMA_INVALID', 'DATABASE_RUNTIME_EVIDENCE_BOUNDARY_INVALID',
    'DATABASE_RUNTIME_SOURCE_COMMIT_MISMATCH', 'DATABASE_RUNTIME_DIGEST_INVALID',
    'DATABASE_RUNTIME_EXPECTED_DIGEST_INVALID', 'DATABASE_RUNTIME_RELEASE_DIGEST_MISMATCH',
    'DATABASE_RUNTIME_TARGET_INVALID', 'DATABASE_RUNTIME_TARGET_ISOLATION_NOT_PROVEN', 'DATABASE_RUNTIME_EVIDENCE_STALE',
    'DATABASE_RUNTIME_TOOLING_INVALID', 'DATABASE_RUNTIME_MIGRATION_INVALID',
    'DATABASE_RUNTIME_EXPECTED_MIGRATION_INVALID', 'DATABASE_RUNTIME_MIGRATION_MISMATCH',
    'DATABASE_RUNTIME_SURFACE_INVALID', 'DATABASE_RUNTIME_GRANTS_INVALID', 'DATABASE_RUNTIME_POLICIES_INVALID',
    'DATABASE_RUNTIME_ISOLATION_INVALID', 'DATABASE_RUNTIME_ADVISORS_INVALID',
  ]);
  const code = allowed.has(error?.message) ? error.message : 'DATABASE_RUNTIME_EVIDENCE_UNREADABLE';
  console.error(JSON.stringify({ ok: false, contentFree: true, containsCandidateValues: false, performsWrites: false, error: code }));
  process.exit(1);
}
