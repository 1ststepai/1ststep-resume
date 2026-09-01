import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEPLOYMENT_ID_PATTERN = /^dpl_[A-Za-z0-9]{20,80}$/;
const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;
const SINCE_PATTERN = /^(?:[1-9]|[1-5][0-9]|60)m$/;
const ALLOWED_PATHS = new Set([
  '/api/health/live',
  '/api/health/ready',
  '/api/app-config',
  '/api/concierge-preview-smoke',
]);
const EXPECTED_STATUSES = new Map([
  ['/api/health/live', 200],
  ['/api/health/ready', 503],
  ['/api/app-config', 200],
  ['/api/concierge-preview-smoke', 200],
]);

function fail(message) {
  throw new Error(message);
}

function runVercel(args) {
  const referenceValues = args.filter((value) => !['vercel', 'inspect', 'logs', '--format=json', '--non-interactive', '--no-follow', '--json', '--since', '--limit'].includes(value));
  if (referenceValues.some((value) => /[^A-Za-z0-9_.:/-]/.test(value))) fail('Unsafe Vercel CLI argument.');
  const command = process.platform === 'win32'
    ? {
        executable: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
        args: ['/d', '/s', '/c', `npx ${args.join(' ')}`],
      }
    : { executable: 'npx', args };
  const result = spawnSync(command.executable, command.args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });
  if (result.error) fail(`Vercel CLI could not start: ${result.error.message}`);
  if (result.status !== 0) fail('Vercel read-only inspection failed.');
  return result.stdout;
}

export function validatePreviewDeployment(deployment, { deploymentId, expectedProject }) {
  if (!DEPLOYMENT_ID_PATTERN.test(String(deploymentId || ''))) fail('A valid exact Vercel deployment ID is required.');
  if (!PROJECT_NAME_PATTERN.test(String(expectedProject || ''))) fail('A valid expected project name is required.');
  if (!deployment || typeof deployment !== 'object' || Array.isArray(deployment)) fail('Deployment inspection is invalid.');
  if (deployment.id !== deploymentId) fail('Deployment ID mismatch.');
  if (deployment.name !== expectedProject) fail('Unexpected Vercel project.');
  if (deployment.target !== 'preview') fail('Log evidence is restricted to Vercel Preview deployments.');
  if (deployment.readyState !== 'READY') fail('Preview deployment is not READY.');
  if (typeof deployment.url !== 'string' || !deployment.url.endsWith('.vercel.app')) fail('Preview URL is invalid.');
  return true;
}

export function parseLogJsonLines(raw) {
  const records = [];
  for (const line of String(raw || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      fail('Vercel log output included malformed JSON.');
    }
  }
  return records;
}

export function summarizePreviewLogs(records, { deploymentId }) {
  if (!DEPLOYMENT_ID_PATTERN.test(String(deploymentId || ''))) fail('A valid exact Vercel deployment ID is required.');
  if (!Array.isArray(records)) fail('Log records must be an array.');
  const routes = {};
  let discardedNonAllowlistedRecords = 0;
  let contentBearingAllowlistedRecords = 0;
  let qualifyingRecords = 0;
  let unexpectedStatusRecords = 0;

  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    if (record.deploymentId !== deploymentId || record.environment !== 'preview') continue;
    if (record.requestMethod !== 'GET' || !ALLOWED_PATHS.has(record.requestPath)) {
      discardedNonAllowlistedRecords += 1;
      continue;
    }
    qualifyingRecords += 1;
    if ((typeof record.message === 'string' && record.message.length > 0)
      || (Array.isArray(record.logs) && record.logs.length > 0)) {
      contentBearingAllowlistedRecords += 1;
    }
    const route = routes[record.requestPath] ||= { requests: 0, statusHistogram: {} };
    route.requests += 1;
    const validStatus = Number.isInteger(record.responseStatusCode)
      && record.responseStatusCode >= 100
      && record.responseStatusCode <= 599;
    const status = validStatus ? String(record.responseStatusCode) : 'unknown';
    if (!validStatus || record.responseStatusCode !== EXPECTED_STATUSES.get(record.requestPath)) {
      unexpectedStatusRecords += 1;
    }
    route.statusHistogram[status] = (route.statusHistogram[status] || 0) + 1;
  }

  const missingRoutes = [...ALLOWED_PATHS].filter((path) => !routes[path]);

  return {
    schemaVersion: 1,
    ok: qualifyingRecords > 0
      && contentBearingAllowlistedRecords === 0
      && unexpectedStatusRecords === 0
      && missingRoutes.length === 0,
    contentFree: true,
    containsCandidateValues: false,
    performsWrites: false,
    environment: 'preview',
    deploymentId,
    qualifyingRecords,
    routes,
    contentBearingAllowlistedRecords,
    unexpectedStatusRecords,
    missingRoutes,
    discardedNonAllowlistedRecords,
    rawMessagesEmitted: false,
    rawLogsRetained: false,
  };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--deployment-id', '--expected-project', '--since', '--limit'].includes(key)) fail(`Unsupported argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${key}.`);
    values[key.slice(2)] = value;
    index += 1;
  }
  const since = values.since || '10m';
  const limit = Number(values.limit || 100);
  if (!SINCE_PATTERN.test(since)) fail('Since must be 1m through 60m.');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('Limit must be 1 through 100.');
  return {
    deploymentId: values['deployment-id'],
    expectedProject: values['expected-project'],
    since,
    limit,
  };
}

export function collectPreviewLogEvidence(options, runner = runVercel) {
  const inspection = JSON.parse(runner([
    'vercel', 'inspect', options.deploymentId, '--format=json', '--non-interactive',
  ]));
  validatePreviewDeployment(inspection, options);
  const rawLogs = runner([
    'vercel', 'logs', options.deploymentId, '--no-follow', '--since', options.since,
    '--limit', String(options.limit), '--json', '--non-interactive',
  ]);
  return summarizePreviewLogs(parseLogJsonLines(rawLogs), options);
}

async function main() {
  try {
    const result = collectPreviewLogEvidence(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
