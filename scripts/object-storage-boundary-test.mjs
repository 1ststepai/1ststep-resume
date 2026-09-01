// Proves the private-object-storage boundary after the runtime gate was narrowed.
//
// Architecture under test: a missing blob provider must NOT disable every signed-user
// feature. Redis-backed account state (sessions, consent, confirmed-fact vault) stays
// available, while every blob-backed operation fails closed on its own — before doing
// partial work and without leaking candidate documents anywhere else.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { jobAgentRuntimeConfiguration, jobAgentArtifactStorageReady } from '../lib/job-agent-runtime-configuration.js';
import { userSessionRuntimeConfiguration } from '../lib/user-session-store.js';
import { jobAgentObjectStorageConfiguration, persistApplicationPackageArtifacts, readApplicationPackageArtifact, deleteApplicationPackageArtifacts, deleteAllApplicationPackageArtifactsForTenant, processExpiredApplicationPackageArtifacts } from '../lib/job-agent-object-storage.js';
import { jobAgentLaunchManifest } from '../lib/job-agent-launch-manifest.js';

const KEY = Buffer.alloc(32, 11).toString('base64');

// A production environment that is completely healthy EXCEPT that private object
// storage has not been provisioned.
const productionWithoutStorage = {
  VERCEL_ENV: 'production',
  UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
  UPSTASH_REDIS_REST_TOKEN: 'x'.repeat(40),
  RATE_LIMIT_HASH_SECRET: 'y'.repeat(48),
  JOB_AGENT_AUDIT_SECRET: 'z'.repeat(48),
  BETA_DATA_ENCRYPTION_KEY: KEY,
  BETA_DATA_ENCRYPTION_KEY_ID: 'beta-2026-08-v1',
};

// ── 1. Non-blob account state stays available without a blob provider ──────────
const runtime = jobAgentRuntimeConfiguration(productionWithoutStorage);
assert.ok(runtime, 'The Job Agent runtime must remain available when only private object storage is missing. Redis-backed consent and the confirmed-fact vault do not touch blob storage.');
assert.ok(runtime.redis && runtime.dataEncryptionKey && runtime.auditSigningSecret, 'The durable runtime must still expose Redis, the encryption keyring, and the audit signing secret.');

const session = userSessionRuntimeConfiguration(productionWithoutStorage);
assert.ok(session, 'Signed-user sessions must not depend on private object storage.');

// ── 2. The artifact-storage readiness check reports the truth ─────────────────
assert.equal(jobAgentArtifactStorageReady(runtime), false, 'Artifact storage must report NOT ready so blob-backed endpoints refuse upfront.');
assert.equal(runtime.objectStorage.ready, false);
assert.equal(runtime.objectStorage.reason, 'OBJECT_STORAGE_DISABLED');
assert.equal(jobAgentArtifactStorageReady(null), false, 'A missing config must never read as ready.');
assert.equal(jobAgentArtifactStorageReady({}), false);
assert.equal(jobAgentArtifactStorageReady({ objectStorage: { ready: 'true' } }), false, 'Readiness must be a strict boolean, never a truthy string.');

// ── 3. Production still refuses the inline-development fallback ───────────────
// This is the critical containment property: without it, a production deployment with
// no blob provider would silently store candidate documents inline.
const productionStorage = jobAgentObjectStorageConfiguration(productionWithoutStorage);
assert.equal(productionStorage.ready, false, 'Production must never fall back to inline artifact storage.');
assert.equal(productionStorage.production, true);

// Enabling storage without a scanner must also stay closed in production.
const noScanner = jobAgentObjectStorageConfiguration({ ...productionWithoutStorage, JOB_AGENT_OBJECT_STORAGE_ENABLED: 'true', BLOB_READ_WRITE_TOKEN: 't'.repeat(32) });
assert.equal(noScanner.ready, false, 'Production storage must fail closed while the malware scanner is unconfigured.');
assert.equal(noScanner.mode, 'unavailable');

