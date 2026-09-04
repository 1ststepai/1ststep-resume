import { createHmac } from 'node:crypto';
import { Redis } from '@upstash/redis';

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const OPERATION_ID = /^[A-Za-z0-9:_-]{8,200}$/;
const RETENTION_SECONDS = 8 * 24 * 60 * 60;
const RECONCILE_AFTER_MS = 15 * 60 * 1000;
const BASE = '1ststep:job-agent:spend:v1';
const RECONCILIATION_DUE_KEY = `${BASE}:reconciliation-due`;
const CATEGORY_ENV = Object.freeze({
  ai: ['JOB_AGENT_AI_DAILY_BUDGET_CENTS', 'JOB_AGENT_AI_MAX_REQUEST_CENTS'],
  'application-package': ['JOB_AGENT_PACKAGE_AI_DAILY_BUDGET_CENTS', 'JOB_AGENT_PACKAGE_AI_MAX_REQUEST_CENTS'],
  'document-render': ['JOB_AGENT_DOCUMENT_RENDER_DAILY_BUDGET_CENTS', 'JOB_AGENT_DOCUMENT_RENDER_MAX_REQUEST_CENTS'],
  'employer-browser': ['JOB_AGENT_EMPLOYER_BROWSER_DAILY_BUDGET_CENTS', 'JOB_AGENT_EMPLOYER_BROWSER_MAX_SESSION_CENTS'],
  email: ['JOB_AGENT_EMAIL_DAILY_BUDGET_CENTS', 'JOB_AGENT_EMAIL_MAX_REQUEST_CENTS'],
  'object-storage': ['JOB_AGENT_OBJECT_STORAGE_DAILY_BUDGET_CENTS', 'JOB_AGENT_OBJECT_STORAGE_MAX_REQUEST_CENTS'],
});

const RESERVE_SCRIPT = `
local replay = redis.call('GET', KEYS[3])
if replay then
  local replay_record = cjson.decode(replay)
  replay_record.replayed = true
  return cjson.encode(replay_record)
end
local amount = tonumber(ARGV[1])
local global_used = (tonumber(redis.call('HGET', KEYS[1], 'reservedCents')) or 0) + (tonumber(redis.call('HGET', KEYS[1], 'settledCents')) or 0)
local category_used = (tonumber(redis.call('HGET', KEYS[2], 'reservedCents')) or 0) + (tonumber(redis.call('HGET', KEYS[2], 'settledCents')) or 0)
if global_used + amount > tonumber(ARGV[2]) then return '{"ok":false,"code":"GLOBAL_MONETARY_BUDGET_EXHAUSTED"}' end
if category_used + amount > tonumber(ARGV[3]) then return '{"ok":false,"code":"CATEGORY_MONETARY_BUDGET_EXHAUSTED"}' end
redis.call('HINCRBY', KEYS[1], 'reservedCents', amount)
redis.call('HINCRBY', KEYS[2], 'reservedCents', amount)
redis.call('EXPIRE', KEYS[1], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[4])
redis.call('SET', KEYS[3], ARGV[5], 'EX', ARGV[4], 'NX')
redis.call('ZADD', KEYS[4], ARGV[6], KEYS[3])
redis.call('EXPIRE', KEYS[4], ARGV[4])
return ARGV[5]
`;

