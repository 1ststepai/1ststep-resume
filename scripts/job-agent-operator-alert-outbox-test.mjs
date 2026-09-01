import assert from 'node:assert/strict';
import {
  enqueueJobAgentOperatorAlert,
  processNextJobAgentOperatorAlert,
  readJobAgentOperatorAlertQueueHealth,
} from '../lib/job-agent-operator-alert-outbox.js';
import { JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST } from '../lib/job-agent-operator-alert.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  setValue(key, value) { this.values.set(key, value); }
  sortedSet(key) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); return this.sorted.get(key); }
  async get(key) { return this.values.get(key) ?? null; }
  async zrange(key, minimum, maximum) {
    return [...this.sortedSet(key).entries()]
      .filter(([, score]) => score >= Number(minimum) && score <= Number(maximum))
      .sort((left, right) => left[1] - right[1])
      .map(([member]) => member);
  }
  async zrem(key, member) { return this.sortedSet(key).delete(member) ? 1 : 0; }
  async zcard(key) { return this.sortedSet(key).size; }
  async zcount(key, minimum, maximum) {
    return [...this.sortedSet(key).values()].filter(score => score >= Number(minimum) && score <= Number(maximum)).length;
  }
  async eval(script, keys, args) {
    if (script.includes("local existing = redis.call('GET', KEYS[2])")) {
      const existing = this.values.get(keys[1]);
      if (existing) return ['deduplicated', existing];
      this.setValue(keys[0], args[0]);
      this.setValue(keys[1], keys[0]);
      this.sortedSet(keys[2]).set(keys[0], Number(args[3]));
      return ['queued', keys[0]];
    }
    const raw = this.values.get(keys[0]);
    if (!raw) return ['missing'];
    const record = JSON.parse(raw);
    if (script.includes("record.status = 'leased'")) {
      if (record.version !== Number(args[0])) return ['not_claimable'];
      record.version += 1;
      record.status = 'leased';
      record.attempt += 1;
      record.leaseTokenHash = args[1];
      record.leaseUntil = args[2];
      record.updatedAt = args[3];
      this.setValue(keys[0], JSON.stringify(record));
      this.sortedSet(keys[1]).set(keys[0], Number(args[5]));
      return ['claimed', JSON.stringify(record)];
    }
    if (record.leaseTokenHash !== args[0]) return ['lease_lost'];
    record.version += 1;
    record.leaseTokenHash = '';
    record.leaseUntil = '';
    if (script.includes("record.status = 'provider-accepted'")) {
      record.status = 'provider-accepted';
      record.nextAttemptAt = '';
      record.updatedAt = args[1];
      record.providerAcceptedAt = args[1];
      this.setValue(keys[0], JSON.stringify(record));
      this.sortedSet(keys[1]).delete(keys[0]);
      return ['provider-accepted', JSON.stringify(record)];
    }
    record.status = args[1];
    record.nextAttemptAt = args[2];
    record.updatedAt = args[3];
    this.setValue(keys[0], JSON.stringify(record));
    this.sortedSet(keys[1]).delete(keys[0]);
    if (record.status === 'retry') this.sortedSet(keys[1]).set(keys[0], Number(args[5]));
    else this.sortedSet(keys[2]).set(keys[0], Number(args[6]));
    return [record.status, JSON.stringify(record)];
  }
}

const env = {
  JOB_AGENT_ALERT_WEBHOOK_URL: 'https://alerts.example.test/job-agent',
  JOB_AGENT_ALERT_ALLOWED_HOSTS: 'alerts.example.test',
  JOB_AGENT_ALERT_BEARER_TOKEN: 'a'.repeat(32),
  JOB_AGENT_ALERT_CONTRACT_VERSION: 'operator-alert-v1',
  UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
  UPSTASH_REDIS_REST_TOKEN: 'redis-token',
  VERCEL_ENV: 'preview',
};
const redis = new FakeRedis();
const firstAt = new Date('2026-08-30T12:00:00.000Z');
const queued = await enqueueJobAgentOperatorAlert('readiness_failure', {
  redis, now: firstAt, contractVersion: env.JOB_AGENT_ALERT_CONTRACT_VERSION,
  contractDigest: JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST, environment: 'preview',
});
assert.equal(queued.status, 'queued');
assert.equal((await enqueueJobAgentOperatorAlert('readiness_failure', {
  redis, now: firstAt, contractVersion: env.JOB_AGENT_ALERT_CONTRACT_VERSION,
  contractDigest: JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST, environment: 'preview',
})).status, 'deduplicated');

const requests = [];
let responseStatus = 503;
const fetchImpl = async (url, init) => {
  requests.push({ url, init });
  return { ok: responseStatus >= 200 && responseStatus < 300, status: responseStatus };
};
const retry = await processNextJobAgentOperatorAlert({ env, redis, now: firstAt, fetchImpl });
assert.equal(retry.status, 'retry');
assert.equal(retry.attempt, 1);
assert.equal(requests.length, 1);
assert.match(requests[0].init.headers['Idempotency-Key'], /^alert-[a-f0-9-]{36}$/);
const requestBody = JSON.parse(requests[0].init.body);
assert.deepEqual(Object.keys(requestBody).sort(), ['schemaVersion', 'service', 'contractVersion', 'contractDigest', 'event', 'severity', 'occurredAt', 'environment', 'contentFree', 'containsCandidateValues'].sort());
assert.equal(requestBody.contentFree, true);
assert.equal(requestBody.containsCandidateValues, false);
assert.doesNotMatch(requests[0].init.body, /email|phone|address|password|otp|captcha/i);

responseStatus = 204;
const retryAt = new Date('2026-08-30T12:01:01.000Z');
const accepted = await processNextJobAgentOperatorAlert({ env, redis, now: retryAt, fetchImpl });
assert.equal(accepted.status, 'provider-accepted');
assert.equal(accepted.attempt, 2);
assert.equal(requests[1].init.headers['Idempotency-Key'], requests[0].init.headers['Idempotency-Key']);
assert.deepEqual(await readJobAgentOperatorAlertQueueHealth({ redis, now: retryAt }), {
  status: 'idle', pending: 0, overdue: 0, failed: 0, contentFree: true, containsCandidateValues: false,
});

const terminalRedis = new FakeRedis();
await enqueueJobAgentOperatorAlert('audit_integrity_failure', {
  redis: terminalRedis, now: firstAt, contractVersion: env.JOB_AGENT_ALERT_CONTRACT_VERSION,
  contractDigest: JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST, environment: 'preview',
});
const terminal = await processNextJobAgentOperatorAlert({ env, redis: terminalRedis, now: firstAt, fetchImpl: async () => ({ ok: false, status: 400 }) });
assert.equal(terminal.status, 'failed');
assert.equal((await readJobAgentOperatorAlertQueueHealth({ redis: terminalRedis, now: firstAt })).status, 'attention-required');

console.log('Durable, idempotent, content-free Job Agent operator alert outbox tests passed.');
