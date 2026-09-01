import { jobAgentRuntimeConfiguration } from '../lib/job-agent-runtime-configuration.js';
import { jobAgentEmailSuppressionConfiguration, recordJobAgentEmailSuppression, verifyJobAgentResendWebhook } from '../lib/job-agent-email-suppression.js';
import { recordConfiguredJobAgentOperationalEvent } from '../lib/job-agent-operational-metrics.js';

export const config = { api: { bodyParser: false } };
export const maxDuration = 10;

async function rawRequestBody(req, limit = 128 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new Error('RESEND_WEBHOOK_PAYLOAD_TOO_LARGE');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export async function handleJobAgentEmailEventRequest(req, res, {
  env = process.env,
  runtime = null,
  recordMetric = recordConfiguredJobAgentOperationalEvent,
} = {}) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!jobAgentEmailSuppressionConfiguration(env).ready) return res.status(503).json({ error: 'Email event processing is not configured.' });
  const activeRuntime = runtime || jobAgentRuntimeConfiguration(env);
  if (!activeRuntime) return res.status(503).json({ error: 'Secure notification persistence is not configured.' });
  try {
    const rawBody = await rawRequestBody(req);
    const event = verifyJobAgentResendWebhook({ rawBody, headers: req.headers, env });
    const result = await recordJobAgentEmailSuppression({
      ...activeRuntime, event, eventId: String(req.headers?.['svix-id'] || ''), env,
    });
    if (result.status === 'suppressed') await recordMetric('needs_you_notification_suppressed', { env });
    return res.status(200).json({ received: true, status: result.status, storesRecipient: false });
  } catch (error) {
    const code = String(error?.message || '');
    if (/SIGNATURE|PAYLOAD|EVENT|RECIPIENT|TENANT|SENDER|TIMESTAMP/.test(code)) return res.status(400).json({ error: 'Invalid email event.' });
    console.error(JSON.stringify({ type: 'job-agent-email-event-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'Email event could not be processed.' });
  }
}

export default async function handler(req, res) {
  return handleJobAgentEmailEventRequest(req, res);
}