const SETTLE_SCRIPT = `
local raw = redis.call('GET', KEYS[3])
if not raw then return '{"ok":false,"code":"SPEND_RESERVATION_NOT_FOUND"}' end
local record = cjson.decode(raw)
if record.status ~= 'reserved' then return raw end
local actual = tonumber(ARGV[1])
local maximum = tonumber(record.maximumCents)
if actual < 0 or actual > maximum then return '{"ok":false,"code":"SPEND_SETTLEMENT_INVALID"}' end
redis.call('HINCRBY', KEYS[1], 'reservedCents', -maximum)
redis.call('HINCRBY', KEYS[2], 'reservedCents', -maximum)
redis.call('HINCRBY', KEYS[1], 'settledCents', actual)
redis.call('HINCRBY', KEYS[2], 'settledCents', actual)
redis.call('HINCRBY', KEYS[1], 'releasedCents', maximum - actual)
redis.call('HINCRBY', KEYS[2], 'releasedCents', maximum - actual)
record.status = ARGV[2]
record.settledCents = actual
record.containsCandidateValues = false
local updated = cjson.encode(record)
redis.call('SET', KEYS[3], updated, 'EX', ARGV[3])
redis.call('ZREM', KEYS[4], KEYS[3])
return updated
`;

function enabled(value) { return String(value || '').toLowerCase() === 'true'; }
function cents(value) { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100_000_000 ? parsed : null; }
function day(now) { return new Date(now).toISOString().slice(0, 10); }
function parseResult(value) { return typeof value === 'string' ? JSON.parse(value) : value; }

export function jobAgentMonetaryBudgetConfiguration(env = process.env) {
  const active = enabled(env.JOB_AGENT_MONETARY_BUDGET_ENABLED);
  const approved = enabled(env.JOB_AGENT_MONETARY_BUDGET_APPROVED);
  const approvalVersion = String(env.JOB_AGENT_MONETARY_BUDGET_APPROVAL_VERSION || '');
  const globalDailyCapCents = cents(env.JOB_AGENT_GLOBAL_DAILY_BUDGET_CENTS);
  const categories = Object.fromEntries(Object.entries(CATEGORY_ENV).map(([category, [dailyName, requestName]]) => [category, {
    dailyCapCents: cents(env[dailyName]), maximumRequestCents: cents(env[requestName]),
  }]));
  const partitionSecret = String(env.RATE_LIMIT_HASH_SECRET || env.TIER_SECRET || '');
  let reason = null;
  if (!active) reason = 'monetary-budget-disabled';
  else if (!approved || !VERSION.test(approvalVersion)) reason = 'monetary-budget-not-approved';
  else if (String(env.JOB_AGENT_MONETARY_BUDGET_CURRENCY || '') !== 'USD') reason = 'monetary-budget-currency-invalid';
  else if (!globalDailyCapCents) reason = 'monetary-global-cap-invalid';
  else if (partitionSecret.length < 32 || !env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) reason = 'monetary-ledger-runtime-not-configured';
  else if (Object.values(categories).some(item => !item.dailyCapCents || !item.maximumRequestCents || item.maximumRequestCents > item.dailyCapCents || item.dailyCapCents > globalDailyCapCents)) reason = 'monetary-category-cap-invalid';
  const currencyValid = String(env.JOB_AGENT_MONETARY_BUDGET_CURRENCY || '') === 'USD';
  const runtimeReady = partitionSecret.length >= 32 && Boolean(env.UPSTASH_REDIS_REST_URL) && Boolean(env.UPSTASH_REDIS_REST_TOKEN);
  return {
    enabled: active, approved, ready: reason === null, reason, currency: 'USD', approvalVersion: VERSION.test(approvalVersion) ? approvalVersion : null,
    globalDailyCapCents, categories, partitionSecret,
    // Additive, for capability-scoped readiness. `ready` keeps its original global meaning.
    currencyValid, runtimeReady,
  };
}

