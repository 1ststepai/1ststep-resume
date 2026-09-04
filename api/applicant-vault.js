import { Redis } from '@upstash/redis';
import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed, jobAgentAccessAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import {
  grantVaultConsent, publicVaultSummary, renewVaultConsent, revokeVaultConsent, revokeVaultDocument,
  revokeVaultFact, syncCanonicalApplicantProfile, upsertVaultDocument, upsertVaultFact,
} from '../lib/applicant-vault-domain.js';
import { deleteApplicantVault, readApplicantVault, saveApplicantVault } from '../lib/applicant-vault-store.js';
import { jobAgentConsentGate } from '../lib/job-agent-consent-store.js';
import { JOB_AGENT_POLICY_LEVELS, requireJobAgentPolicyLevel } from '../lib/job-agent-policy-levels.js';
import { dataEncryptionKeyringFromEnvironment } from '../lib/data-encryption-keyring.js';

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
    return res.status(204).end();
  }
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  if (!jobAgentAccessAllowed(auth)) return res.status(403).json({ error: 'Job Agent access is required.', code: 'JOB_AGENT_ACCESS_REQUIRED' });
  const config = configuration();
  if (!config) return res.status(503).json({ error: 'Secure applicant vault is not configured.', code: 'VAULT_NOT_CONFIGURED' });

  const limit = await enforceDurableRateLimit(req, { scope: 'applicant-vault', subject: auth.subject, ipRule: { limit: 20, window: '1 m' }, accountRule: { limit: 250, window: '1 d' } });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Applicant vault is temporarily rate limited.');
  try {
    if (req.method === 'GET') {
      const result = await readApplicantVault({ ...config, subject: auth.subject });
      return res.status(200).json({ ...result, vault: result.vault ? publicVaultSummary(result.vault) : null });
    }
    if (req.method === 'DELETE') return res.status(200).json(await deleteApplicantVault({ ...config, subject: auth.subject }));
    if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    const current = await readApplicantVault({ ...config, subject: auth.subject });
    const expectedVersion = Number(req.body?.version);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== current.version) {
      return res.status(409).json({ error: 'Applicant vault changed in another session.', code: 'VERSION_CONFLICT', version: current.version });
    }
    const action = String(req.body?.action || '');
    if (action !== 'revoke-consent') {
      // Storing, retrieving and deleting the user's OWN confirmed career facts inside
      // their own workspace. No third party is contacted and nothing is sent on their
      // behalf, so this requires accepted Terms + Privacy, not the Job Agent
      // Authorization instrument that governs acting for them.
      const consent = await requireJobAgentPolicyLevel(JOB_AGENT_POLICY_LEVELS.DATA_CONSENT, { config, subject: auth.subject });
      if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code, policyLevel: consent.level });
    }
    const input = req.body?.input && typeof req.body.input === 'object' ? req.body.input : {};
    let vault;
    if (action === 'grant-consent') {
      vault = current.vault ? renewVaultConsent(current.vault, input) : grantVaultConsent(input);
    } else {
      if (!current.vault) throw new Error('Applicant vault consent is required.');
      const actions = {
        'upsert-fact': () => upsertVaultFact(current.vault, input),
        'revoke-fact': () => revokeVaultFact(current.vault, String(input.id || '')),
        'upsert-document': () => upsertVaultDocument(current.vault, input),
        'sync-profile': () => syncCanonicalApplicantProfile(current.vault, input),
        'revoke-document': () => revokeVaultDocument(current.vault, String(input.id || '')),
        'revoke-consent': () => revokeVaultConsent(current.vault),
      };
      if (!actions[action]) throw new Error('Unsupported applicant vault action.');
      vault = actions[action]();
    }
    const result = await saveApplicantVault({ ...config, subject: auth.subject, vault, expectedVersion: current.version, idempotencyKey: String(req.headers?.['idempotency-key'] || '') });
    if (result.conflict) return res.status(409).json({ error: 'Applicant vault changed in another session.', code: 'VERSION_CONFLICT', version: result.version });
    return res.status(200).json({ ...result, vault: publicVaultSummary(vault) });
  } catch (error) {
    const message = String(error?.message || '');
    if (/required|not allowed|invalid|exceeds|limit|unsupported|must be/i.test(message)) return res.status(400).json({ error: message });
    console.error(JSON.stringify({ type: 'applicant-vault-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'Applicant vault could not be synchronized.' });
  }
}
