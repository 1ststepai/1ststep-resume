import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildJobAgentReleasePreflight } from '../lib/job-agent-release-preflight.js';

await import('./job-agent-release-record-test.mjs');

const root = await mkdtemp(join(tmpdir(), 'job-agent-release-preflight-'));
try {
  await mkdir(join(root, 'api'));
  await mkdir(join(root, 'lib'));
  const rootFiles = ['package.json', 'package-lock.json', 'vercel.json', 'index.html', 'app.html', 'app.js', 'style.css', 'concierge.html', 'concierge.js', 'persistent-concierge.css', 'admin.html', 'funnel.html', 'pricing.html', 'privacy.html', 'terms.html', 'resume-builder.js', 'workday.js'];
  for (const file of rootFiles) await writeFile(join(root, file), `${file}\n`, 'utf8');
  await writeFile(join(root, 'api', 'fixture.js'), 'export default true;\n', 'utf8');
  await writeFile(join(root, 'lib', 'fixture.js'), 'export const fixture = true;\n', 'utf8');
  await writeFile(join(root, '.vercelignore'), '.env*\n.mcp.json\nnode_modules/\ndocs/\nscripts/\nsandbox/\ntest-results/\nprojects/\n1ststep-extension/\n', 'utf8');
  const cleanGit = { branch: 'candidate', head: 'a'.repeat(40), unstagedCount: 0, stagedCount: 0, untrackedCount: 0, unstagedPathDigest: '0'.repeat(64), stagedPathDigest: '0'.repeat(64), untrackedPathDigest: '0'.repeat(64) };
  let result = await buildJobAgentReleasePreflight({ root, gitSnapshot: cleanGit });
  assert.equal(result.ok, true);
  assert.equal(result.contentFree, true);
  assert.equal(result.deploys, false);
  assert.equal(result.runtime.fileCount, 19);
  assert.equal(Object.keys(result.runtime.keyHashes).length, 4);
  assert.equal(result.ignorePolicy.verified, true);
  result = await buildJobAgentReleasePreflight({ root, gitSnapshot: { ...cleanGit, untrackedCount: 2 } });
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('WORKTREE_HAS_UNTRACKED_FILES'));
  await writeFile(join(root, '.vercelignore'), '.env*\n', 'utf8');
  result = await buildJobAgentReleasePreflight({ root, gitSnapshot: cleanGit });
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('VERCELIGNORE_RULE_MISSING:docs/'));
  await writeFile(join(root, '.vercelignore'), '.env*\n!.env.example\n.mcp.json\nnode_modules/\ndocs/\nscripts/\nsandbox/\ntest-results/\nprojects/\n1ststep-extension/\n', 'utf8');
  result = await buildJobAgentReleasePreflight({ root, gitSnapshot: cleanGit });
  assert.ok(result.issues.includes('VERCELIGNORE_ENV_REINCLUSION_FORBIDDEN'));
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('Job Agent release preflight tests passed.');
