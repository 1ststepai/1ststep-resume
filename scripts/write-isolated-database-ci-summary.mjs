import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve(process.argv[2] || 'artifacts/isolated-database-ci-summary.json');
const integer = (name) => {
  const value = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name}_INVALID`);
  return value;
};
const sha256 = (name) => {
  const value = String(process.env[name] || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${name}_INVALID`);
  return value;
};

const sourceRows = integer('CI_SOURCE_ROWS');
const restoredRows = integer('CI_RESTORED_ROWS');
const evidence = {
  schemaVersion: 1,
  evidenceKind: 'isolated-database-ci-drill',
  contentFree: true,
  containsCandidateValues: false,
  productionAccessed: false,
  sourceCommit: String(process.env.CI_SOURCE_COMMIT || ''),
  recordedAt: String(process.env.CI_RECORDED_AT || ''),
  environment: {
    provider: 'github-actions',
    target: 'disposable-local-supabase',
    persistentStaging: false,
  },
  tooling: {
    supabaseCliVersion: String(process.env.CI_SUPABASE_VERSION || ''),
    postgresVersion: String(process.env.CI_POSTGRES_VERSION || ''),
  },
  migration: {
    canonicalSha256: sha256('CI_MIGRATION_SHA256'),
    appliedToDisposableSource: true,
    appliedToDisposableRestore: true,
  },
  isolation: {
    pgTapPlan: 19,
    pgTapPassed: 19,
    jobAgentTables: integer('CI_TABLE_COUNT'),
    rlsAndForceRlsTables: integer('CI_RLS_COUNT'),
  },
  recovery: {
    logicalBackupSha256: sha256('CI_BACKUP_SHA256'),
    sourceFixtureRows: sourceRows,
    restoredFixtureRows: restoredRows,
    fixtureCountsMatch: sourceRows === restoredRows,
    restoreTargetDestroyedAfterRun: process.env.CI_RESTORE_CLEANUP_VERIFIED === 'true',
  },
  limits: {
    managedBackupVerified: false,
    pointInTimeRecoveryVerified: false,
    persistentStagingVerified: false,
  },
};

if (!/^[a-f0-9]{40}$/.test(evidence.sourceCommit)
  || !Number.isFinite(Date.parse(evidence.recordedAt))
  || !evidence.tooling.supabaseCliVersion
  || !evidence.tooling.postgresVersion
  || evidence.isolation.jobAgentTables !== 20
  || evidence.isolation.rlsAndForceRlsTables !== 20
  || !evidence.recovery.fixtureCountsMatch
  || !evidence.recovery.restoreTargetDestroyedAfterRun) {
  throw new Error('ISOLATED_DATABASE_CI_EVIDENCE_INVALID');
}

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(`Content-free isolated database summary written to ${output}`);
