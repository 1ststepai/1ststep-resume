import { discoverPublicJobs } from '../lib/public-ats-discovery.js';
import { DEFAULT_PUBLIC_ATS_SOURCES } from '../lib/public-ats-catalog.js';
import { applyApiHeaders, authenticateApiRequestOrGuest, hasJsonContentType, isOriginAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { recordConfiguredJobAgentOperationalEvent } from '../lib/job-agent-operational-metrics.js';

export const maxDuration = 45;
export const USER_DISCOVERY_RUNTIME = Object.freeze({
  requestTimeoutMs: 4_000,
  detailTimeoutMs: 3_000,
  sourceConcurrency: 20,
  providerRequestConcurrency: 2,
});

function configuredSources() {
  if (process.env.CONCIERGE_PUBLIC_ATS_SOURCES === undefined) return DEFAULT_PUBLIC_ATS_SOURCES;
  try {
    const parsed = JSON.parse(process.env.CONCIERGE_PUBLIC_ATS_SOURCES || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
  const auth = await authenticateApiRequestOrGuest(req);
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  const serialized = JSON.stringify(req.body || {});
  if (serialized.length > 12_000) return res.status(413).json({ error: 'Discovery request is too large.' });
  const durableLimit = await enforceDurableRateLimit(req, {
    scope: 'concierge-discovery', subject: auth.subject,
    ipRule: { limit: 12, window: '1 m' },
    accountRule: { limit: auth.guest ? 30 : 100, window: '1 d' },
    globalRule: { limit: Number(process.env.DISCOVERY_GLOBAL_DAILY_CALLS) || 5_000, window: '1 d' },
  });
  if (!durableLimit.ok) return sendRateLimitResult(res, durableLimit, 'Too many discovery requests. Please wait before trying again.');

  const sources = configuredSources();
  if (!sources.length) {
    return res.status(200).json({
      jobs: [], sourceSummary: [], errors: [], submissionsEnabled: false, costMode: 'no-paid-job-api',
      status: 'sources-not-configured',
    });
  }

  try {
    const result = await discoverPublicJobs({
      mission: req.body?.mission || {},
      sources,
      limit: req.body?.limit || 50,
      runtime: USER_DISCOVERY_RUNTIME,
    });
    return res.status(200).json({ ...result, submissionsEnabled: false, costMode: 'no-paid-job-api', access: auth.guest ? 'guest' : 'signed', status: 'complete' });
  } catch (error) {
    await recordConfiguredJobAgentOperationalEvent('discovery_failure');
    console.error(JSON.stringify({ type: 'public-ats-discovery-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'Public employer-feed discovery failed.' });
  }
}
