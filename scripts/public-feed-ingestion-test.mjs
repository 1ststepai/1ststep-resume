import assert from 'node:assert/strict';
import { createPublicFeedIngestion, publicFeedCatalog, publicFeedRetryAfter } from '../lib/public-feed-ingestion.js';
import { PUBLIC_FEED_SCRIPT } from '../lib/public-feed-redis.js';

// A synchronous atomic contract model, NOT a Lua interpreter or evidence of Redis capacity.
class FakeRedis {
  now = 1700000000000;
  values = new Map();
  sorted = new Map();
  calls = [];
  get(key) {
    const item = this.values.get(key);
    if (item && item.until <= this.now) { this.values.delete(key); return null; }
    return item?.value ?? null;
  }
  set(key, value, ttl = Infinity) { this.values.set(key, { value, until: this.now + ttl }); }
  async eval(script, keys, args) {
    assert.equal(script, PUBLIC_FEED_SCRIPT);
    this.calls.push({ keys, args });
    const [op, registry, token, owner, data, extra, fence] = args;
    const cfg = JSON.parse(registry);
    if (this.get(keys[0]) && this.get(keys[0]) !== registry) return ['registry-conflict'];
    if (op === 'read') return ['read', String(this.now), this.get(keys[5]) || '', this.get(keys[6]) || ''];
    if (!this.get(keys[0])) this.set(keys[0], registry);
    const slots = key => {
      if (!this.sorted.has(key)) this.sorted.set(key, new Map());
      return this.sorted.get(key);
    };
    const release = () => {
      this.values.delete(keys[1]); slots(keys[2]).delete(token); slots(keys[3]).delete(token);
    };
    if (op === 'claim') {
      for (const key of [keys[2], keys[3]]) for (const [member, expiry] of slots(key)) if (expiry <= this.now) slots(key).delete(member);
      const status = JSON.parse(this.get(keys[6]) || '{}');
      const due = Math.max(Number(this.get(keys[4]) || 0), status.retryAt || 0);
      if (due > this.now) return ['deferred', String(due)];
      if (this.get(keys[1])) return ['busy'];
      if (slots(keys[3]).size >= cfg.providerLimit) return ['provider-full'];
      if (slots(keys[2]).size >= cfg.globalLimit) return ['global-full'];
      const sequence = Number(this.get(keys[7]) || 0) + 1;
      this.set(keys[7], String(sequence));
      const lease = `${token}:${sequence}`;
      this.set(keys[1], lease, cfg.leaseMs);
      slots(keys[2]).set(token, this.now + cfg.leaseMs);
      slots(keys[3]).set(token, this.now + cfg.leaseMs);
      return ['claimed', lease, String(sequence), String(this.now)];
    }
    if (this.get(keys[1]) !== owner) return ['lease-lost'];
    if (op === 'release') { release(); return ['released']; }
    if (op === 'publish') {
      const snapshot = JSON.parse(data);
      Object.assign(snapshot, { observedAt: Number(extra), publishedAt: this.now, freshUntil: Number(extra) + cfg.freshMs,
        staleAt: Number(extra) + cfg.freshMs, expiresAt: Number(extra) + cfg.expireMs, fence: Number(fence) });
      if (snapshot.expiresAt <= this.now) { release(); return ['expired']; }
      this.set(keys[5], JSON.stringify(snapshot), snapshot.expiresAt - this.now + cfg.tombstoneMs);
      this.set(keys[6], JSON.stringify({ state: 'ok', failures: 0, retryAt: this.now + cfg.pollMs }), cfg.statusMs);
      release(); return ['published'];
    }
    if (op === 'fail') {
      const prior = JSON.parse(this.get(keys[6]) || '{}');
      const failures = Math.min(16, (prior.failures || 0) + 1);
      const retry = JSON.parse(extra);
      const delay = Math.min(cfg.retryMaxMs, Math.max(Math.min(cfg.backoffMaxMs, cfg.backoffMs * 2 ** (failures - 1)), retry.delayMs || 0, (retry.at || this.now) - this.now));
      if (data === 'throttled') {
        const until = Math.max(Number(this.get(keys[4]) || 0), this.now + delay);
        this.set(keys[4], String(until), until - this.now);
      }
      this.set(keys[6], JSON.stringify({ state: data, failures, failedAt: this.now, retryAt: this.now + delay }), cfg.statusMs);
      release(); return ['failed', String(this.now + delay)];
    }
    throw new Error('Unknown operation');
  }
}
const catalog = [
  { provider: 'greenhouse', slug: 'alpha', employer: 'Alpha' },
  { provider: 'greenhouse', slug: 'bravo', employer: 'Bravo' },
  { provider: 'lever', slug: 'charlie', employer: 'Charlie' },
  { provider: 'ashby', slug: 'delta', employer: 'Delta' },
];
const ids = publicFeedCatalog(catalog).map(s => s.id);
const id = slug => ids.find(value => value.endsWith(`:${slug}`));
const job = (number = 123, extra = {}) => ({ id: number, title: `Engineer ${number}`,
  absolute_url: `https://boards.greenhouse.io/alpha/jobs/${number}`, content: 'Public role description',
  location: { name: 'Remote US' }, ...extra });
