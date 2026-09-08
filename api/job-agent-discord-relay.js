import { applyApiHeaders } from '../lib/api-security.js';
import {
  buildJobAgentDiscordMessage,
  jobAgentDiscordRelayConfiguration,
  verifyJobAgentDiscordRelayRequest,
} from '../lib/job-agent-discord-relay.js';

export const maxDuration = 10;

function requestBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    try { return Buffer.byteLength(JSON.stringify(req.body)) <= 8 * 1024 ? req.body : null; } catch { return null; }
  }
  if (typeof req.body !== 'string' || Buffer.byteLength(req.body) > 8 * 1024) return null;
  try { return JSON.parse(req.body); } catch { return null; }
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (Number(req.headers?.['content-length'] || 0) > 8 * 1024) return res.status(413).json({ error: 'Request rejected' });
  const configuration = jobAgentDiscordRelayConfiguration(process.env);
  if (!configuration) return res.status(503).json({ error: 'Operator alert destination is not configured.' });
  const payload = requestBody(req);
  const verification = verifyJobAgentDiscordRelayRequest({ authorization: req.headers?.authorization, payload, configuration });
  if (!verification.ok) return res.status(verification.status).json({ error: 'Request rejected' });
  const message = buildJobAgentDiscordMessage({
    event: verification.event,
    severity: payload.severity,
    environment: payload.environment,
    occurredAt: verification.occurredAt,
  });
  try {
    const response = await fetch(configuration.webhookUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error('Discord rejected the alert.');
    return res.status(202).json({ accepted: true, contentFree: true, containsCandidateValues: false });
  } catch (error) {
    console.error(JSON.stringify({ type: 'job-agent-discord-relay-error', name: error?.name || 'unknown' }));
    return res.status(502).json({ error: 'Operator alert delivery failed.' });
  }
}
