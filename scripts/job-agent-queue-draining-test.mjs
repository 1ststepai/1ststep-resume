import assert from 'node:assert/strict';
import { createJobAgentRun, claimNextJobAgentRun, claimJobAgentRun, finishJobAgentRun, heartbeatJobAgentRun, failJobAgentRun } from '../lib/job-agent-run-store.js';
import { createWorkerDeadline } from '../lib/job-agent-worker-deadline.js';
// Synthetic store model; real Redis Lua/runtime evidence remains a staging gate.
class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async set(key, value) { this.values.set(key, value); return 'OK'; }
  async del(key) { return this.values.delete(key) ? 1 : 0; }
  async zadd(key, score, member) { this.#zset(key).set(member, Number(score)); return 1; }
  async zrem(key, member) { return this.#zset(key).delete(member) ? 1 : 0; }
  async zrange(key, min, max, options = {}) {
    const entries = [...this.#zset(key)].sort((a, b) => options.rev ? b[1] - a[1] : a[1] - b[1]);
    if (options.byScore) return entries.filter(([, score]) => score >= Number(min) && score <= Number(max)).slice(options.offset || 0, (options.offset || 0) + (options.count || entries.length)).map(([member]) => member);
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
    if (script.includes('tostring(record.version) ~= ARGV[2]')) {
      const raw = this.values.get(keys[0]);
      if (!raw) return this.zrem(keys[1], args[0]);
      const record = JSON.parse(raw);
      if (String(record.version) !== args[1]) return 0;
      if (!['Searching', 'Preparing'].includes(record.status)) return this.zrem(keys[1], args[0]);
      if (record.leaseUntil && record.leaseUntil > args[3]) return 0;
      return this.zadd(keys[1], args[2], args[0]);
    }
    const raw = this.values.get(keys[0]);
    if (!raw) return ['missing'];
    const record = JSON.parse(raw);
    if (record.version !== Number(args[0])) return ['conflict', String(record.version)];
    if (script.includes("record.status ~= 'Searching'")) {
      if (!['Searching', 'Preparing'].includes(record.status)) return ['not_claimable', record.status];
      // Model Redis TIME independently when a test supplies serverNow. Other
      // historical fixtures use their operation timestamp as the server clock.
      const serverNow = this.serverNow ?? Date.parse(args[3]);
      if (Number(args[8]) > serverNow || Number(args[9]) > serverNow) return ['not_due'];
      if (record.attempt >= record.maxAttempts) {
        record.status = 'Failed'; record.lastErrorCode = 'WORKER_RECOVERY_EXHAUSTED';
        this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], args[5]);
        return ['exhausted'];
      }
      record.status = 'Searching'; record.lifecycleState = 'Searching'; record.version += 1; record.attempt += 1; record.leaseTokenHash = args[1];
      record.leaseUntil = args[2]; record.updatedAt = args[3]; record.lastHeartbeatAt = args[3]; record.events.push(JSON.parse(args[7])); this.values.set(keys[0], JSON.stringify(record));
      await this.zadd(keys[1], args[6], args[5]); return ['claimed', JSON.stringify(record)];
    }
    if (script.includes('record.leaseTokenHash ~= ARGV[2]')) {
      if (record.leaseTokenHash !== args[1] || !record.leaseUntil || record.leaseUntil <= args[3] || (this.serverNow !== undefined && Number(args[16]) <= this.serverNow)) return ['lease_lost'];
      record.version += 1; record.status = args[2]; record.updatedAt = args[3]; record.leaseUntil = args[4];
      record.leaseTokenHash = args[5]; record.resultEnvelope = JSON.parse(args[6]); record.lastErrorCode = args[7];
      record.nextAttemptAt = args[8]; record.nextRetryAt = args[8]; record.lifecycleState = args[13]; if (args[14]) record.lastHeartbeatAt = args[14]; record.events.push(JSON.parse(args[15])); this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], args[12]);
      if (args[10] === 'enqueue') await this.zadd(keys[1], args[11], args[12]);
      return ['updated', JSON.stringify(record)];
    }
    record.version += 1; record.status = args[1]; record.updatedAt = args[2]; record.nextAttemptAt = args[3];
    record.leaseUntil = ''; record.leaseTokenHash = ''; record.nextRetryAt = args[3]; record.lifecycleState = args[9]; record.events.push(JSON.parse(args[10])); if (args[8] === 'reset') record.attempt = 0; this.values.set(keys[0], JSON.stringify(record));
    await this.zrem(keys[1], args[5]); if (args[6] === 'enqueue') await this.zadd(keys[1], args[7], args[5]);
    return ['updated', JSON.stringify(record)];
  }
}

