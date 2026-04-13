// Vercel Serverless Function — Job Search Proxy
// Keeps the RapidAPI key server-side so customers don't need their own.
//
// Environment variable required:
//   RAPIDAPI_KEY = your RapidAPI key (from jsearch plan on rapidapi.com)
//
// Set it in Vercel: Project → Settings → Environment Variables
//
// JSearch plan: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
// Free tier: 200 calls/month  |  Basic: $10/mo for 500 calls

export const maxDuration = 30;

// ── Allowed origins ─────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://1ststep.ai',
  'https://www.1ststep.ai',
  'https://app.1ststep.ai',
];

// ── Allowed query parameters forwarded to JSearch ──────────────────────────
// Explicit allowlist prevents parameter injection / SSRF
const ALLOWED_PARAMS = new Set([
  'query', 'page', 'num_pages', 'date_posted', 'remote_jobs_only',
  'employment_types', 'job_requirements', 'country', 'radius',
  'job_id', 'extended_publisher_details',
]);

// ── Rate limiting ────────────────────────────────────────────────────────────
const ipWindows = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_CALLS = 30; // job searches are cheaper, allow more

function isRateLimited(ip) {
  const now = Date.now();
  const calls = (ipWindows.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  calls.push(now);
  ipWindows.set(ip, calls);
  if (ipWindows.size > 5000) {
    const oldest = [...ipWindows.keys()].slice(0, 500);
    oldest.forEach(k => ipWindows.delete(k));
  }
  return calls.length > RATE_LIMIT_MAX_CALLS;
}

export default async function handler(req, res) {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // CORS
  const origin = req.headers['origin'] || '';
  const originAllowed = !origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app');
  if (originAllowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!originAllowed) return res.status(403).json({ error: 'Forbidden' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many searches — please wait a moment and try again.' });
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    console.error('RAPIDAPI_KEY environment variable not set');
    return res.status(500).json({ error: 'Job search not configured on server.' });
  }

  // Build clean params — only forward allowlisted keys
  const safeParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (ALLOWED_PARAMS.has(key) && typeof value === 'string' && value.length < 500) {
      safeParams.set(key, value);
    }
  }

  // Determine endpoint
  const isDetails = req.url?.includes('/details');
  const jsearchEndpoint = isDetails ? 'job-details' : 'search';

  try {
    const upstream = await fetch(`https://jsearch.p.rapidapi.com/${jsearchEndpoint}?${safeParams}`, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
    });

    if (upstream.status === 403 || upstream.status === 401) {
      return res.status(403).json({ error: 'Invalid RapidAPI key on server. Contact support at evan@1ststep.ai' });
    }
    if (upstream.status === 429) {
      return res.status(429).json({ error: 'Job search is temporarily at capacity — try again shortly.' });
    }
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Job search error ${upstream.status}` });
    }

    const data = await upstream.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('Job proxy error:', err);
    return res.status(500).json({ error: err.message || 'Job search failed' });
  }
}
