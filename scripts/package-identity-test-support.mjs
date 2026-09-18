// In-memory adapter for existing worker tests. The separate Python check executes
// the production Lua verbatim; this adapter is not the concurrency evidence.
export async function createUniquePackageFake(redis, keys, args) {
  const ledger = JSON.parse(redis.values.get(keys[4]) || '{}');
  const aliases = JSON.parse(args[5]);
  const idem = redis.values.get(keys[1]);
  let existing = idem || args[6];
  let matched = false;
  for (const alias of aliases) {
    if (!ledger[alias]) continue;
    matched = true;
    if (existing && existing !== ledger[alias]) return ['history_required'];
    existing = ledger[alias];
  }
  if (idem && !matched && args[6] !== idem) return ['history_required'];
  if (Object.keys(ledger).length > 2000) return ['history_required'];
  for (const alias of aliases) ledger[alias] = existing || args[1];
  redis.values.set(keys[4], JSON.stringify(ledger));
  if (existing) return ['replayed', existing];
  redis.values.set(keys[0], args[0]);
  redis.values.set(keys[1], args[1]);
  await redis.zadd(keys[2], args[2], args[1]);
  await redis.zadd(keys[3], args[2], args[1]);
  return ['created', args[1]];
}
