import assert from 'node:assert/strict';
import { createApplicationSession, recordPostSubmissionOutcome } from '../lib/application-session-domain.js';
import { createDurableApplicationSession, deleteDurableApplicationSession, updateDurableApplicationSession } from '../lib/application-session-store.js';
import { deleteAllApplicationFollowUpRemindersForTenant, prepareApplicationFollowUpReminderReservation, processNextApplicationFollowUpReminder } from '../lib/application-follow-up-store.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async del(...keys) { let count = 0; for (const key of keys) { if (this.values.delete(key)) count += 1; this.sorted.delete(key); } return count; }
  async zadd(key, scoreOrEntry, member) {
    const score = typeof scoreOrEntry === 'object' ? Number(scoreOrEntry.score) : Number(scoreOrEntry);
    const value = typeof scoreOrEntry === 'object' ? scoreOrEntry.member : member;
    const set = this.sorted.get(key) || new Map(); set.set(value, score); this.sorted.set(key, set); return 1;
  }
  async zrem(key, member) { return this.sorted.get(key)?.delete(member) ? 1 : 0; }
  async zrange(key, start, end, options = {}) {
    const entries = [...(this.sorted.get(key) || new Map()).entries()].sort((a, b) => options.rev ? b[1] - a[1] : a[1] - b[1]);
    if (options.byScore) return entries.filter(([, score]) => score >= Number(start) && score <= Number(end)).slice(options.offset || 0, (options.offset || 0) + (options.count || entries.length)).map(([id]) => id);
    return entries.slice(start, end < 0 ? undefined : end + 1).map(([id]) => id);
  }
  async eval(script, keys, args) {
    if (script.includes("local replay = redis.call('GET', KEYS[2])") && script.includes("return {'created'")) {
      const replay = this.values.get(keys[1]); if (replay) return ['replayed', replay];
      this.values.set(keys[0], args[0]); this.values.set(keys[1], args[1]); await this.zadd(keys[2], args[4], args[1]);
      this.values.set(keys[3], args[5]); await this.zadd(keys[4], args[4], args[6]); return ['created', args[1]];
    }
    if (script.includes('record.auditHeadHash = ARGV[8]')) {
      const record = JSON.parse(this.values.get(keys[0]) || 'null'); if (!record) return ['missing'];
      if (record.tenantId !== args[0] || record.version !== Number(args[1])) return ['conflict', String(record?.version || 0)];
      record.version += 1; record.updatedAt = args[2]; record.envelope = JSON.parse(args[3]); record.auditHeadHash = args[7]; record.auditCount = Number(args[8]); record.auditHeadSignature = args[13];
      this.values.set(keys[0], JSON.stringify(record)); await this.zadd(keys[1], args[5], args[6]); this.values.set(keys[2], args[9]); await this.zadd(keys[3], args[5], args[12]);
      if (args[19] === 'schedule') { this.values.set(keys[4], args[20]); await this.zadd(keys[5], args[22], keys[4]); await this.zadd(keys[6], args[22], keys[4]); }
      if (args[19] === 'remove') { this.values.delete(keys[4]); await this.zrem(keys[5], keys[4]); await this.zrem(keys[6], keys[4]); }
      return ['updated', JSON.stringify(record)];
    }
    if (script.includes("record.status = 'leased'")) {
      const record = JSON.parse(this.values.get(keys[0]) || 'null'); if (!record) return ['missing'];
      const eligible = ['scheduled', 'retry'].includes(record.status) || (record.status === 'leased' && record.leaseUntil <= args[6]);
      if (record.version !== Number(args[0]) || !eligible) return ['not_claimable'];
      record.version += 1; record.status = 'leased'; record.attempt += 1; record.leaseTokenHash = args[1]; record.leaseUntil = args[2]; record.updatedAt = args[3];
      this.values.set(keys[0], JSON.stringify(record)); await this.zadd(keys[1], args[5], keys[0]); return ['claimed', JSON.stringify(record)];
    }
    if (script.includes("record.status = ARGV[2]") && script.includes("record.nextAttemptAt = ARGV[3]")) {
      const record = JSON.parse(this.values.get(keys[0]) || 'null'); if (!record || record.leaseTokenHash !== args[0]) return ['lease_lost'];
      record.version += 1; record.status = args[1]; record.nextAttemptAt = args[2]; record.leaseTokenHash = ''; record.leaseUntil = ''; record.updatedAt = args[3];
      this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], keys[0]); if (record.status === 'retry') await this.zadd(keys[1], args[5], keys[0]); return [record.status, JSON.stringify(record)];
    }
    if (script.includes("record.status = ARGV[2]")) {
      const record = JSON.parse(this.values.get(keys[0]) || 'null'); if (!record || record.leaseTokenHash !== args[0]) return ['lease_lost'];
      record.version += 1; record.status = args[1]; record.leaseTokenHash = ''; record.leaseUntil = ''; record.updatedAt = args[2];
      this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], keys[0]); return [record.status, JSON.stringify(record)];
    }
    throw new Error('Unexpected follow-up fixture script.');
  }
}

