import { applyApiHeaders, hasJsonContentType, isOriginAllowed, requestIp } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { publicWaitlistRedis, upsertPublicWaitlistLead } from '../lib/public-waitlist-store.js';

export const maxDuration = 10;

function waitlistSecret(env = process.env) {
  return String(env.RATE_LIMIT_HASH_SECRET || env.TIER_SECRET || '');
}

export async function handlePublicWaitlist(req, res, { kv, secret } = {}) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });

  const ip = requestIp(req);
  const durableLimit = await enforceDurableRateLimit(req, {
    scope: 'public-waitlist',
    ip,
    ipRule: { limit: 8, window: '1 h' },
    globalRule: { limit: 2_000, window: '1 d' },
  });
  if (!durableLimit.ok) return sendRateLimitResult(res, durableLimit, 'Too many waitlist requests. Please try again later.');

  const body = req.body || {};
  const result = await upsertPublicWaitlistLead({
    email: body.email,
    name: body.name,
    marketingConsent: body.marketingConsent === true,
    source: body.source,
    page: body.page,
    campaign: body.campaign,
  }, {
    kv: kv === undefined ? publicWaitlistRedis() : kv,
    secret: secret === undefined ? waitlistSecret() : secret,
  });

  if (!result.ok && result.code === 'INVALID_EMAIL') {
    return res.status(400).json({ error: 'Enter a valid email address.', code: result.code });
  }
  if (!result.ok) {
    return res.status(503).json({
      error: 'The waitlist is temporarily unavailable. You can still email sales@1ststep.ai.',
      code: result.code || 'WAITLIST_UNAVAILABLE',
    });
  }
  return res.status(200).json({
    ok: true,
    duplicate: result.duplicate === true,
    grantsBetaAccess: false,
    message: result.duplicate
      ? 'You are already on the waitlist. This does not grant Job Agent beta access.'
      : 'You are on the waitlist. This does not grant Job Agent beta access.',
  });
}

export default async function handler(req, res) {
  return handlePublicWaitlist(req, res);
}
