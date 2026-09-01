import { dataEncryptionKeyringFromEnvironment, decryptJsonEnvelope, encryptJsonEnvelope } from '../lib/data-encryption-keyring.js';

try {
  if (!process.env.BETA_DATA_ENCRYPTION_KEY_ID) throw new Error('BETA_DATA_ENCRYPTION_KEY_ID is required for a rotation drill.');
  const keyring = dataEncryptionKeyringFromEnvironment(process.env);
  const aad = '1ststep:rotation-drill:synthetic';
  const fixture = { schemaVersion: 1, synthetic: true, containsCandidateValues: false };
  const activeEnvelope = encryptJsonEnvelope(fixture, { dataEncryptionKey: keyring, aad });
  const activeRestored = decryptJsonEnvelope(activeEnvelope, { dataEncryptionKey: keyring, aad });
  if (activeEnvelope.keyId !== keyring.activeKeyId || activeRestored.synthetic !== true) throw new Error('Active-key round trip failed.');
  let retiredKeysVerified = 0;
  for (const [keyId, key] of keyring.keys.entries()) {
    if (keyId === keyring.activeKeyId) continue;
    const retiredOnly = { activeKeyId: keyId, keys: new Map([[keyId, key]]) };
    const retiredEnvelope = encryptJsonEnvelope(fixture, { dataEncryptionKey: retiredOnly, aad });
    if (decryptJsonEnvelope(retiredEnvelope, { dataEncryptionKey: keyring, aad }).synthetic !== true) throw new Error('Retired-key recovery failed.');
    retiredKeysVerified += 1;
  }
  console.log(JSON.stringify({
    ok: true, synthetic: true, containsCandidateValues: false,
    activeKeyId: keyring.activeKeyId, configuredKeys: keyring.keys.size, retiredKeysVerified,
  }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, synthetic: true, containsCandidateValues: false, error: error?.message || 'Rotation drill failed.' }));
  process.exit(1);
}
