import assert from 'node:assert/strict';
import { cancelApplicationSubmissionTaskBeforeStart, cancelPendingApplicationSubmissionTasksForTenant, claimNextApplicationSubmissionTask, createApplicationSubmissionTask, deleteAllApplicationSubmissionTasks, deleteApplicationSubmissionTask, finishApplicationSubmissionTask, listApplicationSubmissionTaskSummaries, markNextStaleApplicationSubmissionTaskUnknown, readApplicationSubmissionTask, readApplicationSubmissionTaskQueueHealth, startApplicationSubmissionTask } from '../lib/application-submission-task-store.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async del(key) { return this.values.delete(key) ? 1 : 0; }
  async scan(_cursor, { match }) { const pattern = new RegExp(`^${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')}$`); return ['0', [...this.values.keys()].filter(key => pattern.test(key))]; }
  async zadd(key, score, member) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); this.sorted.get(key).set(member, Number(score)); return 1; }
  async zrem(key, member) { return this.sorted.get(key)?.delete(member) ? 1 : 0; }
  async zcard(key) { return (this.sorted.get(key) || new Map()).size; }
  async zcount(key, min, max) { return [...(this.sorted.get(key) || new Map()).values()].filter(score => score >= Number(min) && score <= Number(max)).length; }
  async zrange(key, start, stop, options = {}) {
    const entries = [...(this.sorted.get(key) || new Map()).entries()].sort((a, b) => a[1] - b[1]);
    if (options.byScore) return entries.filter(([, score]) => score >= Number(start) && score <= Number(stop)).slice(options.offset || 0, (options.offset || 0) + (options.count || entries.length)).map(([member]) => member);
    return entries.slice(Number(start), Number(stop) < 0 ? undefined : Number(stop) + 1).map(([member]) => member);
  }
  async eval(script, keys, args) {
    if (script.includes("local replay = redis.call('GET', KEYS[2])")) {
      const replay = this.values.get(keys[1]); if (replay) return ['replayed', replay];
      this.values.set(keys[0], args[0]); this.values.set(keys[1], args[1]); await this.zadd(keys[2], args[2], args[1]); await this.zadd(keys[3], args[2], args[1]); return ['created', args[1]];
    }
    const record = JSON.parse(this.values.get(keys[0]) || 'null');
    if (!record) return ['missing'];
    if (script.includes("record.status = 'cancelled'")) {
      if (record.version !== Number(args[0]) || !['queued', 'leased'].includes(record.status)) return ['not-cancellable', record.status];
      record.version += 1; record.status = 'cancelled'; record.resultEnvelope = JSON.parse(args[1]); record.completedAt = args[2]; record.updatedAt = args[2]; record.leaseTokenHash = ''; record.leaseUntil = '';
      this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], args[4]); await this.zrem(keys[2], args[4]); return ['cancelled', JSON.stringify(record)];
    }
    if (script.includes("record.status ~= 'queued' and record.status ~= 'leased'")) {
      if (record.version !== Number(args[0]) || !['queued', 'leased'].includes(record.status)) return ['conflict'];
      record.version += 1; record.status = 'leased'; record.attempt += 1; record.leaseTokenHash = args[1]; record.leaseUntil = args[2]; record.updatedAt = args[3];
      this.values.set(keys[0], JSON.stringify(record)); await this.zadd(keys[1], args[5], args[6]); return ['claimed', JSON.stringify(record)];
    }
    if (script.includes("record.status ~= 'leased'")) {
      if (record.version !== Number(args[0]) || record.status !== 'leased' || record.leaseTokenHash !== args[1]) return ['lease-lost'];
      record.version += 1; record.status = 'executing'; record.startedAt = args[2]; record.updatedAt = args[2]; record.leaseUntil = '';
      this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], args[4]); await this.zadd(keys[2], args[5], args[4]); return ['started', JSON.stringify(record)];
    }
    if (script.includes("record.status ~= 'executing' or record.leaseTokenHash")) {
      if (record.version !== Number(args[0]) || record.status !== 'executing' || record.leaseTokenHash !== args[1]) return ['lease-lost'];
      record.version += 1; record.status = args[2]; record.resultEnvelope = JSON.parse(args[3]); record.completedAt = args[4]; record.updatedAt = args[4]; record.leaseTokenHash = ''; record.leaseUntil = '';
      this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], args[6]); await this.zrem(keys[2], args[6]); return ['finished', JSON.stringify(record)];
    }
    if (script.includes('record.startedAt ~= ARGV[2]')) {
      if (record.version !== Number(args[0]) || record.status !== 'executing' || record.startedAt !== args[1]) return ['changed'];
      record.version += 1; record.status = 'outcome-unknown'; record.resultEnvelope = JSON.parse(args[2]); record.completedAt = args[3]; record.updatedAt = args[3]; record.leaseTokenHash = '';
      this.values.set(keys[0], JSON.stringify(record)); return ['unknown', JSON.stringify(record)];
    }
    throw new Error('Unexpected fake Redis script.');
  }
}

