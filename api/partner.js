import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed } from '../lib/api-security.js';
import { isAdministratorSubject } from '../lib/admin-subject.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import {
  partnerAccountConfiguration, readPartnerAccount, recordPartnerAttribution,
  reviewPartnerApplication, savePartnerApplication,
} from '../lib/partner-account.js';

export const maxDuration = 15;

const publicPartner = partner => partner ? {
  displayName: partner.displayName,
  code: partner.code,
  path: partner.path,
  status: partner.status,
  createdAt: partner.createdAt,
  updatedAt: partner.updatedAt,
  termsVersion: partner.termsVersion,
  jobAgentEntitlementGranted: false,
  jobSeekerDataCreated: false,
} : null;

function fail(res, error) {
  const code = String(error?.message || 'PARTNER_REQUEST_FAILED');
  const known = {
    PARTNER_NAME_INVALID: [400, 'Enter your name or organization name.'],
    PARTNER_CODE_INVALID: [400, 'Use letters, numbers, and hyphens for your partner code.'],
    PARTNER_PATH_INVALID: [400, 'Choose whether you already use 1stStep or want affiliate-only access.'],
    PARTNER_TERMS_REQUIRED: [400, 'Accept the beta partner terms to continue.'],
    PARTNER_CODE_TAKEN: [409, 'That partner code is already in use.'],
    PARTNER_CODE_UNKNOWN: [409, 'That referral code is not available.'],
    PARTNER_APPROVAL_REQUIRED: [409, 'That partner is not approved yet.'],
    PARTNER_SELF_REFERRAL: [409, 'A partner cannot refer their own account.'],
    PARTNER_REVIEW_STATUS_INVALID: [400, 'Choose approved or rejected.'],
    PARTNER_REVIEWER_REQUIRED: [400, 'An administrator identity is required.'],
    PARTNER_IDEMPOTENCY_KEY_REQUIRED: [400, 'Refresh and retry that review action.'],
    PARTNER_REVIEW_REPLAYED: [409, 'That review action was already processed.'],
    PARTNER_NOT_FOUND: [404, 'Partner application not found.'],
  };
  const [status, message] = known[code] || [500, 'The Partner area is temporarily unavailable.'];
  return res.status(status).json({ error: message, code });
}

export function createPartnerHandler({
  authenticate = authenticateApiRequest,
  configuration = partnerAccountConfiguration,
  rateLimit = enforceDurableRateLimit,
  administrator = isAdministratorSubject,
} = {}) {
  return async function handler(req, res) {
    applyApiHeaders(req, res);
    if (req.method === 'OPTIONS') {
      if (!isOriginAllowed(req)) return res.status(403).end();
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(204).end();
    }
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
    if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Request origin is not authorized.' });
    if (req.method === 'POST' && !hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });

    const auth = await authenticate(req, { requireOpaqueSession: true });
    if (!auth?.ok) return res.status(auth?.status || 401).json({ error: 'Sign in securely to continue.', code: auth?.code || 'AUTH_REQUIRED' });
    const runtime = configuration();
    if (!runtime) return res.status(503).json({ error: 'The Partner area is not configured in this environment.', code: 'PARTNER_RUNTIME_NOT_CONFIGURED' });
    const limit = await rateLimit(req, {
      scope: `partner:${req.method.toLowerCase()}`,
      subject: auth.subject,
      ipRule: { limit: 30, window: '1 h' },
      accountRule: { limit: 30, window: '1 h' },
      globalRule: { limit: 5000, window: '1 d' },
    });
    if (!limit.ok) return sendRateLimitResult(res, limit, 'Partner requests are temporarily limited.');

    try {
      if (req.method === 'GET') {
        return res.status(200).json({ partner: publicPartner(await readPartnerAccount({ ...runtime, subject: auth.subject })) });
      }
      const action = String(req.query?.action || 'apply');
      if (action === 'review') {
        if (!administrator(auth.subject)) return res.status(403).json({ error: 'Administrator approval is required.', code: 'PARTNER_ADMIN_REQUIRED' });
        const partner = await reviewPartnerApplication({
          ...runtime,
          code: req.body?.code,
          status: req.body?.status,
          idempotencyKey: req.body?.idempotencyKey,
          reviewerSubject: auth.subject,
        });
        return res.status(200).json({ partner: publicPartner(partner) });
      }
      if (action === 'attribute') {
        return res.status(200).json(await recordPartnerAttribution({ ...runtime, subject: auth.subject, code: req.body?.code }));
      }
      if (action !== 'apply') return res.status(400).json({ error: 'Partner action is not supported.' });
      const partner = await savePartnerApplication(req.body, { ...runtime, subject: auth.subject });
      return res.status(202).json({ partner: publicPartner(partner) });
    } catch (error) {
      console.error(JSON.stringify({ type: 'partner-account-error', code: String(error?.message || 'unknown') }));
      return fail(res, error);
    }
  };
}

export default createPartnerHandler();
