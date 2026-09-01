import assert from 'node:assert/strict';
import {
  claimJobAgentRun, createJobAgentRun, deleteAllJobAgentRuns, failJobAgentRun, finishJobAgentRun, heartbeatJobAgentRun,
  listJobAgentRuns, readJobAgentRun, retryDelaySeconds, setJobAgentRunStatus, validateJobAgentMission,
} from '../lib/job-agent-run-store.js';
import { executeClaimedJobAgentRun } from '../lib/job-agent-worker.js';
import { readRequestedJobAgentRun } from '../api/job-agent-runs.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async set(key, value) { this.values.set(key, value); return 'OK'; }
  async del(key) { return this.values.delete(key) ? 1 : 0; }
  async zadd(key, score, member) { this.#zset(key).set(member, Number(score)); return 1; }
  async zrem(key, member) { return this.#zset(key).delete(member) ? 1 : 0; }
  async zrange(key, min, max, options = {}) {
    const entries = [...this.#zset(key)].sort((a, b) => options.rev ? b[1] - a[1] : a[1] - b[1]);
    if (options.byScore) return entries.filter(([, score]) => score >= Number(min) && score <= Number(max)).map(([member]) => member);
    return entries.slice(Number(min), Number(max) < 0 ? undefined : Number(max) + 1).map(([member]) => member);
  }
  #zset(key) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); return this.sorted.get(key); }
  async eval(script, keys, args) {
    if (script.includes("local replay = redis.call('GET', KEYS[2])")) {
      const replay = this.values.get(keys[1]);
      if (replay) return ['replayed', replay];
      this.values.set(keys[0], args[0]); this.values.set(keys[1], args[1]);
      await this.zadd(keys[2], args[2], args[1]); await this.zadd(keys[3], args[2], args[1]);
      return ['created', args[1]];
    }
    const raw = this.values.get(keys[0]);
    if (!raw) return ['missing'];
    const record = JSON.parse(raw);
    if (record.version !== Number(args[0])) return ['conflict', String(record.version)];
    if (script.includes("record.status ~= 'Searching'")) {
      if (!['Searching', 'Preparing'].includes(record.status)) return ['not_claimable', record.status];
      record.status = 'Searching'; record.version += 1; record.attempt += 1; record.leaseTokenHash = args[1];
      record.leaseUntil = args[2]; record.updatedAt = args[3]; this.values.set(keys[0], JSON.stringify(record));
      await this.zadd(keys[1], args[6], args[5]); return ['claimed', JSON.stringify(record)];
    }
    if (script.includes('record.leaseTokenHash ~= ARGV[2]')) {
      if (record.leaseTokenHash !== args[1]) return ['lease_lost'];
      record.version += 1; record.status = args[2]; record.updatedAt = args[3]; record.leaseUntil = args[4];
      record.leaseTokenHash = args[5]; record.resultEnvelope = JSON.parse(args[6]); record.lastErrorCode = args[7];
      record.nextAttemptAt = args[8]; this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], args[12]);
      if (args[10] === 'enqueue') await this.zadd(keys[1], args[11], args[12]);
      return ['updated', JSON.stringify(record)];
    }
    record.version += 1; record.status = args[1]; record.updatedAt = args[2]; record.nextAttemptAt = args[3];
    record.leaseUntil = ''; record.leaseTokenHash = ''; if (args[8] === 'reset') record.attempt = 0; this.values.set(keys[0], JSON.stringify(record));
    await this.zrem(keys[1], args[5]); if (args[6] === 'enqueue') await this.zadd(keys[1], args[7], args[5]);
    return ['updated', JSON.stringify(record)];
  }
}

const redis = new FakeRedis();
const partitionSecret = 'p'.repeat(48);
const dataEncryptionKey = Buffer.alloc(32, 7).toString('base64');
const subject = 'qa@example.test';
const now = new Date('2026-08-29T14:00:00.000Z');
const mission = { role: 'Procurement Manager', workModes: ['Remote'], employmentTypes: ['Full-time'], salaryMin: 100000, location: 'United States', target: 10 };

