import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';

export const JOB_AGENT_OPERATOR_ALERTS = Object.freeze({
  readiness_failure: 'critical',
  audit_integrity_failure: 'critical',
  rate_limit_control_unavailable: 'critical',
  global_budget_exhausted: 'warning',
  application_submission_outcome_unknown: 'critical',
  application_submission_failure: 'critical',
  authoritative_receipt_failure: 'warning',
  consequential_queue_attention_required: 'warning',
  consequential_queue_observation_failure: 'critical',
  account_export_queue_attention_required: 'warning',
  account_export_queue_observation_failure: 'critical',
  stripe_webhook_processing_failure: 'critical',
});

const ALERT_SCHEMA_VERSION = 1;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
const ALERT_SET = new Set(Object.keys(JOB_AGENT_OPERATOR_ALERTS));
const enabled = value => String(value || '').trim().toLowerCase() === 'true';
const boundedInteger = (value, minimum, maximum) => {
  const parsed = Number(String(value || '').trim());
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
};
export const JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST = createHash('sha256')
  .update(JSON.stringify({
    schemaVersion: ALERT_SCHEMA_VERSION,
    service: '1ststep-job-agent',
    events: Object.entries(JOB_AGENT_OPERATOR_ALERTS).sort(([left], [right]) => left.localeCompare(right)),
    delivery: { mode: 'durable-outbox-v1', idempotency: 'record-id', maxAttempts: 4 },
  }))
  .digest('hex');

function exactHosts(value) {
  return new Set(String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean));
}

export function jobAgentOperatorAlertConfiguration(env = process.env) {
  const rawUrl = String(env.JOB_AGENT_ALERT_WEBHOOK_URL || '').trim();
  if (!rawUrl) return null;
  const approved = enabled(env.JOB_AGENT_ALERTING_APPROVED);
  const allowedHosts = exactHosts(env.JOB_AGENT_ALERT_ALLOWED_HOSTS);
  const bearerToken = String(env.JOB_AGENT_ALERT_BEARER_TOKEN || '');
  const contractVersion = String(env.JOB_AGENT_ALERT_CONTRACT_VERSION || '').trim();
  const retentionDays = boundedInteger(env.JOB_AGENT_ALERT_RETENTION_DAYS, 30, 730);
  const acknowledgementWindowMinutes = boundedInteger(env.JOB_AGENT_ALERT_ACKNOWLEDGEMENT_MINUTES, 1, 1_440);
  const redisReady = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !allowedHosts.has(url.hostname.toLowerCase())) return null;
  if (!approved || bearerToken.length < 32 || !redisReady || !SAFE_VERSION.test(contractVersion)
    || !retentionDays || !acknowledgementWindowMinutes) return null;
  return {
    url: url.toString(), bearerToken, redis: new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
    cooldownSeconds: Math.max(60, Math.min(86_400, Number(env.JOB_AGENT_ALERT_COOLDOWN_SECONDS) || 900)),
    environment: String(env.VERCEL_ENV || env.NODE_ENV || 'development').slice(0, 24),
    approved,
    contractVersion, retentionDays, acknowledgementWindowMinutes,
    contractDigest: JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST,
  };
}

export function publicJobAgentOperatorAlertConfiguration(configuration) {
  return {
    ready: Boolean(configuration),
    approved: configuration?.approved === true,
    contractVersion: configuration?.contractVersion || null,
    contractDigest: configuration?.contractDigest || JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST,
    retentionDays: configuration?.retentionDays || null,
    acknowledgementWindowMinutes: configuration?.acknowledgementWindowMinutes || null,
    contentFree: true,
    containsEndpointOrCredential: false,
  };
}

export async function sendJobAgentOperatorAlert(event, {
  url, bearerToken, redis, cooldownSeconds = 900, environment = 'development',
  contractVersion, contractDigest = JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST,
  now = new Date(), fetchImpl = fetch,
} = {}) {
  if (!ALERT_SET.has(String(event || ''))) throw new Error('Unsupported Job Agent operator alert.');
  if (!url || !bearerToken || !redis || !SAFE_VERSION.test(String(contractVersion || ''))
    || contractDigest !== JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST) return { sent: false, reason: 'not-configured' };
  const dedupeKey = `1ststep:job-agent:alert:v1:${contractVersion}:${contractDigest}:${event}`;
  const claimed = await redis.set(dedupeKey, now.toISOString(), { nx: true, ex: cooldownSeconds });
  if (claimed !== 'OK') return { sent: false, reason: 'deduplicated' };
  const response = await fetchImpl(url, {
    method: 'POST', signal: AbortSignal.timeout(5_000),
    headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: ALERT_SCHEMA_VERSION, service: '1ststep-job-agent', contractVersion, contractDigest, event,
      severity: JOB_AGENT_OPERATOR_ALERTS[event], occurredAt: now.toISOString(), environment,
      contentFree: true, containsCandidateValues: false,
    }),
  });
  if (!response.ok) throw new Error('Operator alert destination rejected the content-free event.');
  return { sent: true };
}

export async function sendConfiguredJobAgentOperatorAlert(event, { env = process.env, now = new Date(), fetchImpl = fetch } = {}) {
  const config = jobAgentOperatorAlertConfiguration(env);
  if (!config) return { sent: false, reason: 'not-configured' };
  try {
    const { enqueueJobAgentOperatorAlert } = await import('./job-agent-operator-alert-outbox.js');
    return await enqueueJobAgentOperatorAlert(event, { ...config, now });
  }
  catch (error) {
    console.error(JSON.stringify({ type: 'job-agent-operator-alert-error', event, name: error?.name || 'unknown' }));
    return { sent: false, reason: 'delivery-failed' };
  }
}
