import assert from 'node:assert/strict';
import { closeEmployerBrowserHandoff, createEmployerBrowserHandoff, employerBrowserSessionProviderConfiguration, resumeEmployerBrowserHandoff } from '../lib/employer-browser-session-provider.js';
import { BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED, closeAllEmployerBrowserSessionsBeforeDelete, closeEmployerBrowserSessionBeforeDelete } from '../lib/employer-browser-session-lifecycle.js';
import { createEmployerBrowserSession, listEmployerBrowserSessionSummaries, listEmployerBrowserSessionsInternal, readEmployerBrowserSessionForApplication } from '../lib/employer-browser-session-store.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async del(key) { return this.values.delete(key) ? 1 : 0; }
  async zadd(key, score, member) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); this.sorted.get(key).set(member, Number(score)); return 1; }
  async zrem(key, member) { return this.sorted.get(key)?.delete(member) ? 1 : 0; }
  async zrange(key, start, stop, options = {}) {
    const items = [...(this.sorted.get(key) || new Map()).entries()].sort((a, b) => options.rev ? b[1] - a[1] : a[1] - b[1]).map(([id]) => id);
    return items.slice(Number(start), Number(stop) < 0 ? undefined : Number(stop) + 1);
  }
  async eval(script, keys, args) {
    if (script.includes("local replay = redis.call('GET', KEYS[2])")) {
      const replay = this.values.get(keys[1]); if (replay) return ['replayed', replay];
      this.values.set(keys[0], args[0]); this.values.set(keys[1], args[1]); await this.zadd(keys[2], args[2], args[1]); return ['created', args[1]];
    }
    if (script.includes("record.tenantId ~= ARGV[1]")) {
      const record = JSON.parse(this.values.get(keys[0]) || 'null');
      if (!record) { this.values.delete(keys[1]); return ['missing']; }
      if (record.tenantId !== args[0]) return ['forbidden'];
      this.values.delete(keys[0]); this.values.delete(keys[1]); await this.zrem(keys[2], args[1]); return ['deleted'];
    }
    throw new Error('Unexpected Redis script.');
  }
}

const now = new Date('2026-08-30T20:00:00.000Z');
const application = {
  id: 'application_browser_handoff_fixture',
  role: { employer: 'Example Employer', title: 'Buyer', requisitionId: 'REQ-1', directEmployerUrl: 'https://jobs.example.test/apply/REQ-1' },
  proposedFields: [
    { fieldKey: 'firstName', label: 'First name', maskedPreview: 'J••••' },
    { fieldKey: 'email', label: 'Email address', maskedPreview: 'j•••@example.test' },
  ],
};
assert.equal(employerBrowserSessionProviderConfiguration({ EMPLOYER_BROWSER_SESSION_PROVIDER: 'synthetic-fixture', EMPLOYER_BROWSER_SESSION_FIXTURE_ENABLED: 'true' }).enabled, true);
assert.equal(employerBrowserSessionProviderConfiguration({ VERCEL_ENV: 'production', EMPLOYER_BROWSER_SESSION_PROVIDER: 'synthetic-fixture', EMPLOYER_BROWSER_SESSION_FIXTURE_ENABLED: 'true' }).enabled, false);
assert.equal(employerBrowserSessionProviderConfiguration({ EMPLOYER_BROWSER_SESSION_PROVIDER: 'remote-stream' }).reason, 'remote-stream-disabled');

const handoff = await createEmployerBrowserHandoff({ session: application, env: { EMPLOYER_BROWSER_SESSION_PROVIDER: 'synthetic-fixture', EMPLOYER_BROWSER_SESSION_FIXTURE_ENABLED: 'true' }, now });
assert.equal(handoff.status, 'ready');
assert.equal(handoff.interactive, false);
assert.equal(handoff.externalNavigation, false);
assert.equal(handoff.containsCandidateFieldValues, false);
assert.match(handoff.previewImageDataUrl, /^data:image\/svg\+xml;base64,/);
assert.doesNotMatch(Buffer.from(handoff.previewImageDataUrl.split(',')[1], 'base64').toString('utf8'), /J••|j•••@/);

