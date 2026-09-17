import { allowedClerkFrontendOrigin } from './clerk-browser-script.js';
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

const PRODUCTION_CLERK_SIGN_IN_URL = 'https://accounts.1ststep.ai/sign-in';
const PRODUCTION_CLERK_SIGN_UP_URL = 'https://accounts.1ststep.ai/sign-up';

export function clerkBrowserConfiguration(publishableKey, vercelEnvironment) {
  const match = /^(pk_(?:test|live))_([A-Za-z0-9_-]+)$/.exec(String(publishableKey || ''));
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[2], 'base64url').toString('utf8').replace(/\$$/, '');
    const frontendApiUrl = new URL(`https://${decoded}`);
    const production = vercelEnvironment === 'production';
    if (production && match[1] !== 'pk_live') return null;
    if (!production && match[1] !== 'pk_test') return null;
    const origin = allowedClerkFrontendOrigin(frontendApiUrl.origin, production);
    if (!origin) return null;
    return {
      frontendApiUrl: origin,
      signInUrl: production ? PRODUCTION_CLERK_SIGN_IN_URL : null,
      signUpUrl: production ? PRODUCTION_CLERK_SIGN_UP_URL : null,
    };
  } catch {
    return null;
  }
}

export function publicAuthenticationConfiguration(env = process.env) {
  const tierSecretReady = String(env.TIER_SECRET || '').length >= 32;
  const emailDeliveryReady = Boolean(String(env.RESEND_API_KEY || '') && String(env.RESEND_FROM || ''));
  const signedSessionReady = signedSessionRuntimeShapeReady(env);
  const browserConfiguration = clerkBrowserConfiguration(env.CLERK_PUBLISHABLE_KEY, env.VERCEL_ENV);
  const clerkAvailable = env.CLERK_IDENTITY_ENABLED === 'true' && tierSecretReady && signedSessionReady
    && Boolean(env.CLERK_SECRET_KEY && env.CLERK_JWT_KEY && browserConfiguration);
  return {
    restoreAccessAvailable: tierSecretReady && emailDeliveryReady && signedSessionReady,
    clerk: {
      enabled: clerkAvailable,
      publishableKey: clerkAvailable ? env.CLERK_PUBLISHABLE_KEY : null,
      frontendApiUrl: clerkAvailable ? browserConfiguration.frontendApiUrl : null,
      signInUrl: clerkAvailable ? browserConfiguration.signInUrl : null,
      signUpUrl: clerkAvailable ? browserConfiguration.signUpUrl : null,
    },
  };
}
