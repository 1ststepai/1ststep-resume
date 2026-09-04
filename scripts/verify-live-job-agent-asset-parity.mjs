import { verifyLiveJobAgentAssetParity } from '../lib/live-job-agent-asset-parity.js';

const baseUrl = process.argv[2] || 'https://app.1ststep.ai';
const result = await verifyLiveJobAgentAssetParity({ baseUrl });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
