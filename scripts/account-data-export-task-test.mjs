import assert from 'node:assert/strict';
import { createAccountDataExportTask, deleteAllAccountDataExportTasks, processExpiredAccountDataExports, processNextAccountDataExportTask, readAccountDataExportDownload, readAccountDataExportQueueHealth, readAccountDataExportTask } from '../lib/account-data-export-task.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async del(...keys) { let count = 0; for (const key of keys) { count += this.values.delete(key) ? 1 : 0; count += this.sorted.delete(key) ? 1 : 0; } return count; }
  async expire() { return 1; }
  async zadd(key, score, member) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); this.sorted.get(key).set(String(member), Number(score)); return 1; }
  async zrem(key, member) { return this.sorted.get(key)?.delete(String(member)) ? 1 : 0; }
  async zcard(key) { return this.sorted.get(key)?.size || 0; }
  async zcount(key, min, max) { return [...(this.sorted.get(key) || new Map()).values()].filter(score => score >= Number(min) && score <= Number(max)).length; }
  async zrange(key, start, end, options = {}) {
    const entries = [...(this.sorted.get(key) || new Map())].sort((a, b) => a[1] - b[1]);
    if (options.byScore) return entries.filter(([, score]) => score >= Number(start) && score <= Number(end)).slice(options.offset || 0, (options.offset || 0) + (options.count || entries.length)).map(([member]) => member);
    return entries.slice(Number(start), Number(end) < 0 ? undefined : Number(end) + 1).map(([member]) => member);
  }
  async eval(script, keys, args) {
    if (script.includes("local active = redis.call('GET', KEYS[2])")) {
      const active = this.values.get(keys[1]);
      if (active) return ['replayed', active];
      this.values.set(keys[0], args[0]); this.values.set(keys[1], args[1]);
      await this.zadd(keys[2], args[2], args[1]); await this.zadd(keys[3], args[2], args[1]);
      return ['created', args[1]];
    }
    const record = JSON.parse(this.values.get(keys[0]));
    if (script.includes("record.status = 'processing'")) {
      if (record.version !== Number(args[0])) return ['conflict'];
      record.version += 1; record.status = 'processing'; record.attempt += 1; record.leaseTokenHash = args[1]; record.leaseUntil = args[2]; record.updatedAt = args[3];
      this.values.set(keys[0], JSON.stringify(record)); await this.zadd(keys[1], args[5], args[6]);
      return ['claimed', JSON.stringify(record)];
    }
    if (script.includes("record.status = 'ready'")) {
      record.version += 1; record.status = 'ready'; record.updatedAt = args[2]; record.completedAt = args[2]; record.expiresAt = args[3]; record.result = JSON.parse(args[4]); record.leaseTokenHash = ''; record.leaseUntil = '';
      this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], args[6]); this.values.delete(keys[2]);
      return ['completed', JSON.stringify(record)];
    }
    throw new Error('Unexpected script');
  }
}

class FakeBlob {
  constructor() { this.values = new Map(); }
  async put(pathname, bytes, options) { assert.equal(options.access, 'private'); this.values.set(pathname, Buffer.from(bytes)); return { pathname }; }
  async get(pathname) { const value = this.values.get(pathname); return value ? { statusCode: 200, stream: new Blob([value]).stream() } : null; }
  async del(paths) { for (const path of Array.isArray(paths) ? paths : [paths]) this.values.delete(path); }
  async list({ prefix }) { return { blobs: [...this.values.keys()].filter(path => path.startsWith(prefix)).map(pathname => ({ pathname })), hasMore: false }; }
}

const redis = new FakeRedis();
const blob = new FakeBlob();
const dataEncryptionKey = Buffer.alloc(32, 21);
const partitionSecret = 'account-export-partition-secret'.padEnd(48, 'x');
const objectStorage = { ready: true, mode: 'vercel-blob-private', token: 'synthetic-private-token-value', blobClient: blob };
const config = { redis, dataEncryptionKey, partitionSecret, objectStorage };
const subject = 'candidate@example.test';
const now = new Date('2026-08-30T12:00:00.000Z');

const created = await createAccountDataExportTask({ ...config, subject, now });
assert.equal(created.task.status, 'queued');
const replay = await createAccountDataExportTask({ ...config, subject, now });
assert.equal(replay.replayed, true);
assert.equal(replay.task.id, created.task.id);
assert.deepEqual(await readAccountDataExportQueueHealth({ redis, now: new Date(now.getTime() + 10_000) }), { status: 'pending', pending: 1, overdue: 0, overdueAfterSeconds: 300, contentFree: true, containsCandidateValues: false, containsAccountIdentifiers: false });
assert.deepEqual(await readAccountDataExportQueueHealth({ redis, now: new Date(now.getTime() + 6 * 60_000) }), { status: 'attention-required', pending: 1, overdue: 1, overdueAfterSeconds: 300, contentFree: true, containsCandidateValues: false, containsAccountIdentifiers: false });
const processed = await processNextAccountDataExportTask({ config, now, buildExport: async () => ({ schemaVersion: 1, account: { subject }, scope: { operationalCollectionsComplete: true } }) });
assert.equal(processed.status, 'ready');
assert.equal((await readAccountDataExportQueueHealth({ redis, now })).status, 'idle');
const ready = await readAccountDataExportTask({ ...config, subject, taskId: created.task.id });
assert.equal(ready.ready, true);
assert.equal(await readAccountDataExportTask({ ...config, subject: 'other@example.test', taskId: created.task.id }), null);
assert.doesNotMatch([...blob.values.values()][0].toString('utf8'), /candidate@example\.test/);
const downloaded = await readAccountDataExportDownload({ ...config, subject, taskId: created.task.id });
assert.equal(JSON.parse(downloaded).scope.operationalCollectionsComplete, true);
const second = await createAccountDataExportTask({ ...config, subject, now: new Date(now.getTime() + 1_000) });
assert.notEqual(second.task.id, created.task.id);
const deleted = await deleteAllAccountDataExportTasks({ ...config, subject });
assert.equal(deleted.deleted, 2);
assert.equal(blob.values.size, 0);
assert.deepEqual(await processExpiredAccountDataExports({ redis, objectStorage, now: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000) }), { status: 'completed', deleted: 0 });
console.log('Durable encrypted account export queue, replay, worker, tenant isolation, integrity download, and provider cleanup tests passed.');
