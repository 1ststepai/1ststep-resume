import { createHmac, timingSafeEqual } from 'node:crypto';
import { readUserSession, userSessionRuntimeConfiguration } from './user-session-store.js';
import { recordConfiguredJobAgentOperationalEvent } from './job-agent-operational-metrics.js';
import { containsProhibitedSecretText } from './prohibited-secret.js';
export { jobAgentAccessAllowed } from './job-agent-entitlement.js';

const PRIMARY_ORIGINS = new Set([
  'https://1ststep.ai',
  'https://www.1ststep.ai',
  'https://app.1ststep.ai',
]);
const TOKEN_TIERS = new Set(['free', 'essential', 'complete']);
const EMAIL = /^[^\s@|]{1,128}@[^\s@|]{1,190}$/;
const LOCAL_DEVELOPMENT_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/;
const PRODUCTION_SESSION_COOKIE = '__Host-1ststep_session';
const DEVELOPMENT_SESSION_COOKIE = '1ststep_session';

function isLocalDevelopmentOrigin(origin, env = process.env) {
  return env.VERCEL_ENV !== 'production'
    && env.NODE_ENV !== 'production'
    && LOCAL_DEVELOPMENT_ORIGIN.test(origin);
}

export function requestIp(req = {}) {
  return String(req.headers?.['x-real-ip']
    || String(req.headers?.['x-forwarded-for'] || '').split(',').pop().trim()
    || req.socket?.remoteAddress
    || 'unknown').slice(0, 64);
}

export function allowedOrigins(env = process.env) {
  const origins = new Set(PRIMARY_ORIGINS);
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host && /^[a-z0-9.-]+\.vercel\.app$/i.test(host)) origins.add(`https://${host}`);
  }
  if (env.VERCEL_ENV !== 'production') {
    origins.add('http://127.0.0.1:4175');
    origins.add('http://localhost:4175');
  }
  return origins;
}

export function allowedExtensionOrigins(env = process.env) {
  return new Set(String(env.ALLOWED_EXTENSION_IDS || '').split(',').map(value => value.trim()).filter(Boolean).flatMap(id => [
    `chrome-extension://${id}`,
    `moz-extension://${id}`,
  ]));
}

export function isOriginAllowed(req, { allowExtensions = false, env = process.env } = {}) {
  const origin = String(req.headers?.origin || '');
  if (!origin) {
    // Browsers commonly omit Origin on same-origin GET/HEAD requests. Accept
    // that narrow case only when Fetch Metadata says same-origin and the
    // request host is one of this deployment's exact trusted hosts.
    const sameOriginBrowserRequest = String(req.headers?.['sec-fetch-site'] || '').toLowerCase() === 'same-origin'
      || String(req.headers?.['x-1ststep-client'] || '').toLowerCase() === 'job-agent';
    if (!sameOriginBrowserRequest) return false;
    const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').toLowerCase().split(',')[0].trim();
    if (env.VERCEL_ENV !== 'production' && env.NODE_ENV !== 'production' && /^(?:127\.0\.0\.1|localhost):\d+$/.test(host)) return true;
    const trustedHosts = new Set([...allowedOrigins(env)].map(value => {
      try { return new URL(value).host.toLowerCase(); } catch { return ''; }
    }).filter(Boolean));
    return trustedHosts.has(host);
  }
  return allowedOrigins(env).has(origin)
    || isLocalDevelopmentOrigin(origin, env)
    || (allowExtensions && allowedExtensionOrigins(env).has(origin));
}

