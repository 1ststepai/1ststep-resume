/**
 * GET /api/subscription?email=user@example.com
 *
 * Looks up the user's active Stripe subscription by email.
 * Returns { tier, status, tierToken } where tierToken is a short-lived HMAC
 * proof that claude.js can verify without hitting Stripe on every call.
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY  — sk_live_... (Stripe secret key)
 *   TIER_SECRET        — any random 32+ char string, used to sign tier tokens
 *                        Generate with: openssl rand -hex 32
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
  if (name.includes('complete')) return 'complete';
  if (name.includes('essential')) return 'essential';
  return 'free';
}

export default async function handler(req, res) {
  const headers = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return res.status(204).set(headers).end();
  }

  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit — prevents probing emails to discover paying customers
  const ip = req.headers['x-real-ip']
           || (req.headers['x-forwarded-for'] || '').split(',').pop().trim()
           || req.socket?.remoteAddress
           || 'unknown';
  if (isSubCheckRateLimited(ip)) {
    return res.status(429).json({ tier: 'free', error: 'Too many requests' });
  }

  const email = (req.query.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required', tier: 'free' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY not set');
    return res.status(200).json({ tier: 'free', error: 'Subscription check unavailable' });
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
        status:   'active',
        limit:    5,
        expand:   ['data.items.data.price.product'],
      });

      for (const sub of subscriptions.data) {
        for (const item of sub.items.data) {
          const product = item.price.product;
          const tier = productToTier(product.name);
          if (tier !== 'free') {
            // Only expose tier and status — no subscriptionId, productName, or billing dates.
            // Include a short-lived HMAC tierToken so claude.js can verify without re-hitting Stripe.
            return res.status(200).json({ tier, status: sub.status, tierToken: signTierToken(email, tier) });
          }
        }
      }

      // Also check trialing subscriptions
      const trialing = await stripe.subscriptions.list({
        customer: customer.id,
        status:   'trialing',
        limit:    3,
        expand:   ['data.items.data.price.product'],
      });

      for (const sub of trialing.data) {
        for (const item of sub.items.data) {
          const product = item.price.product;
          const tier = productToTier(product.name);
          if (tier !== 'free') {
            return res.status(200).json({ tier, status: 'trialing', tierToken: signTierToken(email, tier) });
          }
        }
      }
    }

    // Customer exists but no active paid subscription
    return res.status(200).json({ tier: 'free', status: 'no_active_subscription' });

  } catch (err) {
    console.error('Stripe subscription check error:', err.message);
    // Fail open — don't block the user if Stripe is down
    return res.status(200).json({ tier: 'free', error: 'Subscription check failed' });
  }
}
