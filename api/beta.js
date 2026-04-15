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

  const { email = '', code = '', firstName = '', lastName = '' } = req.body || {};

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
    const pipelineId   = process.env.GHL_PIPELINE_ID;
    const betaStageId  = process.env.GHL_STAGE_BETA_SIGNUP;

    // ── Upsert contact ──────────────────────────────────────────────────────
    const ghlPayload = {
      locationId,
      email:  cleanEmail,
      tags:   ['beta', 'complete', 'beta_2026'],
      source: '1stStep.ai — Beta Access',
    };
    if (firstName) ghlPayload.firstName = firstName.trim();
    if (lastName)  ghlPayload.lastName  = lastName.trim();

    // Retry upsert once on failure
    let contactId = null;
    const ghlUpsertHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Version':       '2021-07-28',
      'Content-Type':  'application/json',
    };
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
          method: 'PUT', headers: ghlUpsertHeaders, body: JSON.stringify(ghlPayload),
        });
        if (!r.ok) throw new Error(`GHL returned ${r.status}`);
        const data = await r.json();
        contactId = data?.contact?.id || data?.id || null;
        if (contactId) {
          console.log(`✅ GHL beta contact upserted (attempt ${attempt}): ${contactId} (${cleanEmail})`);
          break;
        } else {
          console.error(`GHL beta upsert failed (attempt ${attempt}):`, JSON.stringify(data));
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }
      } catch (err) {
        console.error(`GHL beta contact error (attempt ${attempt}):`, err.message);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
      }
    }

    // ── Add to pipeline if IDs are configured ──────────────────────────────
    if (contactId && pipelineId && betaStageId) {
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || cleanEmail;
      try {
        const oppRes = await fetch('https://services.leadconnectorhq.com/opportunities/', {
          method:  'POST',
          headers: ghlUpsertHeaders,
          body: JSON.stringify({
            locationId, pipelineId,
            pipelineStageId: betaStageId,
            contactId,
            name:   `${fullName} — Beta Signup`,
            status: 'open',
            source: '1stStep.ai Beta',
          }),
        });
        if (!oppRes.ok) throw new Error(`GHL opportunity create failed: ${oppRes.status}`);
        console.log(`✅ GHL pipeline opportunity created for ${cleanEmail}`);
      } catch (err) {
        console.error('GHL opportunity error:', err.message);
      }
    }
  }

  console.log(`✅ Beta access granted: ${cleanEmail} — expires ${new Date(expiresAt).toISOString()}`);

  // ── Notify Evan via Resend ───────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const time    = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const expires = new Date(expiresAt).toLocaleString('en-US', { timeZone: 'America/New_York' });
    const resendRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    process.env.RESEND_FROM || 'onboarding@resend.dev',
        to:      ['evan@1ststep.ai', cleanEmail],
        reply_to: cleanEmail,
        subject: `🧪 New beta user: ${firstName ? firstName + ' ' + lastName : cleanEmail}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="margin:0 0 16px;color:#0F172A">New Beta User 🧪</h2>
            <table style="width:100%;border-collapse:collapse">
              ${firstName ? `<tr><td style="padding:8px 0;color:#64748B;font-size:14px;width:80px">Name</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#0F172A">${firstName} ${lastName}</td></tr>` : ''}
              <tr><td style="padding:8px 0;color:#64748B;font-size:14px;width:80px">Email</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#0F172A"><a href="mailto:${cleanEmail}" style="color:#4338CA">${cleanEmail}</a></td></tr>
              <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Joined</td><td style="padding:8px 0;font-size:14px;color:#0F172A">${time}</td></tr>
              <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Expires</td><td style="padding:8px 0;font-size:14px;color:#0F172A">${expires}</td></tr>
              <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Plan</td><td style="padding:8px 0;font-size:14px;color:#0F172A">Complete (15-day beta)</td></tr>
            </table>
            <div style="margin-top:20px;padding:12px 16px;background:#EEF2FF;border-radius:8px;font-size:13px;color:#4338CA">
              Hit reply to reach them directly.
            </div>
          </div>`,
      }),
    }).catch(err => { console.error('Beta notification email failed:', err.message); return null; });
    if (resendRes) {
      const resendBody = await resendRes.json().catch(() => ({}));
      console.log('Resend beta email status:', resendRes.status, JSON.stringify(resendBody));
    }
  } else {
    console.warn('RESEND_API_KEY not set — skipping beta notification email');
  }

  return res.status(200).json({
    valid:      true,
    tier:       'complete',
    tierToken,
    expiresAt,
    message:    'Welcome to the 1stStep.ai beta! You have full Complete access for 15 days.',
  });
}
