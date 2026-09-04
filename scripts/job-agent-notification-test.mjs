import assert from 'node:assert/strict';
import {
  claimNextNeedsYouNotification, deleteJobAgentNotificationPreference, enqueueNeedsYouNotification,
  jobAgentNeedsYouNotificationConfiguration, newestUnnotifiedNeedsYouAction, processNextNeedsYouNotification,
  readJobAgentNotificationPreference, saveJobAgentNotificationPreference, validateJobAgentNotificationPreference,
} from '../lib/job-agent-notification-store.js';
import { encryptJsonEnvelope } from '../lib/data-encryption-keyring.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sets = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async set(key, value, options = {}) {
    if (options.nx && this.values.has(key)) return null;
    if (options.xx && !this.values.has(key)) return null;
    this.values.set(key, value); return 'OK';
  }
  async del(...keys) { let deleted = 0; for (const key of keys) { if (this.values.delete(key)) deleted += 1; this.sets.delete(key); this.sorted.delete(key); } return deleted; }
  async sadd(key, value) { const set = this.sets.get(key) || new Set(); const before = set.size; set.add(value); this.sets.set(key, set); return set.size - before; }
  async srem(key, value) { return this.sets.get(key)?.delete(value) ? 1 : 0; }
  async smembers(key) { return [...(this.sets.get(key) || [])]; }
  async expire() { return 1; }
  async zadd(key, value) { const set = this.sorted.get(key) || new Map(); set.set(value.member, Number(value.score)); this.sorted.set(key, set); return 1; }
  async zrem(key, member) { return this.sorted.get(key)?.delete(member) ? 1 : 0; }
  async zrange(key, start, stop, options = {}) {
    const entries = [...(this.sorted.get(key) || new Map()).entries()].sort((a, b) => a[1] - b[1]);
    if (options.byScore) return entries.filter(([, score]) => score >= Number(start) && score <= Number(stop)).slice(options.offset || 0, (options.offset || 0) + (options.count || entries.length)).map(([member]) => member);
    return entries.slice(start, stop < 0 ? entries.length : stop + 1).map(([member]) => member);
  }
  async eval(script, keys, args) {
    if (script.includes("return {'saved', ARGV[2]}")) {
      const replay = this.values.get(keys[1]);
      if (replay) return ['replayed', replay];
      const raw = this.values.get(keys[0]);
      const current = raw ? Number(JSON.parse(raw).version) || 0 : 0;
      if (current !== Number(args[0])) return ['conflict', String(current)];
      this.values.set(keys[0], args[2]); this.values.set(keys[1], args[1]); await this.sadd(keys[2], keys[1]);
      return ['saved', args[1]];
    }
    if (script.includes("return {'queued'}")) {
      if (this.values.has(keys[0])) return ['replayed'];
      this.values.set(keys[0], args[0]); await this.sadd(keys[1], keys[0]); await this.zadd(keys[2], { score: args[2], member: keys[0] });
      return ['queued'];
    }
    if (script.includes("record.status = 'leased'")) {
      const raw = this.values.get(keys[0]); if (!raw) return ['missing'];
      const record = JSON.parse(raw);
      const eligible = ['queued', 'retry'].includes(record.status) || (record.status === 'leased' && record.leaseUntil <= args[6]);
      if (record.version !== Number(args[0]) || !eligible) return ['not_claimable'];
      record.version += 1; record.status = 'leased'; record.attempt += 1; record.leaseTokenHash = args[1]; record.leaseUntil = args[2]; record.updatedAt = args[3];
      this.values.set(keys[0], JSON.stringify(record)); await this.zadd(keys[1], { score: args[5], member: keys[0] });
      return ['claimed', JSON.stringify(record)];
    }
    if (script.includes("record.status = 'accepted'")) {
      const raw = this.values.get(keys[0]); if (!raw) return ['missing'];
      const record = JSON.parse(raw); if (record.status !== 'leased' || record.leaseTokenHash !== args[0]) return ['lease_lost'];
      record.version += 1; record.status = 'accepted'; record.nextAttemptAt = ''; record.leaseTokenHash = ''; record.leaseUntil = ''; record.updatedAt = args[1]; record.providerAcceptedAt = args[1];
      this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], keys[0]); return ['accepted', JSON.stringify(record)];
    }
    if (script.includes('record.status = ARGV[2]')) {
      const raw = this.values.get(keys[0]); if (!raw) return ['missing'];
      const record = JSON.parse(raw); if (record.status !== 'leased' || record.leaseTokenHash !== args[0]) return ['lease_lost'];
      record.version += 1; record.status = args[1]; record.nextAttemptAt = args[2]; record.leaseTokenHash = ''; record.leaseUntil = ''; record.updatedAt = args[3];
      this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], keys[0]);
      if (args[1] === 'retry') await this.zadd(keys[1], { score: args[5], member: keys[0] });
      return [args[1], JSON.stringify(record)];
    }
    throw new Error('Unexpected notification fixture script.');
  }
}

