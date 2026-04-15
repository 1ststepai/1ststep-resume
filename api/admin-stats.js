/**
 * GET /api/admin-stats
 *
 * Private admin dashboard data endpoint for 1stStep.ai.
 * Returns user funnel counts and recent signups from GHL + Stripe.
 *
 * Auth: requires x-admin-secret header (or ?secret= query param) matching ADMIN_SECRET env var.
 *
 * Env vars required:
 *   ADMIN_SECRET      — secret password for the dashboard
 *   GHL_API_KEY       — GHL bearer token
 *   GHL_LOCATION_ID   — GHL location ID
 *   STRIPE_SECRET_KEY — Stripe secret key (for paid subscriber count)
 */

import Stripe from 'stripe';

export const maxDuration = 15;

const GHL_BASE = 'https://services.leadconnectorhq.com';

function ghlHeaders() {
  return {
    'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json',
  };
}

// Count contacts with a specific tag using GHL v2 contacts API
async function countByTag(tag) {
  try {
    const url = `${GHL_BASE}/contacts/?locationId=${encodeURIComponent(process.env.GHL_LOCATION_ID)}&limit=1&tags[]=${encodeURIComponent(tag)}`;
    const res = await fetch(url, { headers: ghlHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    return data.meta?.total ?? data.contacts?.length ?? null;
  } catch {
    return null;
  }
}

// Total contacts at location (all signups ever)
async function countTotal() {
  try {
    const url = `${GHL_BASE}/contacts/?locationId=${encodeURIComponent(process.env.GHL_LOCATION_ID)}&limit=1`;
    const res = await fetch(url, { headers: ghlHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    return data.meta?.total ?? null;
  } catch {
    return null;
  }
}

// Most recent N contacts sorted by date added
async function getRecentContacts(limit = 15) {
  try {
    const url = `${GHL_BASE}/contacts/?locationId=${encodeURIComponent(process.env.GHL_LOCATION_ID)}&limit=${limit}`;
    const res = await fetch(url, { headers: ghlHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.contacts || []).map(c => ({
      id: c.id,
      name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Unknown',
      email: c.email || '',
      tags: c.tags || [],
      dateAdded: c.dateAdded || c.createdAt || null,
    }));
  } catch {
    return [];
  }
}

// Active Stripe subscriptions
async function getStripePaidCount() {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return 0;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    const subs = await stripe.subscriptions.list({ status: 'active', limit: 100 });
    return subs.data.length;
  } catch {
    return 0;
  }
}

export default async function handler(req, res) {
  // Reject non-GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  const provided = req.headers['x-admin-secret'] || req.query.secret;
  const expected = process.env.ADMIN_SECRET;
  if (!expected || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.setHeader('Cache-Control', 'no-store');

  // Fan out all queries in parallel
  const [
    totalResult,
    betaResult,
    activeResult,
    powerResult,
    essentialResult,
    completeResult,
    recentResult,
    stripeResult,
  ] = await Promise.allSettled([
    countTotal(),
    countByTag('beta'),
    countByTag('active_user'),
    countByTag('power_user'),
    countByTag('converted_essential'),
    countByTag('converted_complete'),
    getRecentContacts(15),
    getStripePaidCount(),
  ]);

  const val = (r, fallback) => r.status === 'fulfilled' ? (r.value ?? fallback) : fallback;

  return res.status(200).json({
    funnel: {
      total:       val(totalResult,     null),
      beta:        val(betaResult,      null),
      activeUsers: val(activeResult,    null),
      powerUsers:  val(powerResult,     null),
      paid:        val(stripeResult,    0),
      essential:   val(essentialResult, null),
      complete:    val(completeResult,  null),
    },
    recent:    val(recentResult, []),
    updatedAt: new Date().toISOString(),
  });
}
