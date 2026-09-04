import assert from 'node:assert/strict';
import {
  claimNextJobAgentSchedule, completeJobAgentSchedule, deleteJobAgentSchedule, jobAgentScheduleConfiguration,
  pauseJobAgentScheduleForTenant, processNextJobAgentSchedule, readJobAgentSchedule, saveJobAgentSchedule,
} from '../lib/job-agent-schedule-store.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async set(key, value) { this.values.set(key, value); return 'OK'; }
  async del(key) { const existed = this.values.delete(key); this.sorted.delete(key); return existed ? 1 : 0; }
  async incr(key) { const next = Number(this.values.get(key) || 0) + 1; this.values.set(key, String(next)); return next; }
  async expire() { return 1; }
  async zrem(key, member) { return this.sorted.get(key)?.delete(member) ? 1 : 0; }
  async zrange(key, start, stop, options = {}) {
    const entries = [...(this.sorted.get(key) || new Map()).entries()].sort((a, b) => a[1] - b[1]);
    if (options.byScore) return entries.filter(([, score]) => score >= Number(start) && score <= Number(stop)).slice(options.offset || 0, (options.offset || 0) + (options.count || entries.length)).map(([member]) => member);
    const end = stop < 0 ? entries.length : stop + 1;
    return entries.slice(start, end).map(([member]) => member);
  }
  zadd(key, score, member) { const set = this.sorted.get(key) || new Map(); set.set(member, Number(score)); this.sorted.set(key, set); }
  async eval(script, keys, args) {
    if (script.includes("ARGV[7] == 'active'")) {
      const replay = this.values.get(keys[2]);
      if (replay) return ['replayed', replay];
      const currentRaw = this.values.get(keys[0]);
      const current = currentRaw ? Number(JSON.parse(currentRaw).version) || 0 : 0;
      if (current !== Number(args[0])) return ['conflict', String(current)];
      this.values.set(keys[0], args[2]); this.values.set(keys[2], args[1]);
      await this.zrem(keys[1], args[3]);
      if (args[6] === 'active') this.zadd(keys[1], args[7], args[3]);
      return ['saved', args[1]];
    }
    if (script.includes("return {'claimed', cjson.encode(record)}") && script.includes('record.leaseTokenHash = ARGV[3]')) {
      const raw = this.values.get(keys[0]);
      if (!raw) return ['missing'];
      const record = JSON.parse(raw);
      if (record.version !== Number(args[0]) || record.status !== 'active') return ['not_claimable'];
      record.version += 1; record.leaseTokenHash = args[2]; record.leaseUntil = args[3]; record.updatedAt = args[1];
      this.values.set(keys[0], JSON.stringify(record)); this.zadd(keys[1], args[5], args[6]);
      return ['claimed', JSON.stringify(record)];
    }
    if (script.includes('record.lastRunAt = ARGV[2]')) {
      const record = JSON.parse(this.values.get(keys[0]));
      if (record.leaseTokenHash !== args[0]) return ['lease_lost'];
      record.version += 1; record.lastRunAt = args[1]; record.lastRunId = args[2]; record.lastResult = args[3]; record.nextRunAt = args[4]; record.leaseTokenHash = ''; record.leaseUntil = ''; record.updatedAt = args[1];
      this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], args[6]);
      if (record.status === 'active') this.zadd(keys[1], args[7], args[6]);
      return ['updated', JSON.stringify(record)];
    }
    if (script.includes("record.status = 'paused'") && script.includes("return {'paused', cjson.encode(record)}")) {
      const raw = this.values.get(keys[0]);
      if (!raw) return ['missing'];
      const record = JSON.parse(raw);
      record.version += 1; record.status = 'paused'; record.leaseTokenHash = ''; record.leaseUntil = ''; record.updatedAt = args[0];
      this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], args[2]);
      return ['paused', JSON.stringify(record)];
    }
    if (script.includes("return {'created', ARGV[2]}") && script.includes('ZADD')) {
      const replay = this.values.get(keys[1]);
      if (replay) return ['replayed', replay];
      this.values.set(keys[0], args[0]); this.values.set(keys[1], args[1]); this.zadd(keys[2], args[2], args[1]); this.zadd(keys[3], args[2], args[1]);
      return ['created', args[1]];
    }
    throw new Error('Unexpected schedule fixture script.');
  }
}

const redis = new FakeRedis();
const config = { redis, partitionSecret: 'schedule-partition-secret'.padEnd(48, 'x'), dataEncryptionKey: Buffer.alloc(32, 8).toString('base64') };
const mission = { role: 'Procurement Manager', roleFamily: 'procurement', workModes: ['Remote'], employmentTypes: ['Full-time'], salaryMin: 100000, location: 'United States', target: 10 };
const start = new Date('2026-08-29T12:00:00.000Z');

