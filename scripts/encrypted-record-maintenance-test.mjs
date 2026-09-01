import assert from 'node:assert/strict';
import { encryptJsonEnvelope } from '../lib/data-encryption-keyring.js';
import { encryptedRecordType, inspectEncryptedRecord, maintainEncryptedRedisRecord } from '../lib/encrypted-record-maintenance.js';

class FakeRedis {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); this.conflict = false; }
  async get(key) { return this.values.get(key) || null; }
  async eval(_script, keys, args) {
    const raw = this.values.get(keys[0]);
    if (!raw) return ['missing'];
    const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (this.conflict || Number(record.version) !== Number(args[0])) return ['conflict'];
    this.values.set(keys[0], args[1]);
    return ['updated'];
  }
}

const oldKey = Buffer.alloc(32, 1).toString('base64');
const newKey = Buffer.alloc(32, 2).toString('base64');
const oldOnly = { activeKeyId: 'old-v1', keys: { 'old-v1': oldKey } };
const fullRing = { activeKeyId: 'new-v2', keys: { 'new-v2': newKey, 'old-v1': oldKey } };
const runKey = '1ststep:job-agent:v1:run:run_rotation_fixture';
const privateFixture = { role: 'Synthetic fixture', containsCandidateValues: false };
const runRecord = {
  version: 3,
  missionEnvelope: encryptJsonEnvelope(privateFixture, { dataEncryptionKey: oldOnly, aad: runKey }),
  resultEnvelope: encryptJsonEnvelope({ jobs: [], synthetic: true }, { dataEncryptionKey: oldOnly, aad: runKey }),
};
const redis = new FakeRedis({ [runKey]: JSON.stringify(runRecord) });

assert.equal(encryptedRecordType(runKey), 'run');
assert.equal(encryptedRecordType('1ststep:job-agent:v1:due'), null);
const dry = await maintainEncryptedRedisRecord({ redis, key: runKey, dataEncryptionKey: fullRing });
assert.equal(dry.status, 'verified-needs-reencryption');
assert.equal(dry.needsReencryption, 2);
assert.equal(JSON.parse(redis.values.get(runKey)).missionEnvelope.keyId, 'old-v1');

const applied = await maintainEncryptedRedisRecord({ redis, key: runKey, dataEncryptionKey: fullRing, apply: true });
assert.equal(applied.status, 'updated');
const rewritten = JSON.parse(redis.values.get(runKey));
assert.equal(rewritten.version, 3);
assert.equal(rewritten.missionEnvelope.keyId, 'new-v2');
assert.equal(rewritten.resultEnvelope.keyId, 'new-v2');
const verified = inspectEncryptedRecord({ key: runKey, record: rewritten, dataEncryptionKey: fullRing });
assert.equal(verified.alreadyActive, 2);
assert.equal(verified.needsReencryption, 0);

const conflictingRedis = new FakeRedis({ [runKey]: JSON.stringify(runRecord) });
conflictingRedis.conflict = true;
assert.equal((await maintainEncryptedRedisRecord({ redis: conflictingRedis, key: runKey, dataEncryptionKey: fullRing, apply: true })).status, 'conflict');

const auditKey = '1ststep:application-session:v1:audit:application_fixture_1:7';
const audit = { version: 7, envelope: encryptJsonEnvelope({ synthetic: true }, { dataEncryptionKey: oldOnly, aad: auditKey }) };
assert.equal(inspectEncryptedRecord({ key: auditKey, record: audit, dataEncryptionKey: fullRing }).needsReencryption, 1);
assert.throws(() => inspectEncryptedRecord({ key: auditKey, record: { version: 7, envelope: audit.envelope }, dataEncryptionKey: { activeKeyId: 'new-v2', keys: { 'new-v2': newKey } } }), /could not be decrypted|unavailable/);
for (const [expectedType, key, field] of [
  ['campaign', `1ststep:beta:v1:${'a'.repeat(40)}:campaign`, 'envelope'],
  ['vault', `1ststep:vault:v1:${'b'.repeat(40)}`, 'envelope'],
  ['consent', `1ststep:consent:v1:${'c'.repeat(40)}`, 'envelope'],
  ['schedule', `1ststep:job-agent-schedule:v1:tenant:${'d'.repeat(40)}`, 'missionEnvelope'],
  ['notification-preference', `1ststep:job-agent-notification:v1:tenant:${'f'.repeat(40)}:preference`, 'envelope'],
  ['user-session', `1ststep:user-session:v1:${'e'.repeat(64)}`, 'envelope'],
  ['application-session', '1ststep:application-session:v1:session:application_fixture_1', 'envelope'],
  ['application-follow-up', `1ststep:application-follow-up:v1:tenant:${'9'.repeat(40)}:session:${'8'.repeat(64)}`, 'envelope'],
  ['employer-browser-task', '1ststep:employer-browser-task:v1:task:browser_task_fixture_1', 'payloadEnvelope'],
  ['application-submission-task', '1ststep:application-submission-task:v1:task:submission_task_fixture_1', 'payloadEnvelope'],
  ['application-receipt-task', '1ststep:application-receipt-task:v1:task:receipt_task_fixture_1', 'payloadEnvelope'],
  ['employer-browser-session', '1ststep:employer-browser-session:v1:session:browser_session_fixture_1', 'envelope'],
]) {
  const record = { version: 1, [field]: encryptJsonEnvelope({ synthetic: true }, { dataEncryptionKey: oldOnly, aad: key }) };
  const inspected = inspectEncryptedRecord({ key, record, dataEncryptionKey: fullRing });
  assert.equal(inspected.type, expectedType);
  assert.equal(inspected.needsReencryption, 1);
}
assert.doesNotMatch(JSON.stringify(applied), /Synthetic fixture|jobs/);

console.log('Dry-run, schema allowlist, atomic re-encryption, concurrency conflict, legacy recovery, and content-free maintenance tests passed.');
