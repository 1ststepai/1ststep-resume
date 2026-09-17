import assert from 'node:assert/strict';
import { canonicalCapturedJobId, deleteAllCapturedJobs, listCapturedJobs, readCapturedJob, saveCapturedJob, validateCapturedJob } from '../lib/captured-job-store.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async del(...keys) { let count = 0; for (const key of keys) count += this.values.delete(key) ? 1 : 0; return count; }
  async zrange(key, start, end, options = {}) {
    const values = [...(this.sorted.get(key) || new Map())].sort((a, b) => options.rev ? b[1] - a[1] : a[1] - b[1]).map(([id]) => id);
    return values.slice(Number(start), Number(end) + 1);
  }
  async zcard(key) { return (this.sorted.get(key) || new Map()).size; }
  async zrem(key, ...ids) { const set = this.sorted.get(key) || new Map(); let count = 0; for (const id of ids) count += set.delete(String(id)) ? 1 : 0; return count; }
  async zadd(key, score, member) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); this.sorted.get(key).set(String(member), Number(score)); }
  async eval(_script, keys, args) {
    if (keys.length === 4) {
      const alias = this.values.get(keys[0]);
      if (alias && alias !== args[5]) return ['conflict', ''];
      const existing = this.values.get(keys[1]);
      if (existing) {
        if (!alias) { this.values.set(keys[0], args[5]); await this.zadd(keys[3], args[1], args[3]); }
        return ['replayed', existing];
      }
      if (alias) return ['conflict', ''];
      this.values.set(keys[1], args[0]);
      this.values.set(keys[0], args[5]);
      await this.zadd(keys[2], args[1], args[4]);
      await this.zadd(keys[3], args[1], args[3]);
      return ['saved', args[0]];
    }
    const existing = this.values.get(keys[0]);
    if (existing) return ['replayed', existing];
    this.values.set(keys[0], args[0]);
    if (!this.sorted.has(keys[1])) this.sorted.set(keys[1], new Map());
    this.sorted.get(keys[1]).set(String(args[3]), Number(args[1]));
    return ['saved', args[0]];
  }
}

const redis = new FakeRedis();
const config = { redis, subject: 'candidate@example.test', partitionSecret: 'p'.repeat(48), dataEncryptionKey: Buffer.alloc(32, 9).toString('base64') };
const capture = {
  captureId: 'capture_12345678', jobId: 'job-123', jobTitle: 'Operations Manager', company: 'Example Co',
  jobDescription: 'Lead operations and improve customer outcomes. '.repeat(12), applyUrl: 'https://jobs.example.com/openings/job-123',
  location: 'Remote', salaryText: '$100,000-$120,000', captureMethod: 'structured-job-posting', verification: 'unverified',
};

assert.equal(validateCapturedJob(capture).jobContentSha256.length, 64);
assert.throws(() => validateCapturedJob({ ...capture, applyUrl: 'http://127.0.0.1/private' }), /public HTTPS/);
assert.throws(() => validateCapturedJob({ ...capture, captureId: 'bad' }), /capture ID/);
const saved = await saveCapturedJob({ ...config, job: capture, now: new Date('2026-09-09T12:00:00.000Z') });
assert.equal(saved.replayed, false);
assert.equal(saved.job.description.includes('Lead operations'), true);
assert.equal(JSON.stringify([...redis.values.values()]).includes('Lead operations'), false, 'job content must remain encrypted at rest');
const replay = await saveCapturedJob({ ...config, job: { ...capture, jobDescription: 'Reformatted equivalent delivery.' } });
assert.equal(replay.replayed, true);
assert.equal(replay.job.description, saved.job.description, 'capture identity is immutable');
assert.equal(await readCapturedJob({ ...config, subject: 'other@example.test', captureId: capture.captureId }), null);
assert.equal((await readCapturedJob({ ...config, captureId: capture.captureId })).title, 'Operations Manager');
const page = await listCapturedJobs({ ...config, withPageInfo: true });
assert.equal(page.total, 1);
assert.equal(page.items[0].captureId, capture.captureId);
assert.equal((await deleteAllCapturedJobs(config)).deleted, 1);
assert.equal(await readCapturedJob({ ...config, captureId: capture.captureId }), null);

const canonicalId = canonicalCapturedJobId({ provider: 'greenhouse', sourceSlug: 'exampleco', requisitionId: '12345' });
assert.equal(canonicalId.length, 64);
assert.equal(canonicalCapturedJobId({ provider: 'GREENHOUSE', sourceSlug: 'ExampleCo', requisitionId: '12345' }), canonicalId);
assert.notEqual(canonicalCapturedJobId({ provider: 'greenhouse', sourceSlug: 'otherco', requisitionId: '12345' }), canonicalId);
const verified = { ...capture, captureId: 'capture_canonical_a', verification: 'verified', sourceProvider: 'greenhouse', requisitionId: '12345' };
const first = await saveCapturedJob({ ...config, job: verified, canonicalId });
const second = await saveCapturedJob({ ...config, job: { ...verified, captureId: 'capture_canonical_b' }, canonicalId });
assert.equal(first.replayed, false);
assert.equal(second.replayed, true);
assert.equal(second.job.captureId, first.job.captureId, 'both capture IDs converge on the first canonical job');
assert.equal((await readCapturedJob({ ...config, captureId: 'capture_canonical_b' })).captureId, verified.captureId);
assert.equal((await listCapturedJobs({ ...config, withPageInfo: true })).total, 1, 'one tenant owns one canonical record');
assert.equal(JSON.stringify([...redis.values.values()]).includes('Lead operations'), false, 'canonical job content remains encrypted at rest');
const otherTenant = { ...config, subject: 'other@example.test' };
const other = await saveCapturedJob({ ...otherTenant, job: { ...verified, captureId: 'capture_canonical_c' }, canonicalId });
assert.equal(other.replayed, false);
assert.equal((await listCapturedJobs({ ...otherTenant, withPageInfo: true })).total, 1);
assert.equal((await listCapturedJobs({ ...config, withPageInfo: true })).total, 1);
assert.equal(await readCapturedJob({ ...otherTenant, captureId: verified.captureId }), null, 'cross-tenant alias is inaccessible');
await assert.rejects(saveCapturedJob({ ...config, job: { ...verified, captureId: 'capture_canonical_b' }, canonicalId: '0'.repeat(64) }), /different job/);
assert.equal((await deleteAllCapturedJobs(config)).deleted, 1);
assert.equal(await readCapturedJob({ ...config, captureId: 'capture_canonical_a' }), null);
assert.equal(await readCapturedJob({ ...config, captureId: 'capture_canonical_b' }), null);
assert.equal((await listCapturedJobs({ ...otherTenant, withPageInfo: true })).total, 1, 'deletion is tenant-scoped');
console.log('Encrypted persistence, immutable replay, canonical Greenhouse convergence, tenant isolation, pagination, conflict, and deletion tests passed.');
