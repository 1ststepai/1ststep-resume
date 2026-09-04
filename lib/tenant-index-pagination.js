const MAX_PAGE_SIZE = 500;
const MAX_OFFSET = 20_000;

export async function readBoundedTenantIndexPage({ redis, indexKey, offset = 0, limit, defaultLimit = 100, reverse = false, includeTotal = false }) {
  const parsedOffset = Number(offset);
  const parsedLimit = Number(limit);
  if (!redis || typeof redis.zrange !== 'function' || !String(indexKey || '')) throw new Error('A durable tenant index is required.');
  if (!Number.isSafeInteger(parsedOffset) || parsedOffset < 0 || parsedOffset > MAX_OFFSET) throw new Error('Tenant index offset is invalid.');
  const fallback = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(defaultLimit) || 100));
  const boundedLimit = Number.isSafeInteger(parsedLimit) && parsedLimit > 0 ? Math.min(MAX_PAGE_SIZE, parsedLimit) : fallback;
  const ids = reverse
    ? await redis.zrange(indexKey, parsedOffset, parsedOffset + boundedLimit - 1, { rev: true })
    : await redis.zrange(indexKey, parsedOffset, parsedOffset + boundedLimit - 1);
  const normalized = Array.isArray(ids) ? ids.map(String) : [];
  const total = includeTotal ? Number(await redis.zcard(indexKey)) : null;
  if (includeTotal && (!Number.isSafeInteger(total) || total < 0 || total > MAX_OFFSET + 1)) throw new Error('Tenant index cardinality is invalid.');
  return { ids: normalized, scanned: normalized.length, offset: parsedOffset, limit: boundedLimit, total };
}
