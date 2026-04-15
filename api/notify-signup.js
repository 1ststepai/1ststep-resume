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

// ── HTML escape helper (EMAIL-01: prevents XSS in admin email) ───────────────
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Per-IP rate limiter — prevents CRM spam and inbox flooding ───────────────
// Limit: 5 signup notifications per IP per hour.
const signupWindows = new Map(); // ip → [timestamp, ...]
const SIGNUP_WINDOW_MS  = 60 * 60 * 1000; // 1 hour
const SIGNUP_MAX_PER_IP = 5;

function isSignupRateLimited(ip) {
  const now  = Date.now();
  const hits = (signupWindows.get(ip) || []).filter(t => now - t < SIGNUP_WINDOW_MS);
  hits.push(now);
  signupWindows.set(ip, hits);
  if (signupWindows.size > 2000) {
    const oldest = [...signupWindows.keys()].slice(0, 200);
    oldest.forEach(k => signupWindows.delete(k));
  }
  return hits.length > SIGNUP_MAX_PER_IP;
}

// ── Disposable email domain blocklist ────────────────────────────────────────
// Prevents throwaway signups from polluting GHL CRM and admin inbox.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com','guerrillamail.com','guerrillamail.net','guerrillamail.org',
  'guerrillamail.biz','guerrillamail.de','guerrillamail.info','sharklasers.com',
  'guerrillamailblock.com','spam4.me','yopmail.com','yopmail.fr','cool.fr.nf',
  'jetable.fr.nf','nospam.ze.tc','nomail.xl.cx','mega.zik.dj','speed.1s.fr',
  'courriel.fr.nf','moncourrier.fr.nf','monemail.fr.nf','monmail.fr.nf',
  'trashmail.com','trashmail.me','trashmail.net','trashmail.at','trashmail.io',
  'trashmail.org','trashmail.xyz','dispostable.com','mailnull.com','spamgourmet.com',
  'tempr.email','discard.email','throwam.com','throwam.net','10minutemail.com',
  '10minutemail.net','10minutemail.org','10minemail.com','tempmail.com',
  'tempmail.net','temp-mail.org','temp-mail.io','mailtemp.org','maildrop.cc',
  'getairmail.com','fakeinbox.com','spambox.us','mailnesia.com','mailnull.com',
]);

function isDisposableEmail(email) {
  const domain = (email.split('@')[1] || '').toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
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

  // Rate limit — prevents CRM/inbox spam
  const ip = (req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',').pop().trim()
           || req.socket?.remoteAddress || 'unknown';
  if (isSignupRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { firstName, lastName, email } = req.body || {};

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  // Silently reject disposable email domains — don't tell the client why
  // so bots can't iterate around the blocklist.
  if (isDisposableEmail(email)) {
    console.log(`Disposable email blocked: ${email}`);
    return res.status(200).json({ ok: true, results: { ghl: 'skipped', email: 'skipped' } });
  }

  const fullName  = [firstName, lastName].filter(Boolean).join(' ').trim() || email;
  const results   = { ghl: null, email: null };

  // ── 1. Upsert GHL contact ─────────────────────────────────────────────────
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (apiKey && locationId) {
    const nameParts = fullName.split(/\s+/);
    const ghlBody = JSON.stringify({
      locationId,
      email,
      firstName: nameParts[0]  || '',
      lastName:  nameParts.slice(1).join(' ') || '',
      tags:      ['app_user', 'free', 'signup'],
      // source omitted — GHL rejects custom source strings with 400
    });
    const ghlHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Version':       '2021-07-28',
      'Content-Type':  'application/json',
    };

    // Try up to 2 times (1 retry on failure)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
          method: 'POST', headers: ghlHeaders, body: ghlBody,
        });
        const data = await r.json();
        if (data.contact?.id) {
          console.log(`✅ GHL contact captured (attempt ${attempt}): ${data.contact.id} (${email})`);
          results.ghl = 'ok';
          break;
        } else {
          console.error(`GHL upsert failed (attempt ${attempt}):`, JSON.stringify(data));
          results.ghl = 'error';
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }
      } catch (err) {
        console.error(`GHL upsert error (attempt ${attempt}):`, err.message);
        results.ghl = 'error';
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
      }
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
          from:     process.env.RESEND_FROM || 'onboarding@resend.dev',
          to:       'evan@1ststep.ai',
          reply_to: email,
          subject:  `🆕 New signup: ${fullName}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
              <h2 style="margin:0 0 16px;color:#0F172A">New 1stStep.ai Signup</h2>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Name</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#0F172A">${escHtml(fullName)}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Email</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#0F172A"><a href="mailto:${escHtml(email)}" style="color:#4338CA">${escHtml(email)}</a></td></tr>
                <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Time</td><td style="padding:8px 0;font-size:14px;color:#0F172A">${escHtml(time)}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Plan</td><td style="padding:8px 0;font-size:14px;color:#0F172A">Free</td></tr>
              </table>
              <div style="margin-top:20px;padding:12px 16px;background:#EEF2FF;border-radius:8px;font-size:13px;color:#4338CA">
                Hit reply to reach ${escHtml(firstName) || 'them'} directly.
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
