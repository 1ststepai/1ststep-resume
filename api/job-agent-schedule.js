import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed, jobAgentAccessAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { jobAgentRuntimeConfiguration } from '../lib/job-agent-runtime-configuration.js';
import { jobAgentConsentGate } from '../lib/job-agent-consent-store.js';
import {
  deleteJobAgentSchedule, jobAgentScheduleConfiguration, readJobAgentSchedule, saveJobAgentSchedule,
} from '../lib/job-agent-schedule-store.js';

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
  if (!config) return res.status(503).json({ error: 'Durable Job Agent scheduling is not configured.', code: 'JOB_AGENT_RUNTIME_NOT_CONFIGURED' });
  const limit = await enforceDurableRateLimit(req, { scope: 'job-agent-schedule', subject: auth.subject, ipRule: { limit: 20, window: '1 m' }, accountRule: { limit: 100, window: '1 d' } });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Job Agent schedule controls are temporarily rate limited.');
  try {
    const configuration = jobAgentScheduleConfiguration();
    if (req.method === 'GET') {
      const current = await readJobAgentSchedule({ ...config, subject: auth.subject });
      return res.status(200).json({ ...current, schedulingEnabled: configuration.enabled, schedulingReason: configuration.reason });
    }
    if (req.method === 'DELETE') {
      await deleteJobAgentSchedule({ ...config, subject: auth.subject });
      return res.status(200).json({ deleted: true, schedule: null, version: 0 });
    }
    if (!configuration.enabled) return res.status(503).json({ error: 'Daily background search is not enabled for this controlled beta.', code: 'JOB_AGENT_SCHEDULE_NOT_CONFIGURED', reason: configuration.reason });
    const consent = await jobAgentConsentGate(config, auth.subject);
    if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code });
    if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    if (JSON.stringify(req.body || {}).length > 10_000) return res.status(413).json({ error: 'Schedule request is too large.' });
    const expectedVersion = Number(req.body?.version);
    const saved = await saveJobAgentSchedule({
      ...config, subject: auth.subject, mission: req.body?.mission, status: req.body?.status || 'active', expectedVersion,
      idempotencyKey: String(req.headers?.['idempotency-key'] || ''),
    });
    if (saved.conflict) return res.status(409).json({ error: 'Schedule changed in another session.', code: 'VERSION_CONFLICT', version: saved.version });
    return res.status(200).json({ ...saved, schedulingEnabled: true });
  } catch (error) {
    const message = String(error?.message || '');
    if (/required|mission|role|schedule|version|Idempotency|private|secret/i.test(message)) return res.status(400).json({ error: message });
    console.error(JSON.stringify({ type: 'job-agent-schedule-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'Job Agent schedule could not be updated.' });
  }
}
