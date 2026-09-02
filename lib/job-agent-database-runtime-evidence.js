import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,39}$/;

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

function exactDigest(value, code) {
  const normalized = String(value || '').toLowerCase();
  if (!SHA256.test(normalized)) throw new Error(code);
  return normalized;
}

function nonnegative(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
  return value;
}

function trueFields(value, fields, code) {
  for (const field of fields) if (value[field] !== true) throw new Error(code);
}

function zeroFields(value, fields, code) {
  for (const field of fields) if (value[field] !== 0) throw new Error(code);
}

export function validateJobAgentDatabaseRuntimeEvidence(value, {
  expectedSourceCommit,
  expectedRuntimeSha256,
  expectedMigrationSha256,
  now = new Date(),
} = {}) {
  exactKeys(value, [
    'schemaVersion', 'evidenceKind', 'contentFree', 'containsCandidateValues', 'productionAccessed',
    'sourceCommit', 'runtimeSha256', 'target', 'tooling', 'migration', 'surface', 'grants', 'policies', 'isolation', 'advisors',
  ], 'DATABASE_RUNTIME_EVIDENCE_SCHEMA_INVALID');
  if (value.schemaVersion !== 1 || value.evidenceKind !== 'isolated-database-runtime'
    || value.contentFree !== true || value.containsCandidateValues !== false || value.productionAccessed !== false) {
    throw new Error('DATABASE_RUNTIME_EVIDENCE_BOUNDARY_INVALID');
  }
  const sourceCommit = String(value.sourceCommit || '').toLowerCase();
  if (!GIT_SHA.test(sourceCommit) || sourceCommit !== String(expectedSourceCommit || '').toLowerCase()) {
    throw new Error('DATABASE_RUNTIME_SOURCE_COMMIT_MISMATCH');
  }
  if (exactDigest(value.runtimeSha256, 'DATABASE_RUNTIME_DIGEST_INVALID')
    !== exactDigest(expectedRuntimeSha256, 'DATABASE_RUNTIME_EXPECTED_DIGEST_INVALID')) {
    throw new Error('DATABASE_RUNTIME_RELEASE_DIGEST_MISMATCH');
  }

  exactKeys(value.target, ['class', 'provider', 'fingerprintSha256', 'productionFingerprintSha256', 'inspectedAt'], 'DATABASE_RUNTIME_TARGET_INVALID');
  if (value.target.class !== 'isolated-nonproduction' || value.target.provider !== 'supabase') throw new Error('DATABASE_RUNTIME_TARGET_INVALID');
  const targetFingerprint = exactDigest(value.target.fingerprintSha256, 'DATABASE_RUNTIME_TARGET_INVALID');
  const productionFingerprint = exactDigest(value.target.productionFingerprintSha256, 'DATABASE_RUNTIME_TARGET_INVALID');
  if (targetFingerprint === productionFingerprint) throw new Error('DATABASE_RUNTIME_TARGET_ISOLATION_NOT_PROVEN');
  const inspectedAt = new Date(String(value.target.inspectedAt || ''));
  const current = new Date(now);
  if (!Number.isFinite(inspectedAt.getTime()) || inspectedAt.toISOString() !== value.target.inspectedAt
    || !Number.isFinite(current.getTime()) || inspectedAt > new Date(current.getTime() + 5 * 60_000)
    || current.getTime() - inspectedAt.getTime() > 30 * 86_400_000) throw new Error('DATABASE_RUNTIME_EVIDENCE_STALE');

  exactKeys(value.tooling, ['supabaseCliVersion', 'postgresVersion', 'commandContractDigestSha256', 'privateRawEvidenceSha256'], 'DATABASE_RUNTIME_TOOLING_INVALID');
  if (!SAFE_VERSION.test(String(value.tooling.supabaseCliVersion || '')) || !SAFE_VERSION.test(String(value.tooling.postgresVersion || ''))) {
    throw new Error('DATABASE_RUNTIME_TOOLING_INVALID');
  }
  exactDigest(value.tooling.commandContractDigestSha256, 'DATABASE_RUNTIME_TOOLING_INVALID');
  exactDigest(value.tooling.privateRawEvidenceSha256, 'DATABASE_RUNTIME_TOOLING_INVALID');

  exactKeys(value.migration, ['canonicalSha256', 'appliedHistorySha256', 'appliedMigrationCount', 'schemaDriftDetected', 'destructiveStatementsApplied'], 'DATABASE_RUNTIME_MIGRATION_INVALID');
  if (exactDigest(value.migration.canonicalSha256, 'DATABASE_RUNTIME_MIGRATION_INVALID')
    !== exactDigest(expectedMigrationSha256, 'DATABASE_RUNTIME_EXPECTED_MIGRATION_INVALID')) throw new Error('DATABASE_RUNTIME_MIGRATION_MISMATCH');
  exactDigest(value.migration.appliedHistorySha256, 'DATABASE_RUNTIME_MIGRATION_INVALID');
  if (!Number.isSafeInteger(value.migration.appliedMigrationCount) || value.migration.appliedMigrationCount < 1
    || value.migration.schemaDriftDetected !== false || value.migration.destructiveStatementsApplied !== 0) {
    throw new Error('DATABASE_RUNTIME_MIGRATION_INVALID');
  }

  exactKeys(value.surface, [
    'jobAgentTables', 'rlsEnabledTables', 'forceRlsTables', 'unexpectedApplicationObjects', 'views',
    'materializedViews', 'securityDefinerFunctions', 'unexpectedStoragePolicies', 'dataApiExposureReviewed', 'dataApiExposedJobAgentTables', 'catalogEvidenceSha256',
  ], 'DATABASE_RUNTIME_SURFACE_INVALID');
  if (value.surface.jobAgentTables !== 20 || value.surface.rlsEnabledTables !== 20 || value.surface.forceRlsTables !== 20
    || value.surface.dataApiExposureReviewed !== true) throw new Error('DATABASE_RUNTIME_SURFACE_INVALID');
  zeroFields(value.surface, [
    'unexpectedApplicationObjects', 'views', 'materializedViews', 'securityDefinerFunctions',
    'unexpectedStoragePolicies', 'dataApiExposedJobAgentTables',
  ], 'DATABASE_RUNTIME_SURFACE_INVALID');
  exactDigest(value.surface.catalogEvidenceSha256, 'DATABASE_RUNTIME_SURFACE_INVALID');

  exactKeys(value.grants, [
    'backendRoleExists', 'backendRoleLogin', 'backendRoleBypassRls', 'unexpectedPublicPrivileges',
    'unexpectedAnonPrivileges', 'unexpectedAuthenticatedPrivileges', 'browserServiceRoleExposure', 'grantEvidenceSha256',
  ], 'DATABASE_RUNTIME_GRANTS_INVALID');
  if (value.grants.backendRoleExists !== true || value.grants.backendRoleLogin !== false
    || value.grants.backendRoleBypassRls !== false || value.grants.browserServiceRoleExposure !== false) {
    throw new Error('DATABASE_RUNTIME_GRANTS_INVALID');
  }
  zeroFields(value.grants, ['unexpectedPublicPrivileges', 'unexpectedAnonPrivileges', 'unexpectedAuthenticatedPrivileges'], 'DATABASE_RUNTIME_GRANTS_INVALID');
  exactDigest(value.grants.grantEvidenceSha256, 'DATABASE_RUNTIME_GRANTS_INVALID');

  exactKeys(value.policies, [
    'jobAgentPolicyTables', 'operationSpecificPolicyTables', 'publicPolicies', 'forAllPolicies',
    'updatePoliciesMissingUsingOrCheck', 'policyEvidenceSha256',
  ], 'DATABASE_RUNTIME_POLICIES_INVALID');
  if (value.policies.jobAgentPolicyTables !== 20 || value.policies.operationSpecificPolicyTables !== 20) {
    throw new Error('DATABASE_RUNTIME_POLICIES_INVALID');
  }
  zeroFields(value.policies, ['publicPolicies', 'forAllPolicies', 'updatePoliciesMissingUsingOrCheck'], 'DATABASE_RUNTIME_POLICIES_INVALID');
  exactDigest(value.policies.policyEvidenceSha256, 'DATABASE_RUNTIME_POLICIES_INVALID');

  exactKeys(value.isolation, [
    'pgtapPlan', 'pgtapPassed', 'pgtapFailed', 'anonDenied', 'authenticatedDenied', 'ownTenantAllowed',
    'crossTenantReadDenied', 'crossTenantParentDenied', 'ownershipTransferDenied', 'crossTenantDeleteDenied',
    'invalidTenantDenied', 'pgtapEvidenceSha256',
  ], 'DATABASE_RUNTIME_ISOLATION_INVALID');
  if (value.isolation.pgtapPlan !== 19 || value.isolation.pgtapPassed !== 19 || value.isolation.pgtapFailed !== 0) {
    throw new Error('DATABASE_RUNTIME_ISOLATION_INVALID');
  }
  trueFields(value.isolation, [
    'anonDenied', 'authenticatedDenied', 'ownTenantAllowed', 'crossTenantReadDenied', 'crossTenantParentDenied',
    'ownershipTransferDenied', 'crossTenantDeleteDenied', 'invalidTenantDenied',
  ], 'DATABASE_RUNTIME_ISOLATION_INVALID');
  exactDigest(value.isolation.pgtapEvidenceSha256, 'DATABASE_RUNTIME_ISOLATION_INVALID');

  exactKeys(value.advisors, [
    'securityErrors', 'performanceErrors', 'unacceptedWarnings', 'securityEvidenceSha256', 'performanceEvidenceSha256',
  ], 'DATABASE_RUNTIME_ADVISORS_INVALID');
  zeroFields(value.advisors, ['securityErrors', 'performanceErrors', 'unacceptedWarnings'], 'DATABASE_RUNTIME_ADVISORS_INVALID');
  exactDigest(value.advisors.securityEvidenceSha256, 'DATABASE_RUNTIME_ADVISORS_INVALID');
  exactDigest(value.advisors.performanceEvidenceSha256, 'DATABASE_RUNTIME_ADVISORS_INVALID');

  return {
    schemaVersion: 1,
    ok: true,
    contentFree: true,
    containsCandidateValues: false,
    performsWrites: false,
    productionAccessed: false,
    targetIsolationVerified: true,
    releaseIdentityVerified: true,
    migrationHistoryVerified: true,
    runtimeRlsVerified: true,
    runtimeGrantsVerified: true,
    adversarialIsolationVerified: true,
    advisorsVerified: true,
    jobAgentTablesVerified: 20,
    pgtapTestsPassed: 19,
    artifactSha256: createHash('sha256').update(canonical(value)).digest('hex'),
  };
}
