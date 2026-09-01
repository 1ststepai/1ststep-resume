import { createHmac } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { recordConfiguredJobAgentOperationalEvent } from './job-agent-operational-metrics.js';
import { sendConfiguredJobAgentOperatorAlert } from './job-agent-operator-alert.js';
import { Ratelimit } from '@upstash/ratelimit';
import { requestIp } from './api-security.js';

const redisClients = new Map();
const limiters = new Map();
const localWindows = new Map();

function isProduction(env) {
  return env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production';
}

function redisConfig(env) {
  const url = String(env.UPSTASH_REDIS_REST_URL || '');
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || '');
  return url && token ? { url, token } : null;
}

function hashIdentifier(value, env) {
  const secret = String(env.RATE_LIMIT_HASH_SECRET || env.TIER_SECRET || 'local-development-only');
  return createHmac('sha256', secret).update(String(value)).digest('hex').slice(0, 32);
}

function redisFor(env) {
  const config = redisConfig(env);
  if (!config) return null;
  const cacheKey = `${config.url}|${config.token.slice(-8)}`;
  if (!redisClients.has(cacheKey)) redisClients.set(cacheKey, new Redis(config));
  return { cacheKey, client: redisClients.get(cacheKey) };
}

function limiterFor(redis, cacheKey, scope, dimension, limit, window) {
  const key = `${cacheKey}|${scope}|${dimension}|${limit}|${window}`;
  if (!limiters.has(key)) {
    limiters.set(key, new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `1ststep:rl:${scope}:${dimension}`,
      analytics: false,
    }));
  }
  return limiters.get(key);
}

function localLimit(identifier, limit, windowMs, rate, now = Date.now()) {
  const start = Math.floor(now / windowMs) * windowMs;
  const key = `${identifier}:${start}`;
  const used = (localWindows.get(key) || 0) + rate;
  localWindows.set(key, used);
  if (localWindows.size > 20_000) {
    for (const storedKey of localWindows.keys()) {
      if (!storedKey.endsWith(`:${start}`)) localWindows.delete(storedKey);
    }
  }
  return { success: used <= limit, limit, remaining: Math.max(0, limit - used), reset: start + windowMs };
}

function windowMs(window) {
  const match = /^(\d+)\s*([smhd])$/.exec(String(window).trim());
  if (!match) throw new Error(`Unsupported rate-limit window: ${window}`);
  const factors = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * factors[match[2]];
}

function normalizedRule(rule) {
  if (!rule) return null;
  const limit = Number(rule.limit);
  const rate = Math.max(1, Number(rule.rate) || 1);
  if (!Number.isSafeInteger(limit) || limit < 1 || !rule.window) throw new Error('Invalid durable rate-limit rule.');
  return { limit, rate, window: String(rule.window) };
}

function failure(result, dimension, code = 'RATE_LIMITED') {
  return {
    ok: false,
    status: 429,
    code,
    dimension,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
    retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1_000)),
  };
}

/**
 * Enforces shared limits without storing raw email addresses or IPs in Redis.
 * Production fails closed when shared storage or a hashing secret is missing.
 */
export async function enforceDurableRateLimit(req, {
  scope,
  subject = '',
  ip,
  ipRule,
  accountRule,
  globalRule,
  env = process.env,
} = {}) {
  if (!scope || !/^[a-z0-9:_-]{1,80}$/i.test(scope)) throw new Error('A safe rate-limit scope is required.');
  const rules = [
    ['ip', normalizedRule(ipRule)],
    ['account', normalizedRule(accountRule)],
    ['global', normalizedRule(globalRule)],
  ].filter(([, rule]) => rule);
  if (!rules.length) throw new Error('At least one rate-limit rule is required.');

  const production = isProduction(env);
  const secret = String(env.RATE_LIMIT_HASH_SECRET || env.TIER_SECRET || '');
  const redis = redisFor(env);
  if (production && (!redis || secret.length < 32)) {
    await sendConfiguredJobAgentOperatorAlert('rate_limit_control_unavailable', { env });
    return { ok: false, status: 503, code: 'RATE_LIMIT_CONFIGURATION', retryAfter: 60 };
  }

  const rawIp = String(ip || requestIp(req));
  const identities = {
    ip: hashIdentifier(`ip|${rawIp}`, env),
    account: hashIdentifier(`account|${subject || rawIp}`, env),
    global: 'all',
  };

  try {
    for (const [dimension, rule] of rules) {
      let result;
      if (redis) {
        const limiter = limiterFor(redis.client, redis.cacheKey, scope, dimension, rule.limit, rule.window);
        result = await limiter.limit(identities[dimension], { rate: rule.rate });
      } else {
        result = localLimit(`${scope}:${dimension}:${identities[dimension]}`, rule.limit, windowMs(rule.window), rule.rate);
      }
      if (!result.success) {
        await recordConfiguredJobAgentOperationalEvent('rate_limit_exhaustion');
        if (dimension === 'global' && /(?:ai|package|render|discovery)/i.test(scope)) {
          await sendConfiguredJobAgentOperatorAlert('global_budget_exhausted', { env });
        }
        return failure(result, dimension);
      }
    }
    return { ok: true };
  } catch (error) {
    console.error(JSON.stringify({ type: 'durable-rate-limit-error', scope, name: error?.name || 'unknown' }));
    if (production) {
      await sendConfiguredJobAgentOperatorAlert('rate_limit_control_unavailable', { env });
      return { ok: false, status: 503, code: 'RATE_LIMIT_UNAVAILABLE', retryAfter: 60 };
    }
    return { ok: true, degraded: true };
  }
}

export function sendRateLimitResult(res, result, message = 'Request limit reached. Please try again later.') {
  if (result.retryAfter) res.setHeader('Retry-After', String(result.retryAfter));
  if (Number.isFinite(result.limit)) res.setHeader('X-RateLimit-Limit', String(result.limit));
  if (Number.isFinite(result.remaining)) res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  if (Number.isFinite(result.reset)) res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.reset / 1_000)));
  return res.status(result.status || 429).json({ error: result.status === 503 ? 'Safety controls are temporarily unavailable.' : message, code: result.code });
}

export function __resetLocalRateLimitsForTests() {
  localWindows.clear();
}
