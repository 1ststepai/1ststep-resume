import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import {
  dataEncryptionKeyringFromEnvironment, decryptJsonEnvelope, encryptJsonEnvelope,
  envelopeNeedsReencryption, normalizeDataEncryptionKeyring,
} from '../lib/data-encryption-keyring.js';

const oldKey = Buffer.alloc(32, 3).toString('base64');
const newKey = Buffer.alloc(32, 4).toString('base64');
const keyring = dataEncryptionKeyringFromEnvironment({
  BETA_DATA_ENCRYPTION_KEY: newKey,
  BETA_DATA_ENCRYPTION_KEY_ID: '2026-08-v2',
  BETA_DATA_DECRYPTION_KEYS: JSON.stringify({ '2026-07-v1': oldKey }),
});
assert.equal(keyring.activeKeyId, '2026-08-v2');
assert.equal(keyring.keys.size, 2);

const envelope = encryptJsonEnvelope({ private: 'masked-fixture' }, { dataEncryptionKey: keyring, aad: 'tenant:fixture' });
assert.equal(envelope.keyId, '2026-08-v2');
assert.deepEqual(decryptJsonEnvelope(envelope, { dataEncryptionKey: keyring, aad: 'tenant:fixture' }), { private: 'masked-fixture' });
assert.equal(envelopeNeedsReencryption(envelope, keyring), false);
assert.throws(() => decryptJsonEnvelope(envelope, { dataEncryptionKey: keyring, aad: 'tenant:other' }), /could not be decrypted/);

const iv = randomBytes(12);
const oldCipher = createCipheriv('aes-256-gcm', Buffer.from(oldKey, 'base64'), iv);
oldCipher.setAAD(Buffer.from('tenant:fixture'));
const ciphertext = Buffer.concat([oldCipher.update(JSON.stringify({ legacy: true })), oldCipher.final()]);
const legacyEnvelope = { algorithm: 'A256GCM', iv: iv.toString('base64'), tag: oldCipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
assert.deepEqual(decryptJsonEnvelope(legacyEnvelope, { dataEncryptionKey: keyring, aad: 'tenant:fixture' }), { legacy: true });
assert.equal(envelopeNeedsReencryption(legacyEnvelope, keyring), true);

assert.throws(() => normalizeDataEncryptionKeyring({ activeKeyId: 'missing', keys: { other: oldKey } }), /active.*missing/i);
assert.throws(() => dataEncryptionKeyringFromEnvironment({ VERCEL_ENV: 'production', BETA_DATA_ENCRYPTION_KEY: newKey }), /KEY_ID is required/);
assert.throws(() => dataEncryptionKeyringFromEnvironment({ BETA_DATA_ENCRYPTION_KEY: newKey, BETA_DATA_ENCRYPTION_KEY_ID: 'active', BETA_DATA_DECRYPTION_KEYS: '{bad' }), /JSON object/);
assert.throws(() => normalizeDataEncryptionKeyring({ activeKeyId: 'a', keys: { a: newKey, b: oldKey, c: oldKey, d: oldKey, e: oldKey } }), /1-4/);

console.log('Versioned data-encryption keyring, legacy envelope, AAD binding, bounded keys, and rotation tests passed.');
