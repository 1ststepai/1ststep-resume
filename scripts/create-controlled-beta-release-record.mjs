import { buildJobAgentReleasePreflight } from '../lib/job-agent-release-preflight.js';
import { buildJobAgentControlledBetaReleaseRecord } from '../lib/job-agent-release-record.js';

const preflight = await buildJobAgentReleasePreflight();
const record = buildJobAgentControlledBetaReleaseRecord({ preflight });
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
if (!record.ok) process.exitCode = 1;
