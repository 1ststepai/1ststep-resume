import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildJobAgentReleasePreflight } from '../lib/job-agent-release-preflight.js';
import { verifyJobAgentControlledBetaReleaseRecord } from '../lib/job-agent-release-record.js';

const index = process.argv.indexOf('--artifact');
if (index < 0 || !process.argv[index + 1]) throw new Error('Use --artifact <reviewed-release-record.json>.');
const artifact = await readFile(resolve(process.argv[index + 1]));
const preflight = await buildJobAgentReleasePreflight();
const result = verifyJobAgentControlledBetaReleaseRecord(artifact, { preflight });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.verified) process.exitCode = 1;
