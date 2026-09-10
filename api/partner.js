import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { partnerAccountConfiguration, readPartnerAccount, recordPartnerAttribution, savePartnerApplication } from '../lib/partner-account.js';

export const maxDuration = 15;

function fail(res, error) {
  const code = String(error?.message || 'PARTNER_REQUEST_FAILED');
  const known = {
    PARTNER_NAME_INVALID: [400, 'Enter your name or organization name.'],
    PARTNER_CODE_INVALID: [400, 'Use letters, numbers, and hyphens for your partner code.'],
    PARTNER_TERMS_REQUIRED: [400, 'Accept the beta partner terms to continue.'],
    PARTNER_CODE_TAKEN: [409, 'That partner code is already in use.'],
    PARTNER_CODE_UNKNOWN: [409, 'That referral code is not available.'],
  };
  const [status, message] = known[code] || [500, 'The Partner area is temporarily unavailable.'];
  return res.status(status).json({ error: message, code });
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (req.method === 'POST' && !hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Sign in with your 1stStep.ai account to continue.', code: auth.code });
  const configuration = partnerAccountConfiguration();
  if (!configuration) return res.status(503).json({ error: 'The Partner area is not configured in this environment.', code: 'PARTNER_RUNTIME_NOT_CONFIGURED' });
  const limit = await enforceDurableRateLimit(req, {
    scope: `partner:${req.method.toLowerCase()}`, subject: auth.subject,
    ipRule: { limit: 30, window: '1 h' }, accountRule: { limit: 30, window: '1 h' }, globalRule: { limit: 5000, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Partner requests are temporarily limited.');
  try {
    if (req.method === 'GET') return res.status(200).json({ partner: await readPartnerAccount({ ...configuration, subject: auth.subject }) });
    if (String(req.query?.action || '') === 'attribute') {
      return res.status(200).json(await recordPartnerAttribution({ ...configuration, subject: auth.subject, code: req.body?.code }));
    }
    return res.status(202).json({ partner: await savePartnerApplication(req.body, { ...configuration, subject: auth.subject }) });
  } catch (error) {
    console.error(JSON.stringify({ type: 'partner-account-error', code: String(error?.message || 'unknown') }));
    return fail(res, error);
  }
}
