import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

function portIsOpen(port) {
  return new Promise(resolveCheck => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(250);
    socket.once('connect', () => { socket.destroy(); resolveCheck(true); });
    socket.once('timeout', () => { socket.destroy(); resolveCheck(false); });
    socket.once('error', () => resolveCheck(false));
  });
}

async function waitForClosedPort(port) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await portIsOpen(port))) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  assert.fail(`Browser fixture port ${port} remained open after a failed Playwright run.`);
}

const port = await reservePort();
const outputDirectory = await mkdtemp(join(tmpdir(), '1ststep-browser-harness-'));
const cli = resolve('node_modules/playwright/cli.js');
let output = '';

try {
  const child = spawn(process.execPath, [
    cli,
    'test',
    'scripts/concierge-vault-browser.spec.mjs',
    '--grep',
    'Needs You remembers an exact answer',
    '--workers=1',
    '--timeout=1',
    '--reporter=line',
    '--output',
    outputDirectory,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, BROWSER_TEST_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  const [exitCode, signal] = await once(child, 'exit');

  assert.equal(signal, null, `Playwright lifecycle probe was terminated by ${signal}.`);
  assert.notEqual(exitCode, 0, 'The forced-timeout probe must exercise Playwright failure cleanup.');
  assert.match(output, /1 failed|Test timeout of 1ms exceeded/);
  await waitForClosedPort(port);
  console.log(`BROWSER_HARNESS_FAILURE_CLEANUP_OK port=${port}`);
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
