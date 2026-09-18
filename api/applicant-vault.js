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
import { rememberApplicationAnswer, forgetAnswerMemory } from '../lib/application-answer-memory.js';
import { readDurableApplicationSession } from '../lib/application-session-store.js';

function configuration() {
  const partitionSecret = String(process.env.RATE_LIMIT_HASH_SECRET || process.env.TIER_SECRET || '');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN || partitionSecret.length < 32) return null;
  let dataEncryptionKey;
  try { dataEncryptionKey = dataEncryptionKeyringFromEnvironment(process.env); } catch { return null; }
  return { redis: Redis.fromEnv(), partitionSecret, dataEncryptionKey };
}

export function publicVaultError(error) {
  if (error?.code === 'MEMORY_CONFLICT') return { status: 409, body: {
    error: 'This differs from your remembered answer. Replace the previous answer, or keep this answer only for this application?',
    code: 'MEMORY_CONFLICT',
    factVersion: Number.isSafeInteger(error.version) && error.version > 0 ? error.version : null,
  } };
  const message = String(error?.message || '');
  if (/sensitive-memory opt-in/.test(message)) return { status: 400, body: { error: 'Explicit sensitive-memory opt-in is required, or answer only on the employer site.', code: 'SENSITIVE_MEMORY_OPT_IN_REQUIRED' } };
  if (/certain answer/.test(message)) return { status: 400, body: { error: 'Please clarify what you know before continuing.', code: 'ANSWER_CLARIFICATION_REQUIRED' } };
  if (/required|not allowed|invalid|exceeds|limit|unsupported|must be/i.test(message)) return { status: 400, body: { error: 'The answer could not be saved. Check the input and your saved-information consent, then try again.', code: 'VAULT_INPUT_INVALID' } };
  return { status: 500, body: { error: 'Applicant vault could not be synchronized.', code: 'VAULT_SYNC_FAILED' } };
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
    if (['upsert-fact', 'sync-profile'].includes(action) && JSON.stringify(input).includes('memory_')) throw new Error('Memory edits must use the application-memory controls.');
    if (action === 'grant-consent') {
      vault = current.vault ? renewVaultConsent(current.vault, input) : grantVaultConsent(input);
    } else {
      if (!current.vault) throw new Error('Applicant vault consent is required.');
      const actions = {
        'forget-memory': () => forgetAnswerMemory(current.vault, String(input.id || '')),
        'upsert-fact': () => upsertVaultFact(current.vault, input),
        'revoke-fact': () => revokeVaultFact(current.vault, String(input.id || '')),
        'upsert-document': () => upsertVaultDocument(current.vault, input),
        'sync-profile': () => syncCanonicalApplicantProfile(current.vault, input),
        'revoke-document': () => revokeVaultDocument(current.vault, String(input.id || '')),
        'revoke-consent': () => revokeVaultConsent(current.vault),
      };
      if (action === 'remember-answer' || action === 'edit-memory') {
        let source = input;
        if (action === 'edit-memory') {
          const fact = current.vault.facts.find(f => f.id === input.id && f.status === 'active');
          const v = fact?.versions.find(v => v.version === fact.currentVersion);
          if (!v?.scope?.memory) throw new Error('An active memory is required.');
          source = { ...input, actionId: v.scope.actionId, sessionId: v.scope.applicationId, scope: v.scope.kind, kind: v.scope.category, replaceVersion: fact.currentVersion, expiresAt: v.scope.expiresAt };
        }
        let session = await readDurableApplicationSession({ ...config, subject: auth.subject, sessionId: String(source.sessionId || '') });
        if (!session && action === 'edit-memory') {
          const fact = current.vault.facts.find(f => f.id === input.id);
          const scope = fact.versions.at(-1).scope;
          session = { id: scope.applicationId, role: { employer: scope.employer }, actions: [{ id: scope.actionId, type: 'AMBIGUOUS_FACT', status: 'open', metadata: { question: scope.question } }] };
        }
        if (!session) throw new Error('The source application is required.');
        if (action === 'edit-memory') session = { ...session, actions: session.actions.map(a => a.id === source.actionId ? { ...a, status: 'open' } : a) };
        vault = rememberApplicationAnswer(current.vault, session, source);
      } else {
        if (!actions[action]) throw new Error('Unsupported applicant vault action.');
        vault = actions[action]();
      }
    }
    const result = await saveApplicantVault({ ...config, subject: auth.subject, vault, expectedVersion: current.version, idempotencyKey: String(req.headers?.['idempotency-key'] || '') });
    if (result.conflict) return res.status(409).json({ error: 'Applicant vault changed in another session.', code: 'VERSION_CONFLICT', version: result.version });
    return res.status(200).json({ ...result, vault: publicVaultSummary(vault) });
  } catch (error) {
    const safe = publicVaultError(error);
    if (safe.status === 500) console.error(JSON.stringify({ type: 'applicant-vault-error' }));
    return res.status(safe.status).json(safe.body);
  }
}
