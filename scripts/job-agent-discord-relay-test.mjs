import assert from 'node:assert/strict';
import {
  buildJobAgentDiscordMessage,
  jobAgentDiscordRelayConfiguration,
  publicJobAgentDiscordRelayConfiguration,
  verifyJobAgentDiscordRelayRequest,
} from '../lib/job-agent-discord-relay.js';
import { JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST } from '../lib/job-agent-operator-alert.js';
import { buildAdminSystemAlertDashboard } from '../client/admin-system-alerts.js';
import discordRelayHandler from '../api/job-agent-discord-relay.js';

const env = {
  JOB_AGENT_DISCORD_ALERTS_APPROVED: 'true',
  JOB_AGENT_DISCORD_WEBHOOK_URL: `https://discord.com/api/webhooks/123456789012345678/${'a'.repeat(64)}`,
  JOB_AGENT_ALERT_BEARER_TOKEN: 'b'.repeat(48),
  JOB_AGENT_ALERT_CONTRACT_VERSION: 'operator-alert-v1',
};
const configuration = jobAgentDiscordRelayConfiguration(env);
assert(configuration);
assert.equal(jobAgentDiscordRelayConfiguration({ ...env, JOB_AGENT_DISCORD_ALERTS_APPROVED: '' }), null);
assert.equal(jobAgentDiscordRelayConfiguration({ ...env, JOB_AGENT_DISCORD_WEBHOOK_URL: `https://evil.example/api/webhooks/123456/${'a'.repeat(64)}` }), null);
assert.equal(jobAgentDiscordRelayConfiguration({ ...env, JOB_AGENT_DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/not-safe' }), null);
const payload = {
  schemaVersion: 1,
  service: '1ststep-job-agent',
  contractVersion: env.JOB_AGENT_ALERT_CONTRACT_VERSION,
  contractDigest: JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST,
  event: 'readiness_failure',
  severity: 'critical',
  occurredAt: new Date().toISOString(),
  environment: 'production',
  contentFree: true,
  containsCandidateValues: false,
};
assert.equal(verifyJobAgentDiscordRelayRequest({ authorization: `Bearer ${env.JOB_AGENT_ALERT_BEARER_TOKEN}`, payload, configuration }).ok, true);
assert.equal(verifyJobAgentDiscordRelayRequest({ authorization: 'Bearer wrong', payload, configuration }).status, 401);
assert.equal(verifyJobAgentDiscordRelayRequest({ authorization: `Bearer ${env.JOB_AGENT_ALERT_BEARER_TOKEN}`, payload: { ...payload, containsCandidateValues: true }, configuration }).status, 400);
assert.equal(verifyJobAgentDiscordRelayRequest({ authorization: `Bearer ${env.JOB_AGENT_ALERT_BEARER_TOKEN}`, payload: { ...payload, event: 'candidate_email' }, configuration }).status, 400);
const message = buildJobAgentDiscordMessage(payload);
const serialized = JSON.stringify(message);
assert.deepEqual(message.allowed_mentions, { parse: [] });
assert.match(serialized, /Critical system alert/);
assert.doesNotMatch(serialized, /email|resume|phone|address|password|otp|captcha/i);
const publicConfiguration = publicJobAgentDiscordRelayConfiguration(configuration);
assert.equal(publicConfiguration.ready, true);
assert.equal(serialized.includes(env.JOB_AGENT_DISCORD_WEBHOOK_URL), false);
assert.equal(JSON.stringify(publicConfiguration).includes(env.JOB_AGENT_DISCORD_WEBHOOK_URL), false);
const dashboard = buildAdminSystemAlertDashboard({
  queueHealth: { operatorAlert: { status: 'attention-required', pending: 3, overdue: 1, failed: 0 } },
  launchManifest: { operatorAlerting: { ready: true, acknowledgementWindowMinutes: 15 }, discordOperatorAlerts: { ready: true } },
});
assert.equal(dashboard.destination, 'Private Discord channel');
assert.equal(dashboard.pending, 3);
assert.equal(dashboard.overdue, 1);
assert.equal(dashboard.failed, 0);
assert.equal(dashboard.wholeAppOutageCoverage, 'External uptime monitor required');
assert.equal(buildAdminSystemAlertDashboard({}).available, false);

const environmentKeys = Object.keys(env);
const previousEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const requests = [];
try {
  Object.assign(process.env, env);
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return { ok: true, status: 204 };
  };
  const response = {
    statusCode: 200, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  await discordRelayHandler({ method: 'POST', headers: { authorization: `Bearer ${env.JOB_AGENT_ALERT_BEARER_TOKEN}` }, body: payload }, response);
  assert.equal(response.statusCode, 202);
  assert.equal(response.body.accepted, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, env.JOB_AGENT_DISCORD_WEBHOOK_URL);
  assert.equal(requests[0].init.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(requests[0].init.body).allowed_mentions, { parse: [] });
  const rejected = { ...response, statusCode: 200, body: null, headers: {} };
  await discordRelayHandler({ method: 'POST', headers: { authorization: 'Bearer wrong' }, body: payload }, rejected);
  assert.equal(rejected.statusCode, 401);
  assert.equal(requests.length, 1);
  const oversized = { ...response, statusCode: 200, body: null, headers: {} };
  await discordRelayHandler({ method: 'POST', headers: { authorization: `Bearer ${env.JOB_AGENT_ALERT_BEARER_TOKEN}` }, body: { ...payload, extra: 'x'.repeat(9 * 1024) } }, oversized);
  assert.equal(oversized.statusCode, 400);
  assert.equal(requests.length, 1);
} finally {
  globalThis.fetch = originalFetch;
  for (const key of environmentKeys) {
    if (previousEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnvironment[key];
  }
}

console.log('Content-free Discord operator relay and admin alert dashboard tests passed.');