export function applyApiHeaders(req, res, options = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  const origin = String(req.headers?.origin || '');
  if (origin && isOriginAllowed(req, options)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
}

export function bearerToken(req) {
  const authorization = String(req.headers?.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function cookieValues(req) {
  return String(req.headers?.cookie || '').split(';').reduce((values, item) => {
    const separator = item.indexOf('=');
    if (separator < 1) return values;
    const name = item.slice(0, separator).trim();
    const rawValue = item.slice(separator + 1).trim();
    try { values[name] = decodeURIComponent(rawValue); } catch { values[name] = ''; }
    return values;
  }, {});
}

export function accessSessionToken(req) {
  const bearer = bearerToken(req);
  if (bearer) return bearer;
  const cookies = cookieValues(req);
  return cookies[PRODUCTION_SESSION_COOKIE] || cookies[DEVELOPMENT_SESSION_COOKIE] || '';
}

function cookieSessionToken(req) {
  const cookies = cookieValues(req);
  return cookies[PRODUCTION_SESSION_COOKIE] || cookies[DEVELOPMENT_SESSION_COOKIE] || '';
}

function productionCookie(env = process.env) {
  return env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview' || env.NODE_ENV === 'production';
}

export function setAccessSessionCookie(res, token, { env = process.env, maxAgeSeconds = 20 * 60 } = {}) {
  if (!token || token.length > 2048) throw new Error('A valid signed access token is required for the session cookie.');
  const secure = productionCookie(env);
  const name = secure ? PRODUCTION_SESSION_COOKIE : DEVELOPMENT_SESSION_COOKIE;
  const maxAge = Math.max(1, Math.min(24 * 60 * 60, Math.floor(Number(maxAgeSeconds) || 0)));
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
}

export function clearAccessSessionCookie(res, { env = process.env } = {}) {
  const secure = productionCookie(env);
  const names = secure ? [PRODUCTION_SESSION_COOKIE] : [DEVELOPMENT_SESSION_COOKIE, PRODUCTION_SESSION_COOKIE];
  res.setHeader('Set-Cookie', names.map(name => `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`));
}

export function verifyAccessToken(token, env = process.env) {
  const secret = String(env.TIER_SECRET || '');
  if (secret.length < 32 || !token || token.length > 2048) return null;
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return null;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    const [email, tier, expiresAt, extraField] = decoded.split('|');
    const expiry = Number(expiresAt);
    if (extraField !== undefined || !EMAIL.test(email) || !TOKEN_TIERS.has(tier)) return null;
    if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 24 * 60 * 60 * 1000) return null;
    return { subject: email.toLowerCase(), tier, expiresAt: expiry };
  } catch {
    return null;
  }
}

export async function authenticateApiRequest(req, { allowExtensions = false, fallbackToken = '', env = process.env, sessionRuntime = null, requireOpaqueSession = false } = {}) {
  if (!isOriginAllowed(req, { allowExtensions, env })) {
    await recordConfiguredJobAgentOperationalEvent('authentication_failure', { env });
    return { ok: false, status: 403, code: 'ORIGIN_FORBIDDEN' };
  }
  let requestOrigin = String(req.headers?.origin || '');
  if (!requestOrigin && env.VERCEL_ENV !== 'production' && env.NODE_ENV !== 'production') {
    const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').toLowerCase().split(',')[0].trim();
    if (/^(?:127\.0\.0\.1|localhost):\d+$/.test(host)) requestOrigin = `http://${host}`;
  }
  const localDevelopment = isLocalDevelopmentOrigin(requestOrigin, env);
  if (localDevelopment) return { ok: true, localDevelopment: true, subject: `dev:${requestIp(req)}`, tier: 'free' };
  const explicitBearer = bearerToken(req) || fallbackToken;
  if (explicitBearer) {
    if (String(env.TIER_SECRET || '').length < 32) return { ok: false, status: 503, code: 'AUTH_CONFIGURATION' };
    const verified = verifyAccessToken(explicitBearer, env);
    if (verified && requireOpaqueSession) return { ok: false, status: 409, code: 'SESSION_UPGRADE_REQUIRED' };
    if (verified) return { ok: true, ...verified, authentication: 'bearer' };
    await recordConfiguredJobAgentOperationalEvent('authentication_failure', { env });
    return { ok: false, status: 401, code: 'AUTH_REQUIRED' };
  }
  const cookieToken = cookieSessionToken(req);
  if (cookieToken.startsWith('s1.')) {
    const config = sessionRuntime || userSessionRuntimeConfiguration(env);
    if (!config) return { ok: false, status: 503, code: 'AUTH_CONFIGURATION' };
    const session = await readUserSession({ ...config, token: cookieToken });
    if (session) return { ok: true, ...session };
    await recordConfiguredJobAgentOperationalEvent('authentication_failure', { env });
    return { ok: false, status: 401, code: 'AUTH_REQUIRED' };
  }
  if (String(env.TIER_SECRET || '').length < 32) return { ok: false, status: 503, code: 'AUTH_CONFIGURATION' };
  const verified = verifyAccessToken(cookieToken, env);
  if (verified && requireOpaqueSession) return { ok: false, status: 409, code: 'SESSION_UPGRADE_REQUIRED' };
  if (verified) return { ok: true, ...verified };
  if (cookieToken) await recordConfiguredJobAgentOperationalEvent('authentication_failure', { env });
  return { ok: false, status: 401, code: 'AUTH_REQUIRED' };
}

export async function authenticateApiRequestOrGuest(req, options = {}) {
  const auth = await authenticateApiRequest(req, options);
  if (auth.ok || auth.code !== 'AUTH_REQUIRED' || accessSessionToken(req) || options.fallbackToken) return auth;
  return { ok: true, guest: true, subject: `guest:${requestIp(req)}`, tier: 'free' };
}

export function hasJsonContentType(req) {
  return /^application\/json(?:\s*;|$)/i.test(String(req.headers?.['content-type'] || ''));
}

export function containsProhibitedSecret(value) {
  const input = String(value || '');
  return containsProhibitedSecretText(input)
    || /\b(?:sk-ant-|sk-proj-|ghp_|AKIA)[A-Za-z0-9_-]{12,}/.test(input);
}

export function sanitizeModelText(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g, '').trim().slice(0, maxLength);
}
