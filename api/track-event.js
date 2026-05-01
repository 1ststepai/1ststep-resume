/**
 * POST /api/track-event
 *
 * Lightweight event tracker. Updates a GHL contact's tags when key milestones
 * happen — first tailor, first search, etc. — so Evan can trigger upgrade
 * sequences based on product engagement rather than just signup date.
 *
 * Body: { email, event }
 *   event: 'first_tailor' | 'first_search' | 'first_cover_letter'
 *
 * Env vars required:
 *   GHL_API_KEY     — pit-... (GoHighLevel Private Integration Token)
 *   GHL_LOCATION_ID — GHL Location ID
 */

export const maxDuration = 10;

// ── Per-IP rate limiter — 20 event tracks per IP per hour ────────────────────
const eventWindows = new Map();
const EVENT_WINDOW_MS  = 60 * 60 * 1000;
const EVENT_MAX_PER_IP = 20;

function isEventRateLimited(ip) {
  const now  = Date.now();
  const hits = (eventWindows.get(ip) || []).filter(t => now - t < EVENT_WINDOW_MS);
  hits.push(now);
  eventWindows.set(ip, hits);
  if (eventWindows.size > 2000) {
    const oldest = [...eventWindows.keys()].slice(0, 200);
    oldest.forEach(k => eventWindows.delete(k));
  }
  return hits.length > EVENT_MAX_PER_IP;
}

const ALLOWED_ORIGINS = [
  'https://1ststep.ai',
  'https://www.1ststep.ai',
  'https://app.1ststep.ai',
];

// Allowed events — map to GHL tags
const EVENT_TAGS = {
  first_tailor:               ['first_tailor'],
  first_search:               ['first_search'],
  first_cover_letter:         ['first_cover_letter'],
  application_saved:          ['used_tracker', 'application_saved'],
  application_status_changed: ['used_tracker', 'application_status_changed'],
  tracker_viewed:             ['used_tracker'],
  upgrade_intent:             ['upgrade_intent'],
  paywall_unlock_click:       ['upgrade_intent'],
  pricing_cta_click:          ['upgrade_intent'],
  cover_letter_limit_view:    ['upgrade_intent'],
  power_user:                 ['power_user', 'testimonial_candidate'],
};

function corsHeaders(req) {
  const origin  = req.headers['origin'] || '';
  const allowed =
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[\w-]+\.vercel\.app$/.test(origin);
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',').pop().trim()
           || req.socket?.remoteAddress || 'unknown';
  if (isEventRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { email, event } = req.body || {};

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const tags = EVENT_TAGS[event] || (/^streak_\d+$/.test(event) ? [event] : null);
  if (!tags) {
    return res.status(200).json({ ok: true, result: 'ignored', event });
  }

  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    console.log('GHL env vars not set — skipping event track');
    return res.status(200).json({ ok: true, result: 'skipped' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const ghlBody = JSON.stringify({ locationId, email: normalizedEmail, tags });
  const ghlHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       '2021-07-28',
    'Content-Type':  'application/json',
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
        method: 'POST', headers: ghlHeaders, body: ghlBody,
      });
      if (!r.ok) throw new Error(`GHL returned ${r.status}`);
      const data = await r.json();
      if (data.contact?.id) {
        console.log(`✅ GHL event tracked [${event}] (attempt ${attempt}): ${data.contact.id} (${normalizedEmail})`);
        return res.status(200).json({ ok: true, result: 'ok', contactId: data.contact.id });
      } else {
        console.error(`GHL event tag failed (attempt ${attempt}):`, JSON.stringify(data));
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error(`GHL event track error (attempt ${attempt}):`, err.message);
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
    }
  }
  return res.status(200).json({ ok: false, result: 'error' });
}
