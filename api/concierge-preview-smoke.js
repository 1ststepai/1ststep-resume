import { applyApiHeaders } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { DEFAULT_PUBLIC_ATS_SOURCES } from '../lib/public-ats-catalog.js';
import { discoverPublicJobs } from '../lib/public-ats-discovery.js';

export const maxDuration = 30;

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

  const discovery = await discoverPublicJobs({
    mission: { role: 'procurement', workModes: ['Remote', 'Hybrid'], employmentTypes: ['Full-time', 'Contract'], location: 'Newark, NJ' },
    sources: DEFAULT_PUBLIC_ATS_SOURCES,
    limit: 5,
  });
  return res.status(200).json({
    ok: true,
    durableRateLimit: 'passed',
    sourcesChecked: discovery.sourceSummary.filter(source => source.status === 'ok').length,
    matches: discovery.jobs.length,
    submissionsEnabled: false,
  });
}