assert.equal(validateJobAgentMission(mission).role, 'Procurement Manager');
assert.throws(() => validateJobAgentMission({ role: 'Buyer', email: 'candidate@example.com', location: 'candidate@example.com' }), /Private or secret/);
assert.throws(() => validateJobAgentMission({ role: 'Buyer', exclusions: ['my password is hunter2'] }), /Private or secret/);
assert.throws(() => validateJobAgentMission({ role: '' }), /role or role family/);

const first = await createJobAgentRun({ redis, subject, partitionSecret, dataEncryptionKey, mission, idempotencyKey: 'launch_12345678', now });
assert.equal(first.run.status, 'Searching');
assert.equal(first.run.mission.salaryMin, 100000);
const replay = await createJobAgentRun({ redis, subject, partitionSecret, dataEncryptionKey, mission, idempotencyKey: 'launch_12345678', now });
assert.equal(replay.replayed, true);
assert.equal(replay.run.id, first.run.id);
assert.equal(await readJobAgentRun({ redis, subject: 'different@example.test', partitionSecret, dataEncryptionKey, runId: first.run.id }), null);

let claimed = await claimJobAgentRun({ redis, runId: first.run.id, dataEncryptionKey, now });
assert.equal(claimed.run.attempt, 1);
let heartbeat = await heartbeatJobAgentRun({ redis, runId: first.run.id, leaseToken: claimed.leaseToken, dataEncryptionKey, now });
assert.equal(heartbeat.status, 'Searching');
let finished = await finishJobAgentRun({ redis, runId: first.run.id, leaseToken: claimed.leaseToken, dataEncryptionKey, result: { jobs: [], sourceSummary: [], authority: 'direct-employer' }, now });
assert.equal(finished.status, 'Finished');
assert.equal(finished.result.authority, 'direct-employer');

const second = await createJobAgentRun({ redis, subject, partitionSecret, dataEncryptionKey, mission, idempotencyKey: 'launch_87654321', now: new Date(now.getTime() + 1_000) });
const latestRestored = await readRequestedJobAgentRun({
  query: { latest: 'discovery' }, config: { redis, partitionSecret, dataEncryptionKey }, subject,
});
assert.equal(latestRestored.id, second.run.id);
assert.equal(latestRestored.mission.role, 'Procurement Manager');
assert.equal(await readRequestedJobAgentRun({
  query: { latest: 'discovery' }, config: { redis, partitionSecret, dataEncryptionKey }, subject: 'different@example.test',
}), null);
await assert.rejects(() => readRequestedJobAgentRun({ query: { latest: 'package' }, config: { redis, partitionSecret, dataEncryptionKey }, subject }), /latest discovery/);
await assert.rejects(() => readRequestedJobAgentRun({ query: {}, config: { redis, partitionSecret, dataEncryptionKey }, subject }), /run ID/);
let paused = await setJobAgentRunStatus({ redis, subject, partitionSecret, dataEncryptionKey, runId: second.run.id, status: 'Paused', now });
assert.equal(paused.status, 'Paused');
let resumed = await setJobAgentRunStatus({ redis, subject, partitionSecret, dataEncryptionKey, runId: second.run.id, status: 'Searching', now });
assert.equal(resumed.status, 'Searching');
claimed = await claimJobAgentRun({ redis, runId: second.run.id, dataEncryptionKey, now });
let retried = await failJobAgentRun({ redis, runId: second.run.id, leaseToken: claimed.leaseToken, dataEncryptionKey, errorCode: 'SOURCE_TIMEOUT', now });
assert.equal(retried.status, 'Searching');
assert.equal(retried.lastErrorCode, 'SOURCE_TIMEOUT');
assert.equal(retryDelaySeconds(1), 30);

