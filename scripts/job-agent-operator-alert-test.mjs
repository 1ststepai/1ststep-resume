import assert from 'node:assert/strict';
import { JOB_AGENT_OPERATOR_ALERTS, JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST, jobAgentOperatorAlertConfiguration, sendJobAgentOperatorAlert } from '../lib/job-agent-operator-alert.js';

class FakeRedis {
  constructor() { this.keys = new Set(); }
  async set(key) { if (this.keys.has(key)) return null; this.keys.add(key); return 'OK'; }
}

assert.equal(jobAgentOperatorAlertConfiguration({}), null);
assert.equal(JOB_AGENT_OPERATOR_ALERTS.application_submission_outcome_unknown, 'critical');
assert.equal(JOB_AGENT_OPERATOR_ALERTS.application_submission_failure, 'critical');
assert.equal(JOB_AGENT_OPERATOR_ALERTS.authoritative_receipt_failure, 'warning');
assert.equal(JOB_AGENT_OPERATOR_ALERTS.consequential_queue_attention_required, 'warning');
assert.equal(JOB_AGENT_OPERATOR_ALERTS.consequential_queue_observation_failure, 'critical');
assert.equal(JOB_AGENT_OPERATOR_ALERTS.account_export_queue_attention_required, 'warning');
assert.equal(JOB_AGENT_OPERATOR_ALERTS.account_export_queue_observation_failure, 'critical');
assert.equal(JOB_AGENT_OPERATOR_ALERTS.stripe_webhook_processing_failure, 'critical');
assert.equal(jobAgentOperatorAlertConfiguration({
  JOB_AGENT_ALERT_WEBHOOK_URL: 'http://alerts.example.test/hook', JOB_AGENT_ALERT_ALLOWED_HOSTS: 'alerts.example.test',
  JOB_AGENT_ALERT_BEARER_TOKEN: 'x'.repeat(32), UPSTASH_REDIS_REST_URL: 'https://redis.example.test', UPSTASH_REDIS_REST_TOKEN: 'token',
}), null);
assert.equal(jobAgentOperatorAlertConfiguration({
  JOB_AGENT_ALERT_WEBHOOK_URL: 'https://unapproved.example.test/hook', JOB_AGENT_ALERT_ALLOWED_HOSTS: 'alerts.example.test',
  JOB_AGENT_ALERT_BEARER_TOKEN: 'x'.repeat(32), UPSTASH_REDIS_REST_URL: 'https://redis.example.test', UPSTASH_REDIS_REST_TOKEN: 'token',
}), null);
assert.equal(jobAgentOperatorAlertConfiguration({
  JOB_AGENT_ALERT_WEBHOOK_URL: 'https://alerts.example.test/hook', JOB_AGENT_ALERT_ALLOWED_HOSTS: 'alerts.example.test',
  JOB_AGENT_ALERT_BEARER_TOKEN: 'x'.repeat(32), UPSTASH_REDIS_REST_URL: 'https://redis.example.test', UPSTASH_REDIS_REST_TOKEN: 'token',
}), null);

const redis = new FakeRedis();
const requests = [];
const options = {
  url: 'https://alerts.example.test/hook', bearerToken: 'x'.repeat(32), redis,
  contractVersion: 'alerts-2026-08',
  now: new Date('2026-08-30T01:30:00.000Z'), environment: 'production',
  fetchImpl: async (url, init) => { requests.push({ url, init }); return { ok: true }; },
};
assert.deepEqual(await sendJobAgentOperatorAlert('readiness_failure', options), { sent: true });
assert.deepEqual(await sendJobAgentOperatorAlert('readiness_failure', options), { sent: false, reason: 'deduplicated' });
assert.deepEqual(await sendJobAgentOperatorAlert('authoritative_receipt_failure', options), { sent: true });
assert.deepEqual(await sendJobAgentOperatorAlert('account_export_queue_attention_required', options), { sent: true });
assert.equal(requests.length, 3);
const payload = JSON.parse(requests[0].init.body);
assert.deepEqual(Object.keys(payload).sort(), ['containsCandidateValues', 'contentFree', 'contractDigest', 'contractVersion', 'environment', 'event', 'occurredAt', 'schemaVersion', 'service', 'severity'].sort());
assert.equal(payload.contractVersion, 'alerts-2026-08');
assert.equal(payload.contractDigest, JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST);
assert.equal(payload.contentFree, true);
assert.equal(payload.containsCandidateValues, false);
assert.equal(requests[0].init.headers.Authorization, `Bearer ${'x'.repeat(32)}`);
assert.doesNotMatch(requests[0].init.body, /candidate@example|tenant|email|resume|job description/i);
await assert.rejects(() => sendJobAgentOperatorAlert('candidate@example.test', options), /Unsupported/);
assert.deepEqual(await sendJobAgentOperatorAlert('readiness_failure', { ...options, contractDigest: '0'.repeat(64) }), { sent: false, reason: 'not-configured' });

console.log('Content-free, allowlisted, durably deduplicated Job Agent operator alert tests passed.');
