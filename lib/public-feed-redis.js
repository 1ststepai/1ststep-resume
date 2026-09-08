// Upstash-compatible injected adapter: eval(script, keys, args). No client or I/O on import.
// One hash tag deliberately places admission and source keys in the same Redis slot.
export const PUBLIC_FEED_SCRIPT = `
local op = ARGV[1]
local cfg = cjson.decode(ARGV[2])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local registry = redis.call('GET', KEYS[1])
if registry and registry ~= ARGV[2] then return {'registry-conflict'} end
if op == 'read' then
  return {'read', tostring(now), redis.call('GET', KEYS[6]) or '', redis.call('GET', KEYS[7]) or ''}
end
if not registry then redis.call('SET', KEYS[1], ARGV[2]) end
local token = ARGV[3]
local function release()
  redis.call('DEL', KEYS[2])
  redis.call('ZREM', KEYS[3], token)
  redis.call('ZREM', KEYS[4], token)
end
if op == 'claim' then
  redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)
  redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', now)
  local cooldown = tonumber(redis.call('GET', KEYS[5]) or '0')
  local raw = redis.call('GET', KEYS[7])
  local status = raw and cjson.decode(raw) or {}
  local due = math.max(cooldown, tonumber(status.retryAt or 0))
  if due > now then return {'deferred', tostring(due)} end
  if redis.call('EXISTS', KEYS[2]) == 1 then return {'busy'} end
  if redis.call('ZCARD', KEYS[4]) >= cfg.providerLimit then return {'provider-full'} end
  if redis.call('ZCARD', KEYS[3]) >= cfg.globalLimit then return {'global-full'} end
  local fence = redis.call('INCR', KEYS[8])
  local owner = token .. ':' .. tostring(fence)
  redis.call('SET', KEYS[2], owner, 'PX', cfg.leaseMs)
  redis.call('ZADD', KEYS[3], now + cfg.leaseMs, token)
  redis.call('ZADD', KEYS[4], now + cfg.leaseMs, token)
  redis.call('PEXPIRE', KEYS[3], cfg.leaseMs)
  redis.call('PEXPIRE', KEYS[4], cfg.leaseMs)
  return {'claimed', owner, tostring(fence), tostring(now)}
end
if redis.call('GET', KEYS[2]) ~= ARGV[4] then return {'lease-lost'} end
if op == 'release' then release(); return {'released'} end
if op == 'publish' then
  local observedAt = tonumber(ARGV[6])
  local expiresAt = observedAt + cfg.expireMs
  if expiresAt <= now then release(); return {'expired'} end
  local metadata = cjson.encode({observedAt=observedAt, publishedAt=now,
    freshUntil=observedAt+cfg.freshMs, staleAt=observedAt+cfg.freshMs,
    expiresAt=expiresAt, fence=tonumber(ARGV[7])})
  -- Preserve JSON arrays, especially jobs:[] (Redis cjson re-encodes empty tables as {}).
  -- The private JS publisher supplies a bounded JSON object; do not expose this script as an API.
  local snapshot = string.sub(ARGV[5], 1, -2) .. ',' .. string.sub(metadata, 2)
  redis.call('SET', KEYS[6], snapshot, 'PX', expiresAt - now + cfg.tombstoneMs)
  redis.call('SET', KEYS[7], cjson.encode({state='ok', failures=0, retryAt=now+cfg.pollMs}), 'PX', cfg.statusMs)
  release()
  return {'published'}
end
if op == 'fail' then
  local raw = redis.call('GET', KEYS[7])
  local prior = raw and cjson.decode(raw) or {}
  local failures = math.min(16, (prior.failures or 0) + 1)
  local delay = math.min(cfg.backoffMaxMs, cfg.backoffMs * 2^(failures-1))
  local retry = cjson.decode(ARGV[6])
  delay = math.max(delay, retry.delayMs or 0, (retry.at or now) - now)
  delay = math.min(cfg.retryMaxMs, delay)
  if ARGV[5] == 'throttled' then
    local old = tonumber(redis.call('GET', KEYS[5]) or '0')
    local untilAt = math.max(old, now + delay)
    redis.call('SET', KEYS[5], tostring(untilAt), 'PX', untilAt-now)
  end
  redis.call('SET', KEYS[7], cjson.encode({state=ARGV[5], failures=failures, failedAt=now, retryAt=now+delay}), 'PX', cfg.statusMs)
  release()
  return {'failed', tostring(now+delay)}
end
return {'invalid-operation'}
`;
