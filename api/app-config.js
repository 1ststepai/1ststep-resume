/**
 * GET /api/app-config
 *
 * Returns public app configuration flags for the frontend.
 * Currently exposes:
 *   betaMode — true while the invite-only beta is active, false when the app is public
 *
 * To switch from beta to live:
 *   1. Set BETA_MODE=false in Vercel Environment Variables
 *   2. Redeploy (or let the next deploy pick it up)
 *
 * Response is cached for 5 minutes (CDN + browser) to avoid hammering this
 * on every page load while still propagating the flag within minutes of a change.
 */

const ALLOWED_ORIGINS = [
  'https://1ststep.ai',
  'https://www.1ststep.ai',
  'https://app.1ststep.ai',
];

function corsHeaders(req) {
  const origin  = req.headers['origin'] || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[\w-]+\.vercel\.app$/.test(origin);
  return {
    'Access-Control-Allow-Origin':  allowed ? origin : ALLOWED_ORIGINS[2],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default function handler(req, res) {
  const headers = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return res.status(204).set(headers).end();
  }

  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Cache for 5 minutes — fast propagation after an env var change + redeploy
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');

  // BETA_MODE defaults to true if the env var is not set (safe default)
  const betaMode = process.env.BETA_MODE !== 'false';

  return res.status(200).json({ betaMode });
}