// ── 4. Every blob-backed operation fails closed before doing partial work ─────
const bytes = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const artifact = {
  key: 'resume_pdf', filename: 'synthetic.pdf', contentType: 'application/pdf', bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), pageCount: 1, contentBase64: bytes.toString('base64'),
};
const storedArtifact = { ...artifact, objectRef: { provider: 'vercel-blob-private', pathname: 'job-agent-artifacts/v1/a/b/c.bin' } };

let blobCalls = 0;
const countingBlobClient = {
  async put() { blobCalls += 1; return {}; },
  async get() { blobCalls += 1; return {}; },
  async del() { blobCalls += 1; },
  async list() { blobCalls += 1; return { blobs: [] }; },
};
const unreadyConfiguration = { ...productionStorage, blobClient: countingBlobClient };

await assert.rejects(
  () => persistApplicationPackageArtifacts({ artifacts: [artifact], tenantId: 'a'.repeat(40), runId: 'run_boundary_0001', dataEncryptionKey: KEY, env: productionWithoutStorage, configuration: unreadyConfiguration }),
  /PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED/,
  'Persisting a candidate document must fail closed without private storage.',
);
await assert.rejects(
  () => readApplicationPackageArtifact({ artifact: storedArtifact, tenantId: 'a'.repeat(40), runId: 'run_boundary_0001', dataEncryptionKey: KEY, configuration: unreadyConfiguration }),
  /PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED/,
  'Reading a stored artifact must fail closed without private storage.',
);
await assert.rejects(
  () => deleteApplicationPackageArtifacts({ artifacts: [storedArtifact], configuration: unreadyConfiguration }),
  /PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED/,
  'Deleting stored artifacts must fail closed rather than silently reporting success.',
);
await assert.rejects(
  () => deleteAllApplicationPackageArtifactsForTenant({ tenantId: 'a'.repeat(40), redis: { async smembers() { return []; }, async srem() { return 1; } }, configuration: unreadyConfiguration }),
  /PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED/,
  'Tenant-wide artifact deletion must fail closed rather than falsely reporting a completed erasure.',
);
assert.equal(blobCalls, 0, 'No blob provider call may be attempted while storage is unready. Every guard must run before provider contact.');

// Scheduled expiry must degrade to a reported no-op, never a silent success.
const expiry = await processExpiredApplicationPackageArtifacts({ redis: { async zrange() { return []; } }, configuration: unreadyConfiguration });
assert.deepEqual(expiry, { deleted: 0, status: 'not-configured' }, 'Expired-artifact cleanup must report not-configured in production instead of claiming deletions.');

