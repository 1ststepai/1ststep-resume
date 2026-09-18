import assert from 'node:assert/strict';
import { createJobAgentRun, deleteAllJobAgentRuns, deleteJobAgentRun, jobAgentTenantId } from '../lib/job-agent-run-store.js';
import { canonicalPackageUrl, packageIdentityAliases, packageIdentityMatch, PACKAGE_HISTORY_REQUIRED } from '../lib/application-package-identity.js';
import { createUniquePackageFake } from './package-identity-test-support.mjs';
import { encryptCampaignState, tenantCampaignKeyForTenant } from '../lib/tenant-campaign-store.js';
import { encryptJsonEnvelope } from '../lib/data-encryption-keyring.js';

class RedisFixture {
  values = new Map(); sorted = new Map();
  async get(key) { return this.values.get(key) ?? null; }
  async del(key) { this.sorted.delete(key); return this.values.delete(key); }
  async zadd(key, score, member) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); this.sorted.get(key).set(member, score); }
  async zrem(key, member) { this.sorted.get(key)?.delete(member); }
  async zrange(key, start, end) { return [...(this.sorted.get(key)?.keys() || [])].slice(start, end < 0 ? undefined : end + 1); }
  async eval(script, keys, args) { assert.ok(script.includes('local rawLedger')); return createUniquePackageFake(this, keys, args); }
}
const redis = new RedisFixture();
const config = { redis, subject: 'synthetic-identity-test', partitionSecret: 's'.repeat(40), dataEncryptionKey: Buffer.alloc(32, 11).toString('base64') };
const mission = { roleId: 'role_identity_test', discoveryRunId: 'run_discovery_test', employer: 'Example Corp', title: 'Buyer', requisitionId: 'REQ-10', directEmployerUrl: 'https://jobs.example.test/roles/10?utm_source=feed', applyPathActive: true, resumeText: 'Synthetic reviewed procurement experience. '.repeat(15), jobDescription: 'Synthetic employer procurement responsibilities. '.repeat(15) };
const tenantId = jobAgentTenantId(config.subject, config.partitionSecret);
const create = (idempotencyKey, overrides = {}, extra = {}) => createJobAgentRun({ ...config, mission: { ...mission, ...overrides }, taskType: 'application_package', idempotencyKey, ...extra });

assert.equal(canonicalPackageUrl('https://jobs.example.test/roles/10/?b=2&utm_source=x&a=1#apply'), 'https://jobs.example.test/roles/10?a=1&b=2');
assert.notEqual(canonicalPackageUrl('https://jobs.example.test/?job=10'), canonicalPackageUrl('https://jobs.example.test/?job=11'));
assert.notEqual(canonicalPackageUrl('https://jobs.example.test/ABC'), canonicalPackageUrl('https://jobs.example.test/abc'));
assert.equal(canonicalPackageUrl('https://user:password@jobs.example.test'), '');
assert.equal(packageIdentityMatch(mission, { ...mission, requisitionId: 'REQ-11', directEmployerUrl: 'https://jobs.example.test/11' }), 'possible');
assert.ok(packageIdentityAliases(mission).every(value => /^[a-f0-9]{64}$/.test(value)));

const simultaneous = await Promise.all(Array.from({ length: 12 }, (_, i) => create(`parallel_request_${i}`)));
assert.equal(new Set(simultaneous.map(result => result.run.id)).size, 1);
assert.equal(simultaneous.filter(result => !result.replayed).length, 1);
const runId = simultaneous[0].run.id;
const ledgerKey = `1ststep:job-agent:v1:tenant:${tenantId}:package-identities`;
assert.ok(!redis.values.get(ledgerKey).includes('Example'));
assert.ok(![...redis.values.values()].some(value => String(value).includes(mission.resumeText)));

