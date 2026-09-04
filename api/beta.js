/**
 * POST /api/beta
 *
 * Legacy private-access gate for 1stStep.ai.
 * Validates an access code and captures the user's email as a free app user.
 *
 * Body: { email, code }
 *
 * Returns: { valid: true, tier: 'free', expiresAt: <ms> }
 *      or: { valid: false, error: '...' }
 *
 * Env vars required:
 *   BETA_CODE        — the invite code (set in Vercel — share this with beta users)
 *   TIER_SECRET      — used to sign the tier token (already set)
 *   GHL_API_KEY      — optional — used to tag the beta contact in GHL
 *   GHL_LOCATION_ID  — optional
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { applyApiHeaders, hasJsonContentType, isOriginAllowed, requestIp, setAccessSessionCookie } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';

export const maxDuration = 15;

// Legacy access audit window. Access code signups now receive free accounts only.
const BETA_TTL_MS          = 15  * 24 * 60 * 60 * 1000;
const REVIEWER_TTL_MS      = 365 * 24 * 60 * 60 * 1000;
const REVIEWER_EMAIL       = '1ststep.reviewer@gmail.com';
const ACCESS_TOKEN_TTL_MS  = 20 * 60 * 1000;

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

function secretsEqual(input, expected) {
  const left = Buffer.from(String(input || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });

  const ip = requestIp(req);

  const durableLimit = await enforceDurableRateLimit(req, {
    scope: 'beta-access', ip,
    ipRule: { limit: 10, window: '1 h' },
    globalRule: { limit: 5_000, window: '1 d' },
  });
  if (!durableLimit.ok) return sendRateLimitResult(res, durableLimit, 'Too many access attempts. Please try again later.');

  if (isBetaRateLimited(ip)) {
    return res.status(429).json({ valid: false, error: 'Too many attempts — try again later.' });
  }

  const { email = '', code = '', firstName = '', lastName = '' } = req.body || {};

  // Validate email
  const cleanEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@<>|]{1,128}@[^\s@<>|]{1,190}$/.test(cleanEmail)) {
    return res.status(400).json({ valid: false, error: 'Please enter a valid email address.' });
  }
  if (![firstName, lastName].every(value => String(value).length <= 80 && !/[<>\u0000-\u001F]/.test(String(value)))) {
    return res.status(400).json({ valid: false, error: 'Name is invalid.' });
  }

  // Validate beta code
  const betaCode = (process.env.BETA_CODE || '').trim();
  if (!betaCode) {
    if (process.env.VERCEL_ENV === 'production') return res.status(503).json({ valid: false, error: 'Private access is not configured.' });
    // If BETA_CODE is not set in Vercel, beta gate is disabled — let everyone in
    console.warn('BETA_CODE env var not set — beta gate is open to all');
  } else if (!secretsEqual(String(code).trim(), betaCode)) {
    // Deliberate delay to slow brute-forcing (even with rate limiter)
    await new Promise(r => setTimeout(r, 500));
    return res.status(200).json({ valid: false, error: 'Invalid invite code — check your invite and try again.' });
  }

  // Keep an expiry for old UI compatibility, but do not issue paid entitlement.
  const ttl        = cleanEmail === REVIEWER_EMAIL ? REVIEWER_TTL_MS : BETA_TTL_MS;
  const expiresAt  = Date.now() + ttl;
  if (String(process.env.TIER_SECRET || '').length < 32) return res.status(503).json({ valid: false, error: 'Secure access is not configured.' });
  const tierToken  = signTierToken(cleanEmail, 'free', ACCESS_TOKEN_TTL_MS);
  setAccessSessionCookie(res, tierToken, { maxAgeSeconds: ACCESS_TOKEN_TTL_MS / 1000 });

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
      tags:   ['app_user', 'free', 'legacy_access'],
      // 'source' omitted — GHL rejects custom source strings with 400
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
          method: 'POST', headers: ghlUpsertHeaders, body: JSON.stringify(ghlPayload),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          // Log full body so we can see exactly what GHL rejected
          console.error(JSON.stringify({ type: 'ghl-beta-upsert-failed', status: r.status, attempt }));
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        contactId = data?.contact?.id || data?.id || null;
        if (contactId) {
          console.log(`GHL private-access contact captured on attempt ${attempt}.`);
          break;
        } else {
          console.error(`GHL private-access capture returned no contact ID on attempt ${attempt}.`);
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }
      } catch (err) {
        console.error(JSON.stringify({ type: 'ghl-beta-contact-error', attempt, name: err?.name || 'unknown' }));
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
            name:   `${fullName} - Legacy Access Signup`,
            status: 'open',
            source: '1stStep.ai Legacy Access',
          }),
        });
        if (!oppRes.ok) throw new Error(`GHL opportunity create failed: ${oppRes.status}`);
        console.log('GHL private-access opportunity created.');
      } catch (err) {
        console.error(JSON.stringify({ type: 'ghl-beta-opportunity-error', name: err?.name || 'unknown' }));
      }
    }
  }

  console.log('Private-access signup created a free account.');

  // ── Notify Evan via Resend (FIRST — before GHL so timeout can't block it) ──
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const time    = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      const expires = new Date(expiresAt).toLocaleString('en-US', { timeZone: 'America/New_York' });
      const resendRes = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:    process.env.RESEND_FROM || 'onboarding@resend.dev',
          to:      ['evan@1ststep.ai'],
          reply_to: cleanEmail,
          subject: `New legacy access signup moved to free: ${firstName ? firstName + ' ' + lastName : cleanEmail}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
              <h2 style="margin:0 0 16px;color:#0F172A">Legacy Access Signup</h2>
              <table style="width:100%;border-collapse:collapse">
                ${firstName ? `<tr><td style="padding:8px 0;color:#64748B;font-size:14px;width:80px">Name</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#0F172A">${firstName} ${lastName}</td></tr>` : ''}
                <tr><td style="padding:8px 0;color:#64748B;font-size:14px;width:80px">Email</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#0F172A"><a href="mailto:${cleanEmail}" style="color:#4338CA">${cleanEmail}</a></td></tr>
                <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Joined</td><td style="padding:8px 0;font-size:14px;color:#0F172A">${time}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Expires</td><td style="padding:8px 0;font-size:14px;color:#0F172A">${expires}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B;font-size:14px">Plan</td><td style="padding:8px 0;font-size:14px;color:#0F172A">Free Account</td></tr>
              </table>
              <div style="margin-top:20px;padding:12px 16px;background:#EEF2FF;border-radius:8px;font-size:13px;color:#4338CA">
                Hit reply to reach ${firstName || 'them'} directly.
              </div>
            </div>`,
        }),
      });
      const resendBody = await resendRes.json().catch(() => ({}));
      if (resendRes.ok) {
        console.log('Private-access notification email sent.');
      } else {
        console.error('Private-access notification email failed:', resendRes.status);
      }
    } catch (err) {
      console.error(JSON.stringify({ type: 'beta-email-error', name: err?.name || 'unknown' }));
    }
  } else {
    console.warn('RESEND_API_KEY not set — skipping beta notification email');
  }

  return res.status(200).json({
    valid:      true,
    tier:       'free',
    status:     'legacy_access_free',
    tierToken,
    expiresAt,
    message:    'Your free 1stStep.ai account is ready.',
  });
}
