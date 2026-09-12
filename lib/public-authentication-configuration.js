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
  const publishableKeyReady = (env.VERCEL_ENV === 'production' ? /^pk_live_/ : /^pk_test_/)
    .test(env.CLERK_PUBLISHABLE_KEY || '');
  const identityEnabled = env.CLERK_IDENTITY_ENABLED === 'true';
  const secretKeyPresent = Boolean(env.CLERK_SECRET_KEY);
  const jwtKeyPresent = Boolean(env.CLERK_JWT_KEY);
  const clerkAvailable = identityEnabled && tierSecretReady && signedSessionReady
    && secretKeyPresent && jwtKeyPresent && publishableKeyReady;
  return {
    restoreAccessAvailable: tierSecretReady && emailDeliveryReady && signedSessionReady,
    clerk: {
      enabled: clerkAvailable,
      publishableKey: clerkAvailable ? env.CLERK_PUBLISHABLE_KEY : null,
      ...(env.VERCEL_ENV === 'preview' ? { diagnostics: {
        identityEnabled,
        publishableKeyPresent: Boolean(env.CLERK_PUBLISHABLE_KEY),
        publishableKeyPreviewPrefixValid: publishableKeyReady,
        secretKeyPresent,
        jwtKeyPresent,
      } } : {}),
    },
  };
}
