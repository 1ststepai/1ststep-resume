import { allowedOrigins, applyApiHeaders, authenticateApiRequest, clearAccessSessionCookie, hasJsonContentType, isOriginAllowed, requestIp, setAccessSessionCookie } from '../lib/api-security.js';
import { createUserSession, revokeAllUserSessions, revokeUserSession, userSessionRuntimeConfiguration } from '../lib/user-session-store.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { authenticateClerkIdentity } from '../lib/clerk-identity.js';
import { identityEmailHash, postgresTenantStoreConfiguration, upsertClerkTenantIdentity } from '../lib/postgres-tenant-store.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

export const maxDuration = 15;

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-1stStep-Client');
    return res.status(204).end();
  }
  if (!['POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Request origin is not authorized.' });
  if (req.method === 'POST' && !hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });

  if (req.method === 'POST' && String(req.query?.action || '') === 'clerk-exchange') {
    const preLimit = await enforceDurableRateLimit(req, {
      scope: 'user-session:clerk-exchange:preauth', subject: `ip:${requestIp(req)}`,
      ipRule: { limit: 10, window: '1 h' }, accountRule: { limit: 10, window: '1 h' }, globalRule: { limit: 2_000, window: '1 d' },
    });
    if (!preLimit.ok) return sendRateLimitResult(res, preLimit, 'Sign-in requests are temporarily limited.');
    const identity = await authenticateClerkIdentity(req, { authorizedParties: [...allowedOrigins()] });
    if (!identity.ok) return res.status(identity.status).json({ error: 'Sign-in could not be verified.', code: identity.code });
    const runtime = userSessionRuntimeConfiguration();
    if (!runtime) return res.status(503).json({ error: 'Secure signed-user sessions are temporarily unavailable.', code: 'SESSION_RUNTIME_NOT_CONFIGURED' });
    const tenantId = jobAgentTenantId(identity.subject, runtime.partitionSecret);
    const postgres = postgresTenantStoreConfiguration();
    try {
      await upsertClerkTenantIdentity({
        tenantId,
        providerSubject: identity.providerSubject,
        emailHash: identityEmailHash(identity.subject, runtime.partitionSecret),
        configuration: postgres,
      });
    } catch {
      return res.status(503).json({ error: 'Account storage is temporarily unavailable.', code: 'POSTGRES_IDENTITY_WRITE_FAILED' });
    }
    const session = await createUserSession({ ...runtime, subject: identity.subject, tier: 'free', entitlements: [], maxSessions: 21 });
    setAccessSessionCookie(res, session.token, { maxAgeSeconds: session.maxAgeSeconds });
    return res.status(200).json({
      signedIn: true,
      identityProvider: 'clerk',
      tier: 'free',
      entitlementStatus: 'requires-existing-stripe-resolution',
      session: 'http-only-revocable',
      sessionExpiresAt: session.expiresAt,
    });
  }

  const auth = await authenticateApiRequest(req);
  if (!auth.ok) {
    if (req.method === 'DELETE' && String(req.query?.scope || 'current') === 'current') {
      clearAccessSessionCookie(res);
      return res.status(200).json({ signedOut: true, sessionAlreadyUnavailable: true });
    }
    return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  }
  const limit = await enforceDurableRateLimit(req, {
    scope: `user-session:${req.method.toLowerCase()}`, subject: auth.subject,
    ipRule: { limit: 20, window: '1 h' }, accountRule: { limit: 20, window: '1 h' }, globalRule: { limit: 10_000, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Session requests are temporarily limited.');

  const runtime = userSessionRuntimeConfiguration();
  if (!runtime) return res.status(503).json({ error: 'Secure signed-user sessions are temporarily unavailable.', code: 'SESSION_RUNTIME_NOT_CONFIGURED' });
  if (auth.authentication !== 'opaque-session' || !auth.sessionToken) {
    return res.status(409).json({ error: 'Restore Job Agent access once to upgrade this legacy session.', code: 'SESSION_UPGRADE_REQUIRED' });
  }

  if (req.method === 'DELETE') {
    const allDevices = String(req.query?.scope || 'current') === 'all';
    if (allDevices) await revokeAllUserSessions({ ...runtime, subject: auth.subject });
    else await revokeUserSession({ ...runtime, token: auth.sessionToken, subject: auth.subject });
    clearAccessSessionCookie(res);
    return res.status(200).json({ signedOut: true, allDevices });
  }

  const replacement = await createUserSession({ ...runtime, subject: auth.subject, tier: auth.tier, entitlements: auth.entitlements, maxSessions: 21 });
  await revokeUserSession({ ...runtime, token: auth.sessionToken, subject: auth.subject });
  setAccessSessionCookie(res, replacement.token, { maxAgeSeconds: replacement.maxAgeSeconds });
  return res.status(200).json({ renewed: true, session: 'http-only-revocable', sessionExpiresAt: replacement.expiresAt });
}