// Readiness for ONE spend category, independent of every other category.
// This is the capability-boundary fix: an unconfigured employer-browser budget must not
// disable document generation. Global prerequisites still apply and still fail closed.
export function jobAgentCategoryBudgetReadiness(configuration = {}, category) {
  if (!configuration.enabled) return { ok: false, reason: 'monetary-budget-disabled' };
  if (!configuration.approved || !configuration.approvalVersion) return { ok: false, reason: 'monetary-budget-not-approved' };
  if (configuration.currencyValid !== true) return { ok: false, reason: 'monetary-budget-currency-invalid' };
  if (!configuration.globalDailyCapCents) return { ok: false, reason: 'monetary-global-cap-invalid' };
  if (configuration.runtimeReady !== true) return { ok: false, reason: 'monetary-ledger-runtime-not-configured' };
  const item = (configuration.categories || {})[category];
  if (!item) return { ok: false, reason: 'monetary-category-unknown' };
  if (!item.dailyCapCents || !item.maximumRequestCents) return { ok: false, reason: 'monetary-category-cap-missing' };
  if (item.maximumRequestCents > item.dailyCapCents) return { ok: false, reason: 'monetary-category-cap-invalid' };
  if (item.dailyCapCents > configuration.globalDailyCapCents) return { ok: false, reason: 'monetary-category-cap-invalid' };
  return { ok: true, reason: null };
}

export function publicJobAgentMonetaryBudgetConfiguration(configuration = {}) {
  return {
    enabled: configuration.enabled === true, approved: configuration.approved === true, ready: configuration.ready === true,
    reason: configuration.reason || null, currency: 'USD', approvalVersion: configuration.approvalVersion || null,
    globalDailyCapCents: configuration.globalDailyCapCents || null,
    categories: Object.fromEntries(Object.entries(configuration.categories || {}).map(([key, value]) => [key, { dailyCapCents: value.dailyCapCents || null, maximumRequestCents: value.maximumRequestCents || null }])),
  };
}

export function jobAgentSpendLedgerConfiguration(env = process.env, { redis, category } = {}) {
  const budget = jobAgentMonetaryBudgetConfiguration(env);
  // When a category is named, judge only that category. Otherwise keep the original
  // global behaviour so existing callers are unaffected.
  const gate = category ? jobAgentCategoryBudgetReadiness(budget, category) : { ok: budget.ready, reason: budget.reason };
  if (!gate.ok) return { ...budget, categoryReady: false, categoryReason: gate.reason, redis: null };
  return { ...budget, categoryReady: true, categoryReason: null, redis: redis || Redis.fromEnv() };
}

export function jobAgentMonetarySpendRequired(env = process.env, configuration = jobAgentMonetaryBudgetConfiguration(env)) {
  return ['production', 'preview'].includes(String(env.VERCEL_ENV || '').toLowerCase()) || configuration.enabled === true;
}

function reservationKeys({ category, operationHash, now }) {
  const date = day(now);
  return [`${BASE}:${date}:global`, `${BASE}:${date}:${category}`, `${BASE}:${date}:reservation:${operationHash}`, RECONCILIATION_DUE_KEY];
}

function safeBucket(raw = {}) {
  return Object.freeze({
    reservedCents: Math.max(0, Number(raw.reservedCents) || 0),
    settledCents: Math.max(0, Number(raw.settledCents) || 0),
    releasedCents: Math.max(0, Number(raw.releasedCents) || 0),
  });
}

export async function readJobAgentSpendSummary({ redis, days = 2, now = new Date() } = {}) {
  if (!redis || typeof redis.hgetall !== 'function') throw new Error('SPEND_LEDGER_NOT_CONFIGURED');
  const count = Math.max(1, Math.min(8, Number(days) || 2));
  const totals = { reservedCents: 0, settledCents: 0, releasedCents: 0 };
  const buckets = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(new Date(now).getTime() - offset * 86_400_000);
    const dateKey = day(date);
    const global = safeBucket(await redis.hgetall(`${BASE}:${dateKey}:global`) || {});
    const categories = Object.fromEntries(await Promise.all(Object.keys(CATEGORY_ENV).map(async category => [
      category, safeBucket(await redis.hgetall(`${BASE}:${dateKey}:${category}`) || {}),
    ])));
    for (const key of Object.keys(totals)) totals[key] += global[key];
    buckets.push({ date: dateKey, global, categories });
  }
  return { schemaVersion: 1, contentFree: true, containsCandidateValues: false, currency: 'USD', days: buckets, totals };
}