const redis = new FakeRedis();
const subject = 'candidate@example.test';
const config = { redis, subject, partitionSecret: 'follow-up-partition-secret'.padEnd(48, 'x'), dataEncryptionKey: Buffer.alloc(32, 19).toString('base64'), auditSigningSecret: 'follow-up-audit-secret'.padEnd(48, 'x') };
const tenantId = jobAgentTenantId(subject, config.partitionSecret);
const packageInput = { packageRunId: 'run_follow_up_fixture', packageQaVerified: true, documentVersion: 'resume-v1', employer: 'Private Employer', title: 'Private Role', requisitionId: 'REQ-FOLLOW-1', directEmployerUrl: 'https://careers.example.test/jobs/REQ-FOLLOW-1', proposedFields: [] };
const base = createApplicationSession(packageInput, new Date('2026-08-30T12:00:00.000Z'));
const receiptVerified = { ...base, state: 'Finished', stage: 'receipt_verification', actions: [], receipt: { authority: 'employer-side', receivedAt: '2026-08-30T12:30:00.000Z', verifiedAt: '2026-08-30T12:31:00.000Z' } };
const created = await createDurableApplicationSession({ ...config, session: receiptVerified, idempotencyKey: 'application_follow_up_create', now: new Date('2026-08-30T12:31:00.000Z') });

const dueAt = '2026-09-06T12:31:00.000Z';
const scheduled = recordPostSubmissionOutcome(receiptVerified, { outcome: 'FOLLOW_UP_SCHEDULED', dueAt, confirmed: true }, new Date('2026-08-30T12:32:00.000Z'));
const reservation = prepareApplicationFollowUpReminderReservation({ tenantId, subject, sessionId: scheduled.id, dueAt, recordVersion: created.session.version + 1, dataEncryptionKey: config.dataEncryptionKey, now: new Date('2026-08-30T12:32:00.000Z') });
assert.equal(reservation.mode, 'schedule');
assert.doesNotMatch(JSON.stringify(reservation.record), /candidate@example|Private Employer|Private Role|REQ-FOLLOW/);
const saved = await updateDurableApplicationSession({ ...config, sessionId: scheduled.id, expectedVersion: created.session.version, session: scheduled, followUpReminderReservation: reservation, now: new Date('2026-08-30T12:32:00.000Z') });
assert.equal(saved.postSubmission.followUp.status, 'SCHEDULED');
assert.ok([...redis.values.keys()].some(key => key.startsWith('1ststep:application-follow-up:v1:tenant:')));
assert.ok(![...redis.values.values()].some(value => String(value).includes(subject)));

assert.equal((await processNextApplicationFollowUpReminder({ ...config, env: {}, now: new Date('2026-09-06T12:31:00.000Z') })).status, 'not-configured', 'disabled notification configuration must not claim a reminder');
let queuedInput = null;
const env = { JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED: 'true', RESEND_API_KEY: 're_follow_up_fixture_key'.padEnd(32, 'x'), RESEND_FROM: '1stStep <alerts@1ststep.ai>', RESEND_WEBHOOK_SECRET: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS: '365' };
const processed = await processNextApplicationFollowUpReminder({
  ...config, env, now: new Date('2026-09-06T12:31:00.000Z'),
  enqueueNotification: async input => { queuedInput = input; return { status: 'queued' }; },
});
assert.equal(processed.status, 'enqueued');
assert.equal(processed.containsEmployerData, false);
assert.equal(queuedInput.subject, subject);
assert.equal(queuedInput.actionId, `follow_up_${scheduled.id}`);
assert.doesNotMatch(JSON.stringify(queuedInput), /Private Employer|Private Role|REQ-FOLLOW/);