// ── 5. No candidate content leaks into the failure paths ─────────────────────
// A failure must not echo document bytes, the base64 payload, or a public URL.
const candidateMarker = bytes.toString('base64');
let leaked = null;
try {
  await persistApplicationPackageArtifacts({ artifacts: [artifact], tenantId: 'a'.repeat(40), runId: 'run_boundary_0002', dataEncryptionKey: KEY, env: productionWithoutStorage, configuration: unreadyConfiguration });
} catch (error) {
  leaked = `${error?.message || ''}${error?.stack || ''}`;
}
assert.ok(leaked, 'The persist call must have thrown.');
assert.equal(leaked.includes(candidateMarker), false, 'A storage failure must never include candidate document bytes.');
assert.equal(/https?:\/\//.test(String(new Error('x').message)) , false);
assert.equal(/blob\.vercel-storage\.com|https?:\/\/[^\s]*\.public/.test(leaked), false, 'A storage failure must never surface a public object URL.');

// The unready configuration must not carry a usable token or a public access mode.
assert.equal(unreadyConfiguration.token, undefined, 'An unready storage configuration must not expose a provider token.');
assert.notEqual(unreadyConfiguration.mode, 'vercel-blob-public', 'Candidate documents must never be addressable by a public URL.');

// In production the mode string is still reported as inline-development, but `ready` is
// false and every inline branch in job-agent-object-storage.js is gated on `ready`. That
// combination is what actually prevents an inline production fallback, so assert it
// directly rather than relying on the mode label.
assert.equal(unreadyConfiguration.ready, false);
assert.equal(unreadyConfiguration.production, true);
await assert.rejects(
  () => readApplicationPackageArtifact({ artifact, tenantId: 'a'.repeat(40), runId: 'run_boundary_0003', dataEncryptionKey: KEY, configuration: unreadyConfiguration }),
  /PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED/,
  'An artifact carrying inline contentBase64 must NOT be readable in production. The inline branch is reachable only when ready === true.',
);

// ── 6. Production launch readiness still treats storage as a blocker ──────────
const manifest = jobAgentLaunchManifest(productionWithoutStorage);
const blockers = Object.values(manifest.capabilities).flatMap(entry => entry.blockers || []);
assert.ok(blockers.includes('PRIVATE_DOCUMENT_STORAGE_NOT_CONFIGURED'), 'Launch readiness must still report private document storage as a blocker in production.');
assert.ok(blockers.includes('DURABLE_RUNTIME_NOT_CONFIGURED'), 'The launch manifest keeps its own stricter durable-runtime check, which still requires verified private storage in production even though the request-time runtime no longer does.');
assert.equal(manifest.capabilities.packageReady.eligible, false, 'Package readiness must remain ineligible without verified private storage.');
assert.equal(manifest.submissionsEnabled, false, 'Final submission must remain disabled.');
assert.equal(manifest.externalApplicationExecution, false, 'External application execution must remain disabled.');

// ── 7. Development keeps its inline fallback so local work is possible ────────
const development = jobAgentObjectStorageConfiguration({ BETA_DATA_ENCRYPTION_KEY: KEY });
assert.equal(development.ready, true, 'Local development keeps an inline fallback.');
assert.equal(development.mode, 'inline-development');
assert.equal(development.production, false);

console.log('Object-storage boundary: non-blob account state stays available, every blob-backed operation fails closed before provider contact, no candidate content or public URL leaks, and production launch readiness still requires private storage.');

// ── 8. Text-only package mode ────────────────────────────────────────────────
// Without private storage the package worker must still complete, producing tailored
// resume and cover-letter TEXT and no documents — rather than failing the whole run or
// writing a candidate document somewhere less protected.
{
  const worker = await (await import('node:fs/promises')).readFile(new URL('../lib/application-package-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /documentMode = objectStorage\?\.ready === true \? 'documents' : 'text-only'/,
    'Document mode must be derived from real storage readiness.');
  assert.match(worker, /documentMode === 'text-only'\) \? null :/,
    'Artifact building must be skipped entirely in text-only mode, so nothing is produced that cannot be stored privately.');
  assert.match(worker, /text-verified-no-documents-produced/,
    'QA status must not claim artifacts were verified when none were produced.');

  // Artifacts are persisted only when actually built, so text-only never reaches storage.
  assert.match(worker, /persistedArtifacts = artifactBuild\?\.artifacts\?\.length \? await persistApplicationPackageArtifacts/);

  // The endpoints that serve documents keep their own upfront guards.
  const fs = await import('node:fs/promises');
  const render = await fs.readFile(new URL('../api/application-package-render.js', import.meta.url), 'utf8');
  const artifactApi = await fs.readFile(new URL('../api/application-package-artifact.js', import.meta.url), 'utf8');
  for (const [name, source] of [['application-package-render', render], ['application-package-artifact', artifactApi]]) {
    assert.match(source, /jobAgentArtifactStorageReady\(config\)/, `${name} must still refuse upfront without private storage.`);
    assert.match(source, /PACKAGE_OBJECT_STORAGE_NOT_CONFIGURED/, `${name} must return the storage-not-configured code.`);
  }

  // Creating a package must NOT be gated on storage any more, or text-only cannot run.
  const packages = await fs.readFile(new URL('../api/application-packages.js', import.meta.url), 'utf8');
  assert.equal(/jobAgentArtifactStorageReady/.test(packages), false,
    'Package creation must not be storage-gated; the worker degrades to text-only instead.');
}

console.log('Text-only package mode: runs complete without private storage, produce no documents, claim no artifact verification, and the document-serving endpoints still fail closed.');