export async function reserveJobAgentSpend({ redis, partitionSecret, category, operationId, globalDailyCapCents, categoryDailyCapCents, maximumCents, now = new Date() } = {}) {
  if (!redis || String(partitionSecret || '').length < 32) throw new Error('SPEND_LEDGER_NOT_CONFIGURED');
  if (!Object.hasOwn(CATEGORY_ENV, category) || !OPERATION_ID.test(String(operationId || ''))) throw new Error('SPEND_RESERVATION_SCOPE_INVALID');
  for (const value of [globalDailyCapCents, categoryDailyCapCents, maximumCents]) if (!cents(value)) throw new Error('SPEND_RESERVATION_AMOUNT_INVALID');
  if (maximumCents > categoryDailyCapCents || categoryDailyCapCents > globalDailyCapCents) throw new Error('SPEND_RESERVATION_CAP_INVALID');
  const operationHash = createHmac('sha256', partitionSecret).update(`${category}|${operationId}`).digest('hex').slice(0, 40);
  const keys = reservationKeys({ category, operationHash, now });
  const createdAt = new Date(now).toISOString();
  const reconcileAfter = new Date(new Date(now).getTime() + RECONCILE_AFTER_MS).toISOString();
  const record = { schemaVersion: 1, id: operationHash, category, date: day(now), maximumCents, status: 'reserved', settledCents: null, createdAt, reconcileAfter, containsCandidateValues: false };
  const result = parseResult(await redis.eval(RESERVE_SCRIPT, keys, [String(maximumCents), String(globalDailyCapCents), String(categoryDailyCapCents), String(RETENTION_SECONDS), JSON.stringify(record), String(new Date(reconcileAfter).getTime())]));
  return result.ok === false ? { ...result, status: 429, retryable: false } : { ok: true, reservation: result, replayed: result.replayed === true };
}

export async function settleJobAgentSpend({ redis, partitionSecret, category, operationId, actualCents, definitiveNoProviderCall = false, now = new Date() } = {}) {
  if (!redis || String(partitionSecret || '').length < 32 || !Object.hasOwn(CATEGORY_ENV, category) || !OPERATION_ID.test(String(operationId || ''))) throw new Error('SPEND_SETTLEMENT_SCOPE_INVALID');
  const operationHash = createHmac('sha256', partitionSecret).update(`${category}|${operationId}`).digest('hex').slice(0, 40);
  const keys = reservationKeys({ category, operationHash, now });
  const raw = await redis.get(keys[2]);
  const existing = parseResult(raw);
  if (!existing) return { ok: false, code: 'SPEND_RESERVATION_NOT_FOUND' };
  const amount = definitiveNoProviderCall ? 0 : actualCents === undefined || actualCents === null ? Number(existing.maximumCents) : Number(actualCents);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > Number(existing.maximumCents)) throw new Error('SPEND_SETTLEMENT_AMOUNT_INVALID');
  const status = definitiveNoProviderCall ? 'released-before-provider-call' : actualCents === undefined || actualCents === null ? 'settled-at-maximum-unknown-actual' : 'settled';
  return parseResult(await redis.eval(SETTLE_SCRIPT, keys, [String(amount), status, String(RETENTION_SECONDS)]));
}

