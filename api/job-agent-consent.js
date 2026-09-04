import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import {
  grantJobAgentConsent, jobAgentConsentPolicyConfiguration, publicJobAgentConsent,
  renewJobAgentConsent, revokeJobAgentConsent,
} from '../lib/job-agent-consent-domain.js';
import { readJobAgentConsent, saveJobAgentConsent } from '../lib/job-agent-consent-store.js';
import { shutdownTenantJobAgentAuthorization } from '../lib/job-agent-authorization-shutdown.js';
import { jobAgentRuntimeConfiguration } from '../lib/job-agent-runtime-configuration.js';
import { jobAgentPilotAccessForSubject } from '../lib/job-agent-pilot-access.js';

export const maxDuration = 20;

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
    return res.status(204).end();
  }
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  const config = jobAgentRuntimeConfiguration();
  if (!config) return res.status(503).json({ error: 'Secure Job Agent consent storage is not configured.', code: 'JOB_AGENT_CONSENT_STORE_NOT_CONFIGURED' });
  const limit = await enforceDurableRateLimit(req, { scope: 'job-agent-consent', subject: auth.subject, ipRule: { limit: 20, window: '1 m' }, accountRule: { limit: 100, window: '1 d' } });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Job Agent consent controls are temporarily rate limited.');
  try {
    const policy = jobAgentConsentPolicyConfiguration();
    const current = await readJobAgentConsent({ ...config, subject: auth.subject });
    if (req.method === 'GET') return res.status(200).json({ consent: publicJobAgentConsent(current.consent, policy), version: current.version, policyConfigured: policy.ready });
    if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    if (JSON.stringify(req.body || {}).length > 5_000) return res.status(413).json({ error: 'Consent request is too large.' });
    const expectedVersion = Number(req.body?.version);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== current.version) return res.status(409).json({ error: 'Consent changed in another session.', code: 'VERSION_CONFLICT', version: current.version });
    const action = String(req.body?.action || '');
    let consent;
    if (action === 'grant') {
      const pilot = jobAgentPilotAccessForSubject(auth.subject);
      if (!pilot.ok) return res.status(pilot.status).json({ error: pilot.code === 'JOB_AGENT_PILOT_INVITE_REQUIRED' ? 'This controlled Job Agent beta is currently limited to invited members.' : 'Controlled-beta admission is not configured.', code: pilot.code });
      consent = current.consent ? renewJobAgentConsent(current.consent, req.body?.attestations || {}, policy) : grantJobAgentConsent(req.body?.attestations || {}, policy);
    }
    else if (action === 'revoke') consent = revokeJobAgentConsent(current.consent, { reason: req.body?.reason });
    else return res.status(400).json({ error: 'Use action grant or revoke.' });
    const saved = await saveJobAgentConsent({ ...config, subject: auth.subject, consent, expectedVersion, idempotencyKey: String(req.headers?.['idempotency-key'] || '') });
    if (saved.conflict) return res.status(409).json({ error: 'Consent changed in another session.', code: 'VERSION_CONFLICT', version: saved.version });
    const persistedConsent = saved.replayed ? (await readJobAgentConsent({ ...config, subject: auth.subject })).consent : consent;
    const paused = action === 'revoke'
      ? await shutdownTenantJobAgentAuthorization({ config, subject: auth.subject })
      : { pausedRuns: 0, pausedApplications: 0, pausedSchedule: false, authorizationShutdownReconciliationRequired: false };
    return res.status(200).json({ ...saved, consent: publicJobAgentConsent(persistedConsent, policy), ...paused });
  } catch (error) {
    const message = String(error?.message || '');
    if (/required|consent|policy|attestation|active|revoked|superseded|Idempotency/i.test(message)) return res.status(400).json({ error: message });
    console.error(JSON.stringify({ type: 'job-agent-consent-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'Job Agent consent could not be updated.' });
  }
}
