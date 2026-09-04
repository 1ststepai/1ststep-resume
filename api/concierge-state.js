import { Redis } from '@upstash/redis';
import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { deleteTenantCampaignState, readTenantCampaignState, saveTenantCampaignState } from '../lib/tenant-campaign-store.js';
import { dataEncryptionKeyringFromEnvironment } from '../lib/data-encryption-keyring.js';
import { jobAgentConsentGate } from '../lib/job-agent-consent-store.js';
import { JOB_AGENT_POLICY_LEVELS, requireJobAgentPolicyLevel } from '../lib/job-agent-policy-levels.js';

function configuration() {
  const partitionSecret = String(process.env.RATE_LIMIT_HASH_SECRET || process.env.TIER_SECRET || '');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN || partitionSecret.length < 32) return null;
  let dataEncryptionKey;
  try { dataEncryptionKey = dataEncryptionKeyringFromEnvironment(process.env); } catch { return null; }
  return { redis: Redis.fromEnv(), partitionSecret, dataEncryptionKey };
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
    return res.status(204).end();
  }
  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  const config = configuration();
  if (!config) return res.status(503).json({ error: 'Secure campaign sync is not configured.', code: 'SYNC_NOT_CONFIGURED' });

  const limit = await enforceDurableRateLimit(req, {
    scope: 'concierge-state', subject: auth.subject,
    ipRule: { limit: 30, window: '1 m' }, accountRule: { limit: 500, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Campaign sync is temporarily rate limited.');

  try {
    if (req.method === 'GET') {
      const result = await readTenantCampaignState({ ...config, subject: auth.subject });
      return res.status(200).json(result);
    }
    if (req.method === 'DELETE') {
      const result = await deleteTenantCampaignState({ ...config, subject: auth.subject });
      return res.status(200).json(result);
    }
    if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    // The user's own saved search preferences and workspace state.
    const consent = await requireJobAgentPolicyLevel(JOB_AGENT_POLICY_LEVELS.DATA_CONSENT, { config, subject: auth.subject });
    if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code, policyLevel: consent.level });
    const result = await saveTenantCampaignState({
      ...config,
      subject: auth.subject,
      state: req.body?.state,
      expectedVersion: Number(req.body?.version),
      idempotencyKey: String(req.headers?.['idempotency-key'] || ''),
    });
    if (result.conflict) return res.status(409).json({ error: 'Campaign state changed in another session.', code: 'VERSION_CONFLICT', version: result.version });
    return res.status(200).json(result);
  } catch (error) {
    const message = String(error?.message || '');
    if (/required|not allowed|exceeds|version 1|must be|unsupported|allowed range|at most|credential-free/i.test(message)) return res.status(400).json({ error: message });
    console.error(JSON.stringify({ type: 'concierge-state-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'Campaign state could not be synchronized.' });
  }
}
