import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const path = new URL('../sandbox/employer-browser-runner.mjs', import.meta.url);
const source = await readFile(path);
const version = source.toString('utf8').match(/const RUNNER_VERSION = '([^']+)'/)?.[1];
if (!version) throw new Error('Employer runner version could not be resolved.');
const sha256 = createHash('sha256').update(source).digest('hex');
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  runnerVersion: version,
  runnerSha256: sha256,
  snapshotPath: '/opt/1ststep/employer-browser-runner.mjs',
  containsCandidateValues: false,
  snapshotCreated: false,
  activationAuthorized: false,
}, null, 2)}\n`);
