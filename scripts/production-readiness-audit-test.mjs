import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const scorecard = JSON.parse(await readFile(new URL('../docs/production-readiness/scorecard.json', import.meta.url), 'utf8'));
const entry = JSON.parse(await readFile(new URL('../docs/production-readiness/entry-scorecard.json', import.meta.url), 'utf8'));
const workflow = await readFile(new URL('../.github/workflows/production-readiness.yml', import.meta.url), 'utf8');
const gateSource = await readFile(new URL('./production-readiness-audit.mjs', import.meta.url), 'utf8');
const aiGateSource = await readFile(new URL('./ai-use-case-gate.mjs', import.meta.url), 'utf8');

for (const candidate of [scorecard, entry]) {
  assert.equal(candidate.layers.length, 13);
  assert.deepEqual(candidate.layers.map((layer) => layer.layer), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  for (const layer of candidate.layers) {
    for (const field of ['status', 'evidence', 'evidenceTimestamp', 'testCommand', 'failureDetails', 'owner', 'remediation', 'acceptedRisk', 'expirationDate', 'lastVerifiedCommit', 'states']) {
      assert(Object.hasOwn(layer, field), `Layer ${layer.layer} missing ${field}.`);
    }
    if (layer.status === 'Pass') assert(!layer.states.includes('Unknown'));
  }
}

assert.equal(entry.layers.find((layer) => layer.layer === 7).status, 'Critical');
assert.equal(scorecard.layers.find((layer) => layer.layer === 7).status, 'Warning');
assert(scorecard.layers.filter((layer) => layer.status === 'Critical').length > 0, 'Known production blockers must remain Critical.');
assert.match(packageJson.scripts['release:gate'], /test:web-release/);
assert.match(packageJson.scripts['release:gate'], /test:extension-release/);
assert.match(packageJson.scripts['release:gate'], /inventory:release-source:check/);
assert.match(packageJson.scripts['release:gate'], /security:release-preflight/);
assert.match(packageJson.scripts['release:gate'], /audit:production-readiness/);
assert.match(workflow, /npm ci/);
assert.match(workflow, /npm run release:gate/);
assert.match(workflow, /node-version:\s*'24'/);
assert.match(gateSource, /productionCriticalCount/);
assert.match(gateSource, /deterministicCriticalCount/);
assert.match(aiGateSource, /securityPrivacyGovernanceRisk/);
assert.match(aiGateSource, /humanApproval/);

console.log('Production-readiness audit regression tests passed.');
