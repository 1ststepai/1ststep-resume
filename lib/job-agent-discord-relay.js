import { timingSafeEqual } from 'node:crypto';
import { JOB_AGENT_OPERATOR_ALERTS, JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST } from './job-agent-operator-alert.js';

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
const ENVIRONMENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,23}$/;
const DISCORD_WEBHOOK_PATH = /^\/api\/webhooks\/[0-9]{6,24}\/[A-Za-z0-9._-]{32,160}$/;
const EVENT_LABELS = Object.freeze({
  readiness_failure: 'Production readiness failure',
  audit_integrity_failure: 'Audit integrity failure',
  rate_limit_control_unavailable: 'Rate-limit control unavailable',
  global_budget_exhausted: 'Daily spending limit reached',
  application_submission_outcome_unknown: 'Application outcome is unknown',
  application_submission_failure: 'Application transmission failed',
  authoritative_receipt_failure: 'Employer receipt could not be verified',
  consequential_queue_attention_required: 'Human-action queue needs attention',
  consequential_queue_observation_failure: 'Human-action queue could not be checked',
  account_export_queue_attention_required: 'Account export queue needs attention',
  account_export_queue_observation_failure: 'Account export queue could not be checked',
  stripe_webhook_processing_failure: 'Stripe webhook processing failed',
});

function enabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function safeEqual(left, right) {
  const actual = Buffer.from(String(left || ''));
  const expected = Buffer.from(String(right || ''));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function discordWebhook(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || url.username || url.password || url.hash || url.search) return null;
    return DISCORD_WEBHOOK_PATH.test(url.pathname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function jobAgentDiscordRelayConfiguration(env = process.env) {
  const webhookUrl = discordWebhook(env.JOB_AGENT_DISCORD_WEBHOOK_URL);
  const bearerToken = String(env.JOB_AGENT_ALERT_BEARER_TOKEN || '');
  const contractVersion = String(env.JOB_AGENT_ALERT_CONTRACT_VERSION || '').trim();
  const approved = enabled(env.JOB_AGENT_DISCORD_ALERTS_APPROVED);
  if (!approved || !webhookUrl || bearerToken.length < 32 || !VERSION.test(contractVersion)) return null;
  return { webhookUrl, bearerToken, contractVersion, approved };
}

export function publicJobAgentDiscordRelayConfiguration(configuration) {
  return {
    ready: Boolean(configuration),
    approved: configuration?.approved === true,
    destination: configuration ? 'private-discord-channel' : null,
    contentFree: true,
    containsEndpointOrCredential: false,
  };
}

export function verifyJobAgentDiscordRelayRequest({ authorization, payload, configuration }) {
  const bearer = String(authorization || '').startsWith('Bearer ') ? String(authorization).slice(7).trim() : '';
  if (!configuration || !safeEqual(bearer, configuration.bearerToken)) return { ok: false, status: 401 };
  const event = String(payload?.event || '');
  const occurredAt = new Date(payload?.occurredAt);
  const valid = payload && typeof payload === 'object' && !Array.isArray(payload)
    && payload.schemaVersion === 1
    && payload.service === '1ststep-job-agent'
    && payload.contractVersion === configuration.contractVersion
    && payload.contractDigest === JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST
    && Object.hasOwn(JOB_AGENT_OPERATOR_ALERTS, event)
    && payload.severity === JOB_AGENT_OPERATOR_ALERTS[event]
    && Number.isFinite(occurredAt.getTime())
    && Math.abs(Date.now() - occurredAt.getTime()) <= 24 * 60 * 60 * 1000
    && ENVIRONMENT.test(String(payload.environment || ''))
    && payload.contentFree === true
    && payload.containsCandidateValues === false;
  return valid ? { ok: true, event, occurredAt: occurredAt.toISOString() } : { ok: false, status: 400 };
}

export function buildJobAgentDiscordMessage({ event, severity, environment, occurredAt }) {
  if (!Object.hasOwn(JOB_AGENT_OPERATOR_ALERTS, event) || JOB_AGENT_OPERATOR_ALERTS[event] !== severity) throw new Error('Unsupported Discord operator alert.');
  return {
    username: '1stStep.ai Operations',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: severity === 'critical' ? 'Critical system alert' : 'System warning',
      description: EVENT_LABELS[event],
      color: severity === 'critical' ? 0xdc2626 : 0xf59e0b,
      fields: [
        { name: 'Environment', value: environment, inline: true },
        { name: 'Event', value: event, inline: true },
        { name: 'What to do', value: 'Open the 1stStep.ai admin evidence panel and follow the incident runbook.' },
      ],
      footer: { text: 'Content-free alert. No candidate or customer values are included.' },
      timestamp: occurredAt,
    }],
  };
}
