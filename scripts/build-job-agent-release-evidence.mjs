import { writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createReleaseEvidence } from '../lib/job-agent-release-evidence.js';
import { localReleaseIdentity } from '../lib/job-agent-release-files.js';

const root = process.cwd();
const outputArg = process.argv.find(argument => argument.startsWith('--output='));
const outputPath = resolve(root, outputArg ? outputArg.slice('--output='.length) : 'job-agent-release-evidence.json');

function jsonEnv(name, fallback) {
  if (!process.env[name]) return fallback;
  try { return JSON.parse(process.env[name]); }
  catch { throw new Error(`${name} must contain valid JSON.`); }
}

const local = await localReleaseIdentity(root);
const manifest = createReleaseEvidence({
  ...local,
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  deploymentUrl: process.env.VERCEL_DEPLOYMENT_URL,
  rollbackDeploymentId: process.env.JOB_AGENT_ROLLBACK_DEPLOYMENT_ID,
  featureFlags: jsonEnv('JOB_AGENT_RELEASE_FLAGS_JSON', {}),
  tests: jsonEnv('JOB_AGENT_RELEASE_TESTS_JSON', []),
}, { secret: process.env.JOB_AGENT_RELEASE_EVIDENCE_SECRET });

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(`Wrote signed release evidence to ${basename(outputPath)}.`);
