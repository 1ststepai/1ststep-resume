import assert from 'node:assert/strict';
import { Webhook } from 'svix';
import { Readable } from 'node:stream';
import { config as apiConfig, handleJobAgentEmailEventRequest } from '../api/job-agent-email-events.js';
import {
  deleteJobAgentEmailSuppression, jobAgentEmailSuppressionConfiguration, normalizeJobAgentSuppressionEvent,
  readJobAgentEmailSuppression, recordJobAgentEmailSuppression, verifyJobAgentResendWebhook,
} from '../lib/job-agent-email-suppression.js';
import { sendNeedsYouProviderEmail } from '../lib/job-agent-notification-store.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

class FakeRedis {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async del(...keys) { let count = 0; for (const key of keys) if (this.values.delete(key)) count += 1; return count; }
  async eval(script, keys, args) {
    if (!script.includes("redis.call('EXISTS', KEYS[2])")) throw new Error('Unexpected suppression fixture script.');
    if (this.values.has(keys[1])) return ['replayed'];
    this.values.set(keys[0], args[0]); this.values.set(keys[1], '1');
    return ['suppressed'];
  }
}

const subject = 'candidate@example.test';
const partitionSecret = 'suppression-partition-secret'.padEnd(48, 'x');
const dataEncryptionKey = Buffer.alloc(32, 23).toString('base64');
const tenantId = jobAgentTenantId(subject, partitionSecret);
const webhookSecret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const env = {
  JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED: 'true', RESEND_API_KEY: 're_suppression_fixture'.padEnd(32, 'x'),
  RESEND_FROM: '1stStep Job Agent <alerts@1ststep.ai>', RESEND_WEBHOOK_SECRET: webhookSecret, JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS: '365',
};
const eventAt = new Date();
const eventId = 'msg_job_agent_suppression_fixture_0001';
const event = {
  type: 'email.bounced', created_at: eventAt.toISOString(),
  data: {
    email_id: 'provider-email-reference-0001', from: env.RESEND_FROM, to: [subject],
    tags: { product: 'job_agent_needs_you', tenant_id: tenantId },
    bounce: { type: 'Permanent', subType: 'MessageRejected' },
  },
};
const rawBody = JSON.stringify(event);
const signature = new Webhook(webhookSecret).sign(eventId, eventAt, rawBody);
const headers = { 'svix-id': eventId, 'svix-timestamp': String(Math.floor(eventAt.getTime() / 1000)), 'svix-signature': signature };

assert.equal(jobAgentEmailSuppressionConfiguration({}).ready, false);
assert.equal(jobAgentEmailSuppressionConfiguration({ RESEND_WEBHOOK_SECRET: webhookSecret }).reason, 'retention-not-configured');
assert.equal(jobAgentEmailSuppressionConfiguration(env).ready, true);
assert.equal(jobAgentEmailSuppressionConfiguration(env).retentionDays, 365);
assert.deepEqual(verifyJobAgentResendWebhook({ rawBody, headers, env }), event);
assert.throws(() => verifyJobAgentResendWebhook({ rawBody, headers: { ...headers, 'svix-signature': 'v1,invalid' }, env }), /SIGNATURE_INVALID/);
assert.deepEqual(normalizeJobAgentSuppressionEvent({ ...event, type: 'email.delivered' }, { eventId, partitionSecret, env }), { ignored: true, reason: 'event-type-not-suppressing' });
assert.deepEqual(normalizeJobAgentSuppressionEvent({ ...event, data: { ...event.data, tags: { product: 'legacy_product', tenant_id: tenantId } } }, { eventId, partitionSecret, env }), { ignored: true, reason: 'different-product' });
assert.throws(() => normalizeJobAgentSuppressionEvent({ ...event, data: { ...event.data, tags: { ...event.data.tags, tenant_id: 'f'.repeat(40) } } }, { eventId, partitionSecret, env }), /TENANT_MISMATCH/);

const redis = new FakeRedis();
const stored = await recordJobAgentEmailSuppression({ redis, dataEncryptionKey, event, eventId, partitionSecret, env, now: eventAt });
assert.equal(stored.status, 'suppressed');
assert.equal(stored.storesRecipient, false);
assert.equal((await recordJobAgentEmailSuppression({ redis, dataEncryptionKey, event, eventId, partitionSecret, env, now: eventAt })).status, 'replayed');
assert.ok(![...redis.values.entries()].some(([key, value]) => key.includes(subject) || String(value).includes(subject)));
const restored = await readJobAgentEmailSuppression({ redis, tenantId, dataEncryptionKey });
assert.equal(restored.suppressed, true);
assert.equal(restored.reason, 'permanent-bounce');
assert.equal(restored.storesRecipient, false);

let providerCalled = false;
const blocked = await sendNeedsYouProviderEmail({
  subject, tenantId, actionId: 'action_suppressed_0001', redis, dataEncryptionKey, env, now: eventAt,
  fetchImpl: async () => { providerCalled = true; return { ok: true, status: 200 }; },
});
assert.equal(blocked.status, 'suppressed');
assert.equal(providerCalled, false);
assert.equal((await deleteJobAgentEmailSuppression({ redis, tenantId })).deleted, true);
assert.equal(await readJobAgentEmailSuppression({ redis, tenantId, dataEncryptionKey }), null);

function responseFixture() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
function requestFixture(body, requestHeaders, method = 'POST') {
  const request = Readable.from([body]); request.method = method; request.headers = requestHeaders; return request;
}
assert.equal(apiConfig.api.bodyParser, false);
const apiRedis = new FakeRedis();
const apiResponse = responseFixture();
let metric = null;
await handleJobAgentEmailEventRequest(requestFixture(rawBody, headers), apiResponse, {
  env, runtime: { redis: apiRedis, partitionSecret, dataEncryptionKey },
  recordMetric: async name => { metric = name; return { recorded: true }; },
});
assert.equal(apiResponse.statusCode, 200);
assert.deepEqual(apiResponse.body, { received: true, status: 'suppressed', storesRecipient: false });
assert.equal(metric, 'needs_you_notification_suppressed');
const invalidResponse = responseFixture();
await handleJobAgentEmailEventRequest(requestFixture(rawBody, { ...headers, 'svix-signature': 'v1,invalid' }), invalidResponse, {
  env, runtime: { redis: new FakeRedis(), partitionSecret, dataEncryptionKey }, recordMetric: async () => assert.fail('invalid events must not record metrics'),
});
assert.equal(invalidResponse.statusCode, 400);
assert.deepEqual(invalidResponse.body, { error: 'Invalid email event.' });

console.log('Signed raw-body webhook/API verification, product/sender/tenant correlation, encrypted pseudonymous suppression, replay protection, pre-send blocking, content-free metrics, and deletion tests passed.');
