import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isolatedDatabaseCiAuthorization } from './isolated-database-ci-authorization.mjs';
import { ISOLATED_TARGET_CONFIRMATION as confirmation, isolatedDataReadinessPreflight } from './isolated-data-readiness-preflight.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cases = [
  ['', '', false], ['none', '', false],
  ['local-supabase', confirmation, true],
  ['local-supabase', '', 'error'], ['local-supabase', 'true', 'error'],
  ['local-supabase', `${confirmation} `, 'error'],
  ['', confirmation, 'error'], ['none', confirmation, 'error'],
  ['production', confirmation, 'error'], ['isolated-supabase-project', confirmation, 'error'],
  ['LOCAL-SUPABASE', confirmation, 'error'], [' local-supabase', confirmation, 'error'],
];
for (const [target, attestation, expected] of cases) {
  const env = { JOB_AGENT_ISOLATED_TARGET_KIND: target, JOB_AGENT_ISOLATED_TARGET_CONFIRMATION: attestation };
  const dir = mkdtempSync(path.join(tmpdir(), 'isolated-ci-authorization-'));
  try {
    const output = path.join(dir, 'output');
    const summary = path.join(dir, 'summary');
    const result = spawnSync(process.execPath, ['scripts/isolated-database-ci-authorization.mjs'], {
      cwd: root, encoding: 'utf8', windowsHide: true,
      env: { ...env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
    });
    assert.equal(result.status, expected === 'error' ? 1 : 0, result.stderr);
    if (expected === 'error') {
      assert.throws(() => isolatedDatabaseCiAuthorization(env));
      assert.throws(() => readFileSync(output), { code: 'ENOENT' });
      assert(!result.stderr.includes(attestation) || !attestation || attestation === 'local-supabase');
    } else {
      assert.equal(isolatedDatabaseCiAuthorization(env).authorized, expected);
      assert.equal(readFileSync(output, 'utf8'), `authorized=${expected}\n`);
      if (!expected) assert.match(readFileSync(summary, 'utf8'), /not database verification evidence/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Scheduling authorization cannot turn unavailable tooling or bad evidence into readiness.
const localEnv = { JOB_AGENT_ISOLATED_TARGET_KIND: 'local-supabase', JOB_AGENT_ISOLATED_TARGET_CONFIRMATION: confirmation };
const unavailable = await isolatedDataReadinessPreflight(localEnv, {
  commandResult: () => ({ available: false, version: null }),
});
assert.equal(unavailable.readyForAuthorizedReadOnlyAudit, false);
assert(unavailable.blockers.includes('SUPABASE_CLI_UNAVAILABLE'));
assert(unavailable.blockers.includes('LOCAL_SUPABASE_RUNTIME_UNAVAILABLE'));
const badDigest = await isolatedDataReadinessPreflight(localEnv, {
  commandResult: () => ({ available: true, version: 'fixture' }),
  readFile: async (file) => String(file).endsWith('migration-inventory.json')
    ? readFileSync(file, 'utf8') : 'altered migration fixture',
});
assert.equal(badDigest.readyForAuthorizedReadOnlyAudit, false);
assert(badDigest.blockers.includes('CANONICAL_MIGRATION_DIGEST_MISMATCH'));

const workflow = readFileSync(path.join(root, '.github/workflows/isolated-database-verification.yml'), 'utf8');
assert.match(workflow, /needs: authorize-target\s+if: needs\.authorize-target\.outputs\.authorized == 'true'/);
assert.match(workflow, /JOB_AGENT_ISOLATED_TARGET_CONFIRMATION: \$\{\{ inputs\.confirmation \}\}/);
assert(!workflow.includes('continue-on-error'));
assert(!workflow.includes('secrets.'));
for (const command of ['security:isolated-data-preflight', 'supabase db start', 'db:reconcile:check', 'supabase test db', 'bash scripts/isolated-database-ci-drill.sh']) {
  assert(workflow.includes(command), `Authorized drill must retain ${command}`);
}
console.log('12 CI authorization cases and CLI outputs passed; authorized readiness failures remain fail-closed.');
