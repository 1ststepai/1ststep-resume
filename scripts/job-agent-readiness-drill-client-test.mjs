import assert from 'node:assert/strict';
import { authorizeReadinessDrillRequest, READINESS_DRILL_CONFIRMATION } from '../lib/job-agent-readiness-drill-contract.js';
import { JOB_AGENT_READINESS_DRILL_LIFECYCLES, runProductionReadinessDrill } from '../lib/job-agent-readiness-drill-client.js';

assert.deepEqual(authorizeReadinessDrillRequest({ query: {}, headers: {} }, { actor: 'administrator' }), { ok: true, requested: false });
assert.equal(authorizeReadinessDrillRequest({ query: { deep: '1' }, headers: {} }, { actor: 'administrator' }).code, 'DRILL_OPERATOR_REQUIRED');
assert.equal(authorizeReadinessDrillRequest({ query: { deep: '1' }, headers: {} }, { actor: 'cron' }).code, 'DRILL_CONFIRMATION_REQUIRED');
assert.deepEqual(authorizeReadinessDrillRequest({ query: { deep: '1' }, headers: { 'x-job-agent-readiness-drill': READINESS_DRILL_CONFIRMATION } }, { actor: 'cron' }), { ok: true, requested: true });

const env = {
  JOB_AGENT_READINESS_URL: 'https://app.1ststep.ai/api/job-agent-readiness',
  JOB_AGENT_READINESS_DRILL_CONFIRMATION: READINESS_DRILL_CONFIRMATION,
  CRON_SECRET: 'c'.repeat(48),
};
const responseBody = {
  status: 'ready', readyFor: 'signed-beta', durableStore: 'reachable', encryptionConfigured: true,
  tenantPartitioningConfigured: true, backgroundWorker: { status: 'healthy' },
  launchManifest: { capabilities: { signedBeta: { eligible: true } }, submissionsEnabled: false },
  externalApplicationExecution: false, submissionsEnabled: false,
  ...Object.fromEntries(JOB_AGENT_READINESS_DRILL_LIFECYCLES.map(key => [key, 'verified'])),
};
let request;
const result = await runProductionReadinessDrill({
  env, now: new Date('2026-08-30T16:00:00.000Z'),
  fetchImpl: async (url, options) => {
    request = { url: String(url), options };
    return { ok: true, status: 200, json: async () => responseBody };
  },
});
assert.match(request.url, /session=1/);
assert.match(request.url, /notification=1/);
assert.match(request.url, /audit=1/);
assert.match(request.url, /deep=1/);
assert.equal(request.options.redirect, 'error');
assert.equal(request.options.headers['X-Job-Agent-Readiness-Drill'], READINESS_DRILL_CONFIRMATION);
assert.equal(request.options.headers.Authorization, `Bearer ${env.CRON_SECRET}`);
assert.equal(result.ok, true);
assert.equal(result.contentFree, true);
assert.equal(result.containsCandidateValues, false);
assert.equal(result.submissionsEnabled, false);
assert.equal(result.requestAttempts, 1);
assert.doesNotMatch(JSON.stringify(result), new RegExp(env.CRON_SECRET));

await assert.rejects(() => runProductionReadinessDrill({ env: { ...env, JOB_AGENT_READINESS_DRILL_CONFIRMATION: '' }, fetchImpl: async () => assert.fail('must not fetch') }), /confirmation/i);
await assert.rejects(() => runProductionReadinessDrill({ env: { ...env, JOB_AGENT_READINESS_URL: 'https://preview.example.test/api/job-agent-readiness' }, fetchImpl: async () => assert.fail('must not fetch') }), /exactly/i);
await assert.rejects(() => runProductionReadinessDrill({ env, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ...responseBody, applicantVaultLifecycle: 'not-requested' }) }) }), /applicantVaultLifecycle/);
try {
  await runProductionReadinessDrill({ env, fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ failedStage: 'background-worker-heartbeat' }) }) });
  assert.fail('failed readiness must reject');
} catch (error) {
  assert.equal(error.requestAttempts, 1);
  assert.match(error.message, /^READINESS_HTTP_503_background-worker-heartbeat$/);
}
const timeout = new DOMException('timed out', 'TimeoutError');
await assert.rejects(async () => {
  try { await runProductionReadinessDrill({ env, fetchImpl: async () => { throw timeout; } }); }
  catch (error) { assert.equal(error.outcomeUnknown, true); assert.equal(error.requestAttempts, 1); throw error; }
}, /OUTCOME_UNKNOWN_DO_NOT_RETRY/);

console.log('Explicit operator confirmation, exact production scope, content-free lifecycle proof, and no-retry unknown-outcome tests passed.');
