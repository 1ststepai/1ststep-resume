import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readApplicationPackageArtifact } from '../lib/job-agent-object-storage.js';
import { runSyntheticObjectStorageLifecycleDrill } from '../lib/job-agent-object-storage-drill.js';

class FakeBlob {
  constructor() { this.values = new Map(); this.deleted = []; }
  async put(pathname, bytes) { this.values.set(pathname, Buffer.from(bytes)); return { pathname }; }
  async get(pathname) {
    const value = this.values.get(pathname);
    return value ? { statusCode: 200, stream: new Blob([value]).stream() } : null;
  }
  async del(paths) {
    for (const pathname of Array.isArray(paths) ? paths : [paths]) {
      this.values.delete(pathname);
      this.deleted.push(pathname);
    }
  }
}

const key = Buffer.alloc(32, 9).toString('base64');
const cleanScan = async () => ({ ok: true, json: async () => ({ clean: true, engine: 'fixture', signatureVersion: '1' }) });
function fixture() {
  const blobClient = new FakeBlob();
  return {
    blobClient,
    configuration: {
      mode: 'vercel-blob-private', ready: true, token: 't'.repeat(32), blobClient,
      scanner: { enabled: true, required: true, url: 'https://scanner.example.test/scan', bearerToken: 's'.repeat(32) },
    },
  };
}

let current = fixture();
const result = await runSyntheticObjectStorageLifecycleDrill({ configuration: current.configuration, dataEncryptionKey: key, fetchImpl: cleanScan });
assert.deepEqual(result, {
  ok: true, synthetic: true, contentFree: true, containsCandidateValues: false,
  privateEncryptedWriteVerified: true, malwareScanVerified: true, integrityReadVerified: true,
  deletionVerified: true, artifactsExamined: 1,
});
assert.equal(current.blobClient.values.size, 0);
assert.ok(current.blobClient.deleted.length >= 1);

current = fixture();
await assert.rejects(() => runSyntheticObjectStorageLifecycleDrill({
  configuration: current.configuration,
  dataEncryptionKey: key,
  fetchImpl: async () => ({ ok: true, json: async () => ({ clean: false }) }),
}), /MALWARE_DETECTED/);
assert.equal(current.blobClient.values.size, 0);

current = fixture();
let corruptOnce = true;
const corruptingRead = async options => {
  const value = current.blobClient.values.get(options.artifact.objectRef.pathname);
  if (corruptOnce && value) {
    corruptOnce = false;
    current.blobClient.values.set(options.artifact.objectRef.pathname, Buffer.from(`${value.toString('utf8').slice(0, -2)}xx`));
  }
  return readApplicationPackageArtifact(options);
};
await assert.rejects(() => runSyntheticObjectStorageLifecycleDrill({
  configuration: current.configuration, dataEncryptionKey: key, fetchImpl: cleanScan, read: corruptingRead,
}));
assert.equal(current.blobClient.values.size, 0);
assert.ok(current.blobClient.deleted.length >= 1);

current = fixture();
await assert.rejects(() => runSyntheticObjectStorageLifecycleDrill({
  configuration: current.configuration, dataEncryptionKey: key, fetchImpl: cleanScan,
  read: async () => { throw new Error('SYNTHETIC_PROVIDER_READ_FAILED'); },
}), /SYNTHETIC_PROVIDER_READ_FAILED/);
assert.equal(current.blobClient.values.size, 0);
assert.ok(current.blobClient.deleted.length >= 1);

await assert.rejects(() => runSyntheticObjectStorageLifecycleDrill({
  configuration: { ready: true, mode: 'vercel-blob-private', scanner: { enabled: false } }, dataEncryptionKey: key,
}), /PRIVATE_OBJECT_STORAGE_AND_SCANNER_NOT_CONFIGURED/);

const serialized = JSON.stringify(result);
assert.equal(serialized.includes(key), false);
assert.equal(serialized.includes('job-agent-artifacts'), false);
assert.equal(serialized.includes(createHash('sha256').update(key).digest('hex')), false);
console.log('Synthetic private object-storage scan, integrity, read, and guaranteed cleanup drill tests passed.');
