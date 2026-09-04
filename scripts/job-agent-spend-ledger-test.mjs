import assert from 'node:assert/strict';
import {
  jobAgentMonetaryBudgetConfiguration, publicJobAgentMonetaryBudgetConfiguration, readJobAgentSpendSummary,
  reconcileStaleJobAgentSpendReservations, reserveConfiguredJobAgentSpend, reserveJobAgentSpend, settleConfiguredJobAgentSpend, settleJobAgentSpend,
} from '../lib/job-agent-spend-ledger.js';

const env = {
  JOB_AGENT_MONETARY_BUDGET_ENABLED: 'true', JOB_AGENT_MONETARY_BUDGET_APPROVED: 'true', JOB_AGENT_MONETARY_BUDGET_APPROVAL_VERSION: 'budget-v1',
  JOB_AGENT_MONETARY_BUDGET_CURRENCY: 'USD', JOB_AGENT_GLOBAL_DAILY_BUDGET_CENTS: '1000',
  JOB_AGENT_AI_DAILY_BUDGET_CENTS: '400', JOB_AGENT_AI_MAX_REQUEST_CENTS: '100',
  JOB_AGENT_PACKAGE_AI_DAILY_BUDGET_CENTS: '300', JOB_AGENT_PACKAGE_AI_MAX_REQUEST_CENTS: '150',
  JOB_AGENT_DOCUMENT_RENDER_DAILY_BUDGET_CENTS: '200', JOB_AGENT_DOCUMENT_RENDER_MAX_REQUEST_CENTS: '50',
  JOB_AGENT_EMPLOYER_BROWSER_DAILY_BUDGET_CENTS: '300', JOB_AGENT_EMPLOYER_BROWSER_MAX_SESSION_CENTS: '100',
  JOB_AGENT_EMAIL_DAILY_BUDGET_CENTS: '100', JOB_AGENT_EMAIL_MAX_REQUEST_CENTS: '5',
  JOB_AGENT_OBJECT_STORAGE_DAILY_BUDGET_CENTS: '100', JOB_AGENT_OBJECT_STORAGE_MAX_REQUEST_CENTS: '10',
  RATE_LIMIT_HASH_SECRET: 'spend-ledger-partition-secret'.padEnd(48, 'x'), UPSTASH_REDIS_REST_URL: 'https://redis.example.test', UPSTASH_REDIS_REST_TOKEN: 'token',
};

assert.equal(jobAgentMonetaryBudgetConfiguration({}).reason, 'monetary-budget-disabled');
assert.equal(jobAgentMonetaryBudgetConfiguration({ ...env, JOB_AGENT_MONETARY_BUDGET_CURRENCY: 'EUR' }).reason, 'monetary-budget-currency-invalid');
assert.equal(jobAgentMonetaryBudgetConfiguration({ ...env, JOB_AGENT_AI_MAX_REQUEST_CENTS: '500' }).reason, 'monetary-category-cap-invalid');
assert.equal(jobAgentMonetaryBudgetConfiguration(env).ready, true);
const publicConfig = publicJobAgentMonetaryBudgetConfiguration(jobAgentMonetaryBudgetConfiguration(env));
assert.equal(publicConfig.globalDailyCapCents, 1000);
assert.equal(JSON.stringify(publicConfig).includes(env.RATE_LIMIT_HASH_SECRET), false);
assert.equal(Object.hasOwn(publicConfig, 'partitionSecret'), false);

class FakeRedis {
  constructor() { this.values = new Map(); this.hashes = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async hgetall(key) { return this.hashes.get(key) || null; }
  async zadd(key, score, member) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); this.sorted.get(key).set(member, Number(score)); return 1; }
  async zrem(key, member) { return this.sorted.get(key)?.delete(member) ? 1 : 0; }
  async zrange(key, min, max, options = {}) {
    return [...(this.sorted.get(key) || new Map())].filter(([, score]) => score >= Number(min) && score <= Number(max))
      .slice(options.offset || 0, (options.offset || 0) + (options.count || Number.MAX_SAFE_INTEGER)).map(([member]) => member);
  }
  hash(key) { if (!this.hashes.has(key)) this.hashes.set(key, {}); return this.hashes.get(key); }
  async eval(script, keys, args) {
    if (script.includes('GLOBAL_MONETARY_BUDGET_EXHAUSTED')) {
      if (this.values.has(keys[2])) return JSON.stringify({ ...JSON.parse(this.values.get(keys[2])), replayed: true });
      const amount = Number(args[0]); const global = this.hash(keys[0]); const category = this.hash(keys[1]);
      if ((global.reservedCents || 0) + (global.settledCents || 0) + amount > Number(args[1])) return JSON.stringify({ ok: false, code: 'GLOBAL_MONETARY_BUDGET_EXHAUSTED' });
      if ((category.reservedCents || 0) + (category.settledCents || 0) + amount > Number(args[2])) return JSON.stringify({ ok: false, code: 'CATEGORY_MONETARY_BUDGET_EXHAUSTED' });
      global.reservedCents = (global.reservedCents || 0) + amount; category.reservedCents = (category.reservedCents || 0) + amount;
      this.values.set(keys[2], args[4]); await this.zadd(keys[3], args[5], keys[2]); return args[4];
    }
    const record = JSON.parse(this.values.get(keys[2]));
    if (record.status !== 'reserved') return JSON.stringify(record);
    const actual = Number(args[0]); const global = this.hash(keys[0]); const category = this.hash(keys[1]);
    for (const bucket of [global, category]) {
      bucket.reservedCents = (bucket.reservedCents || 0) - record.maximumCents;
      bucket.settledCents = (bucket.settledCents || 0) + actual;
      bucket.releasedCents = (bucket.releasedCents || 0) + record.maximumCents - actual;
    }
    record.status = args[1]; record.settledCents = actual; this.values.set(keys[2], JSON.stringify(record)); await this.zrem(keys[3], keys[2]); return JSON.stringify(record);
  }
}

