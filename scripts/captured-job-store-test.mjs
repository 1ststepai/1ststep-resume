import assert from 'node:assert/strict';
import { deleteAllCapturedJobs, listCapturedJobs, readCapturedJob, saveCapturedJob, validateCapturedJob } from '../lib/captured-job-store.js';

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
  async eval(_script, keys, args) {
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
console.log('Encrypted captured-job persistence, immutable replay, tenant isolation, pagination, and deletion tests passed.');
