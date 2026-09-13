import { createHash } from 'node:crypto';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { jobAgentTenantId } from './job-agent-run-store.js';
import { readBoundedTenantIndexPage } from './tenant-index-pagination.js';
import { analyzeUntrustedJobContent, validatePublicHttpsDestination } from './untrusted-job-content.js';

const BASE = '1ststep:captured-job:v1';
const TTL_SECONDS = 90 * 24 * 60 * 60;
const SAFE_ID = /^[A-Za-z0-9:_-]{8,160}$/;
const MAX_RECORD_BYTES = 90_000;
const CANONICAL_ID = /^[a-f0-9]{64}$/;

const SAVE_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then return {'replayed', existing} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return {'saved', ARGV[1]}
`;

const SAVE_CANONICAL_SCRIPT = `
local alias = redis.call('GET', KEYS[1])
if alias and alias ~= ARGV[6] then return {'conflict', ''} end
local existing = redis.call('GET', KEYS[2])
if existing then
  if not alias then
    local remaining = redis.call('TTL', KEYS[2])
    if remaining <= 0 then return {'conflict', ''} end
    redis.call('SET', KEYS[1], ARGV[6], 'EX', remaining)
    redis.call('ZADD', KEYS[4], ARGV[2], ARGV[4])
    redis.call('EXPIRE', KEYS[4], ARGV[3])
  end
  return {'replayed', existing}