const redis = new FakeRedis();
const common = { redis, partitionSecret: env.RATE_LIMIT_HASH_SECRET, category: 'ai', globalDailyCapCents: 300, categoryDailyCapCents: 200, maximumCents: 100, now: new Date('2026-08-30T12:00:00.000Z') };
const first = await reserveJobAgentSpend({ ...common, operationId: 'operation_0001' });
assert.equal(first.ok, true);
assert.equal(JSON.stringify(first).includes('operation_0001'), false);
const replay = await reserveJobAgentSpend({ ...common, operationId: 'operation_0001' });
assert.equal(replay.ok, true);
assert.equal(replay.replayed, true);
assert.equal(redis.hash('1ststep:job-agent:spend:v1:2026-08-30:global').reservedCents, 100);
assert.equal((await reserveJobAgentSpend({ ...common, operationId: 'operation_0002' })).ok, true);
const categoryDenied = await reserveJobAgentSpend({ ...common, operationId: 'operation_0003' });
assert.equal(categoryDenied.code, 'CATEGORY_MONETARY_BUDGET_EXHAUSTED');
const globalRedis = new FakeRedis();
const globalCommon = { ...common, redis: globalRedis, globalDailyCapCents: 150, categoryDailyCapCents: 150, maximumCents: 100 };
assert.equal((await reserveJobAgentSpend({ ...globalCommon, operationId: 'operation_global_1' })).ok, true);
assert.equal((await reserveJobAgentSpend({ ...globalCommon, operationId: 'operation_global_2' })).code, 'GLOBAL_MONETARY_BUDGET_EXHAUSTED');
const settled = await settleJobAgentSpend({ redis, partitionSecret: env.RATE_LIMIT_HASH_SECRET, category: 'ai', operationId: 'operation_0001', actualCents: 60, now: common.now });
assert.equal(settled.settledCents, 60);
assert.equal(settled.status, 'settled');
assert.equal(redis.hash('1ststep:job-agent:spend:v1:2026-08-30:global').releasedCents, 40);
const unknownActual = await settleJobAgentSpend({ redis, partitionSecret: env.RATE_LIMIT_HASH_SECRET, category: 'ai', operationId: 'operation_0002', now: common.now });
assert.equal(unknownActual.status, 'settled-at-maximum-unknown-actual');
assert.equal(unknownActual.settledCents, 100);
const nextReservation = await reserveJobAgentSpend({ ...common, operationId: 'operation_0004' });
assert.equal(nextReservation.code, 'CATEGORY_MONETARY_BUDGET_EXHAUSTED');

const releaseRedis = new FakeRedis();
await reserveJobAgentSpend({ ...common, redis: releaseRedis, operationId: 'operation_release_1' });
const released = await settleJobAgentSpend({ redis: releaseRedis, partitionSecret: env.RATE_LIMIT_HASH_SECRET, category: 'ai', operationId: 'operation_release_1', definitiveNoProviderCall: true, now: common.now });
assert.equal(released.status, 'released-before-provider-call');
assert.equal(released.settledCents, 0);

const configuredRedis = new FakeRedis();
const configured = await reserveConfiguredJobAgentSpend({ category: 'email', operationId: 'email:configured:0001', env: { ...env, VERCEL_ENV: 'production' }, redis: configuredRedis, now: common.now });
assert.equal(configured.ok, true);
assert.equal(configured.required, true);
await settleConfiguredJobAgentSpend({ control: configured.control, providerCallStarted: true });
const spendSummary = await readJobAgentSpendSummary({ redis: configuredRedis, days: 1, now: common.now });
assert.deepEqual(spendSummary.totals, { reservedCents: 0, settledCents: 5, releasedCents: 0 });
assert.equal(spendSummary.days[0].categories.email.settledCents, 5);
assert.equal(spendSummary.containsCandidateValues, false);
const localDisabled = await reserveConfiguredJobAgentSpend({ category: 'ai', operationId: 'local-disabled-0001', env: {}, redis: new FakeRedis(), now: common.now });
assert.deepEqual(localDisabled, { ok: true, required: false, control: null });

const staleRedis = new FakeRedis();
await reserveJobAgentSpend({ ...common, redis: staleRedis, operationId: 'operation_stale_0001' });
assert.equal((await reconcileStaleJobAgentSpendReservations({ redis: staleRedis, now: new Date('2026-08-30T12:14:59.000Z') })).status, 'idle');
const reconciled = await reconcileStaleJobAgentSpendReservations({ redis: staleRedis, now: new Date('2026-08-30T12:15:00.000Z') });
assert.deepEqual(reconciled, { status: 'completed', examined: 1, settledAtMaximum: 1, staleIndexEntriesRemoved: 0, earlyIndexEntriesRescheduled: 0, contentFree: true, containsCandidateValues: false, releasedCents: 0 });
const staleSummary = await readJobAgentSpendSummary({ redis: staleRedis, days: 1, now: common.now });
assert.deepEqual(staleSummary.totals, { reservedCents: 0, settledCents: 100, releasedCents: 0 });
assert.equal(JSON.stringify(reconciled).includes('operation_stale_0001'), false);

console.log('Approved integer-cent budgets, pseudonymous idempotent reservations, hard caps, content-free summaries, conservative stale reconciliation, unknown settlement, and safe release tests passed.');
