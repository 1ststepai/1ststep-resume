import assert from 'node:assert/strict';
import { validateJobAgentRecoveryEvidence } from '../lib/job-agent-recovery-evidence.js';

const hash = value => String(value).repeat(64).slice(0, 64);
const migration = hash('a');
const now = new Date('2026-09-02T04:00:00.000Z');
function fixture() {
  return {
    schemaVersion: 1,
    evidenceKind: 'database-backup-restore',
    contentFree: true,
    containsCandidateValues: false,
    productionAccessed: false,
    sourceEnvironment: { class: 'isolated-nonproduction', fingerprintSha256: hash('1') },
    restoreEnvironment: { class: 'isolated-nonproduction-new-target', fingerprintSha256: hash('2') },
    productionEnvironment: { class: 'production-fingerprint-only', fingerprintSha256: hash('3') },
    authorization: {
      approvalVersion: 'recovery-approval-v1', costCeilingCents: 2500, currency: 'USD',
      maximumRpoSeconds: 3600, maximumRtoSeconds: 1800, recoveryOwnerDigestSha256: hash('4'),
    },
    backup: {
      mode: 'scheduled', capturedAt: '2026-09-02T02:55:00.000Z', recoveryPointAt: '2026-09-02T02:50:00.000Z',
      retentionDays: 7, encryptedAtRest: true, providerPolicyDigestSha256: hash('5'),
    },
    restore: {
      incidentAt: '2026-09-02T03:00:00.000Z', startedAt: '2026-09-02T03:05:00.000Z',
      completedAt: '2026-09-02T03:20:00.000Z', cleanupCompletedAt: '2026-09-02T03:25:00.000Z',
      productionConnectionUsed: false, destructiveProductionAction: false,
    },
    reconciliation: {
      migrationSha256: migration, schemaDigestSha256: hash('6'), rowCountDigestSha256: hash('7'),
      relationshipDigestSha256: hash('8'), auditContinuityDigestSha256: hash('9'), tablesExamined: 20,
      orphanedRelationships: 0, crossTenantViolations: 0, integrityVerified: true, cleanupVerified: true,
    },
  };
}

const result = validateJobAgentRecoveryEvidence(fixture(), { expectedMigrationSha256: migration, now });
assert.equal(result.ok, true);
assert.equal(result.rpoSeconds, 600);
assert.equal(result.rtoSeconds, 900);
assert.match(result.artifactSha256, /^[a-f0-9]{64}$/);
assert.equal(JSON.stringify(result).includes('recovery-approval-v1'), false);
assert.equal(JSON.stringify(result).includes(hash('1')), false);

const sameTarget = fixture();
sameTarget.restoreEnvironment.fingerprintSha256 = sameTarget.sourceEnvironment.fingerprintSha256;
assert.throws(() => validateJobAgentRecoveryEvidence(sameTarget, { expectedMigrationSha256: migration, now }), /RECOVERY_TARGET_ISOLATION_NOT_PROVEN/);

const productionTouched = fixture();
productionTouched.restore.productionConnectionUsed = true;
assert.throws(() => validateJobAgentRecoveryEvidence(productionTouched, { expectedMigrationSha256: migration, now }), /RECOVERY_PRODUCTION_BOUNDARY_VIOLATED/);

const migrationMismatch = fixture();
migrationMismatch.reconciliation.migrationSha256 = hash('b');
assert.throws(() => validateJobAgentRecoveryEvidence(migrationMismatch, { expectedMigrationSha256: migration, now }), /RECOVERY_MIGRATION_MISMATCH/);

const rpoExceeded = fixture();
rpoExceeded.authorization.maximumRpoSeconds = 10;
assert.throws(() => validateJobAgentRecoveryEvidence(rpoExceeded, { expectedMigrationSha256: migration, now }), /RECOVERY_RPO_EXCEEDED/);

const rtoExceeded = fixture();
rtoExceeded.authorization.maximumRtoSeconds = 10;
assert.throws(() => validateJobAgentRecoveryEvidence(rtoExceeded, { expectedMigrationSha256: migration, now }), /RECOVERY_RTO_EXCEEDED/);

const brokenReconciliation = fixture();
brokenReconciliation.reconciliation.crossTenantViolations = 1;
assert.throws(() => validateJobAgentRecoveryEvidence(brokenReconciliation, { expectedMigrationSha256: migration, now }), /RECOVERY_RECONCILIATION_FAILED/);

const addedContent = fixture();
addedContent.candidateEmail = 'person@example.com';
assert.throws(() => validateJobAgentRecoveryEvidence(addedContent, { expectedMigrationSha256: migration, now }), /RECOVERY_EVIDENCE_SCHEMA_INVALID/);

const stale = fixture();
assert.throws(() => validateJobAgentRecoveryEvidence(stale, { expectedMigrationSha256: migration, now: new Date('2027-01-01T00:00:00.000Z') }), /RECOVERY_TIMELINE_INVALID/);

console.log('Content-free recovery evidence contract, target isolation, exact migration, RPO/RTO, reconciliation, and cleanup tests passed.');