const redis = new FakeRedis();
const config = { redis, partitionSecret: 'notification-partition-secret'.padEnd(48, 'x'), dataEncryptionKey: Buffer.alloc(32, 13).toString('base64') };
const subject = 'candidate@example.test';
const now = new Date('2026-08-30T12:00:00.000Z');
const env = { JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED: 'true', RESEND_API_KEY: 're_fixture_key'.padEnd(32, 'x'), RESEND_FROM: '1stStep Job Agent <alerts@1ststep.ai>', RESEND_WEBHOOK_SECRET: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS: '365' };

assert.equal(jobAgentNeedsYouNotificationConfiguration({}).reason, 'disabled');
assert.equal(jobAgentNeedsYouNotificationConfiguration({ JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED: 'true' }).reason, 'provider-not-configured');
assert.equal(jobAgentNeedsYouNotificationConfiguration({ ...env, RESEND_WEBHOOK_SECRET: '' }).reason, 'suppression-not-configured');
assert.equal(jobAgentNeedsYouNotificationConfiguration(env).enabled, true);
assert.throws(() => validateJobAgentNotificationPreference({ schemaVersion: 1, enabled: true, channel: 'email', consentVersion: 'needs-you-email-v1', consentedAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString(), recipient: subject }), /recipient/);

const saved = await saveJobAgentNotificationPreference({ ...config, subject, enabled: true, expectedVersion: 0, idempotencyKey: 'notification_create_0001', now });
assert.equal(saved.preference.enabled, true);
assert.ok(![...redis.values.values()].some(value => String(value).includes(subject)));
assert.equal((await readJobAgentNotificationPreference({ ...config, subject: 'other@example.test' })).preference, null);
assert.equal((await saveJobAgentNotificationPreference({ ...config, subject, enabled: false, expectedVersion: 0, idempotencyKey: 'notification_conflict_0002', now })).conflict, true);

assert.equal((await enqueueNeedsYouNotification({ ...config, subject, actionId: 'action_fixture_0001', env, now })).status, 'queued');
assert.equal((await enqueueNeedsYouNotification({ ...config, subject, actionId: 'action_fixture_0001', env, now })).status, 'replayed');
assert.ok(![...redis.values.values()].some(value => String(value).includes(subject)));
let request = null;
const accepted = await processNextNeedsYouNotification({
  ...config, env, now, fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, status: 200 }; },
});
assert.equal(accepted.status, 'provider-accepted');
assert.equal(accepted.recipientActionVerified, false);
const email = JSON.parse(request.options.body);
assert.deepEqual(email.to, [subject]);
assert.deepEqual(email.tags, [{ name: 'product', value: 'job_agent_needs_you' }, { name: 'tenant_id', value: jobAgentTenantId(subject, config.partitionSecret) }]);
assert.match(request.options.headers['Idempotency-Key'], /^needs-you-[a-f0-9]{64}$/);
assert.notEqual(request.options.headers['Idempotency-Key'], `needs-you-${'action_fixture_0001'}`);
for (const field of ['subject', 'text', 'html']) assert.doesNotMatch(email[field], /candidate|example\.test|action_fixture|employer|requisition|job title/i);
assert.match(email.text, /No application was submitted/);

await enqueueNeedsYouNotification({ ...config, subject, actionId: 'action_fixture_0002', env, now: new Date(now.getTime() + 1_000) });
const retry = await processNextNeedsYouNotification({ ...config, env, now: new Date(now.getTime() + 1_000), fetchImpl: async () => ({ ok: false, status: 503 }) });
assert.equal(retry.status, 'retry');
assert.equal(retry.attempt, 1);
assert.equal(await processNextNeedsYouNotification({ ...config, env, now: new Date(now.getTime() + 30_000), fetchImpl: async () => { throw new Error('not due'); } }), null);
const retried = await processNextNeedsYouNotification({ ...config, env, now: new Date(now.getTime() + 62_000), fetchImpl: async () => ({ ok: true, status: 200 }) });
assert.equal(retried.status, 'provider-accepted');
assert.equal(retried.attempt, 2);