const redis = new FakeRedis();
const base = { redis, subject: 'candidate@example.test', partitionSecret: 'p'.repeat(48), dataEncryptionKey: Buffer.alloc(32, 9).toString('base64') };
await assert.rejects(createEmployerBrowserSession({
  ...base, applicationSessionId: application.id, employerHostname: handoff.employerHostname, pageUrl: handoff.pageUrl,
  provider: handoff.provider, providerSessionReference: handoff.providerSessionReference, viewMode: handoff.viewMode,
  interactive: false, fieldSchemaHash: handoff.fieldSchemaHash, expiresAt: 'not-a-date', now,
}), /expiration is invalid/);
const created = await createEmployerBrowserSession({
  ...base, applicationSessionId: application.id, employerHostname: handoff.employerHostname, pageUrl: handoff.pageUrl,
  provider: handoff.provider, providerSessionReference: handoff.providerSessionReference, viewMode: handoff.viewMode,
  interactive: handoff.interactive, fieldSchemaHash: handoff.fieldSchemaHash, expiresAt: handoff.expiresAt, now,
});
assert.equal(created.session.status, 'ready');
assert.equal(created.session.containsCandidateFieldValues, false);
assert.equal([...redis.values.values()].some(value => String(value).includes(handoff.providerSessionReference)), false);
const replay = await createEmployerBrowserSession({
  ...base, applicationSessionId: application.id, employerHostname: handoff.employerHostname, pageUrl: handoff.pageUrl,
  provider: handoff.provider, providerSessionReference: 'fixture_session_different', viewMode: handoff.viewMode,
  fieldSchemaHash: handoff.fieldSchemaHash, expiresAt: handoff.expiresAt, now,
});
assert.equal(replay.replayed, true);
assert.equal(replay.session.id, created.session.id);
assert.equal(await readEmployerBrowserSessionForApplication({ ...base, subject: 'other@example.test', applicationSessionId: application.id }), null);
const internal = await readEmployerBrowserSessionForApplication({ ...base, applicationSessionId: application.id, includeProviderReference: true, now });
assert.equal(internal.providerSessionReference, handoff.providerSessionReference);
const restored = await resumeEmployerBrowserHandoff({ session: application, browserSession: internal, env: { EMPLOYER_BROWSER_SESSION_PROVIDER: 'synthetic-fixture', EMPLOYER_BROWSER_SESSION_FIXTURE_ENABLED: 'true' } });
assert.equal(restored.status, 'ready');
assert.equal(restored.fieldSchemaHash, handoff.fieldSchemaHash);
assert.deepEqual(await closeEmployerBrowserHandoff({ browserSession: internal, env: { EMPLOYER_BROWSER_SESSION_PROVIDER: 'synthetic-fixture', EMPLOYER_BROWSER_SESSION_FIXTURE_ENABLED: 'true' } }), { status: 'closed', externalAction: false });
assert.equal((await closeEmployerBrowserHandoff({ browserSession: { ...internal, provider: 'remote-stream' }, env: { EMPLOYER_BROWSER_SESSION_PROVIDER: 'remote-stream' } })).status, 'not-configured');
const summaries = await listEmployerBrowserSessionSummaries({ ...base, now });
assert.equal(summaries.length, 1);
assert.equal(JSON.stringify(summaries).includes('providerSessionReference'), false);
await assert.rejects(closeEmployerBrowserSessionBeforeDelete({
  config: base, subject: base.subject, applicationSessionId: application.id,
  closeProvider: async () => ({ status: 'not-configured' }),
}), error => {
  assert.equal(error?.code, BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED);
  assert.equal(String(error?.message || '').includes(internal.providerSessionReference), false);
  return true;
});
assert.notEqual(await readEmployerBrowserSessionForApplication({ ...base, applicationSessionId: application.id }), null);
const confirmedCleanup = await closeEmployerBrowserSessionBeforeDelete({
  config: base, subject: base.subject, applicationSessionId: application.id,
  closeProvider: async () => ({ status: 'closed' }),
});
assert.deepEqual(confirmedCleanup, { closed: true, deleted: true });
assert.equal(await readEmployerBrowserSessionForApplication({ ...base, applicationSessionId: application.id }), null);

for (const suffix of ['bulk_a', 'bulk_b']) await createEmployerBrowserSession({
  ...base, applicationSessionId: `application_browser_${suffix}`, employerHostname: handoff.employerHostname, pageUrl: handoff.pageUrl,
  provider: handoff.provider, providerSessionReference: `fixture_session_${suffix}`, viewMode: handoff.viewMode,
  fieldSchemaHash: handoff.fieldSchemaHash, expiresAt: handoff.expiresAt, now,
});
const otherBase = { ...base, subject: 'separate-candidate@example.test' };
await createEmployerBrowserSession({
  ...otherBase, applicationSessionId: 'application_browser_other_tenant', employerHostname: handoff.employerHostname, pageUrl: handoff.pageUrl,
  provider: handoff.provider, providerSessionReference: 'fixture_session_other_tenant', viewMode: handoff.viewMode,
  fieldSchemaHash: handoff.fieldSchemaHash, expiresAt: handoff.expiresAt, now,
});
assert.equal((await listEmployerBrowserSessionsInternal(base)).length, 2);
await assert.rejects(closeAllEmployerBrowserSessionsBeforeDelete({
  config: base, subject: base.subject,
  closeProvider: async ({ browserSession }) => ({ status: browserSession.providerSessionReference.endsWith('bulk_b') ? 'not-configured' : 'closed' }),
}), error => {
  assert.equal(error?.code, BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED);
  assert.equal(error.closed, 1);
  assert.equal(error.deleted, 1);
  assert.equal(error.retryRequired, 1);
  assert.doesNotMatch(JSON.stringify({ code: error.code, message: error.message, closed: error.closed, deleted: error.deleted }), /fixture_session/);
  return true;
});
const afterPartialFailure = await listEmployerBrowserSessionsInternal(base);
assert.equal(afterPartialFailure.length, 1);
assert.equal(afterPartialFailure[0].providerSessionReference, 'fixture_session_bulk_b');
assert.deepEqual(await closeAllEmployerBrowserSessionsBeforeDelete({ config: base, subject: base.subject, closeProvider: async () => ({ status: 'closed' }) }), { closed: 1, deleted: 1 });
assert.equal((await listEmployerBrowserSessionsInternal(base)).length, 0);
assert.equal((await listEmployerBrowserSessionsInternal(otherBase)).length, 1);
assert.deepEqual(await closeAllEmployerBrowserSessionsBeforeDelete({ config: otherBase, subject: otherBase.subject, closeProvider: async () => ({ status: 'closed' }) }), { closed: 1, deleted: 1 });

console.log('Encrypted tenant-bound browser handoff metadata, synthetic preview, idempotency, isolation, restore, and deletion tests passed.');
