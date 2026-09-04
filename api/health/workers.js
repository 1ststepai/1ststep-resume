import { applyApiHeaders, authenticateApiRequest, isOriginAllowed } from '../../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../../lib/durable-rate-limit.js';
import { jobAgentWorkerAndQueueHealth } from '../../lib/job-agent-health.js';
import { jobAgentRuntimeConfiguration } from '../../lib/job-agent-runtime-configuration.js';
import { isAdminSubject } from '../session-capabilities.js';

export const maxDuration = 10;

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  if (!isAdminSubject(auth.subject)) return res.status(403).json({ error: 'Administrator access is required.' });
  const limit = await enforceDurableRateLimit(req, { scope: 'health-workers', subject: auth.subject, ipRule: { limit: 12, window: '1 m' }, accountRule: { limit: 100, window: '1 d' } });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Worker diagnostics are temporarily rate limited.');
  return res.status(200).json(await jobAgentWorkerAndQueueHealth({ config: jobAgentRuntimeConfiguration() }));
}