await enqueueNeedsYouNotification({ ...config, subject, actionId: 'action_fixture_unauthorized_0004', env, now: new Date(now.getTime() + 65_000) });
const terminalConfigurationFailure = await processNextNeedsYouNotification({ ...config, env, now: new Date(now.getTime() + 65_000), fetchImpl: async () => ({ ok: false, status: 401 }) });
assert.equal(terminalConfigurationFailure.status, 'failed');
assert.equal(terminalConfigurationFailure.attempt, 1);

await enqueueNeedsYouNotification({ ...config, subject, actionId: 'follow_up_application_missing_0001', env, now: new Date(now.getTime() + 66_000) });
let staleFollowUpProviderCalled = false;
const staleFollowUp = await processNextNeedsYouNotification({ ...config, env, now: new Date(now.getTime() + 66_000), fetchImpl: async () => { staleFollowUpProviderCalled = true; return { ok: true, status: 200 }; } });
assert.equal(staleFollowUp.status, 'cancelled');
assert.equal(staleFollowUpProviderCalled, false);

const validFollowUpSessionId = 'application_follow_up_valid_0001';
const validFollowUpActionId = `follow_up_${validFollowUpSessionId}`;
const validFollowUpAt = new Date(now.getTime() + 67_000);
const validFollowUpSessionKey = `1ststep:application-session:v1:session:${validFollowUpSessionId}`;
const validFollowUpSession = {
  id: validFollowUpSessionId, packageRunId: 'run_follow_up_valid_0001', role: {}, documentVersion: 'resume-v1', state: 'Finished', stage: 'receipt_verification',
  actions: [], approvals: {}, receipt: { authority: 'employer-side', receivedAt: now.toISOString() },
  postSubmission: { status: 'SUBMITTED', followUp: { status: 'SCHEDULED', dueAt: validFollowUpAt.toISOString(), completedAt: null } }, timeline: [], createdAt: now.toISOString(), updatedAt: now.toISOString(),
};
redis.values.set(validFollowUpSessionKey, JSON.stringify({
  version: 1, id: validFollowUpSessionId, tenantId: jobAgentTenantId(subject, config.partitionSecret), auditCount: 0, auditHeadHash: '', auditHeadSignature: '',
  envelope: encryptJsonEnvelope(validFollowUpSession, { dataEncryptionKey: config.dataEncryptionKey, aad: validFollowUpSessionKey }),
}));
await enqueueNeedsYouNotification({ ...config, subject, actionId: validFollowUpActionId, env, now: validFollowUpAt });
let validFollowUpProviderCalled = false;
const validFollowUpDelivery = await processNextNeedsYouNotification({ ...config, env, now: validFollowUpAt, fetchImpl: async () => { validFollowUpProviderCalled = true; return { ok: true, status: 200 }; } });
assert.equal(validFollowUpDelivery.status, 'provider-accepted');
assert.equal(validFollowUpProviderCalled, true);

await enqueueNeedsYouNotification({ ...config, subject, actionId: 'action_fixture_0003', env, now: new Date(now.getTime() + 70_000) });
const firstLease = await claimNextNeedsYouNotification({ ...config, now: new Date(now.getTime() + 70_000) });
assert.equal(firstLease.record.attempt, 1);
assert.equal(await claimNextNeedsYouNotification({ ...config, now: new Date(now.getTime() + 100_000) }), null);
const recoveredLease = await claimNextNeedsYouNotification({ ...config, now: new Date(now.getTime() + 161_000) });
assert.equal(recoveredLease.record.attempt, 2);

assert.equal(newestUnnotifiedNeedsYouAction({ state: 'Waiting for You', actions: [{ id: 'action_new_0001', status: 'open' }] })?.id, 'action_new_0001');
assert.equal(newestUnnotifiedNeedsYouAction({ state: 'Waiting for You', actions: [{ id: 'action_old_0001', status: 'open' }] }, { actions: [{ id: 'action_old_0001', status: 'open' }] }), null);
assert.equal(newestUnnotifiedNeedsYouAction({ state: 'Preparing', actions: [{ id: 'action_new_0001', status: 'open' }] }), null);

const deleted = await deleteJobAgentNotificationPreference({ ...config, subject });
assert.equal(deleted.deleted, true);
assert.equal((await readJobAgentNotificationPreference({ ...config, subject })).preference, null);
assert.ok(![...redis.values.keys()].some(key => key.includes('job-agent-notification')));
assert.ok(![...redis.sets.keys()].some(key => key.includes('job-agent-notification')));

console.log('Encrypted notification preference and outbox, exact schema, tenant isolation, opt-in, generic provider payload, leases, retry, dedupe, recovery, and deletion tests passed.');