const crash = await createJobAgentRun({ redis, subject, partitionSecret, dataEncryptionKey, mission, idempotencyKey: 'launch_crash_1', now });
const abandonedLease = await claimJobAgentRun({ redis, runId: crash.run.id, dataEncryptionKey, now, leaseSeconds: 45 });
assert.ok(abandonedLease);
assert.equal(await claimJobAgentRun({ redis, runId: crash.run.id, dataEncryptionKey, now: new Date(now.getTime() + 20_000) }), null);
const reclaimed = await claimJobAgentRun({ redis, runId: crash.run.id, dataEncryptionKey, now: new Date(now.getTime() + 46_000) });
assert.equal(reclaimed.run.attempt, 2);

const failedKey = [...redis.values.keys()].find(key => key.endsWith(second.run.id));
const failedRecord = JSON.parse(redis.values.get(failedKey));
failedRecord.status = 'Failed'; failedRecord.attempt = 4; failedRecord.leaseTokenHash = ''; failedRecord.leaseUntil = '';
redis.values.set(failedKey, JSON.stringify(failedRecord));
const recovered = await setJobAgentRunStatus({ redis, subject, partitionSecret, dataEncryptionKey, runId: second.run.id, status: 'Searching', now });
assert.equal(recovered.status, 'Searching');
assert.equal(recovered.attempt, 0);

const third = await createJobAgentRun({ redis, subject, partitionSecret, dataEncryptionKey, mission, idempotencyKey: 'launch_worker_1', now });
claimed = await claimJobAgentRun({ redis, runId: third.run.id, dataEncryptionKey, now });
const executed = await executeClaimedJobAgentRun({
  claimed, redis, dataEncryptionKey, sources: [{ provider: 'greenhouse', slug: 'example', employer: 'Example Co' }],
  discover: async () => ({
    jobs: [{ provider: 'greenhouse', employer: 'Example Co', title: 'Procurement Manager', requisitionId: 'R-1', applyUrl: 'https://boards.greenhouse.io/example/jobs/1', jobUrl: 'https://boards.greenhouse.io/example/jobs/1', description: 'Contact recruiter@example.com or 212-555-1212.', remote: true, applyPathVerified: true, applyPathVerification: 'current-greenhouse-requisition-fetch', applyPathVerifiedAt: now.toISOString() }],
    sourceSummary: [{ provider: 'greenhouse', employer: 'Example Co', status: 'ok', found: 1, published: 2, unlistedExcluded: 1, invalidApplyPaths: 0 }], errors: [],
    filterSummary: { scanned: 1, duplicatesRemoved: 0, rejectedByMission: 0, limitedOut: 0, verificationFailed: 0, rejectedAfterVerification: 0, matched: 1, returned: 1 },
  }), now,
});
assert.equal(executed.status, 'Finished');
assert.equal(executed.result.sourceSummary[0].unlistedExcluded, 1);
assert.equal(executed.result.jobs.length, 1);
assert.doesNotMatch(executed.result.jobs[0].description, /recruiter@example|212-555/);
assert.equal(executed.result.externalApplicationExecution, false);
assert.equal(executed.result.jobs[0].applyPathVerified, true);
assert.equal(executed.result.filterSummary.verificationFailed, 0);

assert.equal((await listJobAgentRuns({ redis, subject, partitionSecret, dataEncryptionKey, limit: 10 })).length, 4);
assert.equal((await listJobAgentRuns({ redis, subject: 'different@example.test', partitionSecret, dataEncryptionKey, limit: 10 })).length, 0);
assert.equal((await deleteAllJobAgentRuns({ redis, subject, partitionSecret })).deleted, 4);
assert.equal((await listJobAgentRuns({ redis, subject, partitionSecret, dataEncryptionKey, limit: 10 })).length, 0);

console.log('Durable Job Agent run tests passed.');
