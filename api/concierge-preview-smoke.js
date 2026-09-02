import { applyApiHeaders } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { DEFAULT_PUBLIC_ATS_SOURCES } from '../lib/public-ats-catalog.js';
import { discoverPublicJobs } from '../lib/public-ats-discovery.js';

export const maxDuration = 30;
const SMOKE_DISCOVERY_RUNTIME = Object.freeze({
  requestTimeoutMs: 2_500,
  detailTimeoutMs: 2_000,
  sourceConcurrency: 12,
  providerRequestConcurrency: 2,
});

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (process.env.VERCEL_ENV === 'production') return res.status(404).json({ error: 'Not found.' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const limit = await enforceDurableRateLimit(req, {
    scope: 'concierge-preview-smoke',
    ipRule: { limit: 5, window: '1 m' },
    globalRule: { limit: 100, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Preview verification limit reached.');

  const startedAt = Date.now();
  const discovery = await discoverPublicJobs({
    mission: { role: 'procurement', workModes: ['Remote', 'Hybrid'], employmentTypes: ['Full-time', 'Contract'], location: 'Newark, NJ' },
    sources: DEFAULT_PUBLIC_ATS_SOURCES,
    limit: 5,
    runtime: SMOKE_DISCOVERY_RUNTIME,
  });
  const sourcesChecked = discovery.sourceSummary.filter(source => source.status === 'ok' || source.status === 'partial').length;
  const ok = sourcesChecked > 0;
  return res.status(ok ? 200 : 503).json({
    ok,
    durableRateLimit: 'passed',
    sourceAttempts: discovery.sourceSummary.length,
    sourcesChecked,
    matches: discovery.jobs.length,
    durationMs: Math.max(0, Date.now() - startedAt),
    submissionsEnabled: false,
  });
}
