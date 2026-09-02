import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
const ALLOWED_BACKUP_MODES = new Set(['scheduled', 'pitr']);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw new Error(code);
}

function digest(value, code) {
  const normalized = String(value || '').toLowerCase();
  if (!SHA256.test(normalized)) throw new Error(code);
  return normalized;
}

function positiveInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER, code }) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(code);
  return value;
}

function instant(value, code) {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error(code);
  return date;
}

export function validateJobAgentRecoveryEvidence(value, {
  expectedMigrationSha256,
  now = new Date(),
} = {}) {
  exactKeys(value, [
    'schemaVersion', 'evidenceKind', 'contentFree', 'containsCandidateValues', 'productionAccessed',
    'sourceEnvironment', 'restoreEnvironment', 'productionEnvironment', 'authorization', 'backup', 'restore', 'reconciliation',
  ], 'RECOVERY_EVIDENCE_SCHEMA_INVALID');
  if (value.schemaVersion !== 1 || value.evidenceKind !== 'database-backup-restore'
    || value.contentFree !== true || value.containsCandidateValues !== false || value.productionAccessed !== false) {
    throw new Error('RECOVERY_EVIDENCE_BOUNDARY_INVALID');
  }

  for (const [name, environment, expectedClass] of [
    ['source', value.sourceEnvironment, 'isolated-nonproduction'],
    ['restore', value.restoreEnvironment, 'isolated-nonproduction-new-target'],
    ['production', value.productionEnvironment, 'production-fingerprint-only'],
  ]) {
    exactKeys(environment, ['class', 'fingerprintSha256'], `RECOVERY_${name.toUpperCase()}_ENVIRONMENT_INVALID`);
    if (environment.class !== expectedClass) throw new Error(`RECOVERY_${name.toUpperCase()}_ENVIRONMENT_INVALID`);
    digest(environment.fingerprintSha256, `RECOVERY_${name.toUpperCase()}_ENVIRONMENT_INVALID`);
  }
  const fingerprints = [value.sourceEnvironment, value.restoreEnvironment, value.productionEnvironment]
    .map(environment => environment.fingerprintSha256.toLowerCase());
  if (new Set(fingerprints).size !== fingerprints.length) throw new Error('RECOVERY_TARGET_ISOLATION_NOT_PROVEN');

  exactKeys(value.authorization, [
    'approvalVersion', 'costCeilingCents', 'currency', 'maximumRpoSeconds', 'maximumRtoSeconds', 'recoveryOwnerDigestSha256',
  ], 'RECOVERY_AUTHORIZATION_INVALID');
  if (!SAFE_ID.test(String(value.authorization.approvalVersion || '')) || value.authorization.currency !== 'USD') {
    throw new Error('RECOVERY_AUTHORIZATION_INVALID');
  }
  positiveInteger(value.authorization.costCeilingCents, { min: 0, max: 10_000_000, code: 'RECOVERY_AUTHORIZATION_INVALID' });
  positiveInteger(value.authorization.maximumRpoSeconds, { min: 1, max: 31_536_000, code: 'RECOVERY_AUTHORIZATION_INVALID' });
  positiveInteger(value.authorization.maximumRtoSeconds, { min: 1, max: 2_592_000, code: 'RECOVERY_AUTHORIZATION_INVALID' });
  digest(value.authorization.recoveryOwnerDigestSha256, 'RECOVERY_AUTHORIZATION_INVALID');

  exactKeys(value.backup, [
    'mode', 'capturedAt', 'recoveryPointAt', 'retentionDays', 'encryptedAtRest', 'providerPolicyDigestSha256',
  ], 'RECOVERY_BACKUP_INVALID');
  if (!ALLOWED_BACKUP_MODES.has(value.backup.mode) || value.backup.encryptedAtRest !== true) throw new Error('RECOVERY_BACKUP_INVALID');
  positiveInteger(value.backup.retentionDays, { min: 1, max: 365, code: 'RECOVERY_BACKUP_INVALID' });
  digest(value.backup.providerPolicyDigestSha256, 'RECOVERY_BACKUP_INVALID');
  const capturedAt = instant(value.backup.capturedAt, 'RECOVERY_BACKUP_INVALID');
  const recoveryPointAt = instant(value.backup.recoveryPointAt, 'RECOVERY_BACKUP_INVALID');

  exactKeys(value.restore, [
    'incidentAt', 'startedAt', 'completedAt', 'cleanupCompletedAt', 'productionConnectionUsed', 'destructiveProductionAction',
  ], 'RECOVERY_RESTORE_INVALID');
  if (value.restore.productionConnectionUsed !== false || value.restore.destructiveProductionAction !== false) {
    throw new Error('RECOVERY_PRODUCTION_BOUNDARY_VIOLATED');
  }
  const incidentAt = instant(value.restore.incidentAt, 'RECOVERY_RESTORE_INVALID');
  const startedAt = instant(value.restore.startedAt, 'RECOVERY_RESTORE_INVALID');
  const completedAt = instant(value.restore.completedAt, 'RECOVERY_RESTORE_INVALID');
  const cleanupCompletedAt = instant(value.restore.cleanupCompletedAt, 'RECOVERY_RESTORE_INVALID');
  const current = new Date(now);
  if (!Number.isFinite(current.getTime()) || recoveryPointAt > capturedAt || recoveryPointAt > incidentAt || capturedAt > startedAt
    || incidentAt > startedAt || startedAt >= completedAt || completedAt > cleanupCompletedAt
    || cleanupCompletedAt > new Date(current.getTime() + 5 * 60_000)
    || current.getTime() - cleanupCompletedAt.getTime() > 90 * 86_400_000) throw new Error('RECOVERY_TIMELINE_INVALID');

  exactKeys(value.reconciliation, [
    'migrationSha256', 'schemaDigestSha256', 'rowCountDigestSha256', 'relationshipDigestSha256', 'auditContinuityDigestSha256',
    'tablesExamined', 'orphanedRelationships', 'crossTenantViolations', 'integrityVerified', 'cleanupVerified',
  ], 'RECOVERY_RECONCILIATION_INVALID');
  const migrationSha256 = digest(value.reconciliation.migrationSha256, 'RECOVERY_RECONCILIATION_INVALID');
  if (migrationSha256 !== digest(expectedMigrationSha256, 'RECOVERY_EXPECTED_MIGRATION_INVALID')) {
    throw new Error('RECOVERY_MIGRATION_MISMATCH');
  }
  for (const field of ['schemaDigestSha256', 'rowCountDigestSha256', 'relationshipDigestSha256', 'auditContinuityDigestSha256']) {
    digest(value.reconciliation[field], 'RECOVERY_RECONCILIATION_INVALID');
  }
  positiveInteger(value.reconciliation.tablesExamined, { min: 20, max: 10_000, code: 'RECOVERY_RECONCILIATION_INVALID' });
  if (value.reconciliation.orphanedRelationships !== 0 || value.reconciliation.crossTenantViolations !== 0
    || value.reconciliation.integrityVerified !== true || value.reconciliation.cleanupVerified !== true) {
    throw new Error('RECOVERY_RECONCILIATION_FAILED');
  }

  const rpoSeconds = Math.ceil((incidentAt.getTime() - recoveryPointAt.getTime()) / 1000);
  const rtoSeconds = Math.ceil((completedAt.getTime() - startedAt.getTime()) / 1000);
  if (rpoSeconds > value.authorization.maximumRpoSeconds) throw new Error('RECOVERY_RPO_EXCEEDED');
  if (rtoSeconds > value.authorization.maximumRtoSeconds) throw new Error('RECOVERY_RTO_EXCEEDED');

  return {
    schemaVersion: 1,
    ok: true,
    contentFree: true,
    containsCandidateValues: false,
    performsWrites: false,
    productionAccessed: false,
    targetIsolationVerified: true,
    migrationDigestVerified: true,
    encryptedBackupVerified: true,
    reconciliationVerified: true,
    cleanupVerified: true,
    rpoSeconds,
    rtoSeconds,
    withinApprovedRpo: true,
    withinApprovedRto: true,
    artifactSha256: createHash('sha256').update(canonical(value)).digest('hex'),
  };
}