const redis = new FakeRedis();
const base = { redis, subject: 'candidate@example.test', partitionSecret: 'p'.repeat(48), dataEncryptionKey: Buffer.alloc(32, 7).toString('base64') };
const input = { sessionId: 'application_submission_queue_1', scopeHash: 'a'.repeat(64), documentVersion: 'resume-v1', fieldSchemaHash: 'b'.repeat(64), idempotencyKey: 'submission_queue_fixture_1' };
const created = await createApplicationSubmissionTask({ ...base, ...input, now: new Date('2026-08-30T23:00:00.000Z') });
assert.equal(created.task.status, 'queued');
assert.equal((await createApplicationSubmissionTask({ ...base, ...input, now: new Date('2026-08-30T23:00:01.000Z') })).replayed, true);
assert.equal(await readApplicationSubmissionTask({ ...base, subject: 'other@example.test', taskId: created.task.id }), null);
assert.equal([...redis.values.values()].some(value => String(value).includes(input.sessionId)), false);
let claimed = await claimNextApplicationSubmissionTask({ ...base, now: new Date('2026-08-30T23:00:02.000Z'), leaseSeconds: 20 });
assert.equal(claimed.task.status, 'leased');
assert.equal(await claimNextApplicationSubmissionTask({ ...base, now: new Date('2026-08-30T23:00:10.000Z') }), null);
claimed = await claimNextApplicationSubmissionTask({ ...base, now: new Date('2026-08-30T23:00:23.000Z'), leaseSeconds: 20 });
assert.equal(claimed.task.attempt, 2);
assert.equal((await startApplicationSubmissionTask({ ...base, taskId: created.task.id, leaseToken: claimed.leaseToken, now: new Date('2026-08-30T23:00:24.000Z'), outcomeTimeoutSeconds: 60 })).status, 'executing');
assert.equal(await claimNextApplicationSubmissionTask({ ...base, now: new Date('2026-08-31T01:00:00.000Z') }), null, 'started submission tasks must never be re-leased');
const unknown = await markNextStaleApplicationSubmissionTaskUnknown({ ...base, now: new Date('2026-08-30T23:01:25.000Z') });
assert.equal(unknown.task.status, 'outcome-unknown');
assert.equal(unknown.task.result.code, 'SUBMISSION_PROVIDER_OUTCOME_UNKNOWN');

const second = await createApplicationSubmissionTask({ ...base, ...input, sessionId: 'application_submission_queue_2', idempotencyKey: 'submission_queue_fixture_2', now: new Date('2026-08-31T00:00:00.000Z') });
claimed = await claimNextApplicationSubmissionTask({ ...base, now: new Date('2026-08-31T00:00:01.000Z') });
await startApplicationSubmissionTask({ ...base, taskId: second.task.id, leaseToken: claimed.leaseToken, now: new Date('2026-08-31T00:00:02.000Z') });
assert.deepEqual(await readApplicationSubmissionTaskQueueHealth({ redis, now: new Date('2026-08-31T00:04:00.000Z') }), { status: 'attention-required', pending: 0, overdue: 0, reconciliationPending: 2, reconciliationDue: 2, staleAfterSeconds: 7200, contentFree: true });
await assert.rejects(() => deleteApplicationSubmissionTask({ ...base, taskId: second.task.id }), error => error?.code === 'SUBMISSION_TASK_RECONCILIATION_REQUIRED');
await assert.rejects(() => finishApplicationSubmissionTask({ ...base, taskId: second.task.id, leaseToken: claimed.leaseToken, status: 'completed', result: { code: 'SUBMISSION_ATTEMPT_RECORDED' } }), /minimized attempt evidence/);
const completed = await finishApplicationSubmissionTask({ ...base, taskId: second.task.id, leaseToken: claimed.leaseToken, status: 'completed', result: { code: 'SUBMISSION_ATTEMPT_RECORDED', submittedAt: '2026-08-31T00:00:03.000Z', responseFingerprint: 'c'.repeat(64) }, now: new Date('2026-08-31T00:00:04.000Z') });
assert.equal(completed.status, 'completed');
assert.equal(completed.result.responseFingerprint, 'c'.repeat(64));

const queued = await createApplicationSubmissionTask({ ...base, ...input, sessionId: 'application_submission_queue_3', idempotencyKey: 'submission_queue_fixture_3', now: new Date('2026-08-31T00:10:00.000Z') });
assert.equal((await cancelApplicationSubmissionTaskBeforeStart({ ...base, taskId: queued.task.id, now: new Date('2026-08-31T00:10:01.000Z') })).status, 'cancelled');
assert.equal(await deleteApplicationSubmissionTask({ ...base, taskId: queued.task.id }), true);
assert.equal(await readApplicationSubmissionTask({ ...base, taskId: queued.task.id }), null);
const tenantCancellation = await cancelPendingApplicationSubmissionTasksForTenant({ ...base, tenantId: jobAgentTenantId(base.subject, base.partitionSecret), now: new Date('2026-08-31T00:10:02.000Z') });
assert.equal(tenantCancellation.executing, 0);
const summaries = await listApplicationSubmissionTaskSummaries(base);
assert.equal(summaries.length, 2);
assert.equal(summaries.every(item => item.containsCandidateFieldValues === false && item.containsReceiptEvidence === false && !Object.hasOwn(item, 'payload')), true);
assert.equal(JSON.stringify(summaries).includes(base.subject), false);
assert.deepEqual(await deleteAllApplicationSubmissionTasks(base), { deleted: 2 });
assert.equal((await listApplicationSubmissionTaskSummaries(base)).length, 0);
assert.equal((await readApplicationSubmissionTaskQueueHealth({ redis })).status, 'idle');

console.log('Encrypted tenant-isolated submission queue, idempotency, pre-start lease recovery, single-use execution, cancellation, and stale outcome-unknown tests passed.');