assert.deepEqual(jobAgentScheduleConfiguration({}), { enabled: false, reason: 'disabled', globalDailyRuns: 0 });
assert.deepEqual(jobAgentScheduleConfiguration({ JOB_AGENT_SCHEDULE_ENABLED: 'true' }), { enabled: false, reason: 'budget-not-configured', globalDailyRuns: 0 });
assert.equal(jobAgentScheduleConfiguration({ JOB_AGENT_SCHEDULE_ENABLED: 'true', JOB_AGENT_SCHEDULE_GLOBAL_DAILY_RUNS: '5' }).enabled, true);

const saved = await saveJobAgentSchedule({ ...config, subject: 'candidate@example.test', mission, expectedVersion: 0, idempotencyKey: 'schedule_create_0001', now: start });
assert.equal(saved.schedule.status, 'active');
assert.equal(saved.schedule.cadence, 'daily');
assert.equal(saved.schedule.mission.role, 'Procurement Manager');
assert.equal(saved.schedule.nextRunAt, '2026-08-30T12:00:00.000Z');
assert.ok(![...redis.values.values()].some(value => String(value).includes('candidate@example.test')));
assert.ok(![...redis.values.values()].some(value => String(value).includes('Procurement Manager')));
assert.equal((await readJobAgentSchedule({ ...config, subject: 'other@example.test' })).schedule, null);
const conflict = await saveJobAgentSchedule({ ...config, subject: 'candidate@example.test', mission, expectedVersion: 0, idempotencyKey: 'schedule_conflict_0002', now: start });
assert.equal(conflict.conflict, true);

const claimed = await claimNextJobAgentSchedule({ ...config, now: new Date('2026-08-30T12:01:00.000Z') });
assert.equal(claimed.schedule.mission.role, 'Procurement Manager');
const completed = await completeJobAgentSchedule({ ...config, tenantId: claimed.tenantId, leaseToken: claimed.leaseToken, runId: 'run_schedule_fixture', now: new Date('2026-08-30T12:02:00.000Z') });
assert.equal(completed.lastRunId, 'run_schedule_fixture');
assert.equal(completed.nextRunAt, '2026-08-31T12:02:00.000Z');

await saveJobAgentSchedule({ ...config, subject: 'second@example.test', mission: { ...mission, role: 'Sourcing Manager' }, expectedVersion: 0, idempotencyKey: 'schedule_second_0001', now: start });
const processed = await processNextJobAgentSchedule({ ...config, env: { JOB_AGENT_SCHEDULE_ENABLED: 'true', JOB_AGENT_SCHEDULE_GLOBAL_DAILY_RUNS: '1' }, now: new Date('2026-08-31T12:03:00.000Z') });
assert.equal(processed.status, 'enqueued');
assert.match(processed.runId, /^run_/);
const deferred = await processNextJobAgentSchedule({ ...config, env: { JOB_AGENT_SCHEDULE_ENABLED: 'true', JOB_AGENT_SCHEDULE_GLOBAL_DAILY_RUNS: '1' }, now: new Date('2026-08-31T12:03:01.000Z') });
assert.equal(deferred.status, 'deferred');
assert.equal(deferred.reason, 'GLOBAL_DAILY_SCHEDULE_BUDGET');

await saveJobAgentSchedule({ ...config, subject: 'pause@example.test', mission, expectedVersion: 0, idempotencyKey: 'schedule_pause_0001', now: start });
const pauseClaim = await claimNextJobAgentSchedule({ ...config, now: new Date('2026-08-31T12:04:00.000Z') });
const paused = await pauseJobAgentScheduleForTenant({ ...config, tenantId: pauseClaim.tenantId, now: new Date('2026-08-31T12:04:01.000Z') });
assert.equal(paused.status, 'paused');
assert.equal(await completeJobAgentSchedule({ ...config, tenantId: pauseClaim.tenantId, leaseToken: pauseClaim.leaseToken, runId: 'must_not_commit', now: new Date('2026-08-31T12:04:02.000Z') }), null);

await deleteJobAgentSchedule({ ...config, subject: 'candidate@example.test' });
assert.equal((await readJobAgentSchedule({ ...config, subject: 'candidate@example.test' })).schedule, null);

console.log('Encrypted tenant-isolated daily schedule, lease recovery, idempotency, consent hook, and global budget tests passed.');
