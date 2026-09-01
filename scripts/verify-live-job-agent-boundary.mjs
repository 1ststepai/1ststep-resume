import { verifyLiveJobAgentBoundary } from '../lib/live-job-agent-boundary.js';

const baseUrl = process.argv[2] || 'https://app.1ststep.ai';
const result = await verifyLiveJobAgentBoundary({ baseUrl });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
