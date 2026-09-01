import { buildJobAgentReleasePreflight } from '../lib/job-agent-release-preflight.js';

const result = await buildJobAgentReleasePreflight();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
