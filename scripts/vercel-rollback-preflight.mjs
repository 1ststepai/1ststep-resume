import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEPLOYMENT_ID_PATTERN = /^dpl_[A-Za-z0-9]{20,80}$/;
const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;
const PRODUCTION_HOST = 'app.1ststep.ai';

function fail(message) {
  throw new Error(message);
}

export function validateRollbackTarget(deployment, {
  deploymentId,
  expectedProject,
  productionHost = PRODUCTION_HOST,
  requireAlias = false,
} = {}) {
  if (!DEPLOYMENT_ID_PATTERN.test(String(deploymentId || ''))) {
    fail('A valid exact Vercel deployment ID is required.');
  }
  if (!PROJECT_NAME_PATTERN.test(String(expectedProject || ''))) {
    fail('A valid expected Vercel project name is required.');
  }
  if (productionHost !== PRODUCTION_HOST) {
    fail(`Production host must be exactly ${PRODUCTION_HOST}.`);
  }
  if (!deployment || typeof deployment !== 'object' || Array.isArray(deployment)) {
    fail('Vercel inspection did not return a deployment object.');
  }

  const aliases = Array.isArray(deployment.aliases)
    ? deployment.aliases.filter((value) => typeof value === 'string')
    : [];
  const ownsProductionAlias = aliases.includes(productionHost);

  if (deployment.id !== deploymentId) fail('Inspected deployment ID does not match the approved rollback target.');
  if (deployment.name !== expectedProject) fail('Rollback target belongs to an unexpected Vercel project.');
  if (deployment.target !== 'production') fail('Rollback target is not a Production deployment.');
  if (deployment.readyState !== 'READY') fail('Rollback target is not READY.');
  if (requireAlias && !ownsProductionAlias) fail('Production alias does not resolve to the approved rollback target.');

  return {
    ok: true,
    deploymentId,
    project: expectedProject,
    target: 'production',
    readyState: 'READY',
    productionHost,
    ownsProductionAlias,
    mode: requireAlias ? 'post-rollback-alias-verification' : 'pre-rollback-target-verification',
  };
}

function parseArgs(argv) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--verify-alias') {
      flags.add(arg);
      continue;
    }
    if (!['--deployment-id', '--expected-project', '--production-host'].includes(arg)) {
      fail(`Unsupported argument: ${arg}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${arg}.`);
    values.set(arg, value);
    index += 1;
  }
  return {
    deploymentId: values.get('--deployment-id'),
    expectedProject: values.get('--expected-project'),
    productionHost: values.get('--production-host') || PRODUCTION_HOST,
    requireAlias: flags.has('--verify-alias'),
  };
}

function inspectDeployment(reference) {
  const command = process.platform === 'win32'
    ? {
        executable: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
        args: ['/d', '/s', '/c', `npx vercel inspect ${reference} --format=json --non-interactive`],
      }
    : {
        executable: 'npx',
        args: ['vercel', 'inspect', reference, '--format=json', '--non-interactive'],
      };
  const result = spawnSync(command.executable, command.args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });
  if (result.error) fail(`Vercel inspection could not start: ${result.error.message}`);
  if (result.status !== 0) fail('Vercel inspection failed. No rollback action was performed.');
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail('Vercel inspection returned invalid JSON. No rollback action was performed.');
  }
}

export function runRollbackPreflight(options, inspector = inspectDeployment) {
  const reference = options.requireAlias ? options.productionHost : options.deploymentId;
  return validateRollbackTarget(inspector(reference), options);
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = runRollbackPreflight(options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
