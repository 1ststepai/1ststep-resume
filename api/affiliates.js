import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { authenticateApiRequest, hasJsonContentType, requestIp } from '../lib/api-security.js';
import { isAdministratorSubject } from '../lib/admin-subject.js';
import {
  affiliateProgramConfiguration, readAffiliateSummary, recordAffiliateClick, recordAffiliatePayout,
  registerAffiliatePartner, saveAffiliatePayoutDetails, setAffiliatePartnerStatus,
} from '../lib/affiliate-program.js';

export const maxDuration = 15;
const PUBLIC_ORIGINS = new Set(['https://partners.1ststep.ai', 'https://app.1ststep.ai']);
const localOrigin = (origin, env) => env.VERCEL_ENV !== 'production' && env.NODE_ENV !== 'production' && /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin);

function publicOriginAllowed(req, env = process.env) {
  const origin = String(req.headers?.origin || '');
  return PUBLIC_ORIGINS.has(origin) || localOrigin(origin, env);
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
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
}
function errorResponse(res, error) {
  const code = String(error?.message || 'AFFILIATE_REQUEST_FAILED');
  const errors = {
    AFFILIATE_ACCOUNT_ID_REQUIRED: [409, 'Sign in with your 1stStep.ai account to use the partner program.'],
    AFFILIATE_IDEMPOTENCY_KEY_REQUIRED: [400, 'Refresh and try that action again.'],
    AFFILIATE_CODE_INVALID: [400, 'Enter a valid partner code.'],
    AFFILIATE_NAME_INVALID: [400, 'Enter your name or organization name.'],
    AFFILIATE_TERMS_REQUIRED: [400, 'Accept the beta partner terms to continue.'],
    AFFILIATE_CODE_TAKEN: [409, 'That partner code is already registered.'],
    AFFILIATE_PARTNER_NOT_FOUND_OR_REPLAYED: [409, 'The partner was not found or that action was already processed.'],
    AFFILIATE_APPROVAL_REQUIRED: [409, 'Admin approval is required before payout setup.'],
    AFFILIATE_PAYOUT_DETAILS_INVALID: [400, 'Enter a valid PayPal payout email.'],
    AFFILIATE_PAYOUT_ENCRYPTION_UNAVAILABLE: [503, 'Secure payout setup is temporarily unavailable.'],
    AFFILIATE_PAYOUT_NOT_READY_OR_REPLAYED: [409, 'This payout is not ready or was already recorded.'],
  };
  const [status, message] = errors[code] || [500, 'Affiliate tracking is temporarily unavailable.'];
  return res.status(status).json({ error: message, code });
}

async function signedUser(req, res, authenticate) {
  const auth = await authenticate(req, { requireOpaqueSession: true });
  if (!auth.ok) {
    res.status(auth.status).json({ error: 'Sign in with your 1stStep.ai account to continue.', code: auth.code });
    return null;
  }
  if (!auth.accountId) {
    res.status(409).json({ error: 'Sign in again to link partner access to your account.', code: 'AFFILIATE_ACCOUNT_ID_REQUIRED' });
    return null;
  }
  return auth;
}

export function createAffiliateHandler({ authenticate = authenticateApiRequest, rateLimit = enforceDurableRateLimit } = {}) {
  return async function handler(req, res) {
  applyHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!publicOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  const configuration = affiliateProgramConfiguration();
  const view = String(req.query?.view || 'mine');
  if (req.method === 'GET' && view === 'public') {
    try {
      const summary = await readAffiliateSummary({ configuration });
      return res.status(summary.available ? 200 : 503).json(summary);
    } catch (error) { return errorResponse(res, error); }
  }
  if (req.method === 'POST' && String(req.body?.action || '') === 'click') {
    if (!publicOriginAllowed(req) || !hasJsonContentType(req)) return res.status(403).json({ error: 'Origin not allowed.' });
    const limit = await rateLimit(req, { scope: 'affiliate-click', subject: requestIp(req), ipRule: { limit: 100, window: '1 h' }, globalRule: { limit: 100_000, window: '1 d' } });
    if (!limit.ok) return sendRateLimitResult(res, limit, 'Referral tracking is temporarily limited.');
    try {
      const result = await recordAffiliateClick({ code: req.body?.code, clickId: req.body?.clickId }, { configuration });
      return res.status(202).json({ ok: true, recorded: result.recorded });
    } catch (error) { return errorResponse(res, error); }
  }
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (req.method === 'POST' && !hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
  const auth = await signedUser(req, res, authenticate);
  if (!auth) return;
  const admin = isAdministratorSubject(auth.subject);
  if (view === 'admin' && !admin) return res.status(403).json({ error: 'Administrator access is required.' });
  const limit = await rateLimit(req, { scope: `affiliate:${view}:${req.method.toLowerCase()}`, subject: auth.accountId, ipRule: { limit: 60, window: '1 h' }, accountRule: { limit: 300, window: '1 d' }, globalRule: { limit: 20_000, window: '1 d' } });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Affiliate account actions are temporarily limited.');
  try {
    if (req.method === 'GET') {
      const summary = await readAffiliateSummary({ configuration, admin: view === 'admin', appUserId: view === 'admin' ? '' : auth.accountId });
      return res.status(summary.available ? 200 : 503).json(summary);
    }
    const action = String(req.body?.action || '');
    if (action === 'apply') {
      const partner = await registerAffiliatePartner({ appUserId: auth.accountId, name: req.body?.name, code: req.body?.code, acceptedTerms: req.body?.acceptedTerms, idempotencyKey: req.body?.idempotencyKey }, { configuration });
      return res.status(partner.status === 'pending' ? 202 : 200).json({ ok: true, partner });
    }
    if (action === 'payout-details') {
      const result = await saveAffiliatePayoutDetails({ appUserId: auth.accountId, method: req.body?.method, destination: req.body?.destination, idempotencyKey: req.body?.idempotencyKey }, { configuration });
      return res.status(200).json({ ok: true, ...result });
    }
    if (!admin) return res.status(403).json({ error: 'Administrator access is required.' });
    if (['approve', 'reject', 'suspend'].includes(action)) {
      const status = action === 'approve' ? 'active' : action === 'reject' ? 'rejected' : 'suspended';
      const partner = await setAffiliatePartnerStatus({ code: req.body?.code, status, actorAppUserId: auth.accountId, idempotencyKey: req.body?.idempotencyKey }, { configuration });
      return res.status(200).json({ ok: true, partner });
    }
    if (action === 'record-payout') {
      const payout = await recordAffiliatePayout({ code: req.body?.code, reference: req.body?.reference, actorAppUserId: auth.accountId, idempotencyKey: req.body?.idempotencyKey }, { configuration });
      return res.status(200).json({ ok: true, payout });
    }
    return res.status(400).json({ error: 'Unsupported affiliate action.' });
  } catch (error) {
    console.error(JSON.stringify({ type: 'affiliate-action-error', action: String(req.body?.action || view), name: error?.name || 'unknown' }));
    return errorResponse(res, error);
  }
  };
}

export default createAffiliateHandler();
