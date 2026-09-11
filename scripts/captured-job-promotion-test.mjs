import assert from 'node:assert/strict';
import { createCapturedDiscoveryRun } from '../lib/captured-job-verification.js';
import { bindPackageToVerifiedDiscovery } from '../lib/discovery-package-binding.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async zadd(key, score, member) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); this.sorted.get(key).set(String(member), Number(score)); }
  async zrem(key, member) { return (this.sorted.get(key) || new Map()).delete(String(member)); }
  async eval(script, keys, args) {
    if (script.includes("local replay = redis.call('GET', KEYS[2])")) {
      const replay = this.values.get(keys[1]);
      if (replay) return ['replayed', replay];
      this.values.set(keys[0], args[0]); this.values.set(keys[1], args[1]);
      await this.zadd(keys[2], args[2], args[1]); await this.zadd(keys[3], args[2], args[1]);
      return ['created', args[1]];
    }
    const record = JSON.parse(this.values.get(keys[0]) || 'null');
    if (!record) return ['missing'];
    if (record.version !== Number(args[0])) return ['conflict', String(record.version)];
    if (script.includes("record.status ~= 'Searching'")) {
      record.status = 'Searching'; record.lifecycleState = 'Searching'; record.version += 1; record.attempt += 1;
      record.leaseTokenHash = args[1]; record.leaseUntil = args[2]; record.updatedAt = args[3]; record.lastHeartbeatAt = args[3]; record.events.push(JSON.parse(args[7]));
      this.values.set(keys[0], JSON.stringify(record)); return ['claimed', JSON.stringify(record)];
    }
    if (script.includes('record.leaseTokenHash ~= ARGV[2]')) {
      assert.equal(record.leaseTokenHash, args[1]);
      record.version += 1; record.status = args[2]; record.updatedAt = args[3]; record.leaseUntil = args[4]; record.leaseTokenHash = args[5];
      record.resultEnvelope = JSON.parse(args[6]); record.lastErrorCode = args[7]; record.nextAttemptAt = args[8]; record.nextRetryAt = args[8];
      record.lifecycleState = args[13]; record.events.push(JSON.parse(args[15])); this.values.set(keys[0], JSON.stringify(record));
      await this.zrem(keys[1], args[12]); return ['updated', JSON.stringify(record)];
    }
    throw new Error('Unexpected Redis script');
  }
}

const now = new Date('2026-09-09T13:00:00.000Z');
const config = { redis: new FakeRedis(), partitionSecret: 'p'.repeat(48), dataEncryptionKey: Buffer.alloc(32, 4).toString('base64') };
const verifiedJob = {
  provider: 'lever', employer: 'Example Co', title: 'Operations Manager', requisitionId: 'abc-123',
  jobUrl: 'https://jobs.lever.co/exampleco/abc-123', applyUrl: 'https://jobs.lever.co/exampleco/abc-123',
  description: 'Current published employer requirements and responsibilities. '.repeat(12), location: 'Remote', remote: true,
  workplaceType: 'remote', employmentType: 'Full-time', applyPathVerified: true, applyPathVerification: 'current-lever-requisition-reverification', applyPathVerifiedAt: now.toISOString(),
};
const run = await createCapturedDiscoveryRun({ config, subject: 'candidate@example.test', captureId: '12345678-abcd-1234-abcd-123456789abc', verifiedJob, now });
assert.equal(run.status, 'Finished');
assert.equal(run.result.authority, 'published-direct-employer-ats-feed');
assert.equal(run.result.jobs[0].requisitionId, 'abc-123');
const bound = bindPackageToVerifiedDiscovery(run, {
  roleId: 'captured_12345678', discoveryRunId: run.id, employer: verifiedJob.employer, title: verifiedJob.title,
  requisitionId: verifiedJob.requisitionId, directEmployerUrl: verifiedJob.applyUrl, applyPathActive: true,
  resumeText: 'Candidate-reviewed resume content. '.repeat(20), includeCoverLetter: true,
}, { now });
assert.equal(bound.discoveryRunId, run.id);
assert.equal(bound.jobDescription.includes('Current published'), true);
console.log('Verified captured job becomes a real finished discovery run accepted by package binding.');
