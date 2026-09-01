import assert from 'node:assert/strict';
import { processNextExpiredEmployerBrowserSession } from '../lib/employer-browser-session-cleanup.js';
import { createEmployerBrowserSession, readEmployerBrowserSessionForApplication } from '../lib/employer-browser-session-store.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async del(key) { return this.values.delete(key) ? 1 : 0; }
  async zadd(key, score, member) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); this.sorted.get(key).set(member, Number(score)); return 1; }
  async zrem(key, member) { return this.sorted.get(key)?.delete(member) ? 1 : 0; }
  async zrange(key, start, stop, options = {}) {
    let items = [...(this.sorted.get(key) || new Map()).entries()].sort((a, b) => a[1] - b[1]);
    if (options.byScore) items = items.filter(([, score]) => score >= Number(start) && score <= Number(stop)).slice(Number(options.offset) || 0, (Number(options.offset) || 0) + (Number(options.count) || 10));
    else items = items.slice(Number(start), Number(stop) < 0 ? undefined : Number(stop) + 1);
    return items.map(([id]) => id);
  }
  async eval(script, keys, args) {
    if (script.includes("local replay = redis.call('GET', KEYS[2])")) {
      const replay = this.values.get(keys[1]); if (replay) return ['replayed', replay];
      this.values.set(keys[0], args[0]); this.values.set(keys[1], args[1]);
      await this.zadd(keys[2], args[2], args[1]); await this.zadd(keys[3], args[4], args[1]);
      return ['created', args[1]];
    }
    if (script.includes("record.cleanupLeaseTokenHash = ARGV[3]")) {
      const raw = this.values.get(keys[0]); if (!raw) { await this.zrem(keys[1], args[0]); return ['missing']; }
      const record = JSON.parse(raw);
      if (record.cleanupLeaseUntil && record.cleanupLeaseUntil > args[1]) return ['leased'];
      record.cleanupLeaseTokenHash = args[2]; record.cleanupLeaseUntil = args[3]; record.cleanupAttempts = Number(record.cleanupAttempts || 0) + 1;
      this.values.set(keys[0], JSON.stringify(record)); await this.zadd(keys[1], args[5], args[0]);
      return ['claimed', JSON.stringify(record)];
    }
    if (script.includes("return {'released'}")) {
      const record = JSON.parse(this.values.get(keys[0]) || 'null'); if (!record) return ['missing'];
      if (record.cleanupLeaseTokenHash !== args[1]) return ['forbidden'];
      record.cleanupLeaseTokenHash = ''; record.cleanupLeaseUntil = ''; this.values.set(keys[0], JSON.stringify(record)); await this.zadd(keys[1], args[3], args[0]);
      return ['released'];
    }
    if (script.includes("record.cleanupLeaseTokenHash ~= ARGV[3]")) {
      const record = JSON.parse(this.values.get(keys[0]) || 'null'); if (!record) return ['missing'];
      if (record.tenantId !== args[1] || record.cleanupLeaseTokenHash !== args[2]) return ['forbidden'];
      this.values.delete(keys[0]); this.values.delete(keys[1]); await this.zrem(keys[2], args[0]); await this.zrem(keys[3], args[0]); return ['deleted'];
    }
    throw new Error('Unexpected Redis script.');
  }
}

const redis = new FakeRedis();
const createdAt = new Date('2026-08-30T22:00:00.000Z');
const applicationSessionId = 'application_cleanup_fixture_001';
const base = { redis, subject: 'cleanup-candidate@example.test', partitionSecret: 'cleanup-partition-secret-at-least-32-characters', dataEncryptionKey: Buffer.alloc(32, 12).toString('base64') };
await createEmployerBrowserSession({
  ...base, applicationSessionId, employerHostname: 'careers.company.invalid', pageUrl: 'https://careers.company.invalid/apply/REQ-3',
  provider: 'remote-stream', providerSessionReference: 'remote_cleanup_reference_001', viewMode: 'interactive-stream', interactive: true,
  fieldSchemaHash: 'c'.repeat(64), expiresAt: new Date(createdAt.getTime() + 60_000).toISOString(), now: createdAt,
});

let providerCalls = 0;
const retry = await processNextExpiredEmployerBrowserSession({
  ...base, now: new Date(createdAt.getTime() + 61_000),
  dependencies: { closeProvider: async () => { providerCalls += 1; return { status: 'not-confirmed', externalAction: true }; } },
});
assert.deepEqual(retry, { status: 'retry', providerConfirmed: false, externalAction: false, containsCandidateValues: false });
assert.equal(providerCalls, 1);
assert.notEqual(await readEmployerBrowserSessionForApplication({ ...base, applicationSessionId }), null);

const beforeBackoff = await processNextExpiredEmployerBrowserSession({ ...base, now: new Date(createdAt.getTime() + 75_000), dependencies: { closeProvider: async () => ({ status: 'closed' }) } });
assert.equal(beforeBackoff.status, 'idle');
const cleaned = await processNextExpiredEmployerBrowserSession({
  ...base, now: new Date(createdAt.getTime() + 92_000),
  dependencies: { closeProvider: async ({ browserSession }) => {
    providerCalls += 1;
    assert.equal(browserSession.providerSessionReference, 'remote_cleanup_reference_001');
    return { status: 'missing', externalAction: true };
  } },
});
assert.deepEqual(cleaned, { status: 'cleaned', providerConfirmed: true, externalAction: true, containsCandidateValues: false });
assert.equal(providerCalls, 2);
assert.equal(await readEmployerBrowserSessionForApplication({ ...base, applicationSessionId }), null);
assert.equal(JSON.stringify(cleaned).includes('remote_cleanup_reference_001'), false);

console.log('Durable browser-session expiry claim, lease/backoff recovery, provider-confirmed cleanup, encrypted-reference retention, and content-free result tests passed.');