export async function reserveConfiguredJobAgentSpend({ category, operationId, env = process.env, redis, now = new Date() } = {}) {
  const configuration = jobAgentSpendLedgerConfiguration(env, { redis, category });
  if (!jobAgentMonetarySpendRequired(env, configuration)) return { ok: true, required: false, control: null };
  if (!configuration.categoryReady) {
    return {
      ok: false, status: 503, code: 'MONETARY_SPEND_CONTROL_NOT_CONFIGURED',
      category, reason: configuration.categoryReason,
    };
  }
  const categoryConfiguration = configuration.categories[category];
  if (!categoryConfiguration) return { ok: false, status: 503, code: 'MONETARY_SPEND_CATEGORY_NOT_CONFIGURED', category };
  const reservation = await reserveJobAgentSpend({
    redis: configuration.redis, partitionSecret: configuration.partitionSecret, category, operationId,
    globalDailyCapCents: configuration.globalDailyCapCents, categoryDailyCapCents: categoryConfiguration.dailyCapCents,
    maximumCents: categoryConfiguration.maximumRequestCents, now,
  });
  return reservation.ok ? {
    ...reservation, required: true,
    control: { redis: configuration.redis, partitionSecret: configuration.partitionSecret, category, operationId, now },
  } : reservation;
}

export async function settleConfiguredJobAgentSpend({ control, providerCallStarted = false, actualCents } = {}) {
  if (!control) return { ok: true, required: false };
  return settleJobAgentSpend({ ...control, actualCents, definitiveNoProviderCall: !providerCallStarted });
}

export async function reconcileStaleJobAgentSpendReservations({ redis, now = new Date(), limit = 10 } = {}) {
  if (!redis || typeof redis.zrange !== 'function' || typeof redis.zadd !== 'function' || typeof redis.zrem !== 'function') throw new Error('SPEND_LEDGER_NOT_CONFIGURED');
  const maximum = Math.max(1, Math.min(50, Number(limit) || 10));
  const due = await redis.zrange(RECONCILIATION_DUE_KEY, 0, new Date(now).getTime(), { byScore: true, offset: 0, count: maximum });
  let settledAtMaximum = 0;
  let staleIndexEntriesRemoved = 0;
  let earlyIndexEntriesRescheduled = 0;
  for (const reference of due || []) {
    const match = /^1ststep:job-agent:spend:v1:(\d{4}-\d{2}-\d{2}):reservation:([a-f0-9]{40})$/.exec(String(reference || ''));
    if (!match) { await redis.zrem(RECONCILIATION_DUE_KEY, reference); staleIndexEntriesRemoved += 1; continue; }
    const record = parseResult(await redis.get(reference));
    if (!record || record.schemaVersion !== 1 || record.date !== match[1] || record.id !== match[2]
      || !Object.hasOwn(CATEGORY_ENV, record.category) || !cents(record.maximumCents)) {
      await redis.zrem(RECONCILIATION_DUE_KEY, reference); staleIndexEntriesRemoved += 1; continue;
    }
    if (record.status !== 'reserved') { await redis.zrem(RECONCILIATION_DUE_KEY, reference); staleIndexEntriesRemoved += 1; continue; }
    const reconcileAt = new Date(String(record.reconcileAfter || '')).getTime();
    if (!Number.isFinite(reconcileAt)) { await redis.zrem(RECONCILIATION_DUE_KEY, reference); staleIndexEntriesRemoved += 1; continue; }
    if (reconcileAt > new Date(now).getTime()) { await redis.zadd(RECONCILIATION_DUE_KEY, reconcileAt, reference); earlyIndexEntriesRescheduled += 1; continue; }
    const keys = [`${BASE}:${record.date}:global`, `${BASE}:${record.date}:${record.category}`, reference, RECONCILIATION_DUE_KEY];
    const settled = parseResult(await redis.eval(SETTLE_SCRIPT, keys, [String(record.maximumCents), 'settled-at-maximum-stale-reconciliation', String(RETENTION_SECONDS)]));
    if (settled?.status === 'settled-at-maximum-stale-reconciliation') settledAtMaximum += 1;
  }
  return {
    status: (due || []).length ? 'completed' : 'idle', examined: (due || []).length, settledAtMaximum, staleIndexEntriesRemoved, earlyIndexEntriesRescheduled,
    contentFree: true, containsCandidateValues: false, releasedCents: 0,
  };
}
