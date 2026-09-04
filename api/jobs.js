import { alertOnAbuse } from './_alert.js';
import { applyApiHeaders, authenticateApiRequest, isOriginAllowed, requestIp } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';

export const maxDuration = 30;

const ALLOWED_PARAMS = new Set([
  'query', 'page', 'num_pages', 'date_posted', 'remote_jobs_only',
  'employment_types', 'job_requirements', 'country', 'radius',
  'job_id', 'extended_publisher_details',
]);
export default async function handler(req, res) {
  applyApiHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return isOriginAllowed(req) ? res.status(204).end() : res.status(403).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.code === 'AUTH_REQUIRED' ? 'Sign in again to search jobs.' : 'Request not authorized.', code: auth.code });
  const ip = requestIp(req);
  const durableLimit = await enforceDurableRateLimit(req, {
    scope: 'jobs', subject: auth.subject, ip,
    ipRule: { limit: 30, window: '1 m' },
    accountRule: { limit: 200, window: '1 d' },
    globalRule: { limit: Number(process.env.JOB_SEARCH_GLOBAL_DAILY_CALLS) || 10_000, window: '1 d' },
  });
  if (!durableLimit.ok) {
    alertOnAbuse('rate_limited', ip, 'endpoint:jobs');
    return sendRateLimitResult(res, durableLimit, 'Too many searches. Please wait before searching again.');
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Paid job search is disabled. Public employer-feed discovery remains available.' });
  const safeParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (ALLOWED_PARAMS.has(key) && typeof value === 'string' && value.length <= 300) safeParams.set(key, value);
  }
  if (!safeParams.get('query') && !safeParams.get('job_id')) return res.status(400).json({ error: 'A job query or job ID is required.' });
  const endpoint = req.url?.includes('/details') ? 'job-details' : 'search';

  try {
    const upstream = await fetch(`https://jsearch.p.rapidapi.com/${endpoint}?${safeParams}`, {
      headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' },
      signal: AbortSignal.timeout(12_000),
    });
    if (upstream.status === 401 || upstream.status === 403) {
      alertOnAbuse('jsearch_auth_failure', 'provider', `status:${upstream.status}`);
      return res.status(502).json({ error: 'The job-search provider is not configured correctly.' });
    }
    if (upstream.status === 429) return res.status(429).json({ error: 'Job search is temporarily at capacity.' });
    if (!upstream.ok) return res.status(502).json({ error: 'The job-search provider returned an error.' });
    return res.status(200).json(await upstream.json());
  } catch (error) {
    console.error(JSON.stringify({ type: 'job-provider-failure', name: error.name || 'unknown' }));
    return res.status(502).json({ error: 'The job-search provider could not be reached.' });
  }
}
