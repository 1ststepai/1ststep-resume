import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const RELEASE_EVIDENCE_SCHEMA = 'job-agent-release-evidence/v1';
export const RELEASE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const SENSITIVE_KEY = /(secret|token|password|private|credential|api.?key)/i;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(canonical(value));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function contentDigest(entries) {
  return sha256(stableJson(entries.map(entry => ({
    path: String(entry.path).replaceAll('\\', '/'),
    sha256: String(entry.sha256).toLowerCase(),
  })).sort((left, right) => left.path.localeCompare(right.path))));
}

function requireString(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function safeFlags(flags) {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) {
    throw new Error('featureFlags must be an object.');
  }
  const result = {};
  for (const [key, value] of Object.entries(flags)) {
    if (SENSITIVE_KEY.test(key)) throw new Error(`Sensitive feature flag key is not allowed: ${key}`);
    if (!['boolean', 'string', 'number'].includes(typeof value)) {
      throw new Error(`Feature flag ${key} must be a boolean, string, or number.`);
    }
    result[key] = value;
  }
  return canonical(result);
}

function validateDigest(value, label) {
  const normalized = requireString(value, label).toLowerCase();
  if (!SHA256.test(normalized)) throw new Error(`${label} must be a SHA-256 digest.`);
  return normalized;
}

function signedBody(manifest) {
  const { signature: _signature, ...body } = manifest;
  return stableJson(body);
}

export function createReleaseEvidence(input, options = {}) {
  const secret = requireString(options.secret, 'Release evidence signing secret');
  if (secret.length < 32) throw new Error('Release evidence signing secret must be at least 32 characters.');
  if (input.dirty === true) throw new Error('DIRTY_WORKTREE');

  const commit = requireString(input.commit, 'commit').toLowerCase();
  if (!COMMIT.test(commit)) throw new Error('commit must be a full 40-character Git SHA.');
  const createdAt = new Date(options.now || Date.now());
  if (Number.isNaN(createdAt.valueOf())) throw new Error('now must be a valid date.');
  const expiresAt = new Date(createdAt.valueOf() + (options.maxAgeMs || RELEASE_EVIDENCE_MAX_AGE_MS));
  const featureFlags = safeFlags(input.featureFlags || {});
  const tests = Array.isArray(input.tests) ? input.tests.map(test => ({
    name: requireString(test.name, 'test name'),
    sha256: validateDigest(test.sha256, `test ${test.name} digest`),
    passedAt: new Date(requireString(test.passedAt, `test ${test.name} passedAt`)).toISOString(),
  })).sort((left, right) => left.name.localeCompare(right.name)) : [];
  if (tests.length === 0) throw new Error('At least one passing test evidence record is required.');

  const manifest = {
    schema: RELEASE_EVIDENCE_SCHEMA,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    source: { commit, clean: true },
    build: { sha256: validateDigest(input.buildDigest, 'buildDigest') },
    migrations: { sha256: validateDigest(input.migrationDigest, 'migrationDigest') },
    extension: {
      version: requireString(input.extensionVersion, 'extensionVersion'),
      sha256: validateDigest(input.extensionDigest, 'extensionDigest'),
    },
    deployment: {
      id: requireString(input.deploymentId, 'deploymentId'),
      url: requireString(input.deploymentUrl, 'deploymentUrl'),
    },
    rollback: {
      deploymentId: requireString(input.rollbackDeploymentId, 'rollbackDeploymentId'),
    },
    featureFlags,
    featureFlagsSha256: sha256(stableJson(featureFlags)),
    tests,
    testsSha256: sha256(stableJson(tests)),
  };
  manifest.signature = createHmac('sha256', secret).update(signedBody(manifest)).digest('hex');
  return manifest;
}

export function verifyReleaseEvidence(manifest, options = {}) {
  const blockers = [];
  if (!manifest || manifest.schema !== RELEASE_EVIDENCE_SCHEMA) blockers.push('SCHEMA_MISMATCH');
  const secret = String(options.secret || '');
  const signature = String(manifest?.signature || '');
  if (secret.length < 32 || !SHA256.test(signature)) {
    blockers.push('SIGNATURE_INVALID');
  } else {
    const expected = createHmac('sha256', secret).update(signedBody(manifest)).digest('hex');
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) blockers.push('SIGNATURE_INVALID');
  }
  const now = new Date(options.now || Date.now()).valueOf();
  const createdAt = new Date(manifest?.createdAt || '').valueOf();
  const expiresAt = new Date(manifest?.expiresAt || '').valueOf();
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || now < createdAt || now > expiresAt) {
    blockers.push('EVIDENCE_STALE');
  }
  if (manifest?.source?.clean !== true) blockers.push('DIRTY_WORKTREE');

  const matches = [
    ['commit', manifest?.source?.commit, options.expectedCommit, 'SOURCE_COMMIT_MISMATCH'],
    ['build', manifest?.build?.sha256, options.expectedBuildDigest, 'BUILD_HASH_MISMATCH'],
    ['migrations', manifest?.migrations?.sha256, options.expectedMigrationDigest, 'MIGRATION_HASH_MISMATCH'],
    ['extension', manifest?.extension?.sha256, options.expectedExtensionDigest, 'EXTENSION_HASH_MISMATCH'],
    ['extensionVersion', manifest?.extension?.version, options.expectedExtensionVersion, 'EXTENSION_VERSION_MISMATCH'],
    ['deployment', manifest?.deployment?.id, options.expectedDeploymentId, 'WRONG_DEPLOYMENT'],
    ['deploymentUrl', manifest?.deployment?.url, options.expectedDeploymentUrl, 'WRONG_DEPLOYMENT'],
    ['rollback', manifest?.rollback?.deploymentId, options.expectedRollbackDeploymentId, 'ROLLBACK_MISMATCH'],
  ];
  for (const [, actual, expected, blocker] of matches) {
    if (expected !== undefined && actual !== expected && !blockers.includes(blocker)) blockers.push(blocker);
  }
  if (manifest?.featureFlagsSha256 !== sha256(stableJson(manifest?.featureFlags || {}))) blockers.push('FEATURE_FLAGS_HASH_MISMATCH');
  if (manifest?.testsSha256 !== sha256(stableJson(manifest?.tests || []))) blockers.push('TEST_EVIDENCE_HASH_MISMATCH');
  return { ready: blockers.length === 0, blockers };
}
