import { timingSafeEqual } from 'node:crypto';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { hasJsonContentType, requestIp } from '../lib/api-security.js';
import {
  affiliateProgramConfiguration, readAffiliateSummary, recordAffiliatePayout,
  registerAffiliatePartner, setAffiliatePartnerStatus,
} from '../lib/affiliate-program.js';

export const maxDuration = 15;

const PUBLIC_ORIGINS = new Set(['https://partners.1ststep.ai', 'https://app.1ststep.ai']);

function localOrigin(origin, env) {
  return env.VERCEL_ENV !== 'production' && env.NODE_ENV !== 'production' && /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin);
}

function applyHeaders(req, res, env = process.env) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  const origin = String(req.headers?.origin || '');
  if (PUBLIC_ORIGINS.has(origin) || localOrigin(origin, env)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}

function adminAuthorized(req, env = process.env) {
  const expected = Buffer.from(String(env.ADMIN_SECRET || ''));
  const provided = Buffer.from(String(req.headers?.['x-admin-secret'] || ''));
  return expected.length >= 8 && expected.length === provided.length && timingSafeEqual(expected, provided);
}

function publicOriginAllowed(req, env = process.env) {
  const origin = String(req.headers?.origin || '');
  return PUBLIC_ORIGINS.has(origin) || localOrigin(origin, env);
}

function errorResponse(res, error) {
  const code = String(error?.message || 'AFFILIATE_REQUEST_FAILED');
  const publicErrors = {
    AFFILIATE_CODE_INVALID: [400, 'Enter a valid partner code.'],
    AFFILIATE_NAME_INVALID: [400, 'Enter your name or organization name.'],
    AFFILIATE_EMAIL_INVALID: [400, 'Enter a valid contact email.'],
    AFFILIATE_TERMS_REQUIRED: [400, 'Accept the beta partner terms to continue.'],
    AFFILIATE_CODE_TAKEN: [409, 'That partner code is already registered.'],
    AFFILIATE_PARTNER_NOT_FOUND: [404, 'Partner not found.'],
    AFFILIATE_PAYOUT_NOT_READY: [409, 'This partner does not have a payable balance above the configured threshold.'],
  };
  const [status, message] = publicErrors[code] || [500, 'Affiliate tracking is temporarily unavailable.'];
  return res.status(status).json({ error: message, code });
}

export default async function handler(req, res) {
  applyHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!publicOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
    return res.status(204).end();
  }

  const configuration = affiliateProgramConfiguration();
  const admin = String(req.query?.view || '') === 'admin';

  if (req.method === 'GET') {
    if (admin && !adminAuthorized(req)) return res.status(401).json({ error: 'Administrator access is required.' });
    try {
      const summary = await readAffiliateSummary({ configuration, admin });
      return res.status(summary.available ? 200 : 503).json(summary);
    } catch (error) {
      console.error(JSON.stringify({ type: 'affiliate-summary-error', name: error?.name || 'unknown' }));
      return errorResponse(res, error);
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
  const action = String(req.body?.action || '');

  try {
    if (action === 'register') {
      if (!publicOriginAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });
      const limit = await enforceDurableRateLimit(req, {
        scope: 'affiliate-register', subject: requestIp(req),
        ipRule: { limit: 5, window: '1 h' }, globalRule: { limit: 500, window: '1 d' },
      });
      if (!limit.ok) return sendRateLimitResult(res, limit, 'Too many partner registrations. Please try again later.');
      const partner = await registerAffiliatePartner({
        name: req.body?.name, email: req.body?.email, code: req.body?.code, acceptedTerms: req.body?.acceptedTerms,
      }, { configuration });
      return res.status(partner.status === 'pending' ? 202 : 200).json({ ok: true, partner });
    }

    if (!adminAuthorized(req)) return res.status(401).json({ error: 'Administrator access is required.' });
    if (action === 'approve' || action === 'suspend') {
      const partner = await setAffiliatePartnerStatus({ code: req.body?.code, status: action === 'approve' ? 'active' : 'suspended' }, { configuration });
      return res.status(200).json({ ok: true, partner });
    }
    if (action === 'record-payout') {
      const payout = await recordAffiliatePayout({ code: req.body?.code, reference: req.body?.reference }, { configuration });
      return res.status(200).json({ ok: true, payout });
    }
    return res.status(400).json({ error: 'Unsupported affiliate action.' });
  } catch (error) {
    console.error(JSON.stringify({ type: 'affiliate-action-error', action, name: error?.name || 'unknown' }));
    return errorResponse(res, error);
  }
}
