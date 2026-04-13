/**
 * POST /api/notify-signup
 *
 * Called from the frontend when a user saves their profile for the first time.
 * Reliably captures every free signup into GHL as a contact tagged 'free'
 * so Evan can run retargeting sequences, upgrade nudges, and follow-ups.
 *
 * Also sends an admin email alert via FormSubmit.
 *
 * Body: { firstName, lastName, email }
 *
 * Env vars required:
 *   GHL_API_KEY      — pit-... (GoHighLevel Private Integration Token)
 *   GHL_LOCATION_ID  — GHL Location ID
 */

export const maxDuration = 10;

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

  const { firstName, lastName, email } = req.body || {};

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const fullName  = [firstName, lastName].filter(Boolean).join(' ').trim() || email;
  const results   = { ghl: null, email: null };

  // ── 1. Upsert GHL contact ─────────────────────────────────────────────────
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (apiKey && locationId) {
    try {
      const nameParts = fullName.split(/\s+/);
      const r = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
        method:  'PUT',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Version':       '2021-07-28',
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          locationId,
          email,
          firstName: nameParts[0]  || '',
          lastName:  nameParts.slice(1).join(' ') || '',
          tags:      ['free', 'signup'],
          source:    '1stStep.ai — Free Signup',
        }),
      });
      const data = await r.json();
      if (data.contact?.id) {
        console.log(`✅ GHL contact captured: ${data.contact.id} (${email})`);
        results.ghl = 'ok';
      } else {
        console.error('GHL signup upsert failed:', JSON.stringify(data));
        results.ghl = 'error';
      }
    } catch (err) {
      console.error('GHL signup upsert error:', err.message);
      results.ghl = 'error';
    }
  } else {
    console.log('GHL env vars not set — skipping CRM capture');
    results.ghl = 'skipped';
  }

  // ── 2. Admin email via FormSubmit ─────────────────────────────────────────
  try {
    const body = new URLSearchParams();
    body.set('name',      fullName);
    body.set('email',     email);
    body.set('message',   `New 1stStep.ai signup\n\nName: ${fullName}\nEmail: ${email}\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
    body.set('_subject',  `🆕 New signup: ${fullName}`);
    body.set('_captcha',  'false');
    body.set('_template', 'box');
    body.set('_replyto',  email); // reply goes to the user, not noreply

    await fetch('https://formsubmit.co/evan@1ststep.ai', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });
    results.email = 'sent';
  } catch (err) {
    console.error('Admin email send failed:', err.message);
    results.email = 'error';
  }

  return res.status(200).json({ ok: true, results });
}
