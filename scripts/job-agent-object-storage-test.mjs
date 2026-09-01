import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deleteAllApplicationPackageArtifactsForTenant, deleteApplicationPackageArtifacts, persistApplicationPackageArtifacts, processExpiredApplicationPackageArtifacts, readApplicationPackageArtifact } from '../lib/job-agent-object-storage.js';

class FakeBlob {
  constructor() { this.values = new Map(); this.deleted = []; }
  async put(pathname, bytes, options) {
    assert.equal(options.access, 'private');
    assert.equal(options.allowOverwrite, false);
    if (this.values.has(pathname)) throw new Error('duplicate');
    this.values.set(pathname, Buffer.from(bytes));
    return { pathname };
  }
  async get(pathname, options) {
    assert.equal(options.access, 'private');
    const value = this.values.get(pathname);
    return value ? { statusCode: 200, stream: new Blob([value]).stream() } : null;
  }
  async del(paths) {
    for (const path of Array.isArray(paths) ? paths : [paths]) { this.values.delete(path); this.deleted.push(path); }
  }
  async list({ prefix }) {
    return { blobs: [...this.values.keys()].filter(pathname => pathname.startsWith(prefix)).map(pathname => ({ pathname })), hasMore: false };
  }
}

class FakeRedis {
  constructor() { this.sorted = new Map(); }
  async del(...keys) { let deleted = 0; for (const key of keys) if (this.sorted.delete(key)) deleted += 1; return deleted; }
  async zadd(key, score, member) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); this.sorted.get(key).set(member, Number(score)); return 1; }
  async zrem(key, member) { return this.sorted.get(key)?.delete(member) ? 1 : 0; }
  async zrange(key, start, end, options = {}) {
    const entries = [...(this.sorted.get(key) || new Map())].sort((left, right) => left[1] - right[1]);
    if (options.byScore) return entries.filter(([, score]) => score >= Number(start) && score <= Number(end)).slice(options.offset || 0, (options.offset || 0) + (options.count || entries.length)).map(([member]) => member);
    return entries.slice(Number(start), Number(end) < 0 ? undefined : Number(end) + 1).map(([member]) => member);
  }
}

const bytes = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const artifact = {
  key: 'resume_pdf', filename: 'candidate-role-resume.pdf', contentType: 'application/pdf', bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), pageCount: 1, contentBase64: bytes.toString('base64'),
};
const blob = new FakeBlob();
const configuration = {
  mode: 'vercel-blob-private', ready: true, token: 't'.repeat(32), blobClient: blob,
  scanner: { enabled: true, required: true, url: 'https://scanner.internal.test/v1/scan', bearerToken: 's'.repeat(32) },
};
const dataEncryptionKey = Buffer.alloc(32, 7).toString('base64');
const tenantId = 'a'.repeat(40);
const runId = 'run_12345678';
const fetchImpl = async () => ({ ok: true, json: async () => ({ clean: true, engine: 'fixture', signatureVersion: '1' }) });
const stored = await persistApplicationPackageArtifacts({ artifacts: [artifact], tenantId, runId, dataEncryptionKey, configuration, fetchImpl, now: new Date('2026-08-30T12:00:00.000Z') });
assert.equal(stored.length, 1);
assert.equal(stored[0].contentBase64, undefined);
assert.equal(stored[0].storage, 'encrypted-private-object');
assert.match(stored[0].objectRef.pathname, /^job-agent-artifacts\/v1\/[a-f0-9]{40}\/[a-f0-9]{64}\/[a-f0-9]{64}\.bin$/);
assert.ok(!stored[0].objectRef.pathname.includes(artifact.filename));
const ciphertext = blob.values.get(stored[0].objectRef.pathname).toString('utf8');
assert.ok(!ciphertext.includes(bytes.toString('base64')));
assert.deepEqual(await readApplicationPackageArtifact({ artifact: stored[0], tenantId, runId, dataEncryptionKey, configuration }), bytes);
await assert.rejects(() => readApplicationPackageArtifact({ artifact: stored[0], tenantId: 'b'.repeat(40), runId, dataEncryptionKey, configuration }), /ARTIFACT_OBJECT_REFERENCE_INVALID/);
blob.values.set(stored[0].objectRef.pathname, Buffer.from(`${ciphertext.slice(0, -2)}xx`));
await assert.rejects(() => readApplicationPackageArtifact({ artifact: stored[0], tenantId, runId, dataEncryptionKey, configuration }));
blob.values.set(stored[0].objectRef.pathname, Buffer.from(ciphertext));
assert.equal((await deleteApplicationPackageArtifacts({ artifacts: stored, configuration })).deleted, 1);
assert.equal(blob.values.size, 0);

const redis = new FakeRedis();
const expiring = await persistApplicationPackageArtifacts({ artifacts: [artifact], tenantId, runId, dataEncryptionKey, redis, configuration, fetchImpl, now: new Date('2026-07-01T12:00:00.000Z') });
assert.equal(blob.values.size, 1);
const cleanup = await processExpiredApplicationPackageArtifacts({ redis, configuration, now: new Date('2026-08-30T12:00:00.000Z') });
assert.equal(cleanup.deleted, 1);
assert.equal(blob.values.size, 0);
assert.ok(expiring[0].expiresAt);

const tenantA = 'c'.repeat(40);
const tenantB = 'd'.repeat(40);
const tenantRedis = new FakeRedis();
const tenantBlob = new FakeBlob();
const tenantConfiguration = { ...configuration, blobClient: tenantBlob };
const runHash = 'e'.repeat(64);
for (let index = 0; index < 205; index += 1) {
  const pathname = `job-agent-artifacts/v1/${tenantA}/${runHash}/${index.toString(16).padStart(64, '0')}.bin`;
  tenantBlob.values.set(pathname, Buffer.from('encrypted'));
  await tenantRedis.zadd(`1ststep:job-agent-artifacts:v1:tenant:${tenantA}`, index, pathname);
  await tenantRedis.zadd('1ststep:job-agent-artifacts:v1:due', index, pathname);
}
const otherPath = `job-agent-artifacts/v1/${tenantB}/${runHash}/${'f'.repeat(64)}.bin`;
const orphanPath = `job-agent-artifacts/v1/${tenantA}/${runHash}/${'a'.repeat(64)}.bin`;
tenantBlob.values.set(orphanPath, Buffer.from('unindexed-after-provider-accept'));
tenantBlob.values.set(otherPath, Buffer.from('other-tenant-encrypted'));
await tenantRedis.zadd(`1ststep:job-agent-artifacts:v1:tenant:${tenantB}`, 1, otherPath);
await tenantRedis.zadd('1ststep:job-agent-artifacts:v1:due', 1, otherPath);
const tenantDeletion = await deleteAllApplicationPackageArtifactsForTenant({ tenantId: tenantA, redis: tenantRedis, configuration: tenantConfiguration, batchSize: 40 });
assert.deepEqual(tenantDeletion, { deleted: 206, tenantIndexDeleted: true });
assert.equal(tenantBlob.values.size, 1);
assert.equal(tenantBlob.values.has(otherPath), true);
assert.deepEqual(await tenantRedis.zrange(`1ststep:job-agent-artifacts:v1:tenant:${tenantA}`, 0, -1), []);
assert.deepEqual(await tenantRedis.zrange(`1ststep:job-agent-artifacts:v1:tenant:${tenantB}`, 0, -1), [otherPath]);
assert.deepEqual(await tenantRedis.zrange('1ststep:job-agent-artifacts:v1:due', 0, -1), [otherPath]);

console.log('Tenant-scoped private object encryption, integrity, isolation, and cleanup tests passed.');
