import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed, jobAgentAccessAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { jobAgentConsentGate } from '../lib/job-agent-consent-store.js';
import { jobAgentRuntimeConfiguration } from '../lib/job-agent-runtime-configuration.js';
import {
  deleteJobAgentNotificationPreference, jobAgentNeedsYouNotificationConfiguration,
  readJobAgentNotificationPreference, saveJobAgentNotificationPreference,
} from '../lib/job-agent-notification-store.js';

export const maxDuration = 15;

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
  if (!jobAgentAccessAllowed(auth)) return res.status(403).json({ error: 'Job Agent access is required.', code: 'JOB_AGENT_ACCESS_REQUIRED' });
  const config = jobAgentRuntimeConfiguration();
  if (!config) return res.status(503).json({ error: 'Secure notification preferences are not configured.', code: 'JOB_AGENT_RUNTIME_NOT_CONFIGURED' });
  const limit = await enforceDurableRateLimit(req, { scope: 'job-agent-notifications', subject: auth.subject, ipRule: { limit: 20, window: '1 m' }, accountRule: { limit: 100, window: '1 d' } });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Notification preferences are temporarily rate limited.');
  try {
    const delivery = jobAgentNeedsYouNotificationConfiguration();
    if (req.method === 'GET') {
      const current = await readJobAgentNotificationPreference({ ...config, subject: auth.subject });
      return res.status(200).json({ ...current, deliveryAvailable: delivery.enabled, deliveryReason: delivery.reason });
    }
    if (req.method === 'DELETE') {
      const deleted = await deleteJobAgentNotificationPreference({ ...config, subject: auth.subject });
      return res.status(200).json({ ...deleted, preference: null, version: 0, deliveryAvailable: delivery.enabled });
    }
    if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    if (JSON.stringify(req.body || {}).length > 2_000) return res.status(413).json({ error: 'Notification preference request is too large.' });
    if (req.body?.enabled === true) {
      if (!delivery.enabled) return res.status(503).json({ error: 'Email Needs You alerts are not available yet.', code: 'NEEDS_YOU_EMAIL_NOT_CONFIGURED' });
      const consent = await jobAgentConsentGate(config, auth.subject);
      if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code });
    }
    const saved = await saveJobAgentNotificationPreference({
      ...config, subject: auth.subject, enabled: req.body?.enabled, expectedVersion: Number(req.body?.version),
      idempotencyKey: String(req.headers?.['idempotency-key'] || ''),
    });
    if (saved.conflict) return res.status(409).json({ error: 'Notification preference changed in another session.', code: 'VERSION_CONFLICT', version: saved.version });
    return res.status(200).json({ ...saved, deliveryAvailable: delivery.enabled, deliveryReason: delivery.reason });
  } catch (error) {
    const message = String(error?.message || '');
    if (/required|preference|version|Idempotency|enabled/i.test(message)) return res.status(400).json({ error: message });
    console.error(JSON.stringify({ type: 'job-agent-notification-preference-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'Notification preference could not be updated.' });
  }
}
