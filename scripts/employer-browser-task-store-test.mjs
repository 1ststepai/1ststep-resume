import assert from 'node:assert/strict';
import {
  cancelEmployerBrowserTaskBeforeStart, cancelPendingEmployerBrowserTasksForTenant, claimEmployerBrowserTask, claimNextEmployerBrowserTask, createEmployerBrowserTask, finishEmployerBrowserTask,
  deleteAllEmployerBrowserTasks, listEmployerBrowserTaskSummaries, markNextStaleEmployerBrowserTaskUnknown, readEmployerBrowserTask, reconcileEmployerBrowserTaskCompleted, startEmployerBrowserTask,
} from '../lib/employer-browser-task-store.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async del(key) { return this.values.delete(key) ? 1 : 0; }
  async scan(cursor, { match }) {
    const expression = new RegExp(`^${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')}$`);
    return ['0', [...this.values.keys()].filter(key => expression.test(key))];
  }
  async zadd(key, score, member) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); this.sorted.get(key).set(member, Number(score)); return 1; }
  async zrem(key, member) { return this.sorted.get(key)?.delete(member) ? 1 : 0; }
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
    if (script.includes("record.startedAt ~= ARGV[2]")) {
      if (record.version !== Number(args[0]) || record.status !== 'executing' || record.startedAt !== args[1]) return ['changed'];
      record.version += 1; record.status = 'outcome-unknown'; record.resultEnvelope = JSON.parse(args[2]); record.completedAt = args[3]; record.updatedAt = args[3]; record.leaseTokenHash = ''; record.leaseUntil = '';
      this.values.set(keys[0], JSON.stringify(record)); return ['unknown', JSON.stringify(record)];
    }
    if (script.includes("record.status ~= 'outcome-unknown'")) {
      if (record.version !== Number(args[0]) || record.status !== 'outcome-unknown') return ['changed'];
      record.version += 1; record.status = 'completed'; record.resultEnvelope = JSON.parse(args[1]); record.completedAt = args[2]; record.updatedAt = args[2];
      this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], args[4]); return ['completed', JSON.stringify(record)];
    }
    throw new Error('Unexpected fake Redis script.');
  }
}

const redis = new FakeRedis();
const base = { redis, subject: 'candidate@example.test', partitionSecret: 'p'.repeat(48), dataEncryptionKey: Buffer.alloc(32, 5).toString('base64') };
const input = { sessionId: 'application_fixture_100', fieldSchemaHash: 'a'.repeat(64), stagedFieldKeys: ['email', 'firstName'], idempotencyKey: 'browser_task_fixture_100' };
const created = await createEmployerBrowserTask({ ...base, ...input, now: new Date('2026-08-30T15:00:00.000Z') });
assert.equal(created.task.status, 'queued');
const replay = await createEmployerBrowserTask({ ...base, ...input, now: new Date('2026-08-30T15:00:01.000Z') });
assert.equal(replay.replayed, true);
assert.equal(replay.task.id, created.task.id);
assert.equal(await readEmployerBrowserTask({ ...base, subject: 'other@example.test', taskId: created.task.id }), null);
assert.equal([...redis.values.values()].some(value => String(value).includes('application_fixture_100')), false);

let claimed = await claimNextEmployerBrowserTask({ ...base, now: new Date('2026-08-30T15:00:02.000Z'), leaseSeconds: 20 });
assert.equal(claimed.task.status, 'leased');
assert.equal(await claimEmployerBrowserTask({ ...base, taskId: created.task.id, now: new Date('2026-08-30T15:00:10.000Z') }), null);
const recovered = await claimEmployerBrowserTask({ ...base, taskId: created.task.id, now: new Date('2026-08-30T15:00:23.000Z'), leaseSeconds: 20 });
assert.equal(recovered.task.attempt, 2, 'a task may be re-leased only before execution starts');
const started = await startEmployerBrowserTask({ ...base, taskId: created.task.id, leaseToken: recovered.leaseToken, now: new Date('2026-08-30T15:00:24.000Z'), outcomeTimeoutSeconds: 120 });
assert.equal(started.status, 'executing');
assert.equal(await claimEmployerBrowserTask({ ...base, taskId: created.task.id, now: new Date('2026-08-30T16:00:00.000Z') }), null, 'executing work must never be auto-released');
assert.equal(await markNextStaleEmployerBrowserTaskUnknown({ ...base, now: new Date('2026-08-30T15:02:20.000Z') }), null);
const unknown = await markNextStaleEmployerBrowserTaskUnknown({ ...base, now: new Date('2026-08-30T15:02:25.000Z') });
assert.equal(unknown.task.status, 'outcome-unknown');
assert.equal(unknown.task.result.code, 'EMPLOYER_WORKER_OUTCOME_UNKNOWN');
const reconciled = await reconcileEmployerBrowserTaskCompleted({ ...base, taskId: created.task.id, transmittedFieldKeys: ['email', 'firstName'], now: new Date('2026-08-30T15:02:26.000Z') });
assert.equal(reconciled.status, 'completed');
assert.equal(reconciled.result.code, 'FILLED_WITHOUT_SUBMIT');
assert.equal(await claimEmployerBrowserTask({ ...base, taskId: created.task.id, now: new Date('2026-08-30T17:00:00.000Z') }), null);

