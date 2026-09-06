import { createHash, randomUUID } from 'node:crypto';
import { DEFAULT_PUBLIC_ATS_SOURCES } from './public-ats-catalog.js';
import { normalizePublicPostings, publicSourceUrl, validatePublicSource } from './public-ats-discovery.js';
import { PUBLIC_FEED_SCRIPT } from './public-feed-redis.js';

const BASE = 'public-feed:{public-feed-v1}';
const SOURCE_FIELDS = new Set(['provider', 'slug', 'employer', 'instance', 'allowedApplyHosts']);
const STRING_FIELDS = Object.freeze({ provider: 30, sourceSlug: 80, employer: 120, title: 300,
  requisitionId: 160, jobUrl: 2048, applyUrl: 2048, description: 12000, location: 500,
  workplaceType: 80, employmentType: 80, salaryDisclosure: 500, postedDate: 30, countryCode: 3 });
const DEFAULTS = Object.freeze({ globalLimit: 4, providerLimit: 2, leaseMs: 30000,
  timeoutMs: 10000, redisTimeoutMs: 2000, freshMs: 300000, expireMs: 86400000, tombstoneMs: 3600000,
  pollMs: 60000, backoffMs: 5000, backoffMaxMs: 300000, retryMaxMs: 86400000,
  statusMs: 172800000, maxJobs: 500, maxResponseBytes: 2000000, maxSnapshotBytes: 1000000 });
const MAXIMA = { globalLimit: 16, providerLimit: 4, leaseMs: 120000, timeoutMs: 60000, redisTimeoutMs: 5000,
  freshMs: 3600000, expireMs: 604800000, tombstoneMs: 86400000, pollMs: 86400000,
  backoffMs: 60000, backoffMaxMs: 3600000, retryMaxMs: 604800000, statusMs: 1209600000,
  maxJobs: 1000, maxResponseBytes: 4000000, maxSnapshotBytes: 2000000 };
const hash = value => createHash('sha256').update(value).digest('hex');

function sourceIdentity(source) {
  return `${source.provider}:${source.instance}:${source.slug.toLowerCase()}`;
}

export function publicFeedCatalog(inputs = DEFAULT_PUBLIC_ATS_SOURCES) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 100) throw new Error('Invalid catalog size');
  const seen = new Set();
  return Object.freeze(inputs.map(input => {
    if (!input || Object.keys(input).some(key => !SOURCE_FIELDS.has(key))) throw new Error('Invalid catalog fields');
    if (input.instance !== undefined && !['global', 'eu'].includes(input.instance)) throw new Error('Invalid instance');
    if (input.instance === 'eu' && input.provider !== 'lever') throw new Error('Invalid provider instance');
    const source = validatePublicSource(input);
    if (input.allowedApplyHosts !== undefined && (!Array.isArray(input.allowedApplyHosts)
      || input.allowedApplyHosts.length > 5 || source.allowedApplyHosts.length !== input.allowedApplyHosts.length)) throw new Error('Invalid Apply hosts');
    const id = sourceIdentity(source);
    if (seen.has(id)) throw new Error('Duplicate source identity');
    seen.add(id);
    return Object.freeze({ id, ...source, allowedApplyHosts: Object.freeze(source.allowedApplyHosts) });
  }).sort((a, b) => a.id.localeCompare(b.id)));
}

function options(input) {
  if (Object.keys(input).some(key => !(key in DEFAULTS))) throw new Error('Unknown feed option');
  const cfg = { ...DEFAULTS, ...input };
  for (const [key, value] of Object.entries(cfg)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > MAXIMA[key]) throw new Error(`Invalid ${key}`);
  }
  if (cfg.timeoutMs + 2 * cfg.redisTimeoutMs >= cfg.leaseMs || cfg.freshMs >= cfg.expireMs || cfg.providerLimit > cfg.globalLimit
    || cfg.backoffMs > cfg.backoffMaxMs || cfg.backoffMaxMs > cfg.retryMaxMs
    || cfg.statusMs < Math.max(cfg.retryMaxMs, cfg.pollMs, cfg.expireMs + cfg.tombstoneMs)) throw new Error('Inconsistent feed limits');
  return cfg;
}

// Deliberately reconstruct records: no spreads of upstream/candidate objects, verification or tenant state.
function publicRecord(job) {
  const record = {};
  for (const [key, cap] of Object.entries(STRING_FIELDS)) {
    if (typeof job[key] === 'string') record[key] = job[key].slice(0, cap);
  }
  // Tracking/query values are not required as evidence of current availability.
  for (const key of ['jobUrl', 'applyUrl']) {
    const url = new URL(record[key]);
    // Greenhouse custom URLs may locate the requisition in a query parameter; preserve only its identity.
    for (const param of [...url.searchParams.keys()]) {
      if (!['gh_jid', 'jid'].includes(param) || url.searchParams.get(param) !== record.requisitionId) url.searchParams.delete(param);
    }
    url.hash = '';
    record[key] = url.href;
  }
  record.remote = job.remote === true;
  for (const key of ['salaryMin', 'salaryMax']) record[key] = Number.isFinite(job[key]) ? job[key] : null;
  record.applyPathVerified = false;
  record.applyPathVerification = 'pending-current-requisition-check';
  record.exactRequisitionRevalidationRequired = true;
  return record;
}

