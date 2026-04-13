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

  // ── 2. Admin email via Resend ─────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const time = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      const r = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:     'onboarding@resend.dev',
          to:       'evan@1ststep.ai',
          reply_to: email,
          subject:  `🆕 New signup: ${fullName}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
              <h2 style="margin:0 0 16px;color:#0F172A">New 1stStep.ai Signup</h2>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Name</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#0F172A">${fullName}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Email</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#0F172A"><a href="mailto:${email}" style="color:#4338CA">${email}</a></td></tr>
                <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Time</td><td style="padding:8px 0;font-size:14px;color:#0F172A">${time}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Plan</td><td style="padding:8px 0;font-size:14px;color:#0F172A">Free</td></tr>
              </table>
              <div style="margin-top:20px;padding:12px 16px;background:#EEF2FF;border-radius:8px;font-size:13px;color:#4338CA">
                Hit reply to reach ${firstName || 'them'} directly.
              </div>
            </div>`,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        console.log(`✅ Admin email sent via Resend: ${data.id}`);
        results.email = 'sent';
      } else {
        console.error('Resend error:', JSON.stringify(data));
        results.email = 'error';
      }
    } catch (err) {
      console.error('Resend send failed:', err.message);
      results.email = 'error';
    }
  } else {
    console.log('RESEND_API_KEY not set — skipping email');
    results.email = 'skipped';
  }

  return res.status(200).json({ ok: true, results });
}
