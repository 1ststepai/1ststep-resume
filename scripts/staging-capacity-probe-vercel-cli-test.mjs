import assert from 'node:assert/strict';
import { runAuthenticatedVercelCliCapacityProbe } from './staging-capacity-probe-vercel-cli.mjs';

const base = {
  baseUrl: 'https://synthetic-preview.vercel.app',
  deploymentId: `dpl_${'a'.repeat(24)}`,
  requests: 8,
  concurrency: 3,
  maximumP95Ms: 1_000,
};
let active = 0;
let maximumActive = 0;
const calls = [];
const commandRunner = async input => {
  calls.push(input);
  active += 1;
  maximumActive = Math.max(maximumActive, active);
  await new Promise(resolve => setTimeout(resolve, 10));
  active -= 1;
  return 'Retrieving project…\nSTATUS:200 TIME:0.125';
};

const result = await runAuthenticatedVercelCliCapacityProbe({ ...base, commandRunner });
assert.equal(result.ok, true);
assert.deepEqual(result.statusHistogram, { 200: 8 });
assert.deepEqual(result.latencyMs, { p50: 125, p95: 125, max: 125, limitP95: 1000 });
assert.equal(result.responseBodiesRead, false);
assert.equal(result.responseBodySink, 'os-null-device');
assert.equal(result.authenticationMode, 'vercel-cli-session');
assert.equal(result.bypassSecretPresent, false);
assert.ok(maximumActive <= 3 && maximumActive >= 2);
assert.equal(calls.length, 8);
assert(calls.every(call => call.path === '/api/health/live' && call.deploymentId === base.deploymentId));

await assert.rejects(() => runAuthenticatedVercelCliCapacityProbe({ ...base, baseUrl: 'https://app.1ststep.ai', commandRunner }), /Production targets are forbidden/);
await assert.rejects(() => runAuthenticatedVercelCliCapacityProbe({ ...base, deploymentId: 'production', commandRunner }), /valid exact Vercel deployment ID/);
await assert.rejects(() => runAuthenticatedVercelCliCapacityProbe({ ...base, path: '/api/private', commandRunner }), /allowlist/);
await assert.rejects(() => runAuthenticatedVercelCliCapacityProbe({ ...base, requests: 26, commandRunner }), /1-25/);
await assert.rejects(() => runAuthenticatedVercelCliCapacityProbe({ ...base, concurrency: 6, commandRunner }), /1-5/);

const unexpected = await runAuthenticatedVercelCliCapacityProbe({ ...base, requests: 2, concurrency: 1, commandRunner: async () => 'STATUS:503 TIME:0.100' });
assert.equal(unexpected.ok, false);
assert.equal(unexpected.unexpectedResponses, 2);
assert.deepEqual(unexpected.statusHistogram, { 503: 2 });

const invalid = await runAuthenticatedVercelCliCapacityProbe({ ...base, requests: 1, concurrency: 1, commandRunner: async () => 'candidate@example.test' });
assert.equal(invalid.ok, false);
assert.deepEqual(invalid.statusHistogram, { 'error:CLI_TRANSPORT_OUTPUT_INVALID': 1 });
assert.equal(JSON.stringify(invalid).includes('candidate@example.test'), false, 'CLI output must never enter aggregate evidence.');

console.log('Authenticated Vercel CLI capacity probe stays Preview-only, GET-only, body-free, concurrency-bounded, exact-deployment-bound, and value-free on transport failure.');
