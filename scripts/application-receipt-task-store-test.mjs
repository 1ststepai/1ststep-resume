import assert from 'node:assert/strict';
import { cancelPendingApplicationReceiptTasksForTenant, claimNextApplicationReceiptTask, deleteAllApplicationReceiptTasks, finishApplicationReceiptTask, listApplicationReceiptTaskSummaries, prepareApplicationReceiptTaskRecord, readApplicationReceiptTask, readApplicationReceiptTaskQueueHealth, rescheduleApplicationReceiptTask } from '../lib/application-receipt-task-store.js';
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
    const values = [...(this.sorted.get(key) || new Map()).entries()].sort((a, b) => a[1] - b[1]);
    if (options.byScore) return values.filter(([, score]) => score >= Number(start) && score <= Number(stop)).slice(options.offset || 0, (options.offset || 0) + (options.count || values.length)).map(([id]) => id);
    return values.slice(Number(start), Number(stop) < 0 ? undefined : Number(stop) + 1).map(([id]) => id);
  }
  async eval(script, keys, args) {
    const record = JSON.parse(this.values.get(keys[0]) || 'null');
    if (!record) return ['missing'];
    if (script.includes('record.attempt = record.attempt + 1')) {
      if (record.version !== Number(args[0]) || !['queued', 'leased'].includes(record.status)) return ['conflict'];
      record.version += 1; record.status = 'leased'; record.attempt += 1; record.leaseTokenHash = args[1]; record.leaseUntil = args[2]; record.updatedAt = args[3];
      this.values.set(keys[0], JSON.stringify(record)); await this.zadd(keys[1], args[5], args[6]); return ['claimed', JSON.stringify(record)];
    }
    if (script.includes("record.status = 'queued'")) {
      if (record.version !== Number(args[0]) || record.status !== 'leased' || record.leaseTokenHash !== args[1]) return ['lease-lost'];
      record.version += 1; record.status = 'queued'; record.lastOutcomeCode = args[2]; record.nextAttemptAt = args[3]; record.updatedAt = args[4]; record.leaseTokenHash = ''; record.leaseUntil = '';
      this.values.set(keys[0], JSON.stringify(record)); await this.zadd(keys[1], args[6], args[7]); return ['rescheduled', JSON.stringify(record)];
    }
    if (script.includes('record.status = ARGV[3]')) {
      if (record.version !== Number(args[0]) || record.status !== 'leased' || record.leaseTokenHash !== args[1]) return ['lease-lost'];
      record.version += 1; record.status = args[2]; record.lastOutcomeCode = args[3]; record.completedAt = args[4]; record.updatedAt = args[4]; record.leaseTokenHash = ''; record.leaseUntil = '';
      this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], args[6]); return ['finished', JSON.stringify(record)];
    }
    if (script.includes("record.status = 'cancelled'")) {
      if (record.version !== Number(args[0]) || !['queued', 'leased'].includes(record.status)) return ['not-cancellable'];
      record.version += 1; record.status = 'cancelled'; record.lastOutcomeCode = args[1]; record.completedAt = args[2]; record.updatedAt = args[2]; record.leaseTokenHash = ''; record.leaseUntil = '';
      this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], args[4]); return ['cancelled', JSON.stringify(record)];
    }
    throw new Error('Unexpected receipt-task script.');
  }
}

async function storePrepared(redis, prepared) {
  redis.values.set(prepared.keys[0], prepared.args[0]);
  redis.values.set(prepared.keys[1], prepared.taskId);
  await redis.zadd(prepared.keys[2], prepared.args[2], prepared.taskId);
  await redis.zadd(prepared.keys[3], prepared.args[2], prepared.taskId);
}

const redis = new FakeRedis();
const base = { redis, subject: 'candidate@example.test', partitionSecret: 'p'.repeat(48), dataEncryptionKey: Buffer.alloc(32, 8).toString('base64') };
const tenantId = jobAgentTenantId(base.subject, base.partitionSecret);
const input = { tenantId, dataEncryptionKey: base.dataEncryptionKey, sessionId: 'application_receipt_task_001', documentVersion: 'resume-v1', scopeHash: 'a'.repeat(64), responseFingerprint: 'b'.repeat(64), submittedAt: '2026-08-30T18:00:00.000Z', expectedSessionVersion: 4, idempotencyKey: 'receipt_task_fixture_001', now: new Date('2026-08-30T18:00:01.000Z') };
const prepared = prepareApplicationReceiptTaskRecord(input);
await storePrepared(redis, prepared);
assert.equal([...redis.values.values()].some(value => String(value).includes(input.sessionId)), false);
assert.equal((await readApplicationReceiptTask({ ...base, taskId: prepared.taskId })).payload.responseFingerprint, 'b'.repeat(64));
assert.equal(await readApplicationReceiptTask({ ...base, subject: 'other@example.test', taskId: prepared.taskId }), null);
let claimed = await claimNextApplicationReceiptTask({ ...base, now: new Date('2026-08-30T18:00:02.000Z'), leaseSeconds: 20 });
assert.equal(claimed.task.status, 'leased');
assert.equal(await claimNextApplicationReceiptTask({ ...base, now: new Date('2026-08-30T18:00:10.000Z') }), null);
assert.equal((await rescheduleApplicationReceiptTask({ ...base, taskId: prepared.taskId, leaseToken: claimed.leaseToken, reasonCode: 'AUTHORITATIVE_RECEIPT_NOT_YET_AVAILABLE', nextAttemptAt: new Date('2026-08-30T18:02:00.000Z'), now: new Date('2026-08-30T18:00:03.000Z') })).status, 'queued');
assert.equal(await claimNextApplicationReceiptTask({ ...base, now: new Date('2026-08-30T18:01:00.000Z') }), null);
claimed = await claimNextApplicationReceiptTask({ ...base, now: new Date('2026-08-30T18:02:01.000Z') });
assert.equal((await finishApplicationReceiptTask({ ...base, taskId: prepared.taskId, leaseToken: claimed.leaseToken, status: 'completed', reasonCode: 'AUTHORITATIVE_RECEIPT_VERIFIED', now: new Date('2026-08-30T18:02:02.000Z') })).status, 'completed');
const second = prepareApplicationReceiptTaskRecord({ ...input, sessionId: 'application_receipt_task_002', idempotencyKey: 'receipt_task_fixture_002', now: new Date('2026-08-30T18:03:00.000Z') });
await storePrepared(redis, second);
assert.deepEqual(await readApplicationReceiptTaskQueueHealth({ redis, now: new Date('2026-08-30T20:04:00.000Z') }), { status: 'attention-required', pending: 1, overdue: 1, staleAfterSeconds: 7200, contentFree: true, containsReceiptEvidence: false });
assert.deepEqual(await cancelPendingApplicationReceiptTasksForTenant({ ...base, tenantId, now: new Date('2026-08-30T18:03:01.000Z') }), { cancelled: 1 });
const summaries = await listApplicationReceiptTaskSummaries(base);
assert.equal(summaries.length, 2);
assert.equal(summaries.every(item => item.containsCandidateValues === false && item.containsReceiptEvidence === false), true);
assert.equal(JSON.stringify(summaries).includes(input.responseFingerprint), false);
assert.deepEqual(await deleteAllApplicationReceiptTasks(base), { deleted: 2 });
assert.equal((await readApplicationReceiptTaskQueueHealth({ redis })).status, 'idle');

console.log('Encrypted tenant-isolated receipt task queue, lease recovery, bounded rescheduling, redacted export, cancellation, and deletion tests passed.');
