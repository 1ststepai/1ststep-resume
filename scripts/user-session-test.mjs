import assert from 'node:assert/strict';
import {
  createUserSession, readUserSession, revokeAllUserSessions, revokeUserSession,
} from '../lib/user-session-store.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sets = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async del(...keys) { for (const key of keys.flat()) { this.values.delete(key); this.sets.delete(key); } return 1; }
  async eval(script, keys, args) {
    if (script.includes("SCARD")) {
      const members = this.sets.get(keys[1]) || new Set();
      if (members.size >= Number(args[2])) return 'limit';
      if (this.values.has(keys[0])) return 'collision';
      this.values.set(keys[0], args[0]);
      members.add(keys[0]);
      this.sets.set(keys[1], members);
      return 'created';
    }
    if (script.includes("SREM")) {
      this.values.delete(keys[0]);
      this.sets.get(keys[1])?.delete(keys[0]);
      return 1;
    }
    if (script.includes("SMEMBERS")) {
      const members = [...(this.sets.get(keys[0]) || [])];
      for (const key of members) this.values.delete(key);
      this.sets.delete(keys[0]);
      return members.length;
    }
    throw new Error('Unsupported fake Redis script.');
  }
}

const redis = new FakeRedis();
const partitionSecret = 'partition-session-test-secret'.padEnd(48, 'x');
const dataEncryptionKey = Buffer.alloc(32, 7).toString('base64');
const now = new Date('2026-08-29T18:00:00.000Z');
const first = await createUserSession({ redis, subject: 'Person@Example.com', tier: 'complete', entitlements: ['job-agent-controlled-beta'], partitionSecret, dataEncryptionKey, now, ttlSeconds: 3600 });
assert.match(first.token, /^s1\.[A-Za-z0-9_-]{43}$/);
assert.equal(first.subject, 'person@example.com');
assert.equal(first.tier, 'complete');
assert.deepEqual(first.entitlements, ['job-agent-controlled-beta']);
assert.ok(![...redis.values.values()][0].includes('person@example.com'), 'Redis record must not expose the signed-user subject');

const restored = await readUserSession({ redis, token: first.token, partitionSecret, dataEncryptionKey, now: new Date(now.getTime() + 1000) });
assert.equal(restored.subject, 'person@example.com');
assert.equal(restored.authentication, 'opaque-session');
assert.deepEqual(restored.entitlements, ['job-agent-controlled-beta']);
assert.equal(await readUserSession({ redis, token: first.token, partitionSecret: 'wrong'.padEnd(48, 'x'), dataEncryptionKey, now }), null);
assert.equal(await readUserSession({ redis, token: first.token, partitionSecret, dataEncryptionKey: Buffer.alloc(32, 8).toString('base64'), now }), null);
assert.equal(await readUserSession({ redis, token: first.token, partitionSecret, dataEncryptionKey, now: new Date(now.getTime() + 3_700_000) }), null);

const current = await createUserSession({ redis, subject: 'person@example.com', tier: 'complete', partitionSecret, dataEncryptionKey, now, ttlSeconds: 3600 });
assert.equal((await revokeUserSession({ redis, token: current.token, subject: 'person@example.com', partitionSecret })).revoked, true);
assert.equal(await readUserSession({ redis, token: current.token, partitionSecret, dataEncryptionKey, now }), null);

const second = await createUserSession({ redis, subject: 'person@example.com', tier: 'complete', partitionSecret, dataEncryptionKey, now, ttlSeconds: 3600 });
const third = await createUserSession({ redis, subject: 'person@example.com', tier: 'complete', partitionSecret, dataEncryptionKey, now, ttlSeconds: 3600 });
const otherTenant = await createUserSession({ redis, subject: 'other@example.com', tier: 'essential', partitionSecret, dataEncryptionKey, now, ttlSeconds: 3600 });
assert.equal((await revokeAllUserSessions({ redis, subject: 'person@example.com', partitionSecret })).revoked, 2);
assert.equal(await readUserSession({ redis, token: second.token, partitionSecret, dataEncryptionKey, now }), null);
assert.equal(await readUserSession({ redis, token: third.token, partitionSecret, dataEncryptionKey, now }), null);
assert.equal((await readUserSession({ redis, token: otherTenant.token, partitionSecret, dataEncryptionKey, now })).subject, 'other@example.com');
assert.deepEqual((await readUserSession({ redis, token: otherTenant.token, partitionSecret, dataEncryptionKey, now })).entitlements, []);
await assert.rejects(() => createUserSession({ redis, subject: 'person@example.com', tier: 'complete', entitlements: ['unrecognized-product'], partitionSecret, dataEncryptionKey, now }), /not recognized/);

console.log('Encrypted opaque signed-user session creation, isolation, expiry, and revocation tests passed.');
