import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const MAX_KEYS = 4;

function decodeKey(value, label = 'data encryption key') {
  const raw = String(value || '').trim();
  const bytes = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (bytes.length !== 32) throw new Error(`${label} must decode to exactly 32 bytes.`);
  return bytes;
}

export function normalizeDataEncryptionKeyring(value) {
  if (typeof value === 'string' || Buffer.isBuffer(value)) {
    const key = Buffer.isBuffer(value) && value.length === 32 ? Buffer.from(value) : decodeKey(value);
    return { activeKeyId: 'legacy', keys: new Map([['legacy', key]]) };
  }
  const activeKeyId = String(value?.activeKeyId || '');
  if (!KEY_ID.test(activeKeyId)) throw new Error('A safe active data-encryption key ID is required.');
  const entries = value?.keys instanceof Map ? [...value.keys.entries()] : Object.entries(value?.keys || {});
  if (!entries.length || entries.length > MAX_KEYS) throw new Error(`The data-encryption keyring must contain 1-${MAX_KEYS} keys.`);
  const keys = new Map();
  for (const [idValue, keyValue] of entries) {
    const id = String(idValue || '');
    if (!KEY_ID.test(id)) throw new Error('Every data-encryption key ID must be safe.');
    if (keys.has(id)) throw new Error('Duplicate data-encryption key IDs are not allowed.');
    keys.set(id, Buffer.isBuffer(keyValue) ? decodeKey(keyValue.toString('base64'), `Data-encryption key ${id}`) : decodeKey(keyValue, `Data-encryption key ${id}`));
  }
  if (!keys.has(activeKeyId)) throw new Error('The active data-encryption key ID is missing from the keyring.');
  return { activeKeyId, keys };
}

export function dataEncryptionKeyringFromEnvironment(env = process.env) {
  const activeKey = String(env.BETA_DATA_ENCRYPTION_KEY || '');
  if (String(env.VERCEL_ENV || '').toLowerCase() === 'production' && !String(env.BETA_DATA_ENCRYPTION_KEY_ID || '').trim()) {
    throw new Error('BETA_DATA_ENCRYPTION_KEY_ID is required in production.');
  }
  const activeKeyId = String(env.BETA_DATA_ENCRYPTION_KEY_ID || 'legacy');
  let retired = {};
  if (String(env.BETA_DATA_DECRYPTION_KEYS || '').trim()) {
    try {
      retired = JSON.parse(String(env.BETA_DATA_DECRYPTION_KEYS));
    } catch {
      throw new Error('BETA_DATA_DECRYPTION_KEYS must be a JSON object keyed by safe key IDs.');
    }
    if (!retired || Array.isArray(retired) || typeof retired !== 'object') throw new Error('BETA_DATA_DECRYPTION_KEYS must be a JSON object keyed by safe key IDs.');
  }
  if (Object.prototype.hasOwnProperty.call(retired, activeKeyId) && String(retired[activeKeyId]).trim() !== activeKey.trim()) {
    throw new Error('The active data-encryption key ID cannot map to two different keys.');
  }
  return normalizeDataEncryptionKeyring({ activeKeyId, keys: { ...retired, [activeKeyId]: activeKey } });
}

export function encryptJsonEnvelope(value, { dataEncryptionKey, aad }) {
  const keyring = normalizeDataEncryptionKeyring(dataEncryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyring.keys.get(keyring.activeKeyId), iv);
  cipher.setAAD(Buffer.from(String(aad || '')));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    algorithm: 'A256GCM', keyId: keyring.activeKeyId, iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptJsonEnvelope(envelope, { dataEncryptionKey, aad }) {
  if (!envelope || envelope.algorithm !== 'A256GCM') throw new Error('Unsupported encrypted data envelope.');
  const keyring = normalizeDataEncryptionKeyring(dataEncryptionKey);
  const candidates = envelope.keyId
    ? [[String(envelope.keyId), keyring.keys.get(String(envelope.keyId))]].filter(([, key]) => key)
    : [[keyring.activeKeyId, keyring.keys.get(keyring.activeKeyId)], ...[...keyring.keys.entries()].filter(([id]) => id !== keyring.activeKeyId)];
  if (!candidates.length) throw new Error('Encrypted data key is unavailable.');
  for (const [, key] of candidates) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
      decipher.setAAD(Buffer.from(String(aad || '')));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8');
      return JSON.parse(plaintext);
    } catch { /* Try the next bounded legacy key without revealing which key failed. */ }
  }
  throw new Error('Encrypted data could not be decrypted with the configured keyring.');
}

export function envelopeNeedsReencryption(envelope, dataEncryptionKey) {
  const keyring = normalizeDataEncryptionKeyring(dataEncryptionKey);
  return String(envelope?.keyId || '') !== keyring.activeKeyId;
}
