import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { jobAgentTenantId } from './job-agent-run-store.js';
import { readBoundedTenantIndexPage } from './tenant-index-pagination.js';
import { analyzeUntrustedJobContent, validatePublicHttpsDestination } from './untrusted-job-content.js';

const BASE = '1ststep:captured-job:v1';
const TTL_SECONDS = 90 * 24 * 60 * 60;
const SAFE_ID = /^[A-Za-z0-9:_-]{8,160}$/;
const MAX_RECORD_BYTES = 90_000;

const SAVE_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then return {'replayed', existing} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return {'saved', ARGV[1]}
`;

function tenantIndex(tenantId) { return `${BASE}:tenant:${tenantId}:index`; }
function captureKey(tenantId, captureId) { return `${BASE}:tenant:${tenantId}:capture:${captureId}`; }
function tenant(subject, partitionSecret) { return jobAgentTenantId(subject, partitionSecret); }
function parse(raw) { return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; }

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

export async function saveCapturedJob({ redis, subject, partitionSecret, dataEncryptionKey, job, now = new Date() }) {
  const safe = validateCapturedJob(job);
  const tenantId = tenant(subject, partitionSecret);
  const key = captureKey(tenantId, safe.captureId);
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
  const response = await redis.eval(SAVE_SCRIPT, [key, tenantIndex(tenantId)], [serialized, String(now.getTime()), String(TTL_SECONDS), safe.captureId]);
  const [status, raw] = Array.isArray(response) ? response : ['error', ''];
  if (!['saved', 'replayed'].includes(status)) throw new Error('Captured job could not be saved.');
  const stored = decodeRecord(raw, { dataEncryptionKey, key });
  if (!stored) throw new Error('Captured job could not be restored.');
  return { job: stored, replayed: status === 'replayed' };
}

export async function readCapturedJob({ redis, subject, partitionSecret, dataEncryptionKey, captureId }) {
  if (!SAFE_ID.test(String(captureId || ''))) return null;
  const tenantId = tenant(subject, partitionSecret);
  const key = captureKey(tenantId, captureId);
  return decodeRecord(await redis.get(key), { dataEncryptionKey, key });
}

export async function listCapturedJobs({ redis, subject, partitionSecret, dataEncryptionKey, offset = 0, limit = 100, withPageInfo = false }) {
  const tenantId = tenant(subject, partitionSecret);
  const page = await readBoundedTenantIndexPage({ redis, indexKey: tenantIndex(tenantId), offset, limit, defaultLimit: 100, reverse: true, includeTotal: withPageInfo });
  const items = [];
  for (const captureId of page.ids) {
    const key = captureKey(tenantId, captureId);
    const job = decodeRecord(await redis.get(key), { dataEncryptionKey, key });
    if (job) items.push(job);
  }
  return withPageInfo ? { items, scanned: page.scanned, offset: page.offset, limit: page.limit, total: page.total } : items;
}

export async function deleteAllCapturedJobs({ redis, subject, partitionSecret }) {
  const tenantId = tenant(subject, partitionSecret);
  const index = tenantIndex(tenantId);
  let deleted = 0;
  for (;;) {
    const ids = await redis.zrange(index, 0, 99);
    if (!Array.isArray(ids) || !ids.length) break;
    await redis.del(...ids.map(id => captureKey(tenantId, String(id))));
    await redis.zrem(index, ...ids);
    deleted += ids.length;
    if (deleted > 10_000) throw new Error('Captured-job deletion limit exceeded.');
  }
  await redis.del(index);
  return { deleted, contentFree: true, containsCandidateValues: false };
}