const second = await createEmployerBrowserTask({ ...base, ...input, idempotencyKey: 'browser_task_fixture_200', sessionId: 'application_fixture_200', now: new Date('2026-08-30T16:00:00.000Z') });
claimed = await claimEmployerBrowserTask({ ...base, taskId: second.task.id, now: new Date('2026-08-30T16:00:01.000Z') });
await startEmployerBrowserTask({ ...base, taskId: second.task.id, leaseToken: claimed.leaseToken, now: new Date('2026-08-30T16:00:02.000Z') });
await assert.rejects(() => finishEmployerBrowserTask({ ...base, taskId: second.task.id, leaseToken: claimed.leaseToken, status: 'completed', result: { code: 'FILLED_WITHOUT_SUBMIT', transmittedFieldKeys: ['phone'] }, now: new Date('2026-08-30T16:00:03.000Z') }), /scope/);
const completed = await finishEmployerBrowserTask({ ...base, taskId: second.task.id, leaseToken: claimed.leaseToken, status: 'completed', result: { code: 'FILLED_WITHOUT_SUBMIT', transmittedFieldKeys: ['firstName', 'email'] }, now: new Date('2026-08-30T16:00:03.000Z') });
assert.equal(completed.status, 'completed');
assert.deepEqual(completed.result.transmittedFieldKeys, ['email', 'firstName']);
assert.equal(await finishEmployerBrowserTask({ ...base, taskId: second.task.id, leaseToken: claimed.leaseToken, status: 'completed', result: { code: 'FILLED_WITHOUT_SUBMIT', transmittedFieldKeys: ['email', 'firstName'] } }), null);

const cancelledDirect = await createEmployerBrowserTask({ ...base, ...input, idempotencyKey: 'browser_task_cancel_direct', sessionId: 'application_cancel_direct', now: new Date('2026-08-30T16:10:00.000Z') });
const cancelled = await cancelEmployerBrowserTaskBeforeStart({ ...base, taskId: cancelledDirect.task.id, now: new Date('2026-08-30T16:10:01.000Z') });
assert.equal(cancelled.status, 'cancelled');
assert.equal(cancelled.result.code, 'JOB_AGENT_AUTHORIZATION_REVOKED');
assert.equal(cancelled.result.transmittedFieldKeys.length, 0);
assert.equal(await claimEmployerBrowserTask({ ...base, taskId: cancelled.id, now: new Date('2026-08-30T16:10:02.000Z') }), null);

const pendingQueued = await createEmployerBrowserTask({ ...base, ...input, idempotencyKey: 'browser_task_cancel_queued', sessionId: 'application_cancel_queued', now: new Date('2026-08-30T16:11:00.000Z') });
const pendingLeased = await createEmployerBrowserTask({ ...base, ...input, idempotencyKey: 'browser_task_cancel_leased', sessionId: 'application_cancel_leased', now: new Date('2026-08-30T16:11:01.000Z') });
await claimEmployerBrowserTask({ ...base, taskId: pendingLeased.task.id, now: new Date('2026-08-30T16:11:02.000Z') });
const pendingExecuting = await createEmployerBrowserTask({ ...base, ...input, idempotencyKey: 'browser_task_cancel_executing', sessionId: 'application_cancel_executing', now: new Date('2026-08-30T16:11:03.000Z') });
const executingLease = await claimEmployerBrowserTask({ ...base, taskId: pendingExecuting.task.id, now: new Date('2026-08-30T16:11:04.000Z') });
await startEmployerBrowserTask({ ...base, taskId: pendingExecuting.task.id, leaseToken: executingLease.leaseToken, now: new Date('2026-08-30T16:11:05.000Z') });
const tenantCancellation = await cancelPendingEmployerBrowserTasksForTenant({ ...base, tenantId: jobAgentTenantId(base.subject, base.partitionSecret), now: new Date('2026-08-30T16:11:06.000Z') });
assert.equal(tenantCancellation.cancelled, 2);
assert.equal(tenantCancellation.executing, 1);
assert.equal(tenantCancellation.reconciliationRequired, true);
assert.deepEqual(new Set(tenantCancellation.cancelledTaskIds), new Set([pendingQueued.task.id, pendingLeased.task.id]));
assert.deepEqual(tenantCancellation.executingTaskIds, [pendingExecuting.task.id]);
assert.equal((await readEmployerBrowserTask({ ...base, taskId: pendingQueued.task.id })).status, 'cancelled');
assert.equal((await readEmployerBrowserTask({ ...base, taskId: pendingLeased.task.id })).status, 'cancelled');
assert.equal((await readEmployerBrowserTask({ ...base, taskId: pendingExecuting.task.id })).status, 'executing');
const repeatedTenantCancellation = await cancelPendingEmployerBrowserTasksForTenant({ ...base, tenantId: jobAgentTenantId(base.subject, base.partitionSecret), now: new Date('2026-08-30T16:11:07.000Z') });
assert.equal(repeatedTenantCancellation.cancelled, 0);
assert.equal(repeatedTenantCancellation.executing, 1);
assert.equal(repeatedTenantCancellation.reconciliationRequired, true);

const summaries = await listEmployerBrowserTaskSummaries(base);
assert.equal(summaries.length, 6);
assert.equal(summaries.every(item => item.containsCandidateFieldValues === false && !Object.hasOwn(item, 'payload')), true);
assert.equal(JSON.stringify(summaries).includes('candidate@example.test'), false);
assert.deepEqual(await deleteAllEmployerBrowserTasks(base), { deleted: 6 });
assert.equal((await listEmployerBrowserTaskSummaries(base)).length, 0);

console.log('Encrypted tenant-isolated browser task queue, idempotency, pre-start lease recovery, single-use execution, stale outcome-unknown, and exact-scope completion tests passed.');
