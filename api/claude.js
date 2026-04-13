// Vercel Serverless Function — Claude API Proxy
// Keeps the Anthropic API key server-side so customers don't need their own.
//
// Environment variable required:
//   ANTHROPIC_API_KEY = sk-ant-api03-...
//
// Set it in Vercel: Project → Settings → Environment Variables

export const maxDuration = 60; // seconds — needed for long Sonnet rewrites

// ── Allowed origins (same-origin calls don't need CORS, but list here for preflight) ──
const ALLOWED_ORIGINS = [
  'https://1ststep.ai',
  'https://www.1ststep.ai',
  'https://app.1ststep.ai',
];

// ── Server-side caps — client cannot exceed these even if it tries ──
const MAX_TOKENS_HARD_CAP = 4096;
const MAX_BODY_BYTES       = 32_000; // ~32 KB — enough for any resume + job desc

// ── Per-minute rate limiter (per warm function instance) ──
// Prevents rapid hammering regardless of monthly limits.
const ipWindows = new Map(); // ip → [timestamp, ...]
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_CALLS = 15;     // max Claude calls per IP per minute

// ── Monthly usage tracker (per warm function instance) ──
// Keys: "<ip>:<YYYY-MM>" → { tailor, coverLetter, search, linkedin }
// Note: resets on cold starts — intentional for serverless.  Provides meaningful
// friction against the most common abuse pattern (clearing localStorage) without
// requiring an external database.
const monthlyIpUsage = new Map();

// Server-side monthly limits per IP.
// Set high enough that no paying user ever hits them,
// low enough to block a free-tier abuser who clears localStorage repeatedly.
const MONTHLY_IP_LIMITS = {
  tailor:      15,  // free tier client limit is 3 → abuser cut off after 5 resets
  coverLetter: 15,
  search:      30,
  linkedin:     8,
};

// callType values that are counted against monthly limits
const COUNTED_TYPES = new Set(['tailor', 'coverLetter', 'search', 'linkedin']);

function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getMonthlyKey(ip) {
  return `${ip}:${currentMonth()}`;
}

function checkAndIncrementMonthly(ip, callType) {
  // Only count meaningful call types
  if (!COUNTED_TYPES.has(callType)) return { allowed: true };

  const key   = getMonthlyKey(ip);
  const usage = monthlyIpUsage.get(key) || { tailor: 0, coverLetter: 0, search: 0, linkedin: 0 };
  const limit = MONTHLY_IP_LIMITS[callType] ?? 999;

  if (usage[callType] >= limit) {
    return { allowed: false, used: usage[callType], limit };
  }

  usage[callType] = (usage[callType] || 0) + 1;
  monthlyIpUsage.set(key, usage);

  // Trim map — keep max 10 000 IP-month keys
  if (monthlyIpUsage.size > 10_000) {
    const oldest = [...monthlyIpUsage.keys()].slice(0, 1000);
    oldest.forEach(k => monthlyIpUsage.delete(k));
  }

  return { allowed: true, used: usage[callType], limit };
}

function isRateLimited(ip) {
  const now = Date.now();
  const calls = (ipWindows.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  calls.push(now);
  ipWindows.set(ip, calls);
  // Trim map so it doesn't grow unbounded across many IPs
  if (ipWindows.size > 5000) {
    const oldest = [...ipWindows.keys()].slice(0, 500);
    oldest.forEach(k => ipWindows.delete(k));
  }
  return calls.length > RATE_LIMIT_MAX_CALLS;
}

function getOriginHeader(req, res) {
  const origin = req.headers['origin'] || '';
  // Allow same-origin (no origin header) and listed origins
  const allowed = !origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app');
  if (allowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  return allowed;
}

export default async function handler(req, res) {
  // Security headers on every response
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    const origin = req.headers['origin'] || '';
    if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Origin check
  if (!getOriginHeader(req, res)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Resolve client IP
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
           || req.socket?.remoteAddress
           || 'unknown';

  // Per-minute rate limiting (prevents hammering)
  if (isRateLimited(ip)) {
    return res.status(429).json({
      error: 'Too many requests — please wait a moment and try again.',
      code: 'RATE_LIMITED',
    });
  }

  // Body size guard
  const bodyStr = JSON.stringify(req.body || {});
  if (bodyStr.length > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Request too large. Please shorten your resume or job description.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY environment variable not set');
    return res.status(500).json({ error: 'Server configuration error — API key not configured.' });
  }

  const { model, system, messages, max_tokens, callType = 'utility' } = req.body || {};

  if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: model, messages' });
  }

  // Allowlist models — prevents abuse if someone calls your endpoint directly
  const allowedModels = [
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6',
    'claude-haiku-3-5-latest',
    'claude-3-haiku-20240307',
  ];
  if (!allowedModels.includes(model)) {
    return res.status(400).json({ error: `Model not allowed: ${model}` });
  }

  // ── Monthly per-IP limit check ─────────────────────────────────────────────
  // This is the server-side enforcement that backs up the client-side usage meter.
  // A user who clears localStorage to bypass client limits will still be blocked here
  // once they've consumed their monthly server-side allowance for this IP.
  const limitCheck = checkAndIncrementMonthly(ip, callType);
  if (!limitCheck.allowed) {
    return res.status(429).json({
      error: `Monthly limit reached for this IP address. Upgrade to continue.`,
      code: 'MONTHLY_LIMIT',
      callType,
      used: limitCheck.used,
      limit: limitCheck.limit,
    });
  }

  // Enforce server-side token cap — client cannot request more than this
  const clampedTokens = Math.min(Number(max_tokens) || 1024, MAX_TOKENS_HARD_CAP);

  // Validate messages structure (basic)
  for (const msg of messages) {
    if (!msg.role || !msg.content || typeof msg.content !== 'string') {
      return res.status(400).json({ error: 'Invalid message format' });
    }
    if (!['user', 'assistant'].includes(msg.role)) {
      return res.status(400).json({ error: 'Invalid message role' });
    }
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: clampedTokens,
        system,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.json().catch(() => ({}));
      const message = errBody?.error?.message || `Anthropic API error ${anthropicRes.status}`;
      console.error('Anthropic error:', anthropicRes.status, message);
      return res.status(anthropicRes.status).json({ error: message });
    }

    const data = await anthropicRes.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
