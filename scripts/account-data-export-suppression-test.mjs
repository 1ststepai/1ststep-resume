import assert from 'node:assert/strict';
import { buildCompleteAccountDataExport } from '../lib/account-data-export-builder.js';
import { recordJobAgentEmailSuppression } from '../lib/job-agent-email-suppression.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

class EmptyTenantRedis {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(String(key)) ?? null; }
  async zrange() { return []; }
  async zcard() { return 0; }
  async eval(script, keys, args) {
    if (!script.includes("redis.call('SET', KEYS[1]")) throw new Error('Unexpected fixture script.');
    if (this.values.has(keys[1])) return ['replayed'];
    this.values.set(keys[0], args[0]);
    this.values.set(keys[1], '1');
    return ['suppressed'];
  }
}

const redis = new EmptyTenantRedis();
const subject = 'candidate@example.test';
const partitionSecret = 'account-export-suppression-partition'.padEnd(48, 'x');
const dataEncryptionKey = Buffer.alloc(32, 26);
const tenantId = jobAgentTenantId(subject, partitionSecret);
const now = new Date('2026-08-30T15:30:00.000Z');
const env = {
  RESEND_FROM: '1stStep <alerts@1ststep.ai>',
  RESEND_WEBHOOK_SECRET: 'whsec_account_export_suppression_fixture_123456789',
  JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS: '365',
};

await recordJobAgentEmailSuppression({
  redis, dataEncryptionKey, partitionSecret, env, now, eventId: 'msg_account_export_bounce',
  event: {
    type: 'email.bounced', created_at: now.toISOString(),
    data: {
      to: [subject], from: env.RESEND_FROM, email_id: 'email_account_export_fixture',
      tags: [{ name: 'product', value: 'job_agent_needs_you' }, { name: 'tenant_id', value: tenantId }],
    },
  },
});

const exported = await buildCompleteAccountDataExport({
  config: { redis, partitionSecret, dataEncryptionKey }, subject, now,
});

assert.equal(exported.scope.needsYouEmailSuppression, true);
assert.deepEqual(exported.needsYouEmailSuppression, {
  suppressed: true, reason: 'permanent-bounce', suppressedAt: now.toISOString(), storesRecipient: false,
});
assert.doesNotMatch(JSON.stringify(exported.needsYouEmailSuppression), /candidate@example\.test|email_account_export_fixture|msg_account_export_bounce/);
assert.equal(exported.scope.operationalCollectionsComplete, true);

const suppressionKey = [...redis.values.keys()].find(key => key.includes(`email-suppression:v1:tenant:${tenantId}`));
assert.ok(suppressionKey);
const stored = JSON.parse(redis.values.get(suppressionKey));
stored.envelope = { ...stored.envelope, ciphertext: 'invalid-corrupt-envelope' };
redis.values.set(suppressionKey, JSON.stringify(stored));
await assert.rejects(
  () => buildCompleteAccountDataExport({ config: { redis, partitionSecret, dataEncryptionKey }, subject, now }),
  /decrypt|authentication|envelope/i,
);

console.log('Complete tenant account export includes recipient-free Needs You suppression status and fails closed on corrupt encrypted suppression state.');
