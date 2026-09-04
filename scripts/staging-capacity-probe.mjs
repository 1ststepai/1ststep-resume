import { pathToFileURL } from 'node:url';

const CONFIRMATION = 'BOUNDED_CONTENT_FREE_STAGING_PROBE';
const ALLOWED_PATHS = new Set(['/api/health/live', '/api/app-config']);
const PRODUCTION_HOSTS = new Set(['1ststep.ai', 'www.1ststep.ai', 'app.1ststep.ai']);

function integer(value, fallback, maximum) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new Error(`Expected an integer from 1-${maximum}.`);
  return parsed;
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? null;
}

export function validateStagingTarget(raw, { allowLocal = false } = {}) {
  const target = new URL(String(raw || ''));
  if (target.username || target.password || target.search || target.hash || target.pathname !== '/') throw new Error('Capacity target must be an origin only.');
  if (PRODUCTION_HOSTS.has(target.hostname.toLowerCase())) throw new Error('Production targets are forbidden.');
  const local = ['127.0.0.1', 'localhost', '::1'].includes(target.hostname.toLowerCase());
  if (local && allowLocal && target.protocol === 'http:') return target;
  if (target.protocol !== 'https:' || !target.hostname.toLowerCase().endsWith('.vercel.app')) throw new Error('Only an HTTPS Vercel Preview origin is allowed.');
  return target;
}

export async function runStagingCapacityProbe({
  baseUrl, path = '/api/health/live', requests = 10, concurrency = 2,
  expectedStatus = 200, maximumP95Ms = 5_000, timeoutMs = 6_000,
  bypassSecret = '', allowLocal = false, fetchImpl = fetch, now = () => performance.now(),
} = {}) {
  const origin = validateStagingTarget(baseUrl, { allowLocal });
  if (!ALLOWED_PATHS.has(path)) throw new Error('Probe path is not on the content-free allowlist.');
  const total = integer(requests, 10, 25);
  const parallel = integer(concurrency, 2, 5);
  const status = integer(expectedStatus, 200, 599);
  const p95Limit = integer(maximumP95Ms, 5_000, 30_000);
  const timeout = integer(timeoutMs, 6_000, 30_000);
  const results = new Array(total);
  let cursor = 0;

  await Promise.all(Array.from({ length: Math.min(parallel, total) }, async () => {
    while (cursor < total) {
      const index = cursor;
      cursor += 1;
      const started = now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const headers = { accept: 'application/json', 'user-agent': '1ststep-capacity-probe/1.0' };
        if (bypassSecret) headers['x-vercel-protection-bypass'] = bypassSecret;
        const response = await fetchImpl(new URL(path, origin), { method: 'GET', headers, redirect: 'error', signal: controller.signal });
        // Do not read or retain the body. This probe measures only transport/status.
        results[index] = { status: response.status, latencyMs: Math.max(0, Math.round(now() - started)), errorClass: null };
        await response.body?.cancel();
      } catch (error) {
        results[index] = { status: null, latencyMs: Math.max(0, Math.round(now() - started)), errorClass: error?.name || 'Error' };
      } finally {
        clearTimeout(timer);
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
    path,
    requests: total,
    concurrency: parallel,
    expectedStatus: status,
    statusHistogram,
    latencyMs: { p50: percentile(latencies, 0.5), p95: p95Ms, max: Math.max(...latencies), limitP95: p95Limit },
    unexpectedResponses: unexpected,
    responseBodiesRead: false,
    bypassSecretPresent: Boolean(bypassSecret),
  };
}

function argumentsFrom(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    values[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return values;
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  if (args.confirm !== CONFIRMATION) throw new Error(`Pass --confirm ${CONFIRMATION}.`);
  const result = await runStagingCapacityProbe({
    baseUrl: args['base-url'], path: args.path,
    requests: args.requests, concurrency: args.concurrency,
    expectedStatus: args['expected-status'], maximumP95Ms: args['maximum-p95-ms'],
    bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '',
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(error => {
  console.error(JSON.stringify({ ok: false, contentFree: true, error: error?.message || 'Probe failed.' }));
  process.exitCode = 1;
});
