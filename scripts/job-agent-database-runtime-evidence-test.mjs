import assert from 'node:assert/strict';
import { validateJobAgentDatabaseRuntimeEvidence } from '../lib/job-agent-database-runtime-evidence.js';

const hash = value => String(value).repeat(64).slice(0, 64);
const commit = 'a'.repeat(40);
const runtime = hash('b');
const migration = hash('c');
const now = new Date('2026-09-02T05:00:00.000Z');

function fixture() {
  return {
    schemaVersion: 1,
    evidenceKind: 'isolated-database-runtime',
    contentFree: true,
    containsCandidateValues: false,
    productionAccessed: false,
    sourceCommit: commit,
    runtimeSha256: runtime,
    target: {
      class: 'isolated-nonproduction', provider: 'supabase', fingerprintSha256: hash('1'),
      productionFingerprintSha256: hash('2'), inspectedAt: '2026-09-02T04:30:00.000Z',
    },
    tooling: {
      supabaseCliVersion: '2.116.0', postgresVersion: '17.4', commandContractDigestSha256: hash('3'), privateRawEvidenceSha256: hash('4'),
    },
    migration: {
      canonicalSha256: migration, appliedHistorySha256: hash('5'), appliedMigrationCount: 1,
      schemaDriftDetected: false, destructiveStatementsApplied: 0,
    },
    surface: {
      jobAgentTables: 20, rlsEnabledTables: 20, forceRlsTables: 20, unexpectedApplicationObjects: 0,
      views: 0, materializedViews: 0, securityDefinerFunctions: 0, unexpectedStoragePolicies: 0,
      dataApiExposureReviewed: true, dataApiExposedJobAgentTables: 0, catalogEvidenceSha256: hash('6'),
    },
    grants: {
      backendRoleExists: true, backendRoleLogin: false, backendRoleBypassRls: false,
      unexpectedPublicPrivileges: 0, unexpectedAnonPrivileges: 0, unexpectedAuthenticatedPrivileges: 0,
      browserServiceRoleExposure: false, grantEvidenceSha256: hash('7'),
    },
    policies: {
      jobAgentPolicyTables: 20, operationSpecificPolicyTables: 20, publicPolicies: 0,
      forAllPolicies: 0, updatePoliciesMissingUsingOrCheck: 0, policyEvidenceSha256: hash('8'),
    },
    isolation: {
      pgtapPlan: 19, pgtapPassed: 19, pgtapFailed: 0, anonDenied: true, authenticatedDenied: true,
      ownTenantAllowed: true, crossTenantReadDenied: true, crossTenantParentDenied: true,
      ownershipTransferDenied: true, crossTenantDeleteDenied: true, invalidTenantDenied: true, pgtapEvidenceSha256: hash('9'),
    },
    advisors: {
      securityErrors: 0, performanceErrors: 0, unacceptedWarnings: 0,
      securityEvidenceSha256: hash('d'), performanceEvidenceSha256: hash('e'),
    },
  };
}

const options = { expectedSourceCommit: commit, expectedRuntimeSha256: runtime, expectedMigrationSha256: migration, now };
const result = validateJobAgentDatabaseRuntimeEvidence(fixture(), options);
assert.equal(result.ok, true);
assert.equal(result.jobAgentTablesVerified, 20);
assert.equal(result.pgtapTestsPassed, 19);
assert.match(result.artifactSha256, /^[a-f0-9]{64}$/);
assert.equal(JSON.stringify(result).includes(hash('1')), false);
assert.equal(JSON.stringify(result).includes('2.116.0'), false);

const productionTarget = fixture();
productionTarget.target.productionFingerprintSha256 = productionTarget.target.fingerprintSha256;
assert.throws(() => validateJobAgentDatabaseRuntimeEvidence(productionTarget, options), /DATABASE_RUNTIME_TARGET_ISOLATION_NOT_PROVEN/);

const wrongCommit = fixture();
wrongCommit.sourceCommit = 'f'.repeat(40);
assert.throws(() => validateJobAgentDatabaseRuntimeEvidence(wrongCommit, options), /DATABASE_RUNTIME_SOURCE_COMMIT_MISMATCH/);

const drift = fixture();
drift.migration.schemaDriftDetected = true;
assert.throws(() => validateJobAgentDatabaseRuntimeEvidence(drift, options), /DATABASE_RUNTIME_MIGRATION_INVALID/);

const rlsMissing = fixture();
rlsMissing.surface.forceRlsTables = 19;
assert.throws(() => validateJobAgentDatabaseRuntimeEvidence(rlsMissing, options), /DATABASE_RUNTIME_SURFACE_INVALID/);

const grantLeak = fixture();
grantLeak.grants.unexpectedAuthenticatedPrivileges = 1;
assert.throws(() => validateJobAgentDatabaseRuntimeEvidence(grantLeak, options), /DATABASE_RUNTIME_GRANTS_INVALID/);

const failedIsolation = fixture();
failedIsolation.isolation.pgtapFailed = 1;
failedIsolation.isolation.pgtapPassed = 18;
assert.throws(() => validateJobAgentDatabaseRuntimeEvidence(failedIsolation, options), /DATABASE_RUNTIME_ISOLATION_INVALID/);

const advisorWarning = fixture();
advisorWarning.advisors.unacceptedWarnings = 1;
assert.throws(() => validateJobAgentDatabaseRuntimeEvidence(advisorWarning, options), /DATABASE_RUNTIME_ADVISORS_INVALID/);

const candidateField = fixture();
candidateField.candidateEmail = 'person@example.com';
assert.throws(() => validateJobAgentDatabaseRuntimeEvidence(candidateField, options), /DATABASE_RUNTIME_EVIDENCE_SCHEMA_INVALID/);

assert.throws(() => validateJobAgentDatabaseRuntimeEvidence(fixture(), { ...options, now: new Date('2026-11-02T00:00:00.000Z') }), /DATABASE_RUNTIME_EVIDENCE_STALE/);

console.log('Content-free isolated database runtime, target separation, migration, RLS/grants, pgTAP, and advisor evidence tests passed.');
