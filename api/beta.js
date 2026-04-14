/**
 * POST /api/beta
 *
 * Beta access gate for 1stStep.ai.
 * Validates an invite code, issues a 15-day HMAC tier token (Complete plan),
 * and captures the user's email as a GHL contact tagged 'beta'.
 *
 * Body: { email, code }
 *
 * Returns: { valid: true, tier: 'complete', tierToken: '...', expiresAt: <ms> }
 *      or: { valid: false, error: '...' }
 *
 * Env vars required:
 *   BETA_CODE        — the invite code (set in Vercel — share this with beta users)
 *   TIER_SECRET      — used to sign the tier token (already set)
 *   GHL_API_KEY      — optional — used to tag the beta contact in GHL
 *   GHL_LOCATION_ID  — optional
 */

import { createHmac } from 'crypto';

export const maxDuration = 15;

const ALLOWED_ORIGINS = [
  'https://1ststep.ai',
  'https://www.1ststep.ai',
  'https://app.1ststep.ai',
];

// Beta token TTL: 15 days
const BETA_TTL_MS = 15 * 24 * 60 * 60 * 1000;

// Rate limiter — 10 attempts per IP per hour (prevents code brute-forcing)
const betaAttempts = new Map();
const BETA_WINDOW_MS  = 60 * 60 * 1000;
const BETA_MAX_TRIES  = 10;

function isBetaRateLimited(ip) {
  const now  = Date.now();
  const hits = (betaAttempts.get(ip) || []).filter(t => now - t < BETA_WINDOW_MS);
  hits.push(now);
  betaAttempts.set(ip, hits);
  if (betaAttempts.size > 2000) {
    [...betaAttempts.keys()].slice(0, 200).forEach(k => betaAttempts.delete(k));
  }
  return hits.length > BETA_MAX_TRIES;
}

function signTierToken(email, tier, ttlMs) {
  const secret = process.env.TIER_SECRET;
  if (!secret) return '';
  const exp     = Date.now() + ttlMs;
  const payload = Buffer.from(`${email}|${tier}|${exp}`).toString('base64');
  const sig     = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function corsHeaders(req) {
  const origin  = req.headers['origin'] || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[\w-]+\.vercel\.app$/.test(origin);
  return {
    'Access-Control-Allow-Origin':  allowed ? origin : ALLOWED_ORIGINS[2],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default async function handler(req, res) {
  const headers = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return res.status(204).set(headers).end();
  }

  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-real-ip']
           || (req.headers['x-forwarded-for'] || '').split(',').pop().trim()
           || req.socket?.remoteAddress
           || 'unknown';

  if (isBetaRateLimited(ip)) {
    return res.status(429).json({ valid: false, error: 'Too many attempts — try again later.' });
  }

  const { email = '', code = '' } = req.body || {};

  // Validate email
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return res.status(400).json({ valid: false, error: 'Please enter a valid email address.' });
  }

  // Validate beta code
  const betaCode = (process.env.BETA_CODE || '').trim();
  if (!betaCode) {
    // If BETA_CODE is not set in Vercel, beta gate is disabled — let everyone in
    console.warn('BETA_CODE env var not set — beta gate is open to all');
  } else if (code.trim() !== betaCode) {
    // Deliberate delay to slow brute-forcing (even with rate limiter)
    await new Promise(r => setTimeout(r, 500));
    return res.status(200).json({ valid: false, error: 'Invalid invite code — check your invite and try again.' });
  }

  // Issue a 15-day Complete tier token
  const expiresAt  = Date.now() + BETA_TTL_MS;
  const tierToken  = signTierToken(cleanEmail, 'complete', BETA_TTL_MS);

  // ── Capture in GHL as beta contact ──────────────────────────────────────────
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (apiKey && locationId) {
    fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method:  'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version':       '2021-07-28',
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        locationId,
        email:  cleanEmail,
        tags:   ['beta', 'complete', 'beta_2026'],
        source: '1stStep.ai — Beta Access',
      }),
    }).catch(err => console.error('GHL beta contact error:', err.message));
    // fire-and-forget — don't delay the response
  }

  console.log(`✅ Beta access granted: ${cleanEmail} — expires ${new Date(expiresAt).toISOString()}`);

  return res.status(200).json({
    valid:      true,
    tier:       'complete',
    tierToken,
    expiresAt,
    message:    'Welcome to the 1stStep.ai beta! You have full Complete access for 15 days.',
  });
}
