import { createClerkClient, verifyToken } from '@clerk/backend';

const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const EMAIL = /^[^\s@|]{1,128}@[^\s@|]{1,190}$/;

function enabled(value) { return String(value || '').toLowerCase() === 'true'; }

export function clerkIdentityConfiguration(env = process.env) {
  if (!enabled(env.CLERK_IDENTITY_ENABLED)) return { enabled: false, ready: false, reason: 'CLERK_IDENTITY_DISABLED' };
  const secretKey = String(env.CLERK_SECRET_KEY || '');
  const jwtKey = String(env.CLERK_JWT_KEY || '');
  if (!secretKey) return { enabled: true, ready: false, reason: 'CLERK_SECRET_KEY_MISSING' };
  if (!jwtKey) return { enabled: true, ready: false, reason: 'CLERK_JWT_KEY_MISSING' };
  return { enabled: true, ready: true, secretKey, jwtKey };
}

export function clerkSessionToken(req = {}) {
  const authorization = String(req.headers?.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  return token.length <= 4096 && JWT.test(token) ? token : '';
}

function verifiedPrimaryEmail(user) {
  const primaryId = String(user?.primaryEmailAddressId || '');
  const address = (user?.emailAddresses || []).find(item => String(item?.id || '') === primaryId);
  const email = String(address?.emailAddress || '').trim().toLowerCase();
  const status = String(address?.verification?.status || '').toLowerCase();
  if (!EMAIL.test(email) || status !== 'verified') throw new Error('CLERK_VERIFIED_PRIMARY_EMAIL_REQUIRED');
  return email;
}

export async function authenticateClerkIdentity(req, {
  env = process.env,
  authorizedParties = [],
  verify = verifyToken,
  clerkClient = null,
  reportFailure = event => console.warn(JSON.stringify(event)),
} = {}) {
  const configuration = clerkIdentityConfiguration(env);
  if (!configuration.ready) return { ok: false, status: 503, code: configuration.reason };
  const token = clerkSessionToken(req);
  if (!token) return { ok: false, status: 401, code: 'CLERK_SESSION_REQUIRED' };
  let stage = 'token-verification';
  try {
    const claims = await verify(token, {
      jwtKey: configuration.jwtKey,
      authorizedParties: [...new Set(authorizedParties.filter(Boolean))],
    });
    stage = 'subject-validation';
    const providerSubject = String(claims?.sub || '');
    if (!/^user_[A-Za-z0-9]+$/.test(providerSubject)) throw new Error('CLERK_SUBJECT_INVALID');
    stage = 'identity-lookup';
    const client = clerkClient || createClerkClient({ secretKey: configuration.secretKey });
    const user = await client.users.getUser(providerSubject);
    stage = 'verified-primary-email';
    return {
      ok: true,
      provider: 'clerk',
      providerSubject,
      subject: verifiedPrimaryEmail(user),
      sessionId: String(claims?.sid || '').slice(0, 160),
      authentication: 'clerk-session',
    };
  } catch {
    // Fixed categories only: provider errors may contain credentials or identity
    // data. A diagnostic failure must never change the authentication decision.
    try { reportFailure({ type: 'clerk-identity-rejected', stage }); } catch { /* remain denied */ }
    return { ok: false, status: 401, code: 'CLERK_SESSION_INVALID' };
  }
}