const rescheduledDueAt = '2026-09-13T12:31:00.000Z';
const { version, audit: _audit, ...savedSession } = saved;
const rescheduled = recordPostSubmissionOutcome(savedSession, { outcome: 'FOLLOW_UP_SCHEDULED', dueAt: rescheduledDueAt, confirmed: true }, new Date('2026-09-06T12:32:00.000Z'));
const rescheduleReservation = prepareApplicationFollowUpReminderReservation({ tenantId, subject, sessionId: rescheduled.id, dueAt: rescheduledDueAt, recordVersion: version + 1, dataEncryptionKey: config.dataEncryptionKey, now: new Date('2026-09-06T12:32:00.000Z') });
const savedAgain = await updateDurableApplicationSession({ ...config, sessionId: rescheduled.id, expectedVersion: version, session: rescheduled, followUpReminderReservation: rescheduleReservation, now: new Date('2026-09-06T12:32:00.000Z') });
assert.equal(savedAgain.postSubmission.followUp.dueAt, rescheduledDueAt);
const { version: rescheduledVersion, audit: _rescheduledAudit, ...rescheduledSession } = savedAgain;
const completed = recordPostSubmissionOutcome(rescheduledSession, { outcome: 'FOLLOW_UP_COMPLETED', confirmed: true }, new Date('2026-09-13T12:32:00.000Z'));
const removeReservation = prepareApplicationFollowUpReminderReservation({ tenantId, subject, sessionId: completed.id, dueAt: null, recordVersion: rescheduledVersion + 1, dataEncryptionKey: config.dataEncryptionKey, now: new Date('2026-09-13T12:32:00.000Z') });
const completedSaved = await updateDurableApplicationSession({ ...config, sessionId: completed.id, expectedVersion: rescheduledVersion, session: completed, followUpReminderReservation: removeReservation, now: new Date('2026-09-13T12:32:00.000Z') });
assert.equal(completedSaved.postSubmission.followUp.status, 'COMPLETED');
assert.ok(![...redis.values.keys()].some(key => key.startsWith('1ststep:application-follow-up:v1:tenant:')));
const { version: completedVersion, audit: _completedAudit, ...completedSession } = completedSaved;
const finalDueAt = '2026-09-20T12:32:00.000Z';
const finalSchedule = recordPostSubmissionOutcome(completedSession, { outcome: 'FOLLOW_UP_SCHEDULED', dueAt: finalDueAt, confirmed: true }, new Date('2026-09-13T12:33:00.000Z'));
const finalReservation = prepareApplicationFollowUpReminderReservation({ tenantId, subject, sessionId: finalSchedule.id, dueAt: finalDueAt, recordVersion: completedVersion + 1, dataEncryptionKey: config.dataEncryptionKey, now: new Date('2026-09-13T12:33:00.000Z') });
await updateDurableApplicationSession({ ...config, sessionId: finalSchedule.id, expectedVersion: completedVersion, session: finalSchedule, followUpReminderReservation: finalReservation, now: new Date('2026-09-13T12:33:00.000Z') });
assert.equal(await deleteDurableApplicationSession({ ...config, sessionId: scheduled.id }), true);
assert.ok(![...redis.values.keys()].some(key => key.startsWith('1ststep:application-follow-up:v1:tenant:')));
assert.equal([...(redis.sorted.get('1ststep:application-follow-up:v1:due') || [])].length, 0);

const orphanKey = `1ststep:application-follow-up:v1:tenant:${tenantId}:session:${'a'.repeat(64)}`;
const otherTenantId = 'b'.repeat(40);
const otherKey = `1ststep:application-follow-up:v1:tenant:${otherTenantId}:session:${'c'.repeat(64)}`;
redis.values.set(orphanKey, JSON.stringify({ tenantId }));
redis.values.set(otherKey, JSON.stringify({ tenantId: otherTenantId }));
await redis.zadd(`1ststep:application-follow-up:v1:tenant:${tenantId}:reminders`, 1, orphanKey);
await redis.zadd(`1ststep:application-follow-up:v1:tenant:${otherTenantId}:reminders`, 1, otherKey);
await redis.zadd('1ststep:application-follow-up:v1:due', 1, orphanKey);
await redis.zadd('1ststep:application-follow-up:v1:due', 1, otherKey);
assert.deepEqual(await deleteAllApplicationFollowUpRemindersForTenant({ redis, tenantId }), { deleted: 1 });
assert.equal(redis.values.has(orphanKey), false);
assert.equal(redis.values.has(otherKey), true);
assert.deepEqual(await redis.zrange(`1ststep:application-follow-up:v1:tenant:${tenantId}:reminders`, 0, -1), []);
assert.deepEqual(await redis.zrange(`1ststep:application-follow-up:v1:tenant:${otherTenantId}:reminders`, 0, -1), [otherKey]);
assert.deepEqual(await redis.zrange('1ststep:application-follow-up:v1:due', 0, -1), [otherKey]);

console.log('Atomic encrypted follow-up scheduling, tenant opacity, due processing, generic notification handoff, rescheduling, and deletion tests passed.');
