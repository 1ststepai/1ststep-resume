import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('./isolated-database-ci-drill.sh', import.meta.url), 'utf8');
const start = source.indexOf('for _ in $(seq 1 60); do');
const end = source.indexOf('docker exec -i "${restore_container}" psql', start);
assert(start > 0 && end > start, 'Test must execute the real restore readiness gate before migration.');
const gate = source.slice(start, end);
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';

for (const [readyAfter, expectedStatus] of [[1, 0], [3, 0], [100, 1]]) {
  const result = spawnSync(bash, ['-c', `
set -euo pipefail
restore_container=isolated-readiness-fixture
attempts=0
docker() {
  # A Unix socket can accept connections throughout bootstrap. It must not
  # satisfy either the polling check or the final readiness assertion.
  if [[ "$*" != "exec isolated-readiness-fixture pg_isready -h 127.0.0.1 -U postgres -d postgres" ]]; then
    exit 91
  fi
  attempts=$((attempts + 1))
  test "$attempts" -ge "$READY_AFTER"
}
sleep() { :; }
${gate}
printf 'ready:%s' "$attempts"
`], {
    encoding: 'utf8', windowsHide: true,
    env: { ...process.env, READY_AFTER: String(readyAfter) },
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.error?.message);
  if (expectedStatus === 0) assert.equal(result.stdout, `ready:${readyAfter + 1}`);
  else assert.equal(result.stdout, '', 'A readiness timeout must stop before migrations or restore.');
}
console.log('Restore readiness waits for final TCP server, retries startup, and fails closed on timeout.');
