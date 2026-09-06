import assert from 'node:assert/strict';
import { mock } from 'node:test';

// Synthetic boundary test: no provider, Redis or object-storage traffic.
let elapsed, leaseEnd, calls, delays;
const base = new Date('2026-08-29T16:00:00Z');
mock.method(performance, 'now', () => elapsed);
const owned = now => now.getTime() - base.getTime() < leaseEnd;
mock.module('../lib/job-agent-run-store.js', { namedExports: {
  heartbeatJobAgentRun: async ({ now }) => { calls.heartbeat++; if (!owned(now)) return null; leaseEnd = now.getTime() - base.getTime() + 45000; return {}; },
  finishJobAgentRun: async ({ now }) => owned(now) ? { status: 'Finished' } : null,
  failJobAgentRun: async () => { throw new Error('Unexpected failure path'); },
  waitForUserJobAgentRun: async () => { throw new Error('Unexpected QA issues'); },
} });
mock.module('../lib/ai-provider.js', { namedExports: {
  buildAiRequest: () => ({ configured: true, provider: 'synthetic', url: 'https://example.invalid', headers: {}, body: {} }),
  extractAiUsage: () => ({ inputTokens: 0, outputTokens: 0 }), extractAiText: () => generated,
} });
mock.module('../lib/job-agent-spend-ledger.js', { namedExports: {
  reserveConfiguredJobAgentSpend: async () => ({ ok: true, control: {} }), settleConfiguredJobAgentSpend: async () => {},
} });
mock.module('../lib/job-agent-operational-metrics.js', { namedExports: { recordConfiguredJobAgentOperationalEvent: async () => {} } });
mock.module('../lib/application-package-artifacts.js', { namedExports: {
  buildApplicationPackageArtifacts: async () => { calls.build++; elapsed += delays.build; return { qa: { issues: [] }, artifacts: [{}] }; },
} });
mock.module('../lib/job-agent-object-storage.js', { namedExports: {
  jobAgentObjectStorageConfiguration: () => ({ ready: false }),
  persistApplicationPackageArtifacts: async () => { calls.persist++; elapsed += delays.persist; return [{}]; },
  deleteApplicationPackageArtifacts: async () => { calls.cleanup++; },
} });
const { executeClaimedApplicationPackageRun } = await import('../lib/application-package-worker.js');
const sentence = 'Managed supplier relationships and contract workflows across business teams.';
const resume = `EXPERIENCE\n${sentence}\n`.repeat(10);
const generated = JSON.stringify({ resume_text: resume, cover_letter_text: '', source_map: Array.from({ length: 3 }, () => ({ output_claim: sentence, source_excerpt: sentence })) });
async function run(change = {}) {
  elapsed = 0; leaseEnd = 45000; calls = { heartbeat: 0, build: 0, persist: 0, cleanup: 0, provider: 0 };
  delays = { provider: 0, build: 0, persist: 0, ...change };
  const result = await executeClaimedApplicationPackageRun({
    claimed: { run: { id: 'synthetic', taskType: 'application_package', attempt: 1, mission: { resumeText: resume, jobDescription: 'Procurement operations', includeCoverLetter: false } }, leaseToken: 'synthetic', tenantId: 'synthetic' },
    redis: {}, dataEncryptionKey: 'unused', env: {}, objectStorage: { ready: true }, now: base,
    fetchImpl: async () => { calls.provider++; elapsed += delays.provider; return { ok: true, json: async () => ({}) }; },
  });
  return { result, ...calls };
}
const lateProvider = await run({ provider: 46000 });
assert.equal(lateProvider.result, null);
assert.equal(lateProvider.build, 0);
assert.equal(lateProvider.persist, 0);
const lateBuild = await run({ build: 46000 });
assert.equal(lateBuild.result, null);
assert.equal(lateBuild.persist, 0, 'lost lease cannot start artifact transmission');
const renewed = await run({ provider: 30000, build: 30000 });
assert.equal(renewed.result.status, 'Finished');
assert.equal(renewed.heartbeat, 3);
const lateStorage = await run({ persist: 46000 });
assert.equal(lateStorage.result, null, 'late dispatched storage is not counted complete');
assert.equal(lateStorage.cleanup, 1, 'existing orphan cleanup path remains');
mock.restoreAll();
console.log('Synthetic package lease boundaries passed: slow generation, rendering, renewal and late persistence. No real services exercised.');
