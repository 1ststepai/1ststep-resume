import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflowPaths = [
  '.github/workflows/production-readiness.yml',
  '.github/workflows/qa.yml',
  '.github/workflows/codeql.yml',
];
const workflows = Object.fromEntries(workflowPaths.map((path) => [path, readFileSync(path, 'utf8')]));

for (const [path, source] of Object.entries(workflows)) {
  assert.doesNotMatch(source, /pull_request_target\s*:/, `${path} must not execute repository code through pull_request_target`);
  assert.match(source, /^permissions:\s*$/m, `${path} must declare explicit permissions`);
  assert.match(source, /timeout-minutes:\s*\d+/, `${path} must bound job runtime`);

  const actionUses = [...source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)].map((match) => match[1]);
  assert.ok(actionUses.length > 0, `${path} must use pinned actions`);
  for (const action of actionUses) {
    assert.match(action, /@[a-f0-9]{40}$/, `${path} action must use an immutable 40-character commit SHA: ${action}`);
  }

  const checkoutCount = actionUses.filter((action) => action.startsWith('actions/checkout@')).length;
  const disabledCredentialCount = (source.match(/persist-credentials:\s*false/g) || []).length;
  assert.equal(disabledCredentialCount, checkoutCount, `${path} must disable persisted checkout credentials`);
}

const readiness = workflows['.github/workflows/production-readiness.yml'];
assert.match(readiness, /node-version:\s*['"]24['"]/, 'Production readiness must use application Node 24');
assert.match(readiness, /run:\s*npm ci --ignore-scripts/, 'Production readiness must install the lockfile without lifecycle scripts');
assert.match(readiness, /run:\s*npm run release:gate/, 'Production readiness must execute the complete release gate');
assert.match(readiness, /dependency-audit:/, 'Production readiness must include a separate dependency audit job');
assert.match(readiness, /run:\s*npm audit --omit=dev --audit-level=high/, 'Production dependency audit must reject high or critical runtime advisories');
assert.match(readiness, /name:\s*Production dependency vulnerability audit[\s\S]*?timeout-minutes:\s*10/, 'Production dependency audit must have its own bounded runtime');
assert.match(readiness, /^\s*contents:\s*read\s*$/m, 'Production readiness must use read-only repository contents');

const qa = workflows['.github/workflows/qa.yml'];
assert.match(qa, /node-version:\s*['"]24['"]/, 'QA must use application Node 24');
assert.match(qa, /run:\s*npm ci --ignore-scripts/, 'QA must install the locked dependency graph');
assert.match(qa, /run:\s*npm run smoke/, 'QA must use the package smoke command');

const codeql = workflows['.github/workflows/codeql.yml'];
assert.match(codeql, /^\s*security-events:\s*write\s*$/m, 'CodeQL needs only its explicit security-events write permission');
assert.match(codeql, /github\/codeql-action\/analyze@[a-f0-9]{40}/, 'CodeQL analysis must remain enabled and SHA-pinned');

console.log('CI workflow policy verified Node 24, locked installs, immutable actions, bounded jobs, minimal permissions, non-persisted checkout credentials, and a separate high/critical production dependency audit.');
