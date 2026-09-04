import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed, jobAgentAccessAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { JOB_AGENT_POLICY_LEVELS, requireJobAgentPolicyLevel } from '../lib/job-agent-policy-levels.js';
import { jobAgentRuntimeConfiguration } from '../lib/job-agent-runtime-configuration.js';
import {
  correctPreference, createJobAgentLearningState, promoteLearningProposal, publicLearningSummary,
  recordPreference, revokePreference, rollbackLearningPolicy, setLearningStatus,
} from '../lib/job-agent-learning-domain.js';
import {
  deleteJobAgentLearningState, readJobAgentLearningState, saveJobAgentLearningState,
} from '../lib/job-agent-learning-store.js';
import { readApplicantVault } from '../lib/applicant-vault-store.js';
import { publicVaultSummary } from '../lib/applicant-vault-domain.js';

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
  const config = jobAgentRuntimeConfiguration();
  if (!config) return res.status(503).json({ error: 'Secure Job Agent learning is not configured.', code: 'LEARNING_NOT_CONFIGURED' });
  const limit = await enforceDurableRateLimit(req, { scope: 'job-agent-learning', subject: auth.subject, ipRule: { limit: 20, window: '1 m' }, accountRule: { limit: 200, window: '1 d' } });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Learning controls are temporarily rate limited.');
  try {
    if (req.method === 'DELETE') return res.status(200).json(await deleteJobAgentLearningState({ ...config, subject: auth.subject }));
    const [learning, vault] = await Promise.all([
      readJobAgentLearningState({ ...config, subject: auth.subject }),
      readApplicantVault({ ...config, subject: auth.subject }),
    ]);
    if (req.method === 'GET') {
      return res.status(200).json({
        version: learning.version,
        learning: publicLearningSummary(learning.state || createJobAgentLearningState()),
        facts: vault.vault ? publicVaultSummary(vault.vault).facts : [],
        exportable: true, deletable: true,
      });
    }
    if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    if (JSON.stringify(req.body || {}).length > 30_000) return res.status(413).json({ error: 'Learning request is too large.' });
    const policy = await requireJobAgentPolicyLevel(JOB_AGENT_POLICY_LEVELS.DATA_CONSENT, { config, subject: auth.subject });
    if (!policy.ok) return res.status(policy.status).json({ error: policy.error, code: policy.code, policyLevel: policy.level });
    const expectedVersion = Number(req.body?.version);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== learning.version) return res.status(409).json({ error: 'Learned profile changed in another session.', code: 'VERSION_CONFLICT', version: learning.version });
    const state = learning.state || createJobAgentLearningState({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const input = req.body?.input && typeof req.body.input === 'object' ? req.body.input : {};
    const action = String(req.body?.action || '');
    const actions = {
      pause: () => setLearningStatus(state, 'paused'),
      resume: () => setLearningStatus(state, 'active'),
      'record-preference': () => recordPreference(state, input),
      'correct-preference': () => correctPreference(state, { ...input, userConfirmed: true }),
      'revoke-preference': () => revokePreference(state, String(input.id || '')),
      rollback: () => rollbackLearningPolicy(state, String(input.version || ''), 'user-requested'),
      'approve-proposal': () => promoteLearningProposal(state, String(input.id || ''), { humanApproved: true }),
    };
    if (!actions[action]) return res.status(400).json({ error: 'Unsupported learning action.' });
    const next = actions[action]();
    const saved = await saveJobAgentLearningState({ ...config, subject: auth.subject, state: next, expectedVersion, idempotencyKey: String(req.headers?.['idempotency-key'] || '') });
    if (saved.conflict) return res.status(409).json({ error: 'Learned profile changed in another session.', code: 'VERSION_CONFLICT', version: saved.version });
    return res.status(200).json({ ...saved, learning: publicLearningSummary(next), facts: vault.vault ? publicVaultSummary(vault.vault).facts : [] });
  } catch (error) {
    const message = String(error?.message || '');
    if (/required|not allowed|not found|invalid|exceeds|paused|verified|supported|promotion|proposal|rollback|preference/i.test(message)) return res.status(400).json({ error: message });
    console.error(JSON.stringify({ type: 'job-agent-learning-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'Job Agent learning could not be synchronized.' });
  }
}
