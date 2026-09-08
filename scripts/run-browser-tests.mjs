import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { once } from 'node:events';

async function reservePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  assert.ok(address && typeof address === 'object');
  await new Promise((resolveClose, reject) => probe.close(error => error ? reject(error) : resolveClose()));
  return address.port;
}

const port = process.env.BROWSER_TEST_PORT || String(await reservePort());
const cli = resolve('node_modules/playwright/cli.js');
console.log(`Browser test harness reserved http://127.0.0.1:${port}`);
const child = spawn(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: { ...process.env, BROWSER_TEST_PORT: port },
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}

const [exitCode, signal] = await once(child, 'exit');
if (signal) process.kill(process.pid, signal);
process.exitCode = exitCode ?? 1;
