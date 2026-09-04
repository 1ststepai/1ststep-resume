import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { validateStagingTarget } from './staging-capacity-probe.mjs';

const execFileAsync = promisify(execFile);
const CONFIRMATION = 'BOUNDED_CONTENT_FREE_STAGING_PROBE';
const ALLOWED_PATHS = new Set(['/api/health/live', '/api/app-config']);
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{20,64}$/;

function integer(value, fallback, maximum) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new Error(`Expected an integer from 1-${maximum}.`);
  return parsed;
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? null;
}

async function defaultCommandRunner({ deploymentId, path, timeoutMs }) {
  const writeOut = 'STATUS:%{http_code} TIME:%{time_total}';
  const curlArgs = ['curl', path, '--deployment', deploymentId, '--', '--silent', '--show-error', '--output', process.platform === 'win32' ? 'NUL' : '/dev/null', '--write-out', writeOut];
  if (process.platform === 'win32') {
    const command = `& vercel.cmd ${curlArgs.map(value => `'${String(value).replaceAll("'", '')}'`).join(' ')}`;
    const result = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 });
    return String(result.stdout || '');
  }
  const result = await execFileAsync('vercel', curlArgs, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 });
  return String(result.stdout || '');
}

function parseStatusAndLatency(output) {
  const match = String(output || '').match(/STATUS:(\d{3})\s+TIME:(\d+(?:\.\d+)?)\s*$/);
  if (!match) throw new Error('CLI_TRANSPORT_OUTPUT_INVALID');
  return { status: Number(match[1]), latencyMs: Math.max(0, Math.round(Number(match[2]) * 1000)) };
}

export async function runAuthenticatedVercelCliCapacityProbe({
  baseUrl, deploymentId, path = '/api/health/live', requests = 10, concurrency = 2,
  expectedStatus = 200, maximumP95Ms = 5_000, timeoutMs = 30_000,
  commandRunner = defaultCommandRunner,
} = {}) {
  validateStagingTarget(baseUrl);
  if (!DEPLOYMENT_ID.test(String(deploymentId || ''))) throw new Error('A valid exact Vercel deployment ID is required.');
  if (!ALLOWED_PATHS.has(path)) throw new Error('Probe path is not on the content-free allowlist.');
  const total = integer(requests, 10, 25);
  const parallel = integer(concurrency, 2, 5);
  const status = integer(expectedStatus, 200, 599);
  const p95Limit = integer(maximumP95Ms, 5_000, 30_000);
  const timeout = integer(timeoutMs, 30_000, 60_000);
  const results = new Array(total);
  let cursor = 0;

  await Promise.all(Array.from({ length: Math.min(parallel, total) }, async () => {
    while (cursor < total) {
      const index = cursor;
      cursor += 1;
      try {
        const output = await commandRunner({ deploymentId, path, timeoutMs: timeout });
        results[index] = { ...parseStatusAndLatency(output), errorClass: null };
      } catch (error) {
        const errorClass = error?.code === 'ETIMEDOUT' || error?.killed ? 'TimeoutError' : String(error?.message || '').startsWith('CLI_TRANSPORT_') ? error.message : 'CliTransportError';
        results[index] = { status: null, latencyMs: timeout, errorClass };
      }
    }
  }));

  const latencies = results.map(item => item.latencyMs);
  const statusHistogram = {};
  for (const item of results) {
    const key = item.status === null ? `error:${item.errorClass}` : String(item.status);
    statusHistogram[key] = (statusHistogram[key] || 0) + 1;
  }
  const p95Ms = percentile(latencies, 0.95);
  const unexpected = results.filter(item => item.status !== status).length;
  return {
    schemaVersion: 1,
    ok: unexpected === 0 && p95Ms <= p95Limit,
    contentFree: true,
    containsCandidateValues: false,
    performsWrites: false,
    targetClass: 'vercel-preview',
    deploymentId: String(deploymentId),
    path,
    requests: total,
    concurrency: parallel,
    expectedStatus: status,
    statusHistogram,
    latencyMs: { p50: percentile(latencies, 0.5), p95: p95Ms, max: Math.max(...latencies), limitP95: p95Limit },
    unexpectedResponses: unexpected,
    responseBodiesRead: false,
    responseBodySink: 'os-null-device',
    authenticationMode: 'vercel-cli-session',
    bypassSecretPresent: false,
  };
}

function argumentsFrom(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--') || index + 1 >= argv.length) throw new Error(`Unexpected argument: ${key}`);
    values[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return values;
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  if (args.confirm !== CONFIRMATION) throw new Error(`Pass --confirm ${CONFIRMATION}.`);
  const result = await runAuthenticatedVercelCliCapacityProbe({
    baseUrl: args['base-url'], deploymentId: args['deployment-id'], path: args.path,
    requests: args.requests, concurrency: args.concurrency,
    expectedStatus: args['expected-status'], maximumP95Ms: args['maximum-p95-ms'], timeoutMs: args['timeout-ms'],
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(error => {
  console.error(JSON.stringify({ ok: false, contentFree: true, containsCandidateValues: false, performsWrites: false, error: String(error?.message || 'Probe failed.').replace(/[^A-Za-z0-9_.=-]/g, '_').slice(0, 180) }));
  process.exitCode = 1;
});
