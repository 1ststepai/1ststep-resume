import { createHash, randomBytes } from 'node:crypto';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';

function encode(value) { return typeof value === 'string' ? value : JSON.stringify(value); }
function decode(value) { return typeof value === 'string' ? JSON.parse(value) : value; }

export async function runSyntheticEncryptedRestoreDrill({ redis, dataEncryptionKey, now = new Date() }) {
  const key = `1ststep:recovery-drill:v1:${randomBytes(16).toString('hex')}`;
  const fixture = { schemaVersion: 1, synthetic: true, containsCandidateValues: false, createdAt: now.toISOString() };
  const record = { version: 1, envelope: encryptJsonEnvelope(fixture, { dataEncryptionKey, aad: key }) };
  const serialized = JSON.stringify(record);
  const digest = createHash('sha256').update(serialized).digest('hex');
  try {
    const created = await redis.set(key, serialized, { ex: 120, nx: true });
    if (!created) throw new Error('Synthetic recovery record could not be created.');
    const backup = await redis.get(key);
    if (!backup || createHash('sha256').update(encode(backup)).digest('hex') !== digest) throw new Error('Synthetic backup capture integrity failed.');
    await redis.del(key);
    if (await redis.get(key)) throw new Error('Synthetic recovery deletion checkpoint failed.');
    const restored = await redis.set(key, encode(backup), { ex: 120, nx: true });
    if (!restored) throw new Error('Synthetic recovery restore could not be written.');
    const recovered = decode(await redis.get(key));
    if (createHash('sha256').update(JSON.stringify(recovered)).digest('hex') !== digest) throw new Error('Synthetic restored ciphertext integrity failed.');
    const plaintext = decryptJsonEnvelope(recovered.envelope, { dataEncryptionKey, aad: key });
    if (plaintext.synthetic !== true || plaintext.containsCandidateValues !== false || plaintext.createdAt !== fixture.createdAt) throw new Error('Synthetic restored plaintext verification failed.');
    return { ok: true, synthetic: true, contentFree: true, containsCandidateValues: false, ciphertextIntegrityVerified: true, decryptAfterRestoreVerified: true };
  } finally {
    await redis.del(key).catch(() => false);
  }
}