const ok = (jobs = [job()]) => Response.json({ jobs });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const setup = (fetchImpl = async () => ok(), limits = {}, custom = catalog) => {
  const redis = new FakeRedis();
  const api = createPublicFeedIngestion({ enabled: true, redis, fetchImpl, catalog: custom, limits });
  return { redis, api };
};

assert.throws(() => publicFeedCatalog([]));
assert.throws(() => publicFeedCatalog(Array(101).fill(catalog[0])));
for (const bad of [
  { ...catalog[0], provider: 'unknown' }, { ...catalog[0], slug: '../private' },
  { ...catalog[0], candidateEmail: 'private' }, { ...catalog[0], instance: 'eu' },
  { ...catalog[0], allowedApplyHosts: ['localhost'] },
]) assert.throws(() => publicFeedCatalog([bad]));
assert.throws(() => publicFeedCatalog([catalog[0], { ...catalog[0], slug: 'ALPHA' }]));
assert.throws(() => createPublicFeedIngestion({ limits: { globalLimit: Infinity } }));
assert.throws(() => createPublicFeedIngestion({ limits: { timeoutMs: 30000 } }));
assert.deepEqual(publicFeedRetryAfter('20'), { delayMs: 20000 });
assert.deepEqual(publicFeedRetryAfter('garbage'), {});
assert.deepEqual(publicFeedRetryAfter('Wed, 15 Nov 2023 00:00:00 GMT'), { at: Date.parse('Wed, 15 Nov 2023 00:00:00 GMT') });
{
  const redis = new FakeRedis();
  const api = createPublicFeedIngestion({ redis, catalog, fetchImpl: () => { throw new Error('must not fetch'); } });
  assert.equal((await api.refresh(id('alpha'))).status, 'disabled');
  assert.equal((await api.read(id('alpha'))).reason, 'disabled');
  assert.equal(redis.calls.length, 0);
  await assert.rejects(api.refresh('greenhouse:global:not-registered'));
}
{
  const wait = deferred();
  const { api, redis } = setup(() => wait.promise);
  const pending = api.refresh(id('alpha'));
  assert.equal((await api.refresh(id('alpha'))).status, 'busy');
  wait.resolve(ok());
  assert.equal((await pending).status, 'published');
  const result = await api.read(id('alpha'));
  assert.equal(result.status, 'fresh');
  assert.equal(result.jobs[0].applyPathVerified, false);
  assert.equal(result.jobs[0].exactRequisitionRevalidationRequired, true);
  assert.equal((await api.refresh(id('alpha'))).status, 'deferred');
  redis.now = result.staleAt;
  assert.equal((await api.read(id('alpha'))).status, 'stale');
  assert.equal((await api.readIndex([id('alpha')])).status, 'stale');
  redis.now = result.expiresAt;
  assert.equal((await api.read(id('alpha'))).reason, 'expired');
  redis.now += 3600001;
  assert.equal((await api.read(id('alpha'))).reason, 'missing');
}
{
  const { api } = setup(async () => ok([]));
  assert.equal((await api.refresh(id('alpha'))).status, 'published');
  assert.deepEqual((await api.read(id('alpha'))).jobs, []);
  assert.equal((await api.readIndex([id('alpha')])).status, 'fresh');
}
{
  // Two workers, same adapter/catalog: expired old worker cannot publish OR release the new owner.
  const old = deferred(); const newer = deferred(); let calls = 0;
  const { redis, api } = setup(() => (++calls === 1 ? old.promise : newer.promise));
  const first = api.refresh(id('alpha'));
  await Promise.resolve();
  redis.now += 30001;
  const second = api.refresh(id('alpha'));
  await Promise.resolve();
  old.resolve(ok([job(111)]));
  assert.equal((await first).status, 'lease-lost');
  assert.equal((await api.refresh(id('alpha'))).status, 'busy');
  newer.resolve(ok([job(222)]));
  assert.equal((await second).status, 'published');
  assert.equal((await api.read(id('alpha'))).jobs[0].requisitionId, '222');
  // Replay a recorded stale publication after the newer snapshot is stored.
  const stale = redis.calls.find(call => call.args[0] === 'publish');
  assert.equal((await redis.eval(PUBLIC_FEED_SCRIPT, stale.keys, stale.args))[0], 'lease-lost');
  assert.equal((await api.read(id('alpha'))).jobs[0].requisitionId, '222');
}
{
  const waits = [deferred(), deferred()]; let calls = 0;
  const { api } = setup(() => waits[calls++].promise, { globalLimit: 2, providerLimit: 1 });
  const first = api.refresh(id('alpha'));
  assert.equal((await api.refresh(id('bravo'))).status, 'provider-full');
  const second = api.refresh(id('charlie'));
  assert.equal((await api.refresh(id('delta'))).status, 'global-full');
  waits[0].resolve(ok()); waits[1].resolve(Response.json([]));
  assert.equal((await first).status, 'published');
  assert.equal((await second).status, 'published');
  assert.equal(calls, 2);
}
{
  let calls = 0;
  const { api, redis } = setup(async () => { calls++; return new Response('', { status: 429, headers: { 'retry-after': '120' } }); }, { globalLimit: 1, providerLimit: 1 });
  const throttled = await api.refresh(id('alpha'));
  assert.equal(throttled.status, 'throttled');
  assert.equal(throttled.retryAt, redis.now + 120000);
  assert.equal((await api.refresh(id('bravo'))).status, 'deferred');
  assert.equal(calls, 1);
  // Other provider is admitted immediately; no global slot held during the cooldown.
  assert.equal((await api.refresh(id('charlie'))).status, 'throttled');
  assert.equal(calls, 2);
  redis.now += 120000;
  assert.equal((await api.refresh(id('bravo'))).status, 'throttled');
}
{
  let fail = false;
  const { api, redis } = setup(async () => fail ? new Response('', { status: 503 }) : ok());
  await api.refresh(id('alpha'));
  const before = await api.read(id('alpha'));
  redis.now += 60000; fail = true;
  const failed = await api.refresh(id('alpha'));
  assert.equal(failed.status, 'upstream-failure');
  const after = await api.read(id('alpha'));
  assert.equal(after.status, 'partial');
  assert.deepEqual(after.jobs, before.jobs);
  assert.equal(after.observedAt, before.observedAt);
  assert.equal(failed.retryAt, redis.now + 5000);
  redis.now += 5000;
  assert.equal((await api.refresh(id('alpha'))).retryAt, redis.now + 10000);
  assert.equal((await api.readIndex()).status, 'partial');
  assert.equal((await api.read(id('bravo'))).status, 'unavailable');
}
{
  const controller = new AbortController(); let observed;
  const { api } = setup((_url, init) => { observed = init.signal; return new Promise(() => {}); });
  const pending = api.refresh(id('alpha'), { signal: controller.signal });
  await new Promise(setImmediate);
  controller.abort();
  assert.equal((await pending).status, 'cancelled');
  assert.equal(observed.aborted, true);
  assert.equal((await api.read(id('alpha'))).status, 'unavailable');
  const timed = setup((_url, init) => { observed = init.signal; return new Promise(() => {}); }, { timeoutMs: 5 });
  assert.equal((await timed.api.refresh(id('alpha'))).status, 'timeout');
  assert.equal(observed.aborted, true);
}
{
  let cancelledBody = false;
  const { api } = setup(async () => new Response(new ReadableStream({
    start(stream) { stream.enqueue(new TextEncoder().encode('{"jobs":[')); },
    cancel() { cancelledBody = true; },
  })), { timeoutMs: 5 });
  assert.equal((await api.refresh(id('alpha'))).status, 'timeout');
  assert.equal(cancelledBody, true);
  const slow = createPublicFeedIngestion({ enabled: true, catalog, limits: { redisTimeoutMs: 5 },
    redis: { eval: () => new Promise(() => {}) }, fetchImpl: () => { throw new Error('must not fetch'); } });
  assert.equal((await slow.refresh(id('alpha'))).status, 'unavailable');
  assert.equal((await slow.read(id('alpha'))).status, 'unavailable');
}
{
  const { api, redis } = setup(async () => ok([job(123, {
    candidate: { email: 'PRIVATE_SENTINEL' }, resume: 'PRIVATE_SENTINEL', answers: { secret: 'PRIVATE_SENTINEL' },
    applyPathVerified: true, applyPathVerifiedAt: 'yesterday',
    absolute_url: 'https://boards.greenhouse.io/alpha/jobs/123?email=PRIVATE_SENTINEL',
  })]));
  assert.equal((await api.refresh(id('alpha'))).status, 'published');
  const read = await api.read(id('alpha'));
  assert.equal(read.jobs[0].applyPathVerified, false);
  assert.equal(JSON.stringify([...redis.values]).includes('PRIVATE_SENTINEL'), false);
  assert.equal(JSON.stringify(read).includes('PRIVATE_SENTINEL'), false);
  assert.equal('applyPathVerifiedAt' in read.jobs[0], false);
}
{
  const { api } = setup(async () => ok([job(1), job(2), job(3)]), { maxJobs: 2 });
  const refreshed = await api.refresh(id('alpha'));
  assert.equal(refreshed.coverage, 'partial');
  assert.equal(refreshed.count, 2);
  assert.equal((await api.read(id('alpha'))).status, 'partial');
  const invalid = setup(async () => ok([job(), job(2, { absolute_url: 'https://evil.example/job/2' })]));
  assert.equal((await invalid.api.refresh(id('alpha'))).coverage, 'partial');
  const huge = setup(async () => ok([job()]), { maxResponseBytes: 10 });
  assert.equal((await huge.api.refresh(id('alpha'))).status, 'response-too-large');
  const malformed = setup(async () => Response.json({ unknown: [] }));
  assert.equal((await malformed.api.refresh(id('alpha'))).status, 'invalid-response');
  const small = setup(async () => ok([job(1, { content: 'a'.repeat(12000) }), job(2)]), { maxSnapshotBytes: 2000 });
  assert.equal((await small.api.refresh(id('alpha'))).coverage, 'partial');
}
{
  const source = { provider: 'smartrecruiters', slug: 'Example', employer: 'Example' };
  const { api } = setup(async () => Response.json({ content: [{ id: 'abc', name: 'Engineer' }], totalFound: 200 }), {}, [source]);
  assert.equal((await api.refresh(api.sources[0].id)).coverage, 'partial');
}
{
  const { api, redis } = setup();
  await api.refresh(id('alpha'));
  const incompatible = createPublicFeedIngestion({ enabled: true, redis, catalog, limits: { globalLimit: 3 }, fetchImpl: () => { throw new Error('no request'); } });
  assert.equal((await incompatible.refresh(id('bravo'))).status, 'unavailable');
  assert.equal((await incompatible.read(id('alpha'))).status, 'unavailable');
  const unavailable = createPublicFeedIngestion({ enabled: true, catalog, redis: { eval() { throw new Error('offline'); } }, fetchImpl: () => { throw new Error('no request'); } });
  assert.equal((await unavailable.refresh(id('alpha'))).status, 'unavailable');
  assert.equal((await unavailable.readIndex()).status, 'unavailable');
}
console.log('Public feed ingestion: synthetic contract tests passed (real Redis/Lua and distributed capacity not tested).');
