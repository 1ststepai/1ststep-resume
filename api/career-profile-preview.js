import { Redis } from '@upstash/redis';
import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed, jobAgentAccessAllowed } from '../lib/api-security.js';
import { readApplicantVault } from '../lib/applicant-vault-store.js';
import { dataEncryptionKeyringFromEnvironment } from '../lib/data-encryption-keyring.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { jobAgentPilotAccessForSubject } from '../lib/job-agent-pilot-access.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';
import { buildLegacyCareerProfilePlan, publicLegacyCareerProfilePlan } from '../lib/career-profile-legacy-reconciliation.js';
import { CareerProfileStoreError, careerProfilePostgresConfiguration, readCareerProfile, writeCareerProfileFacts } from '../lib/career-profile-postgres-store.js';

export const maxDuration = 30;

function configuration() {
  const postgres = careerProfilePostgresConfiguration();
  const partitionSecret = String(process.env.RATE_LIMIT_HASH_SECRET || process.env.TIER_SECRET || '');
  if (!postgres.enabled || !postgres.ready || partitionSecret.length < 32) return { ready: false, reason: postgres.reason || 'CAREER_PROFILE_PARTITION_NOT_CONFIGURED' };
  let dataEncryptionKey;
  try { dataEncryptionKey = dataEncryptionKeyringFromEnvironment(process.env); } catch { return { ready: false, reason: 'CAREER_PROFILE_ENCRYPTION_NOT_CONFIGURED' }; }
  return { ready: true, postgres, partitionSecret, dataEncryptionKey };
}

function legacyConfiguration(config) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  return { redis: Redis.fromEnv(), partitionSecret: config.partitionSecret, dataEncryptionKey: config.dataEncryptionKey };
}

function publicError(error) {
  const code = String(error?.code || error?.message || 'CAREER_PROFILE_FAILED');
  if (code === '40001') return { status: 409, code: 'CAREER_PROFILE_VERSION_CONFLICT' };
  if (['CAREER_PROFILE_VERSION_CONFLICT', 'CAREER_PROFILE_LEGACY_CONFLICT'].includes(code)) return { status: 409, code };
  if (/INVALID|REQUIRED|NOT_ALLOWED|NOT_VERIFIED|SEPARATE|BATCH|DUPLICATE|RECONCILIATION|NOT_FACT/.test(code)) return { status: 400, code };
  return { status: 500, code: 'CAREER_PROFILE_FAILED' };
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
    return res.status(204).end();
  }
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  const config = configuration();
  if (!config.ready) return res.status(config.reason === 'CAREER_PROFILE_PREVIEW_ONLY' ? 404 : 503).json({ error: 'Career Profile Preview is unavailable.', code: config.reason });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  if (!jobAgentAccessAllowed(auth)) return res.status(403).json({ error: 'Job Agent access is required.', code: 'JOB_AGENT_ACCESS_REQUIRED' });
  const pilot = jobAgentPilotAccessForSubject(auth.subject);
  if (!pilot.ok) return res.status(pilot.status || 403).json({ error: 'Career Profile Preview is limited to invited pilot accounts.', code: pilot.code });
  const limit = await enforceDurableRateLimit(req, { scope: 'career-profile-preview', subject: auth.subject, ipRule: { limit: 20, window: '1 m' }, accountRule: { limit: 100, window: '1 d' } });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Career Profile Preview is temporarily rate limited.');
  const tenantId = jobAgentTenantId(auth.subject, config.partitionSecret);
  try {
    if (req.method === 'GET') return res.status(200).json(await readCareerProfile({ tenantId, dataEncryptionKey: config.dataEncryptionKey, configuration: config.postgres }));
    if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    const action = String(req.body?.action || '');
    const idempotencyKey = String(req.headers?.['idempotency-key'] || '');
    if (action === 'upsert-fact') {
      const input = req.body?.input && typeof req.body.input === 'object' ? req.body.input : {};
      if (input.verificationState !== 'user-confirmed') return res.status(400).json({ error: 'Interactive Career Profile updates must be user-confirmed.', code: 'CAREER_PROFILE_USER_CONFIRMATION_REQUIRED' });
      return res.status(200).json(await writeCareerProfileFacts({ tenantId, facts: [{ ...input, sourceType: 'user' }], dataEncryptionKey: config.dataEncryptionKey, idempotencyKey, configuration: config.postgres }));
    }
    if (!['analyze-legacy', 'import-legacy'].includes(action)) return res.status(400).json({ error: 'Unsupported Career Profile Preview action.', code: 'CAREER_PROFILE_ACTION_INVALID' });
    const legacy = legacyConfiguration(config);
    if (!legacy) return res.status(503).json({ error: 'Legacy reconciliation is unavailable.', code: 'LEGACY_VAULT_NOT_CONFIGURED' });
    const stored = await readApplicantVault({ ...legacy, subject: auth.subject });
    const plan = buildLegacyCareerProfilePlan(stored.vault);
    if (action === 'analyze-legacy') return res.status(200).json(publicLegacyCareerProfilePlan(plan, stored.version));
    if (!Number.isSafeInteger(req.body?.legacyVersion) || req.body.legacyVersion !== stored.version) return res.status(409).json({ error: 'Legacy vault changed; analyze it again before importing.', code: 'LEGACY_VAULT_VERSION_CONFLICT', legacyVersion: stored.version });
    if (!plan.importable.length) return res.status(200).json({ ok: true, profileVersion: 0, imported: 0, replayed: 0, reuseGrantsCreated: 0, reconciliation: publicLegacyCareerProfilePlan(plan, stored.version) });
    const result = await writeCareerProfileFacts({ tenantId, facts: plan.importable.map(fact => ({ ...fact, expectedVersion: 0 })), dataEncryptionKey: config.dataEncryptionKey, idempotencyKey, configuration: config.postgres });
    return res.status(200).json({ ...result, imported: plan.importable.length - result.replayed, reconciliation: publicLegacyCareerProfilePlan(plan, stored.version) });
  } catch (error) {
    const safe = publicError(error);
    if (safe.status === 500) console.error(JSON.stringify({ type: 'career-profile-preview-error' }));
    return res.status(safe.status).json({ error: safe.status === 409 ? 'Career Profile changed; review the latest version before retrying.' : 'Career Profile request could not be completed.', code: safe.code, ...(error instanceof CareerProfileStoreError ? error.details : {}) });
  }
}
