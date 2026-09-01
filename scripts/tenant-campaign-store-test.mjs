import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  decryptCampaignState, deleteTenantCampaignState, encryptCampaignState, readTenantCampaignState,
  readTenantCampaignStateForTenant, saveTenantCampaignState, saveTenantCampaignStateForTenant,
  tenantCampaignKey, tenantCampaignKeyForTenant, validateDurableCampaignState,
} from '../lib/tenant-campaign-store.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

const state = {
  version: 1, campaigns: [], activeCampaignId: '', runs: [], items: [], humanActions: [], evidence: [], transitions: [],
  workspace: {
    version: 1,
    mission: { role: 'Operations Analyst', roleFamily: 'operations', workModes: ['Remote'], employmentTypes: ['Full-time'], location: 'United States', target: 10 },
    dailyGoal: { target: 10, updatedAt: '2026-08-30T10:00:00.000Z' },
  },
  subscriberView: {
    version: 1, runState: 'Preparing',
    jobCards: [{ id: 'role_1', employer: 'Example Employer', title: 'Operations Analyst', status: 'New', fitScore: 84, directEmployerUrl: 'https://careers.example.test/jobs/role-1' }],
    needsYou: [{ id: 'action_1', roleId: 'role_1', type: 'NEW_QUESTION', summary: 'Confirm a role-specific certification.', status: 'open' }],
  },
};
const encryptionKey = randomBytes(32).toString('base64');
const partitionSecret = 'p'.repeat(40);
const tenantKey = tenantCampaignKey('person@example.test', partitionSecret);
const envelope = encryptCampaignState(state, { key: encryptionKey, tenantKey });
assert.deepEqual(decryptCampaignState(envelope, { key: encryptionKey, tenantKey }), state);
assert.throws(() => decryptCampaignState(envelope, { key: encryptionKey, tenantKey: `${tenantKey}:other` }));
assert.throws(() => validateDurableCampaignState({ ...state, candidateProfile: { name: 'Example' } }), /Private field/);
assert.throws(() => validateDurableCampaignState({ ...state, items: [{ title: 'Call 201-555-0123' }] }), /Private or secret/);
assert.throws(() => validateDurableCampaignState({ ...state, subscriberView: { ...state.subscriberView, needsYou: [{ summary: 'otp: 123456' }] } }), /Private or secret/);
assert.throws(() => validateDurableCampaignState({ ...state, subscriberView: { ...state.subscriberView, needsYou: [{ summary: 'The latest OTP is 654321' }] } }), /Private or secret/);
assert.throws(() => validateDurableCampaignState({ ...state, workspace: { ...state.workspace, mission: { role: 'password is hunter2' } } }), /Private or secret/);
assert.throws(() => validateDurableCampaignState({ ...state, subscriberView: { ...state.subscriberView, jobCards: [{ ...state.subscriberView.jobCards[0], resumeText: 'candidate content' }] } }), /Private field|Unsupported durable subscriber field/);
assert.throws(() => validateDurableCampaignState({ ...state, subscriberView: { ...state.subscriberView, jobCards: [{ ...state.subscriberView.jobCards[0], directEmployerUrl: 'http://careers.example.test/jobs/role-1' }] } }), /credential-free HTTPS URL/);
assert.throws(() => validateDurableCampaignState({ ...state, subscriberView: { ...state.subscriberView, jobCards: Array.from({ length: 101 }, (_, index) => ({ ...state.subscriberView.jobCards[0], id: `role_${index}` })) } }), /at most 100/);
assert.notEqual(tenantCampaignKey('a@example.test', partitionSecret), tenantCampaignKey('b@example.test', partitionSecret));

class FakeRedis {
  values = new Map();
  async get(key) { return this.values.get(key) || null; }
  async del(key) { return this.values.delete(key) ? 1 : 0; }
  async eval(_script, keys, args) {
    const [stateKey, idemKey] = keys;
    if (this.values.has(idemKey)) return ['replayed', this.values.get(idemKey)];
    const current = this.values.has(stateKey) ? JSON.parse(this.values.get(stateKey)).version : 0;
    if (current !== Number(args[0])) return ['conflict', String(current)];
    this.values.set(stateKey, args[2]);
    this.values.set(idemKey, args[1]);
    return ['saved', args[1]];
  }
}

const redis = new FakeRedis();
const first = await saveTenantCampaignState({ redis, subject: 'person@example.test', partitionSecret, dataEncryptionKey: encryptionKey, state, expectedVersion: 0, idempotencyKey: 'save_test_0001' });
assert.equal(first.version, 1);
const replay = await saveTenantCampaignState({ redis, subject: 'person@example.test', partitionSecret, dataEncryptionKey: encryptionKey, state, expectedVersion: 0, idempotencyKey: 'save_test_0001' });
assert.equal(replay.replayed, true);
const conflict = await saveTenantCampaignState({ redis, subject: 'person@example.test', partitionSecret, dataEncryptionKey: encryptionKey, state, expectedVersion: 0, idempotencyKey: 'save_test_0002' });
assert.equal(conflict.conflict, true);
const loaded = await readTenantCampaignState({ redis, subject: 'person@example.test', partitionSecret, dataEncryptionKey: encryptionKey });
assert.deepEqual(loaded.state, state);
assert.equal(loaded.version, 1);
const opaqueTenantId = jobAgentTenantId('person@example.test', partitionSecret);
assert.equal(tenantCampaignKeyForTenant(opaqueTenantId), tenantCampaignKey('person@example.test', partitionSecret));
const tenantLoaded = await readTenantCampaignStateForTenant({ redis, tenantId: opaqueTenantId, dataEncryptionKey: encryptionKey });
assert.deepEqual(tenantLoaded.state, state);
const tenantSaved = await saveTenantCampaignStateForTenant({
  redis, tenantId: opaqueTenantId, dataEncryptionKey: encryptionKey, state,
  expectedVersion: tenantLoaded.version, idempotencyKey: 'save_test_0003',
});
assert.equal(tenantSaved.version, 2);
assert.deepEqual(await deleteTenantCampaignState({ redis, subject: 'person@example.test', partitionSecret }), { ok: true, revoked: true });
assert.equal((await readTenantCampaignState({ redis, subject: 'person@example.test', partitionSecret, dataEncryptionKey: encryptionKey })).state, null);

console.log('Tenant campaign store tests passed.');
