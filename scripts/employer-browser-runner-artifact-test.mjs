import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { employerBrowserRunnerArtifactConfiguration, createEmployerBrowserInspectionRequest } from '../lib/employer-browser-runner-protocol.js';

const runnerPath = new URL('../sandbox/employer-browser-runner.mjs', import.meta.url);
const source = await readFile(runnerPath);
const text = source.toString('utf8');
const sha256 = createHash('sha256').update(source).digest('hex');
assert.match(sha256, /^[a-f0-9]{64}$/);

const artifact = employerBrowserRunnerArtifactConfiguration({
  EMPLOYER_BROWSER_WORKER_RUNNER_VERSION: '1ststep-employer-runner-v2',
  EMPLOYER_BROWSER_WORKER_RUNNER_SHA256: sha256,
  EMPLOYER_BROWSER_WORKER_RUNNER_PATH: '/opt/1ststep/employer-browser-runner.mjs',
});
assert.equal(artifact.ready, true);
const request = createEmployerBrowserInspectionRequest({ hostname: 'jobs.example.test', pageUrl: 'https://jobs.example.test/apply/REQ-1' }, artifact);
assert.equal(request.constraints.includeFieldValues, false);
assert.equal(request.constraints.includePageText, false);
assert.equal(request.constraints.submit, false);

assert.match(text, /networkPolicy|context\.route|route\.abort\('blockedbyclient'\)/);
assert.match(text, /acceptDownloads: false/);
assert.match(text, /serviceWorkers: 'block'/);
assert.match(text, /\['GET', 'HEAD'\]/);
assert.match(text, /routeWebSocket/);
assert.match(text, /HTMLFormElement\.prototype, 'submit'/);
assert.match(text, /input:not\(\[type="hidden"\]\), select, textarea/);
assert.match(text, /RUNNER_ATTESTATION_FAILED/);
assert.match(text, /RUNNER_SCHEMA_MISMATCH/);
assert.match(text, /freshField/);
assert.match(text, /fillFreshField/);
assert.match(text, /attempt < 2/);
assert.match(text, /clickedSubmit: false/);
assert.match(text, /submitted: false/);
assert.match(text, /valuesRetained: false/);
assert.match(text, /flag: 'wx'/);
assert.match(text, /mode: 0o600/);
assert.match(text, /browser\.close\(\)/);
assert.doesNotMatch(text, /\.click\s*\(/);
assert.doesNotMatch(text, /console\.(?:log|info|debug)/);

console.log(`Checked-in employer runner artifact contract and SHA-256 binding tests passed (${sha256.slice(0, 12)}…).`);