// Expiring HTTP idempotency keys must not permit tomorrow's rediscovery to pay again.
for (const key of redis.values.keys()) if (key.includes(':idem:')) redis.values.delete(key);
const tomorrow = await create('next_day_request', { roleId: 'new_discovery_card', discoveryRunId: 'next_discovery_run', directEmployerUrl: 'https://jobs.example.test/roles/10?source=newsletter' }, { now: new Date(Date.now() + 86400000) });
assert.equal(tomorrow.run.id, runId);
assert.equal(tomorrow.replayed, true);
const rawRunKey = `1ststep:job-agent:v1:run:${runId}`;
for (const status of ['Searching', 'Preparing', 'Waiting for You', 'Paused', 'Finished', 'Failed']) {
  const raw = JSON.parse(redis.values.get(rawRunKey));
  raw.status = status;
  redis.values.set(rawRunKey, JSON.stringify(raw));
  const replay = await create(`status_replay_${status.replaceAll(' ', '_')}`);
  assert.equal(replay.run.id, runId);
  assert.equal(replay.run.status, status);
}

// A retained receipt-backed or outcome-unknown session is never permission to retry.
const sessionId = 'session_history_fixture';
const sessionKey = `1ststep:application-session:v1:session:${sessionId}`;
const sessionIndex = `1ststep:application-session:v1:tenant:${tenantId}:sessions`;
for (const state of ['Submitted', 'Outcome Unknown', 'Rejected/Closed']) {
  redis.values.set(sessionKey, { id: sessionId, tenantId, version: 1, envelope: encryptJsonEnvelope({ id: sessionId, role: mission, state, packageRunId: runId, receipt: { verified: true } }, { dataEncryptionKey: config.dataEncryptionKey, aad: sessionKey }) });
  await redis.zadd(sessionIndex, 1, sessionId);
  await assert.rejects(create(`session_state_${state.replaceAll(/[^a-z]/gi, '_')}`), new RegExp(PACKAGE_HISTORY_REQUIRED));
}
redis.values.delete(sessionKey);
await redis.zrem(sessionIndex, sessionId);

// Backfill pre-upgrade retained packages without creating another run.
redis.values.delete(ledgerKey);
assert.equal((await create('legacy_package_replay')).run.id, runId);
assert.ok(redis.values.has(ledgerKey));
await assert.rejects(create('ambiguous_same_title', { requisitionId: 'REQ-11', directEmployerUrl: 'https://jobs.example.test/11' }), new RegExp(PACKAGE_HISTORY_REQUIRED));
const otherTenant = await create('other_tenant_request', {}, { subject: 'another-synthetic-tenant' });
assert.notEqual(otherTenant.run.id, runId);

await deleteJobAgentRun({ ...config, runId });
await assert.rejects(create('deleted_package_retry'), new RegExp(PACKAGE_HISTORY_REQUIRED));
await deleteAllJobAgentRuns(config);
assert.equal(await redis.get(ledgerKey), null);
assert.ok(redis.values.has(`1ststep:job-agent:v1:tenant:${jobAgentTenantId('another-synthetic-tenant', config.partitionSecret)}:package-identities`));

// Imported campaign history also holds new generation, including closed/unknown work.
const campaignKey = tenantCampaignKeyForTenant(tenantId);
const state = { version: 1, campaigns: [], runs: [], items: [], humanActions: [], evidence: [], transitions: [], subscriberView: { version: 1, runState: 'Waiting for You', jobCards: [{ id: 'old_card', employer: mission.employer, title: mission.title, requisitionId: mission.requisitionId, directEmployerUrl: mission.directEmployerUrl, status: 'Submitted' }], needsYou: [] } };
redis.values.set(campaignKey, { version: 1, envelope: encryptCampaignState(state, { key: config.dataEncryptionKey, tenantKey: campaignKey }) });
await assert.rejects(create('imported_history_hold'), new RegExp(PACKAGE_HISTORY_REQUIRED));
redis.values.delete(campaignKey);
await redis.zadd(`1ststep:application-session:v1:tenant:${tenantId}:sessions`, 1, 'missing_session');
await assert.rejects(create('unknown_session_hold'), new RegExp(PACKAGE_HISTORY_REQUIRED));
redis.sorted.clear();
for (let i = 0; i < 251; i++) await redis.zadd(`1ststep:job-agent:v1:tenant:${tenantId}:runs`, i, `old_run_${i}`);
await assert.rejects(create('history_page_overflow'), new RegExp(PACKAGE_HISTORY_REQUIRED));
console.log('Package identity tests passed: concurrent/repeated requests, tracking URLs, legacy backfill, tenant isolation, encrypted payloads, deletion, imported history, unknown/oversized history.');