end
if alias then return {'conflict', ''} end
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[3])
redis.call('SET', KEYS[1], ARGV[6], 'EX', ARGV[3])
redis.call('ZADD', KEYS[3], ARGV[2], ARGV[5])
redis.call('ZADD', KEYS[4], ARGV[2], ARGV[4])
redis.call('EXPIRE', KEYS[3], ARGV[3])
redis.call('EXPIRE', KEYS[4], ARGV[3])
return {'saved', ARGV[1]}
`;

function tenantIndex(tenantId) { return `${BASE}:tenant:${tenantId}:index`; }
function aliasIndex(tenantId) { return `${BASE}:tenant:${tenantId}:aliases`; }
function captureKey(tenantId, captureId) { return `${BASE}:tenant:${tenantId}:capture:${captureId}`; }
function canonicalKey(tenantId, canonicalId) { return `${BASE}:tenant:${tenantId}:canonical:${canonicalId}`; }
function tenant(subject, partitionSecret) { return jobAgentTenantId(subject, partitionSecret); }
function parse(raw) { return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; }

export function canonicalCapturedJobId({ provider, sourceSlug, requisitionId } = {}) {
  const parts = [String(provider || '').trim().toLowerCase(), String(sourceSlug || '').trim().toLowerCase(), String(requisitionId || '').trim()];
  return parts.every(Boolean) ? createHash('sha256').update(JSON.stringify(parts)).digest('hex') : '';
}

export function validateCapturedJob(input = {}) {
  const captureId = String(input.captureId || input.id || '').trim();
  if (!SAFE_ID.test(captureId)) throw new Error('A valid capture ID is required.');
  const content = analyzeUntrustedJobContent(String(input.jobDescription || input.description || ''), { maxChars: 50_000 });
  if (!content.normalizedText) throw new Error('A captured job description is required.');
  let applyUrl;
  try { applyUrl = validatePublicHttpsDestination(String(input.applyUrl || input.url || '')); }
  catch { throw new Error('A public HTTPS job URL is required.'); }
  const verification = ['verified', 'unverified', 'closed', 'unavailable'].includes(input.verification) ? input.verification : 'unverified';
  return {
    id: captureId,
    captureId,
    jobId: String(input.jobId || '').trim().slice(0, 160),
    title: String(input.title || input.jobTitle || '').trim().slice(0, 220),
    company: String(input.company || input.employer || '').trim().slice(0, 160),
    description: content.normalizedText,
    applyUrl,
    site: String(input.site || '').trim().slice(0, 100),
    location: String(input.location || '').trim().slice(0, 300),
    salaryText: String(input.salaryText || '').trim().slice(0, 400),
    captureMethod: String(input.captureMethod || '').trim().slice(0, 80),
    verification,
    sourceProvider: String(input.sourceProvider || '').trim().slice(0, 40),
    requisitionId: String(input.requisitionId || '').trim().slice(0, 160),
    discoveryRunId: String(input.discoveryRunId || '').trim().slice(0, 128),
    applyPathActive: verification === 'verified' && input.applyPathActive === true,
    verifiedAt: String(input.verifiedAt || '').trim().slice(0, 40),
    jobContentSha256: content.sha256,
    jobContentTrust: content.trust,
    jobContentInstructionSignals: content.instructionSignals,
  };
}

function decodeRecord(raw, { dataEncryptionKey, key }) {
  const record = parse(raw);
  if (!record?.envelope) return null;
  return {
    ...decryptJsonEnvelope(record.envelope, { dataEncryptionKey, aad: key }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
  };
}

export async function saveCapturedJob({ redis, subject, partitionSecret, dataEncryptionKey, job, canonicalId = '', now = new Date() }) {
  const safe = validateCapturedJob(job);
  if (canonicalId && !CANONICAL_ID.test(canonicalId)) throw new Error('A valid canonical job identity is required.');
  const tenantId = tenant(subject, partitionSecret);
  const aliasKey = captureKey(tenantId, safe.captureId);
  const key = canonicalId ? canonicalKey(tenantId, canonicalId) : aliasKey;
  const timestamp = now.toISOString();
  const record = {
    version: 1,
    tenantId,
    captureId: safe.captureId,
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: new Date(now.getTime() + TTL_SECONDS * 1000).toISOString(),
    envelope: encryptJsonEnvelope(safe, { dataEncryptionKey, aad: key }),
  };
  const serialized = JSON.stringify(record);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RECORD_BYTES) throw new Error('Captured job exceeds the secure storage limit.');
  const response = canonicalId
    ? await redis.eval(SAVE_CANONICAL_SCRIPT, [aliasKey, key, tenantIndex(tenantId), aliasIndex(tenantId)],
      [serialized, String(now.getTime()), String(TTL_SECONDS), safe.captureId, `canonical:${canonicalId}`, `canonical:${canonicalId}`])
    : await redis.eval(SAVE_SCRIPT, [key, tenantIndex(tenantId)], [serialized, String(now.getTime()), String(TTL_SECONDS), safe.captureId]);
  const [status, raw] = Array.isArray(response) ? response : ['error', ''];
  if (status === 'conflict') throw new Error('Capture ID belongs to a different job.');
  if (!['saved', 'replayed'].includes(status)) throw new Error('Captured job could not be saved.');
  const stored = typeof raw === 'string' && raw.startsWith('canonical:')
    ? await readCapturedJob({ redis, subject, partitionSecret, dataEncryptionKey, captureId: safe.captureId })
    : decodeRecord(raw, { dataEncryptionKey, key });
  if (!stored) throw new Error('Captured job could not be restored.');
  return { job: stored, replayed: status === 'replayed' };
}

export async function readCapturedJob({ redis, subject, partitionSecret, dataEncryptionKey, captureId }) {
  if (!SAFE_ID.test(String(captureId || ''))) return null;
  const tenantId = tenant(subject, partitionSecret);
  const key = captureKey(tenantId, captureId);
  const raw = await redis.get(key);
  if (typeof raw === 'string' && raw.startsWith('canonical:')) {
    const canonicalId = raw.slice('canonical:'.length);
    if (!CANONICAL_ID.test(canonicalId)) return null;
    const recordKey = canonicalKey(tenantId, canonicalId);
    return decodeRecord(await redis.get(recordKey), { dataEncryptionKey, key: recordKey });
  }
  return decodeRecord(raw, { dataEncryptionKey, key });
}

export async function listCapturedJobs({ redis, subject, partitionSecret, dataEncryptionKey, offset = 0, limit = 100, withPageInfo = false }) {
  const tenantId = tenant(subject, partitionSecret);
  const page = await readBoundedTenantIndexPage({ redis, indexKey: tenantIndex(tenantId), offset, limit, defaultLimit: 100, reverse: true, includeTotal: withPageInfo });
  const items = [];
  for (const id of page.ids) {
    const canonicalId = String(id).startsWith('canonical:') ? String(id).slice('canonical:'.length) : '';
    const key = CANONICAL_ID.test(canonicalId) ? canonicalKey(tenantId, canonicalId) : captureKey(tenantId, String(id));
    const job = decodeRecord(await redis.get(key), { dataEncryptionKey, key });
    if (job) items.push(job);
  }
  return withPageInfo ? { items, scanned: page.scanned, offset: page.offset, limit: page.limit, total: page.total } : items;
}

export async function deleteAllCapturedJobs({ redis, subject, partitionSecret }) {
  const tenantId = tenant(subject, partitionSecret);
  const index = tenantIndex(tenantId);
  const aliases = aliasIndex(tenantId);
  let deleted = 0;
  for (;;) {
    const ids = await redis.zrange(index, 0, 99);
    if (!Array.isArray(ids) || !ids.length) break;
    await redis.del(...ids.map(id => {
      const canonicalId = String(id).startsWith('canonical:') ? String(id).slice('canonical:'.length) : '';
      return CANONICAL_ID.test(canonicalId) ? canonicalKey(tenantId, canonicalId) : captureKey(tenantId, String(id));
    }));
    await redis.zrem(index, ...ids);
    deleted += ids.length;
    if (deleted > 10_000) throw new Error('Captured-job deletion limit exceeded.');
  }
  let removedAliases = 0;
  for (;;) {
    const ids = await redis.zrange(aliases, 0, 99);
    if (!Array.isArray(ids) || !ids.length) break;
    await redis.del(...ids.map(id => captureKey(tenantId, String(id))));
    await redis.zrem(aliases, ...ids);
    removedAliases += ids.length;
    if (removedAliases > 10_000) throw new Error('Captured-job alias deletion limit exceeded.');
  }
  await redis.del(index);
  await redis.del(aliases);
  return { deleted, contentFree: true, containsCandidateValues: false };
}