export function publicFeedRetryAfter(value) {
  if (typeof value !== 'string' || value.length > 100) return {};
  if (/^\d+$/.test(value.trim())) return { delayMs: Math.min(604800000, Number(value) * 1000) };
  const at = Date.parse(value);
  return Number.isFinite(at) ? { at } : {};
}

async function responseJson(response, maxBytes, signal) {
  if (!response?.body?.getReader) throw new Error('invalid-response');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks = [];
  let size = 0;
  try {
    if (Number(response.headers?.get('content-length')) > maxBytes) throw new Error('response-too-large');
    while (true) {
      if (signal.aborted) throw new Error('cancelled');
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('response-too-large');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { signal.removeEventListener('abort', cancel); cancel(); }
}

function normalizeSnapshot(source, payload, cfg) {
  const field = source.provider === 'smartrecruiters' ? 'content' : 'jobs';
  const rows = source.provider === 'lever' ? payload : payload?.[field];
  if (!Array.isArray(rows) || (source.provider === 'ashby' && String(payload.apiVersion) !== '1')) throw new Error('invalid-response');
  const selected = rows.slice(0, cfg.maxJobs);
  const bounded = source.provider === 'lever' ? selected : { [field]: selected, apiVersion: payload.apiVersion };
  const normalized = normalizePublicPostings(source, bounded);
  const jobs = [];
  const seen = new Set();
  let bytes = 1024;
  let partial = rows.length > cfg.maxJobs || normalized.length !== selected.length;
  // This module intentionally requests one public page, with no detail fanout or new scraper.
  if (source.provider === 'smartrecruiters' && (!Number.isFinite(payload.totalFound)
    || payload.totalFound > rows.length)) partial = true;
  for (const job of normalized) {
    if (job.requisitionId.length > 160 || job.jobUrl.length > 2048 || job.applyUrl.length > 2048) { partial = true; continue; }
    const record = publicRecord(job);
    if (seen.has(record.requisitionId)) { partial = true; continue; }
    const cost = Buffer.byteLength(JSON.stringify(record)) + 1;
    if (bytes + cost > cfg.maxSnapshotBytes) { partial = true; break; }
    jobs.push(record); seen.add(record.requisitionId); bytes += cost;
  }
  return { sourceId: source.id, jobs, coverage: partial ? 'partial' : 'complete',
    detailEnrichment: 'not-performed', exactRequisitionRevalidationRequired: true };
}

export function createPublicFeedIngestion({ enabled = false, redis, fetchImpl,
  catalog = DEFAULT_PUBLIC_ATS_SOURCES, limits = {} } = {}) {
  const sources = publicFeedCatalog(catalog);
  const byId = new Map(sources.map(source => [source.id, source]));
  const cfg = options(limits);
  // A fixed registry key prevents divergent catalogs/limits from silently multiplying capacity.
  const registry = JSON.stringify({ ...cfg, catalogHash: hash(JSON.stringify(sources)) });
  function sourceFor(id) {
    if (typeof id !== 'string' || !byId.has(id)) throw new Error('Unknown catalog source identity');
    return byId.get(id);
  }
  async function operation(op, source, token = '', owner = '', ...args) {
    if (!redis?.eval) throw new Error('redis-unavailable');
    const key = `${BASE}:source:${hash(source.id)}`;
    let timer;
    try {
      const result = await Promise.race([redis.eval(PUBLIC_FEED_SCRIPT,
        [`${BASE}:registry`, `${key}:lease`, `${BASE}:global`, `${BASE}:provider:${source.provider}`,
          `${BASE}:cooldown:${source.provider}`, `${key}:snapshot`, `${key}:status`, `${BASE}:sequence`],
        [op, registry, token, owner, ...args].map(String)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('redis-timeout')), cfg.redisTimeoutMs); })]);
      if (result[0] === 'registry-conflict') throw new Error('registry-conflict');
      return result;
    } finally { clearTimeout(timer); }
  }

  async function refresh(id, { signal } = {}) {
    const source = sourceFor(id);
    if (enabled !== true) return { status: 'disabled' };
    if (signal?.aborted) return { status: 'cancelled' };
    if (typeof fetchImpl !== 'function') return { status: 'unavailable' };
    const token = randomUUID();
    let claim;
    try { claim = await operation('claim', source, token); }
    catch { return { status: 'unavailable' }; }
    if (claim[0] !== 'claimed') return { status: claim[0], retryAt: Number(claim[1]) || null };
    const [, owner, fence, observedAt] = claim;
    const controller = new AbortController();
    let timeout;
    let abort;
    let reason = 'cancelled';
    try {
      const stop = new Promise((_, reject) => {
        abort = () => { controller.abort(); reject(new Error(reason)); };
        signal?.addEventListener('abort', abort, { once: true });
        timeout = setTimeout(() => { reason = 'timeout'; abort(); }, cfg.timeoutMs);
        if (signal?.aborted) abort();
      });
      const work = async () => {
        if (controller.signal.aborted) throw new Error(reason);
        const response = await fetchImpl(publicSourceUrl(source), { signal: controller.signal,
          redirect: 'error', credentials: 'omit', headers: { accept: 'application/json' } });
        if (response.status === 429) {
          void response.body?.cancel().catch(() => {});
          const error = new Error('throttled');
          error.retry = publicFeedRetryAfter(response.headers?.get('retry-after'));
          throw error;
        }
        if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new Error('upstream-failure'); }
        const payload = await responseJson(response, cfg.maxResponseBytes, controller.signal);
        if (controller.signal.aborted) throw new Error(reason);
        return normalizeSnapshot(source, payload, cfg);
      };
      const snapshot = await Promise.race([work(), stop]);
      if (controller.signal.aborted) throw new Error(reason);
      const serialized = JSON.stringify(snapshot);
      if (Buffer.byteLength(serialized) + 512 > cfg.maxSnapshotBytes) throw new Error('snapshot-too-large');
      const result = await operation('publish', source, token, owner, serialized, observedAt, fence);
      return { status: result[0], coverage: snapshot.coverage, count: snapshot.jobs.length };
    } catch (error) {
      const state = ['throttled', 'timeout', 'cancelled', 'invalid-response', 'response-too-large', 'snapshot-too-large'].includes(error.message)
        ? error.message : 'upstream-failure';
      try {
        const result = await operation('fail', source, token, owner, state, JSON.stringify(error.retry || {}));
        return { status: result[0] === 'lease-lost' ? 'lease-lost' : state, retryAt: Number(result[1]) || null };
      } catch { return { status: 'unavailable' }; }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      controller.abort();
      // A transport-unknown publication is never retried. Compare-owner cleanup is safe either way.
      try { await operation('release', source, token, owner); } catch { /* TTL recovers crashes/outages. */ }
    }
  }

  async function read(id) {
    const source = sourceFor(id);
    if (enabled !== true) return { sourceId: id, status: 'unavailable', reason: 'disabled', jobs: [] };
    try {
      const [, nowRaw, raw, statusRaw] = await operation('read', source);
      const now = Number(nowRaw);
      const snapshot = raw ? JSON.parse(raw) : null;
      const last = statusRaw ? JSON.parse(statusRaw) : null;
      if (!snapshot) return { sourceId: id, status: 'unavailable', reason: 'missing', jobs: [] };
      if (now >= snapshot.expiresAt) return { sourceId: id, status: 'unavailable', reason: 'expired', jobs: [], expiresAt: snapshot.expiresAt };
      const stale = now >= snapshot.freshUntil;
      const partial = snapshot.coverage === 'partial' || (last && last.state !== 'ok');
      return { sourceId: id, status: stale ? 'stale' : partial ? 'partial' : 'fresh',
        coverage: partial ? 'partial' : 'complete', freshness: stale ? 'stale' : 'fresh',
        observedAt: snapshot.observedAt, publishedAt: snapshot.publishedAt, freshUntil: snapshot.freshUntil,
        staleAt: snapshot.staleAt, expiresAt: snapshot.expiresAt, lastRefreshFailed: Boolean(last && last.state !== 'ok'),
        jobs: snapshot.jobs.map(publicRecord), exactRequisitionRevalidationRequired: true };
    } catch { return { sourceId: id, status: 'unavailable', reason: 'store-unavailable', jobs: [] }; }
  }

  async function readIndex(ids = sources.map(source => source.id)) {
    if (!Array.isArray(ids) || ids.length > sources.length || new Set(ids).size !== ids.length) throw new Error('Invalid source selection');
    ids.forEach(sourceFor);
    // Sequential bounded reads avoid turning a consumer request into an unbounded Redis fanout.
    const coverage = [];
    for (const id of ids) coverage.push(await read(id));
    const available = coverage.filter(item => item.status !== 'unavailable');
    return { status: !available.length ? 'unavailable' : coverage.some(item => item.status === 'unavailable' || item.coverage === 'partial')
      ? 'partial' : coverage.some(item => item.status === 'stale') ? 'stale' : 'fresh',
    sources: coverage, exactRequisitionRevalidationRequired: true };
  }
  return Object.freeze({ sources, refresh, read, readIndex });
}
