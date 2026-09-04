import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJobAgentRecoveryEvidence } from '../lib/job-agent-recovery-evidence.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(root, 'supabase', 'migrations', '20260901195545_job_agent_canonical_baseline.sql');
const index = process.argv.indexOf('--artifact');

try {
  if (index < 0 || !process.argv[index + 1]) throw new Error('RECOVERY_ARTIFACT_REQUIRED');
  const artifactPath = path.resolve(process.cwd(), process.argv[index + 1]);
  const [artifactText, migration] = await Promise.all([readFile(artifactPath, 'utf8'), readFile(migrationPath)]);
  const result = validateJobAgentRecoveryEvidence(JSON.parse(artifactText), {
    expectedMigrationSha256: createHash('sha256').update(migration).digest('hex'),
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const allowed = new Set([
    'RECOVERY_ARTIFACT_REQUIRED', 'RECOVERY_EVIDENCE_SCHEMA_INVALID', 'RECOVERY_EVIDENCE_BOUNDARY_INVALID',
    'RECOVERY_SOURCE_ENVIRONMENT_INVALID', 'RECOVERY_RESTORE_ENVIRONMENT_INVALID', 'RECOVERY_PRODUCTION_ENVIRONMENT_INVALID',
    'RECOVERY_TARGET_ISOLATION_NOT_PROVEN', 'RECOVERY_AUTHORIZATION_INVALID', 'RECOVERY_BACKUP_INVALID',
    'RECOVERY_RESTORE_INVALID', 'RECOVERY_PRODUCTION_BOUNDARY_VIOLATED', 'RECOVERY_TIMELINE_INVALID',
    'RECOVERY_RECONCILIATION_INVALID', 'RECOVERY_EXPECTED_MIGRATION_INVALID', 'RECOVERY_MIGRATION_MISMATCH',
    'RECOVERY_RECONCILIATION_FAILED', 'RECOVERY_RPO_EXCEEDED', 'RECOVERY_RTO_EXCEEDED',
  ]);
  const code = allowed.has(error?.message) ? error.message : 'RECOVERY_EVIDENCE_UNREADABLE';
  console.error(JSON.stringify({ ok: false, contentFree: true, containsCandidateValues: false, performsWrites: false, error: code }));
  process.exit(1);
}
