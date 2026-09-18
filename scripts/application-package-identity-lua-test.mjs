import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { CREATE_UNIQUE_PACKAGE_SCRIPT } from '../lib/application-package-identity.js';
// Development-only dependency: python -m pip install --target output/package-identity-test-deps "fakeredis[lua]"
const result = spawnSync(process.env.PYTHON || 'python', ['scripts/application-package-identity-lua-test.py'], {
  input: JSON.stringify({ script: CREATE_UNIQUE_PACKAGE_SCRIPT }), encoding: 'utf8',
  env: { ...process.env, PYTHONPATH: process.env.PACKAGE_IDENTITY_TEST_PYTHONPATH || resolve('output/package-identity-test-deps') },
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || String(result.error || ''));
process.exitCode = result.status ?? 1;
