import { dataEncryptionKeyringFromEnvironment, normalizeDataEncryptionKeyring } from './data-encryption-keyring.js';

function signedSessionRuntimeShapeReady(env) {
  if (!String(env.UPSTASH_REDIS_REST_URL || '') || !String(env.UPSTASH_REDIS_REST_TOKEN || '')) return false;
  if (String(env.RATE_LIMIT_HASH_SECRET || env.TIER_SECRET || '').length < 32) return false;
  try {
    normalizeDataEncryptionKeyring(dataEncryptionKeyringFromEnvironment(env));
    return true;
  } catch {
    return false;
  }
}

export function publicAuthenticationConfiguration(env = process.env) {
  const tierSecretReady = String(env.TIER_SECRET || '').length >= 32;
  const emailDeliveryReady = Boolean(String(env.RESEND_API_KEY || '') && String(env.RESEND_FROM || ''));
  const signedSessionReady = signedSessionRuntimeShapeReady(env);
  return { restoreAccessAvailable: tierSecretReady && emailDeliveryReady && signedSessionReady };
}
