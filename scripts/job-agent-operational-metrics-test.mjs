import assert from 'node:assert/strict';
import { JOB_AGENT_OPERATIONAL_EVENTS, jobAgentCostControlSummary, jobAgentOperationalMetricsConfiguration, readJobAgentOperationalMetrics, recordJobAgentOperationalEvent, recordJobAgentWorkerHeartbeat } from '../lib/job-agent-operational-metrics.js';

class FakeRedis {
  constructor() { this.hashes = new Map(); this.values = new Map(); }
  async eval(_script, keys, args) {
    const hash = this.hashes.get(keys[0]) || {};
    hash[args[0]] = Number(hash[args[0]] || 0) + Number(args[1]);
    this.hashes.set(keys[0], hash);
    return 1;
  }
  async hgetall(key) { return this.hashes.get(key) || null; }
  async set(key, value) { this.values.set(key, value); return 'OK'; }
  async get(key) { return this.values.get(key) || null; }
}

const redis = new FakeRedis();
const originalWarn = console.warn;
const configurationWarnings = [];
let injectedConfiguration;
try {
  console.warn = (...args) => configurationWarnings.push(args.join(' '));
  injectedConfiguration = jobAgentOperationalMetricsConfiguration({
    UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
    UPSTASH_REDIS_REST_TOKEN: 'synthetic-test-token',
  });
} finally {
  console.warn = originalWarn;
}
assert.ok(injectedConfiguration?.redis, 'An explicitly supplied Redis environment must construct the metrics client.');
assert.deepEqual(configurationWarnings, [], 'Explicit Redis configuration must not fall back to process.env or emit missing-environment warnings.');
assert.equal(jobAgentOperationalMetricsConfiguration({}), null, 'Missing Redis configuration must remain fail-closed.');
const now = new Date('2026-08-29T19:20:00.000Z');
await recordJobAgentOperationalEvent('provider_failure', { redis, now });
await recordJobAgentOperationalEvent('provider_failure', { redis, now });
await recordJobAgentOperationalEvent('authentication_failure', { redis, now });
await recordJobAgentOperationalEvent('provider_request_completed', { redis, now });
await recordJobAgentOperationalEvent('provider_input_tokens', { redis, now, amount: 1250 });
await recordJobAgentOperationalEvent('provider_output_tokens', { redis, now, amount: 240 });
await recordJobAgentOperationalEvent('public_ats_request_completed', { redis, now, amount: 3 });
await recordJobAgentOperationalEvent('public_ats_request_failed', { redis, now });
await recordJobAgentOperationalEvent('public_ats_zero_llm_request', { redis, now, amount: 4 });
await recordJobAgentOperationalEvent('account_export_completed', { redis, now });
await recordJobAgentOperationalEvent('account_export_queue_attention_required', { redis, now });
await recordJobAgentOperationalEvent('account_export_queue_observation_failure', { redis, now });
await recordJobAgentOperationalEvent('background_worker_invocation', { redis, now });
await recordJobAgentOperationalEvent('schedule_enqueued', { redis, now });
await recordJobAgentOperationalEvent('application_submission_outcome_unknown', { redis, now });
await recordJobAgentOperationalEvent('authoritative_receipt_pending', { redis, now });
await recordJobAgentOperationalEvent('authoritative_receipt_verified', { redis, now });
await recordJobAgentOperationalEvent('consequential_queue_attention_required', { redis, now });
await recordJobAgentOperationalEvent('stripe_webhook_completed', { redis, now });
await recordJobAgentOperationalEvent('stripe_webhook_duplicate', { redis, now });
await recordJobAgentOperationalEvent('stripe_webhook_retry_deferred', { redis, now });
await recordJobAgentOperationalEvent('stripe_webhook_failure', { redis, now });
await recordJobAgentOperationalEvent('audit_head_archive_completed', { redis, now });
await recordJobAgentOperationalEvent('audit_head_archive_failure', { redis, now });
await recordJobAgentWorkerHeartbeat({ redis, now, outcome: 'succeeded' });
await assert.rejects(() => recordJobAgentOperationalEvent('candidate@example.com', { redis, now }), /Unsupported/);
await assert.rejects(() => recordJobAgentOperationalEvent('provider_input_tokens', { redis, now, amount: -1 }), /Invalid/);
const report = await readJobAgentOperationalMetrics({ redis, days: 2, now });
assert.equal(report.contentFree, true);
assert.equal(report.containsCandidateValues, false);
assert.equal(report.totals.provider_failure, 2);
assert.equal(report.totals.authentication_failure, 1);
assert.equal(report.totals.provider_request_completed, 1);
assert.equal(report.totals.provider_input_tokens, 1250);
assert.equal(report.totals.provider_output_tokens, 240);
assert.deepEqual(report.providerUsageEvidence, {
  requests: 1, inputTokens: 1250, outputTokens: 240,
  source: 'provider-reported-aggregate', monetaryCostStatus: 'unknown-until-provider-invoice-reconciled',
});
assert.deepEqual(report.publicDiscoveryEvidence, {
  requests: 4, completed: 3, failed: 1, zeroLlmRequests: 4,
  llmTokenStatus: 'zero-by-provider-contract', monetaryCostStatus: 'network-and-runtime-cost-not-yet-invoice-reconciled',
});
assert.equal(report.totals.account_export_completed, 1);
assert.equal(report.totals.account_export_queue_attention_required, 1);
assert.equal(report.totals.account_export_queue_observation_failure, 1);
assert.equal(report.totals.background_worker_invocation, 1);
assert.equal(report.totals.schedule_enqueued, 1);
assert.equal(report.totals.application_submission_outcome_unknown, 1);
assert.equal(report.totals.authoritative_receipt_pending, 1);
assert.equal(report.totals.authoritative_receipt_verified, 1);
assert.equal(report.totals.consequential_queue_attention_required, 1);
assert.equal(report.totals.stripe_webhook_completed, 1);
assert.equal(report.totals.stripe_webhook_duplicate, 1);
assert.equal(report.totals.stripe_webhook_retry_deferred, 1);
assert.equal(report.totals.stripe_webhook_failure, 1);
assert.equal(report.totals.audit_head_archive_completed, 1);
assert.equal(report.totals.audit_head_archive_failure, 1);
assert.equal(report.backgroundWorker.status, 'healthy');
assert.equal(report.backgroundWorker.outcome, 'succeeded');
assert.equal(report.days.length, 2);
assert.deepEqual(Object.keys(report.totals), [...JOB_AGENT_OPERATIONAL_EVENTS]);
assert.doesNotMatch(JSON.stringify(report), /candidate@example/);
const costControls = jobAgentCostControlSummary({
  AI_GLOBAL_DAILY_UNITS: '20000', CLAUDE_GLOBAL_DAILY_UNITS: '30000', PACKAGE_GLOBAL_DAILY_UNITS: '300',
  DOCUMENT_RENDER_GLOBAL_DAILY_UNITS: '100', EMPLOYER_BROWSER_GLOBAL_DAILY_UNITS: '30',
});
assert.equal(costControls.unit, 'weighted-request-units-not-dollars');
assert.equal(costControls.monetaryCostStatus, 'unknown-until-provider-invoice-reconciled');
assert.equal(costControls.caps.applicationPackageGlobalDailyUnits, 300);
assert.equal(jobAgentCostControlSummary({}).caps.guidedAiGlobalDailyUnits, null);
const stale = await readJobAgentOperationalMetrics({ redis, days: 1, now: new Date('2026-08-29T22:00:01.000Z') });
assert.equal(stale.backgroundWorker.status, 'stale');
await recordJobAgentWorkerHeartbeat({ redis, now, outcome: 'started' });
const incomplete = await readJobAgentOperationalMetrics({ redis, days: 1, now: new Date('2026-08-29T19:31:00.000Z') });
assert.equal(incomplete.backgroundWorker.status, 'incomplete');
await assert.rejects(() => recordJobAgentWorkerHeartbeat({ redis, now, outcome: 'candidate@example.test' }), /Unsupported/);
console.log('Content-free Job Agent operational metrics tests passed.');
