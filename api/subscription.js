/**
 * GET /api/subscription?email=user@example.com
 *
 * Looks up the user's active Stripe subscription by email.
 * Returns { tier: 'free' | 'essential' | 'complete', status, subscriptionId }
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY  — sk_live_... (Stripe secret key)
 */

import Stripe from 'stripe';

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
      return res.status(200).json({ tier: 'free', status: 'no_customer' });
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
            return res.status(200).json({
              tier,
              status:         sub.status,
              subscriptionId: sub.id,
              productName:    product.name,
              currentPeriodEnd: sub.current_period_end,
            });
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
            return res.status(200).json({
              tier,
              status:         'trialing',
              subscriptionId: sub.id,
              productName:    product.name,
              currentPeriodEnd: sub.current_period_end,
            });
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
