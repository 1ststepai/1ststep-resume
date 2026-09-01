import assert from 'node:assert/strict';
import { runSyntheticEncryptedRestoreDrill } from '../lib/encrypted-record-recovery.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.deleted = 0; }
  async set(key, value, options = {}) {
    if (options.nx && this.values.has(key)) return null;
    this.values.set(key, value);
    return 'OK';
  }
  async get(key) { return this.values.get(key) || null; }
  async del(key) { const removed = this.values.delete(key); if (removed) this.deleted += 1; return removed ? 1 : 0; }
}

const redis = new FakeRedis();
const result = await runSyntheticEncryptedRestoreDrill({ redis, dataEncryptionKey: Buffer.alloc(32, 6).toString('base64'), now: new Date('2026-08-30T04:20:00.000Z') });
assert.deepEqual(result, {
  ok: true, synthetic: true, contentFree: true, containsCandidateValues: false,
  ciphertextIntegrityVerified: true, decryptAfterRestoreVerified: true,
});
assert.equal(redis.values.size, 0);
assert.ok(redis.deleted >= 2);
assert.doesNotMatch(JSON.stringify(result), /2026-08-30|1ststep:|"ciphertext":|"iv":|"tag":|BETA_DATA/);

class CorruptRestoreRedis extends FakeRedis {
  constructor() { super(); this.writeCount = 0; }
  async set(key, value, options) {
    this.writeCount += 1;
    return super.set(key, this.writeCount === 2 ? JSON.stringify({ version: 1, envelope: { algorithm: 'A256GCM' } }) : value, options);
  }
}
const corrupt = new CorruptRestoreRedis();
await assert.rejects(() => runSyntheticEncryptedRestoreDrill({ redis: corrupt, dataEncryptionKey: Buffer.alloc(32, 6).toString('base64') }), /integrity failed/);
assert.equal(corrupt.values.size, 0);

console.log('Synthetic encrypted capture, deletion checkpoint, restore, decrypt, integrity, redaction, and cleanup tests passed.');