const redis = new FakeRedis();
const now = new Date('2026-09-05T12:00:00Z');
const dataEncryptionKey = Buffer.alloc(32, 7).toString('base64');
const base = { redis, dataEncryptionKey, partitionSecret: 'p'.repeat(48), mission: { role: 'Buyer' }, now };
const create = (subject, key) => createJobAgentRun({ ...base, subject, idempotencyKey: key });
const a = await create('tenant-a', 'fairness_a_000');
for (let i = 1; i < 105; i++) await create('tenant-a', `fairness_a_${String(i).padStart(3, '0')}`);
const b = await create('tenant-b', 'fairness_b_000');
const c = await create('tenant-c', 'fairness_c_000');
assert.equal((await create('tenant-a', 'fairness_a_000')).run.id, a.run.id, 'replay preserves identity');
const served = [];
for (let i = 0; i < 5; i++) {
  const claimed = await claimNextJobAgentRun({ redis, dataEncryptionKey, now: new Date(+now + i * 10) });
  assert.ok(claimed);
  served.push(claimed.run.id);
}
assert.ok(served.includes(b.run.id) && served.includes(c.run.id), 'large tenant backlog must rotate across repeated one-run invocations');
const raceRedis = new FakeRedis();
const race = await createJobAgentRun({ ...base, redis: raceRedis, subject: 'race', idempotencyKey: 'contention_000' });
const claims = await Promise.all([0, 1].map(() => claimNextJobAgentRun({ redis: raceRedis, dataEncryptionKey, now })));
assert.equal(claims.filter(Boolean).length, 1);
const owner = claims.find(Boolean);
assert.ok([...raceRedis.sorted.values()].some(index => index.get(race.run.id) === +now + 45000), 'loser preserves winner recovery score');
const expired = new Date(+now + 45000);
raceRedis.serverNow = +expired;
assert.equal(await heartbeatJobAgentRun({ redis: raceRedis, dataEncryptionKey, runId: race.run.id, leaseToken: owner.leaseToken, now }), null, 'atomic expiry fences even a stale client timestamp');
delete raceRedis.serverNow;
assert.equal(await finishJobAgentRun({ redis: raceRedis, dataEncryptionKey, runId: race.run.id, leaseToken: owner.leaseToken, now: expired, result: { jobs: [] } }), null);
assert.equal(await heartbeatJobAgentRun({ redis: raceRedis, dataEncryptionKey, runId: race.run.id, leaseToken: owner.leaseToken, now: expired }), null);
const recovered = await claimNextJobAgentRun({ redis: raceRedis, dataEncryptionKey, now: expired });
assert.equal(recovered.run.attempt, 2);
assert.equal(await finishJobAgentRun({ redis: raceRedis, dataEncryptionKey, runId: race.run.id, leaseToken: owner.leaseToken, now: expired, result: { jobs: [] } }), null);
assert.equal((await finishJobAgentRun({ redis: raceRedis, dataEncryptionKey, runId: race.run.id, leaseToken: recovered.leaseToken, now: expired, result: { jobs: [] } })).status, 'Finished');
assert.equal(await claimJobAgentRun({ redis: raceRedis, dataEncryptionKey, runId: race.run.id, now: expired }), null);
const crashLoop = await createJobAgentRun({ ...base, redis: raceRedis, subject: 'crash', idempotencyKey: 'crash_loop_000' });
for (let attempt = 0; attempt < 4; attempt++) assert.ok(await claimJobAgentRun({ redis: raceRedis, dataEncryptionKey, runId: crashLoop.run.id, now: new Date(+now + attempt * 45000) }));
assert.equal(await claimNextJobAgentRun({ redis: raceRedis, dataEncryptionKey, now: new Date(+now + 4 * 45000) }), null);
assert.equal(JSON.parse(await raceRedis.get(`1ststep:job-agent:v1:run:${crashLoop.run.id}`)).lastErrorCode, 'WORKER_RECOVERY_EXHAUSTED');
// Exercise both atomic eligibility inputs, including skew in either direction.
// These are synthetic protocol checks, not evidence that Lua executed in Redis.
for (const eligibility of ['lease', 'retry']) {
  const skewRedis = new FakeRedis();
  const created = await createJobAgentRun({ ...base, redis: skewRedis, subject: `clock-${eligibility}`, idempotencyKey: `clock_${eligibility}_000` });
  const runId = created.run.id;
  const first = await claimJobAgentRun({ redis: skewRedis, dataEncryptionKey, runId, now });
  if (eligibility === 'retry') await failJobAgentRun({ redis: skewRedis, dataEncryptionKey, runId, leaseToken: first.leaseToken, now, retryable: true });
  const key = `1ststep:job-agent:v1:run:${runId}`;
  const before = await skewRedis.get(key);
  const record = JSON.parse(before);
  const dueAt = Date.parse(eligibility === 'lease' ? record.leaseUntil : record.nextAttemptAt);
  assert.ok(Number.isFinite(dueAt));
  const dueScores = () => [...skewRedis.sorted.values()].map(index => index.get(runId));
  const beforeScores = dueScores();

  skewRedis.serverNow = dueAt - 1;
  assert.equal(await claimJobAgentRun({ redis: skewRedis, dataEncryptionKey, runId, now: new Date(dueAt) }), null,
    `${eligibility}: client due but server behind must fail the atomic eligibility check`);
  assert.equal(await skewRedis.get(key), before, 'rejected atomic claim cannot change attempts or lease owner');
  assert.deepEqual(dueScores(), beforeScores, 'rejected atomic claim preserves the recovery index');

  skewRedis.serverNow = dueAt + 1000;
  assert.equal(await claimJobAgentRun({ redis: skewRedis, dataEncryptionKey, runId, now: new Date(dueAt - 1) }), null,
    `${eligibility}: server ahead does not override conservative client eligibility`);
  assert.equal(await skewRedis.get(key), before);
  assert.deepEqual(dueScores(), beforeScores);
  const eligible = await claimJobAgentRun({ redis: skewRedis, dataEncryptionKey, runId, now: new Date(dueAt) });
  assert.ok(eligible, `${eligibility}: claim succeeds once both clocks consider it due`);
  assert.equal(eligible.run.attempt, record.attempt + 1);
}
let time = 0;
let fire;
const timers = { setTimeout(fn) { fire = fn; return 1; }, clearTimeout() {} };
const deadline = createWorkerDeadline({ budgetMs: 10, clock: () => time, timers });
let release;
let writes = 0;
const client = deadline.guardClient({ async set() { writes++; } });
const pending = deadline.wait(async () => {
  await new Promise(resolve => { release = resolve; });
  await client.set();
});
await Promise.resolve(); await Promise.resolve();
time = 10; fire();
await assert.rejects(pending, /WORKER_DEADLINE_EXHAUSTED/);
release();
await Promise.resolve(); await Promise.resolve();
assert.equal(writes, 0, 'stalled adapter cannot issue a late store write');
await assert.rejects(deadline.guard(async () => { writes++; })(), /WORKER_DEADLINE_EXHAUSTED/);
assert.equal(writes, 0);
const exhausted = createWorkerDeadline({ budgetMs: 0 });
await assert.rejects(exhausted.wait(async () => { writes++; }), /WORKER_DEADLINE_EXHAUSTED/);
assert.equal(writes, 0);
console.log('Queue draining synthetic tests passed: fairness, contention, recovery, fencing, server-clock lease/retry eligibility, replay, stalled adapter, exhausted deadline.');

