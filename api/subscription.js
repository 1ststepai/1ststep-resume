/**
 * GET /api/subscription?email=user@example.com
 *
 * Looks up the user's active Stripe subscription by email.
 * Returns { tier, status, tierToken } where tierToken is a short-lived HMAC
 * proof that claude.js can verify without hitting Stripe on every call.
 *
 * Also handles LinkedIn OAuth flow:
 *   GET /api/subscription?action=linkedin-init   — returns the LinkedIn auth URL
 *   GET /api/subscription?action=linkedin-callback&code=...&state=... — exchanges code for profile
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY    — sk_live_... (Stripe secret key)
 *   TIER_SECRET          — any random 32+ char string, used to sign tier tokens
 *   LINKEDIN_CLIENT_ID   — LinkedIn OAuth app client ID
 *   LINKEDIN_CLIENT_SECRET — LinkedIn OAuth app client secret
 */

import Stripe from 'stripe';
import { createHmac } from 'crypto';

// ── Tier token helpers ────────────────────────────────────────────────────────
// A tierToken is: base64(email + "|" + tier + "|" + expiry) + "." + HMAC
// Valid for 20 minutes. claude.js verifies without contacting Stripe.
const TOKEN_TTL_MS = 20 * 60 * 1000;

function signTierToken(email, tier) {
  const secret = process.env.TIER_SECRET;
  if (!secret) return ''; // no secret configured — skip token
  const exp     = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(`${email}|${tier}|${exp}`).toString('base64');
  const sig     = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyTierToken(token) {
  const secret = process.env.TIER_SECRET;
  if (!secret || !token) return null;
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    // Constant-time comparison to prevent timing attacks
    if (sig.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    const [email, tier, exp] = Buffer.from(payload, 'base64').toString().split('|');
    if (Date.now() > Number(exp)) return null; // expired
    return { email, tier };
  } catch {
    return null;
  }
}

// ── Beta email override — BETA_EMAILS env var (comma-separated) ──────────────
function isBetaEmail(email) {
  const list = (process.env.BETA_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

// ── Per-IP rate limiter — prevents email enumeration / customer probing ──────
const subCheckWindows = new Map();
const SUB_CHECK_WINDOW_MS  = 60_000; // 1 minute
const SUB_CHECK_MAX_PER_IP = 10;     // 10 checks/IP/min — covers any legit user

function isSubCheckRateLimited(ip) {
  const now  = Date.now();
  const hits = (subCheckWindows.get(ip) || []).filter(t => now - t < SUB_CHECK_WINDOW_MS);
  hits.push(now);
  subCheckWindows.set(ip, hits);
  if (subCheckWindows.size > 5000) {
    [...subCheckWindows.keys()].slice(0, 500).forEach(k => subCheckWindows.delete(k));
  }
  return hits.length > SUB_CHECK_MAX_PER_IP;
}

const ALLOWED_ORIGINS = [
  'https://1ststep.ai',
  'https://www.1ststep.ai',
  'https://app.1ststep.ai',
];

function corsHeaders(req) {
  const origin = req.headers['origin'] || '';
  const allowed =
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[\w-]+\.vercel\.app$/.test(origin);
  return {
    'Access-Control-Allow-Origin':  allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/** Map Stripe product name → app tier */
function productToTier(productName = '') {
  const name = productName.toLowerCase();
  if (name.includes('job hunt pass') || name.includes('pro') || name.includes('complete')) return 'complete';
  if (name.includes('essential')) return 'essential';
  return 'free';
}

// ── LinkedIn popup close page ────────────────────────────────────────────────
// Rendered inside the OAuth popup — posts profile data to the parent window then closes.
function handlePopupAuth({ profile, error } = {}) {
  const payload = JSON.stringify(error ? { error } : { profile });
  const appUrl = 'https://app.1ststep.ai'; // Use a constant for the app URL

  // On mobile, this might open as a new tab. Redirect back to the app.
  // On desktop, it's a popup. Try to close it.
  const closeOrRedirect = () => {
    try { window.close(); } catch(e) { window.location.href = appUrl; } // If close fails, redirect
    setTimeout(() => { window.location.href = appUrl; }, 400); // Fallback redirect
  };

  // Use localStorage as a reliable fallback for parent communication
  try { localStorage.setItem('1ststep_li_auth', JSON.stringify({ ts: Date.now(), payload })); } catch(e) { console.error("localStorage error:", e); }

  // Attempt to use postMessage for desktop popup flow
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({ type: '1ststep_linkedin', payload }, appUrl);
  }

  // Schedule closing or redirecting after a short delay
  setTimeout(closeOrRedirect, 600);
}

function renderPopupHtml({ profile, error } = {}) {
  const title = error ? "LinkedIn Connection Failed" : "Connecting LinkedIn...";
  const message = error
    ? "Could not connect LinkedIn. You can close this window."
    : "Connected! Closing this window...";
  const errorStyle = error ? "color: #F87171;" : ""; // Red for errors

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${title}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0F172A;color:#F1F5F9;
display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:12px}
.spinner{width:32px;height:32px;border:3px solid #334155;border-top-color:#6366F1;border-radius:50%;animation:spin 0.7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}</style></head>
<body>
${error
  ? `<div style="font-size:14px; ${errorStyle}">${message}</div>`
  : `<div class="spinner"></div><div style="font-size:14px;color:#94A3B8">${message}</div>`}
<script>
  // Logic to communicate with the parent window and close/redirect
  const payload = ${JSON.stringify({ profile, error })};
  const appUrl = '${'https://app.1ststep.ai'}'; // Ensure this is the correct app URL

  // Use localStorage as a reliable fallback for parent communication
  try {
    localStorage.setItem('1ststep_li_auth', JSON.stringify({ ts: Date.now(), payload }));
  } catch(e) { console.error("localStorage error:", e); }

  // Attempt to use postMessage for desktop popup flow
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({ type: '1ststep_linkedin', payload }, appUrl);
  }

  // Schedule closing or redirecting after a short delay
  setTimeout(() => {
    try {
      window.close();
    } catch(e) {
      // If close fails (e.g., opened as a new tab), redirect to the app
      window.location.href = appUrl;
    }
    // Fallback redirect if window.close() was not called or failed
    setTimeout(() => { window.location.href = appUrl; }, 400);
  }, 600);
</script>
</body></html>`;
}

// ── LinkedIn OAuth helpers ────────────────────────────────────────────────────
const LINKEDIN_REDIRECT = 'https://app.1ststep.ai/api/subscription?action=linkedin-callback';
const LINKEDIN_SCOPES   = 'openid profile email';

function linkedinAuthUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.LINKEDIN_CLIENT_ID || '',
    redirect_uri:  LINKEDIN_REDIRECT,
    scope:         LINKEDIN_SCOPES,
    state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

async function exchangeLinkedInCode(code) {
  const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  LINKEDIN_REDIRECT,
      client_id:     process.env.LINKEDIN_CLIENT_ID     || '',
      client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
    }),
  });
  if (!r.ok) {
    const errorBody = await r.text(); // Get more details from the response
    console.error(`LinkedIn token exchange failed: ${r.status} - ${errorBody}`);
    throw new Error(`LinkedIn token exchange failed: ${r.status}`);
  }
  return r.json();
}

async function fetchLinkedInProfile(accessToken) {
  // OpenID Connect userinfo endpoint — returns sub, name, email, picture
  const r = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!r.ok) {
    const errorBody = await r.text();
    console.error(`LinkedIn userinfo failed: ${r.status} - ${errorBody}`);
    throw new Error(`LinkedIn userinfo failed: ${r.status}`);
  }
  return r.json();
}

// In-memory state store — prevents CSRF. TTL: 10 min. Resets on cold start (fine).
const linkedInStates = new Map();
function genState() {
  const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  linkedInStates.set(state, Date.now());
  if (linkedInStates.size > 500) {
    const oldest = [...linkedInStates.keys()].slice(0, 50);
    oldest.forEach(k => linkedInStates.delete(k));
  }
  return state;
}
function validateState(state) {
  const ts = linkedInStates.get(state);
  if (!ts) return false;
  linkedInStates.delete(state);
  return Date.now() - ts < 10 * 60 * 1000;
}

export default async function handler(req, res) {
  const headers = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    // Apply CORS headers for OPTIONS requests
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }

  // Apply CORS headers for all responses
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader('Cache-Control', 'no-store'); // Prevent caching of sensitive info

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const action = req.query.action || '';

  // ── LinkedIn: init — return auth URL ─────────────────────────────────────
  if (action === 'linkedin-init') {
    if (!process.env.LINKEDIN_CLIENT_ID) {
      console.error('LINKEDIN_CLIENT_ID not configured.');
      return res.status(500).json({ error: 'LinkedIn integration not configured.' });
    }
    const state = genState();
    return res.status(200).json({ url: linkedinAuthUrl(state) });
  }

  // ── LinkedIn: callback — exchange code, return profile ───────────────────
  if (action === 'linkedin-callback') {
    const { code, state, error: liError } = req.query;

    // Strict origin check for LinkedIn callback to prevent CSRF
    const origin = req.headers['origin'] || '';
    if (!ALLOWED_ORIGINS.includes(origin) && !origin.endsWith('.vercel.app')) {
      console.error(`Invalid origin for LinkedIn callback: ${origin}`);
      return res.status(403).send(renderPopupHtml({ error: 'invalid_origin' }));
    }

    if (liError) {
      // User denied — close popup with error signal
      return res.status(200).send(renderPopupHtml({ error: 'access_denied' }));
    }

    if (!validateState(state)) {
      console.error('Invalid state parameter for LinkedIn callback.');
      return res.status(200).send(renderPopupHtml({ error: 'invalid_state' }));
    }

    try {
      const tokens  = await exchangeLinkedInCode(code);
      const profile = await fetchLinkedInProfile(tokens.access_token);

      // profile shape: { sub, name, given_name, family_name, email, picture }
      const data = {
        firstName: profile.given_name  || '',
        lastName:  profile.family_name || '',
        name:      profile.name        || '',
        email:     profile.email       || '',
        picture:   profile.picture     || '',
        linkedinUrl: profile.sub ? `linkedin.com/in/${profile.sub}` : '', // Construct URL if sub is available
      };

      console.log('LinkedIn auth success');
      return res.status(200).send(renderPopupHtml({ profile: data }));
    } catch (err) {
      console.error('LinkedIn callback error:', err.message);
      return res.status(200).send(renderPopupHtml({ error: 'auth_failed' }));
    }
  }

  // Rate limit — prevents email enumeration / customer probing
  const ip = req.headers['x-real-ip']
           || (req.headers['x-forwarded-for'] || '').split(',').pop()?.trim() // Use optional chaining and trim
           || req.socket?.remoteAddress
           || 'unknown';

  if (isSubCheckRateLimited(ip)) {
    alertOnAbuse('rate_limited', ip, `action:${action || 'check'}`); // More context in alert
    return res.status(429).json({ tier: 'free', error: 'Too many requests' });
  }

  const email = (req.query.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.', tier: 'free' });
  }

  // Beta override — no Stripe lookup needed
  if (isBetaEmail(email)) {
    return res.status(200).json({ tier: 'complete', status: 'beta', expiresAt: null, expiresInDays: null, tierToken: signTierToken(email, 'complete') });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY not set. Subscription check unavailable.');
    return res.status(200).json({ tier: 'free', error: 'Subscription check unavailable.' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    // Find customers with this email
    const customers = await stripe.customers.list({ email, limit: 5 });

    if (!customers.data.length) {
      // Return same shape as 'free' — don't reveal whether the email has ever been seen
      return res.status(200).json({ tier: 'free', status: 'no_active_subscription' });
    }

    // Check each customer for an active subscription
    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status:   'active', // Only consider active subscriptions
        limit:    5,
        expand:   ['data.items.data.price.product'],
      });

      for (const sub of subscriptions.data) {
        for (const item of sub.items.data) {
          // Ensure product is defined before accessing its properties
          const product = item.price?.product;
          if (product?.name) {
            const tier = productToTier(product.name);
            if (tier !== 'free') {
              const passExpMs = customer.metadata?.pass_expires_at ? Number(customer.metadata.pass_expires_at) : null;
              const periodEndMs = sub.current_period_end ? sub.current_period_end * 1000 : null;
              const expiresMs = passExpMs || periodEndMs;
              const expiresAt = expiresMs ? new Date(expiresMs).toISOString() : null;
              const expiresInDays = expiresMs ? Math.max(0, Math.ceil((expiresMs - Date.now()) / 86400000)) : null;
              return res.status(200).json({ tier, status: sub.status, tierToken: signTierToken(email, tier), expiresAt, expiresInDays });
            }
          }
        }
      }

      // Also check trialing subscriptions
      const trialing = await stripe.subscriptions.list({
        customer: customer.id,
        status:   'trialing', // Consider trialing subscriptions as active for feature access
        limit:    3,
        expand:   ['data.items.data.price.product'],
      });

      for (const sub of trialing.data) {
        for (const item of sub.items.data) {
          const product = item.price?.product;
          if (product?.name) {
            const tier = productToTier(product.name);
            if (tier !== 'free') {
              const expiresMs = sub.current_period_end ? sub.current_period_end * 1000 : null;
              const expiresAt = expiresMs ? new Date(expiresMs).toISOString() : null;
              const expiresInDays = expiresMs ? Math.max(0, Math.ceil((expiresMs - Date.now()) / 86400000)) : null;
              return res.status(200).json({ tier, status: 'trialing', tierToken: signTierToken(email, tier), expiresAt, expiresInDays });
            }
          }
        }
      }
    }

    // Customer exists but no active paid or trialing subscription found
    return res.status(200).json({ tier: 'free', status: 'no_active_subscription' });

  } catch (err) {
    console.error('Stripe subscription check error:', err.message);
    // Fail open — don't block the user if Stripe is temporarily down or an unexpected error occurs
    return res.status(200).json({ tier: 'free', error: 'Subscription check failed.' });
  }
}
