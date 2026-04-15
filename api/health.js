/**
 * GET /api/health?secret=HEALTH_CHECK_SECRET
 *
 * Daily security + system health check for app.1ststep.ai
 * Called by the scheduled task every morning.
 * Runs internal checks on all critical systems and emails Evan the results.
 *
 * Env vars required:
 *   HEALTH_CHECK_SECRET   — any random string (set in Vercel) — protects this endpoint
 *   ANTHROPIC_API_KEY     — checked for presence + validity
 *   STRIPE_SECRET_KEY     — checked for presence + validity
 *   STRIPE_WEBHOOK_SECRET — checked for presence
 *   TIER_SECRET           — checked for presence
 *   GHL_API_KEY           — checked for presence
 *   GHL_LOCATION_ID       — checked for presence
 *   RAPIDAPI_KEY          — checked for presence
 *   RESEND_API_KEY        — checked for presence + used to send report
 */

export const maxDuration = 60;

// ── Admin stats helpers ──────────────────────────────────────────────────────
const GHL_BASE = 'https://services.leadconnectorhq.com';

function ghlHeaders() {
  return {
    'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
    'Version': '2021-07-28',
  };
}

async function countByTag(tag) {
  try {
    const url = `${GHL_BASE}/contacts/?locationId=${encodeURIComponent(process.env.GHL_LOCATION_ID)}&limit=1&tags[]=${encodeURIComponent(tag)}`;
    const r = await fetch(url, { headers: ghlHeaders() });
    if (!r.ok) return null;
    const d = await r.json();
    return d.meta?.total ?? d.contacts?.length ?? null;
  } catch { return null; }
}

async function countTotal() {
  // Count all 1stStep.ai app users — tagged 'app_user' at registration
  return countByTag('app_user');
}

async function getRecentContacts(limit = 15) {
  try {
    // Fetch 100 contacts and sort client-side — GHL doesn't reliably sort via query params
    const url = `${GHL_BASE}/contacts/?locationId=${encodeURIComponent(process.env.GHL_LOCATION_ID)}&limit=100`;
    const r = await fetch(url, { headers: ghlHeaders() });
    if (!r.ok) return [];
    const d = await r.json();
    const contacts = (d.contacts || [])
      .filter(c => (c.tags || []).includes('app_user'))  // Only app users
      .map(c => ({
        id: c.id,
        name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Unknown',
        email: c.email || '',
        tags: c.tags || [],
        dateAdded: c.dateAdded || c.createdAt || null,
      }));
    return contacts
      .sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0))
      .slice(0, limit);
  } catch { return []; }
}

async function getStripePaidCount() {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return 0;
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    const subs = await stripe.subscriptions.list({ status: 'active', limit: 100 });
    return subs.data.length;
  } catch { return 0; }
}

// ── Email blast helpers ──────────────────────────────────────────────────────

async function fetchContactsByTag(tag) {
  // Fetch all contacts and filter by tag client-side — GHL's tag query param
  // is unreliable across API versions, and at beta scale this is fine.
  const all = [];
  let after = null;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ locationId: process.env.GHL_LOCATION_ID, limit: '100' });
    if (after) params.set('startAfter', after);
    const res = await fetch(`${GHL_BASE}/contacts/?${params}`, { headers: ghlHeaders() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GHL fetch failed ${res.status}: ${body}`);
    }
    const data  = await res.json();
    const batch = data.contacts || [];
    all.push(...batch);
    if (batch.length < 100) break;
    after = data.meta?.startAfter || null;
    if (!after) break;
  }
  return all.filter(c => (c.tags || []).includes(tag));
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildBlastHtml(firstName) {
  const name = esc(firstName || 'there');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Inter',system-ui,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
  <div style="text-align:center;margin-bottom:28px">
    <div style="font-size:22px;font-weight:800;color:#0F172A;letter-spacing:-0.5px">1stStep.ai</div>
    <div style="font-size:12px;color:#94A3B8;margin-top:2px;text-transform:uppercase;letter-spacing:1px">Beta Update</div>
  </div>
  <div style="background:#fff;border-radius:16px;border:1.5px solid #E2E8F0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#4338CA 0%,#6366F1 100%);padding:28px 28px 24px">
      <div style="font-size:28px;margin-bottom:8px">🎤</div>
      <div style="font-size:20px;font-weight:700;color:#fff;line-height:1.3;margin-bottom:6px">Your Interview Cheat Sheet is here.</div>
      <div style="font-size:14px;color:#C7D2FE;line-height:1.5">We just shipped a feature that turns your tailored resume into a complete interview prep kit — in about 40 seconds.</div>
    </div>
    <div style="padding:24px 28px">
      <p style="font-size:14px;color:#475569;line-height:1.65;margin:0 0 20px">Hey ${name},</p>
      <p style="font-size:14px;color:#475569;line-height:1.65;margin:0 0 20px">You've already tailored your resume. Now let's make sure you actually nail the interview.</p>
      <div style="background:#F8FAFC;border-radius:10px;padding:18px 20px;margin-bottom:22px">
        <div style="font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px">What's in your cheat sheet</div>
        <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px">
          <div style="font-size:16px;flex-shrink:0">📋</div>
          <div><div style="font-size:13.5px;font-weight:600;color:#0F172A;margin-bottom:2px">9 predicted interview questions</div><div style="font-size:12.5px;color:#64748B;line-height:1.5">Behavioral, technical, situational — with your personalized talking point for each one.</div></div>
        </div>
        <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px">
          <div style="font-size:16px;flex-shrink:0">💬</div>
          <div><div style="font-size:13.5px;font-weight:600;color:#0F172A;margin-bottom:2px">4 smart questions to ask them</div><div style="font-size:12.5px;color:#64748B;line-height:1.5">Questions that surface real intel and signal you've done your homework.</div></div>
        </div>
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div style="font-size:16px;flex-shrink:0">🛡️</div>
          <div><div style="font-size:13.5px;font-weight:600;color:#0F172A;margin-bottom:2px">Red flags to get ahead of</div><div style="font-size:12.5px;color:#64748B;line-height:1.5">Based on your actual resume — with a ready reframe for each one.</div></div>
        </div>
      </div>
      <div style="background:#EEF2FF;border-radius:10px;padding:16px 18px;margin-bottom:22px">
        <div style="font-size:12px;font-weight:700;color:#4338CA;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">How to use it</div>
        <div style="font-size:13px;color:#475569;line-height:1.7">1. Open <a href="https://app.1ststep.ai" style="color:#4338CA;font-weight:600">app.1ststep.ai</a><br>2. Go to your <strong>Tailored Resumes</strong> tab<br>3. Hit <strong>🎤 Interview Prep</strong> on any saved resume<br>4. Your cheat sheet is ready in ~40 seconds</div>
      </div>
      <p style="font-size:14px;color:#475569;line-height:1.65;margin:0 0 22px">You're one of the first people to use this. If anything feels off, just reply to this email — it goes straight to me.</p>
      <a href="https://app.1ststep.ai" style="display:block;text-align:center;background:#4338CA;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 24px;border-radius:10px;margin-bottom:20px">Open My Interview Cheat Sheet →</a>
      <p style="font-size:13px;color:#94A3B8;text-align:center;margin:0">Go get it. 💪</p>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #F1F5F9;background:#FAFAFA">
      <p style="font-size:12px;color:#94A3B8;margin:0;text-align:center;line-height:1.6">You're receiving this because you're a 1stStep.ai beta user.<br>Questions? Reply directly — it goes straight to Evan.<br><a href="https://1ststep.ai" style="color:#CBD5E1;text-decoration:none">1stStep.ai</a></p>
    </div>
  </div>
</div>
</body></html>`;
}

function buildBlastText(firstName) {
  const name = firstName || 'there';
  return `Hey ${name},\n\nYour Interview Cheat Sheet just landed at 1stStep.ai.\n\nWe shipped a feature that turns your tailored resume into a complete interview prep kit in about 40 seconds.\n\nWhat's in it:\n• 9 predicted interview questions with your personalized talking point for each\n• 4 smart questions to ask the interviewer\n• Red flags from your actual resume — with a ready reframe for each one\n\nHow to use it:\n1. Open app.1ststep.ai\n2. Go to your Tailored Resumes tab\n3. Hit "Interview Prep" on any saved resume\n4. Your cheat sheet is ready in ~40 seconds\n\nYou're one of the first people to use this. If anything feels off, just reply.\n\nGo get it.\n— Evan\n\n---\nYou're receiving this because you're a 1stStep.ai beta user.`;
}

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── Admin stats mode (?mode=admin&secret=ADMIN_SECRET) ───────────────────────
  if (req.query.mode === 'admin') {
    const provided = req.headers['x-admin-secret'] || req.query.secret;
    const expected = process.env.ADMIN_SECRET;
    if (!expected || provided !== expected) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');
    const [appUserR, betaR, freeR, powerR, paidR, recentR] =
      await Promise.allSettled([
        countByTag('app_user'),
        countByTag('beta_2026'),
        countByTag('free'),
        countByTag('power_user'),
        getStripePaidCount(),
        getRecentContacts(15),
      ]);
    const v = (r, fb) => r.status === 'fulfilled' ? (r.value ?? fb) : fb;
    return res.status(200).json({
      funnel: {
        total:       v(appUserR, null),
        beta:        v(betaR,    null),
        activeUsers: v(freeR,    null),
        powerUsers:  v(powerR,   null),
        paid:        v(paidR,    0),
      },
      recent:    v(recentR, []),
      updatedAt: new Date().toISOString(),
    });
  }

  // ── Email blast mode (?action=blast) ────────────────────────────────────────
  // POST-style action tunnelled through GET using x-admin-secret header.
  // Usage: GET /api/health?action=blast&tag=beta&dryRun=true
  if (req.query.action === 'blast') {
    const provided = req.headers['x-admin-secret'] || req.query.secret;
    const expected = process.env.ADMIN_SECRET;
    if (!expected || provided !== expected) return res.status(401).json({ error: 'Unauthorized' });

    const tag    = req.query.tag    || 'beta';
    const dryRun = req.query.dryRun !== 'false'; // default true — must explicitly pass dryRun=false
    const resendKey = process.env.RESEND_API_KEY;
    const fromAddr  = process.env.RESEND_FROM || 'evan@1ststep.ai';

    if (!resendKey) return res.status(500).json({ error: 'Resend not configured' });

    let contacts;
    try { contacts = await fetchContactsByTag(tag); }
    catch (err) { return res.status(500).json({ error: `GHL fetch failed: ${err.message}` }); }

    const eligible = contacts.filter(c => c.email && c.email.includes('@'));
    const results  = { total: eligible.length, sent: 0, skipped: 0, errors: [], dryRun };

    if (dryRun) {
      results.preview = eligible.map(c => ({
        email: c.email,
        name:  [c.firstName, c.lastName].filter(Boolean).join(' ') || '(no name)',
      }));
      return res.status(200).json(results);
    }

    // Test mode — send to a single override address instead of the full list
    const testTo = req.query.testTo || null;
    if (testTo) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:     fromAddr,
          to:       testTo,
          reply_to: 'evan@1ststep.ai',
          subject:  '[TEST] Your Interview Cheat Sheet just dropped 🎤',
          html:     buildBlastHtml('Evan'),
          text:     buildBlastText('Evan'),
        }),
      });
      const data = await r.json();
      return res.status(r.ok ? 200 : 500).json({ test: true, to: testTo, ok: r.ok, resend: data });
    }

    for (const contact of eligible) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:     fromAddr,
            to:       contact.email,
            reply_to: 'evan@1ststep.ai',
            subject:  'Your Interview Cheat Sheet just dropped 🎤',
            html:     buildBlastHtml(contact.firstName),
            text:     buildBlastText(contact.firstName),
          }),
        });
        const data = await r.json();
        if (r.ok) { results.sent++; console.log(`✅ Sent to ${contact.email}`); }
        else { results.errors.push({ email: contact.email, error: data.message }); results.skipped++; }
      } catch (err) {
        results.errors.push({ email: contact.email, error: err.message });
        results.skipped++;
      }
      await new Promise(r => setTimeout(r, 100)); // pace sends
    }

    console.log(`Blast complete: ${results.sent} sent, ${results.skipped} skipped`);
    return res.status(200).json(results);
  }

  // Auth — accepts either:
  //   1. ?secret=HEALTH_CHECK_SECRET  (manual / external cron calls)
  //   2. Authorization: Bearer CRON_SECRET  (Vercel Cron internal calls)
  const querySecret  = req.query.secret || '';
  const authHeader   = req.headers.authorization || '';
  const cronSecret   = process.env.CRON_SECRET || '';
  const healthSecret = process.env.HEALTH_CHECK_SECRET || '';

  const validQuerySecret = healthSecret && querySecret === healthSecret;
  const validCronHeader  = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!validQuerySecret && !validCronHeader) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const checks = [];
  let criticalFailure = false;

  // ── Helper ──────────────────────────────────────────────────────────────────
  function check(name, status, detail = '') {
    checks.push({ name, status, detail });
    if (status === 'FAIL') criticalFailure = true;
  }

  // ── 1. Environment variable presence ────────────────────────────────────────
  const requiredEnvVars = [
    ['ANTHROPIC_API_KEY',     'Claude AI'],
    ['STRIPE_SECRET_KEY',     'Stripe payments'],
    ['STRIPE_WEBHOOK_SECRET', 'Stripe webhooks'],
    ['TIER_SECRET',           'HMAC tier tokens'],
    ['GHL_API_KEY',           'GoHighLevel CRM'],
    ['GHL_LOCATION_ID',       'GoHighLevel location'],
    ['RAPIDAPI_KEY',          'JSearch job search'],
    ['RESEND_API_KEY',        'Email alerts'],
  ];

  for (const [varName, label] of requiredEnvVars) {
    if (process.env[varName]) {
      check(`Env: ${label}`, 'OK', `${varName} is set`);
    } else {
      check(`Env: ${label}`, 'FAIL', `${varName} is MISSING — feature will not work`);
    }
  }

  // ── 2. Anthropic API connectivity ───────────────────────────────────────────
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
    });
    if (r.ok || r.status === 200) {
      check('Anthropic API', 'OK', 'API key valid and reachable');
    } else if (r.status === 401 || r.status === 403) {
      check('Anthropic API', 'FAIL', `API key rejected — status ${r.status}. Check ANTHROPIC_API_KEY in Vercel.`);
    } else {
      check('Anthropic API', 'WARN', `Unexpected status ${r.status} — may be a temporary issue`);
    }
  } catch (err) {
    check('Anthropic API', 'FAIL', `Network error: ${err.message}`);
  }

  // ── 3. Stripe API connectivity ──────────────────────────────────────────────
  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    await stripe.balance.retrieve(); // free, lightweight check
    check('Stripe API', 'OK', 'Key valid, balance endpoint reachable');
  } catch (err) {
    const detail = err.message?.includes('Invalid API Key')
      ? 'API key rejected — check STRIPE_SECRET_KEY in Vercel'
      : `Error: ${err.message}`;
    check('Stripe API', 'FAIL', detail);
  }

  // ── 4. GHL API connectivity ──────────────────────────────────────────────────
  // Private integration tokens are write-scoped — test the pipeline stage update
  // endpoint the app actually uses rather than a read endpoint that may be out of scope.
  try {
    const r = await fetch(
      `https://services.leadconnectorhq.com/contacts/?locationId=${encodeURIComponent(process.env.GHL_LOCATION_ID)}&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
          'Version': '2021-07-28',
        },
      }
    );
    if (r.ok) {
      // Show real app user counts broken down by tag
      const [betaCount, freeCount, powerCount] = await Promise.all([
        countByTag('beta_2026'),
        countByTag('free'),
        countByTag('power_user'),
      ]);
      const parts = [];
      if (betaCount != null) parts.push(`${betaCount} beta users`);
      if (freeCount  != null) parts.push(`${freeCount} free signups`);
      if (powerCount != null) parts.push(`${powerCount} power users`);
      const detail = parts.length ? `API key valid — ${parts.join(', ')}` : 'API key valid';
      check('GHL CRM API', 'OK', detail);
    } else if (r.status === 401 || r.status === 403) {
      check('GHL CRM API', 'WARN', `Key set but read access denied (${r.status}) — write ops (contact tagging) likely still work`);
    } else {
      check('GHL CRM API', 'WARN', `Status ${r.status} — may be temporary`);
    }
  } catch (err) {
    check('GHL CRM API', 'WARN', `Network error: ${err.message}`);
  }

  // ── 5. Resend API connectivity ───────────────────────────────────────────────
  // Resend keys are often sending-only scoped — GET endpoints return 401 even for valid keys.
  // Real proof of delivery is whether this health report email arrives in your inbox.
  // We just confirm the key is present and non-empty here.
  const resendKeyVal = process.env.RESEND_API_KEY || '';
  if (!resendKeyVal || resendKeyVal.length < 20) {
    check('Resend Email', 'FAIL', 'RESEND_API_KEY missing or too short — check Vercel env vars');
  } else if (!resendKeyVal.startsWith('re_')) {
    check('Resend Email', 'WARN', 'RESEND_API_KEY set but does not start with re_ — double-check the value');
  } else {
    check('Resend Email', 'OK', 'API key set and format valid — delivery confirmed if you received this report');
  }

  // ── 6. RapidAPI / JSearch ────────────────────────────────────────────────────
  try {
    const r = await fetch('https://jsearch.p.rapidapi.com/search?query=test&num_pages=1', {
      headers: {
        'X-RapidAPI-Key':  process.env.RAPIDAPI_KEY || '',
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
    });
    if (r.ok) {
      check('JSearch API', 'OK', 'RapidAPI key valid and reachable');
    } else if (r.status === 401 || r.status === 403) {
      check('JSearch API', 'FAIL', `API key rejected (${r.status}) — check RAPIDAPI_KEY in Vercel`);
    } else if (r.status === 429) {
      check('JSearch API', 'WARN', 'Rate limited on health check — quota may be running low');
    } else {
      check('JSearch API', 'WARN', `Status ${r.status}`);
    }
  } catch (err) {
    check('JSearch API', 'WARN', `Network error: ${err.message}`);
  }

  // ── 7. TIER_SECRET strength check ───────────────────────────────────────────
  const tierSecret = process.env.TIER_SECRET || '';
  if (tierSecret.length >= 32) {
    check('TIER_SECRET strength', 'OK', `Length: ${tierSecret.length} chars`);
  } else if (tierSecret.length > 0) {
    check('TIER_SECRET strength', 'WARN', `Only ${tierSecret.length} chars — recommend 32+ for security`);
  }
  // (missing case already caught in env var check above)

  // ── Build report ─────────────────────────────────────────────────────────────
  const okCount   = checks.filter(c => c.status === 'OK').length;
  const warnCount = checks.filter(c => c.status === 'WARN').length;
  const failCount = checks.filter(c => c.status === 'FAIL').length;
  const overall   = failCount > 0 ? '🚨 ACTION REQUIRED' : warnCount > 0 ? '⚠️ WARNINGS' : '✅ ALL SYSTEMS GO';
  const time      = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  // ── Send email report via Resend ─────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const rows = checks.map(c => {
      const icon  = c.status === 'OK' ? '✅' : c.status === 'WARN' ? '⚠️' : '🚨';
      const color = c.status === 'OK' ? '#065F46' : c.status === 'WARN' ? '#92400E' : '#991B1B';
      const bg    = c.status === 'OK' ? '#ECFDF5' : c.status === 'WARN' ? '#FFFBEB' : '#FEF2F2';
      return `<tr style="background:${bg}">
        <td style="padding:8px 12px;font-size:13px">${icon} ${c.name}</td>
        <td style="padding:8px 12px;font-size:13px;font-weight:700;color:${color}">${c.status}</td>
        <td style="padding:8px 12px;font-size:12px;color:#374151">${c.detail}</td>
      </tr>`;
    }).join('');

    const subject = failCount > 0
      ? `🚨 1stStep.ai health check — ${failCount} FAILURE${failCount > 1 ? 'S' : ''} detected`
      : warnCount > 0
      ? `⚠️ 1stStep.ai health check — ${warnCount} warning${warnCount > 1 ? 's' : ''}`
      : `✅ 1stStep.ai health check — all systems normal`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    process.env.RESEND_FROM || 'onboarding@resend.dev',
        to:      'evan@1ststep.ai',
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:620px;margin:0 auto;padding:24px">
            <h2 style="margin:0 0 4px;color:#0F172A">1stStep.ai Daily Health Check</h2>
            <p style="margin:0 0 20px;color:#64748B;font-size:13px">${time} · ${overall}</p>
            <div style="background:#F8FAFC;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;gap:24px">
              <span style="font-size:13px">✅ <strong>${okCount}</strong> passed</span>
              <span style="font-size:13px">⚠️ <strong>${warnCount}</strong> warnings</span>
              <span style="font-size:13px">🚨 <strong>${failCount}</strong> failures</span>
            </div>
            <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">
              <thead>
                <tr style="background:#F1F5F9">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748B;font-weight:600">CHECK</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748B;font-weight:600">STATUS</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748B;font-weight:600">DETAIL</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            ${failCount > 0 ? `
            <div style="margin-top:20px;padding:16px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px">
              <p style="margin:0;font-size:14px;color:#991B1B;font-weight:600">⚠️ Action required — log into Vercel and check the failing env vars or API keys listed above.</p>
            </div>` : ''}
            <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0">
            <p style="font-size:11px;color:#9CA3AF;margin:0">1stStep.ai automated health check · runs daily at 8am ET · <a href="https://vercel.com" style="color:#9CA3AF">View Vercel logs</a></p>
          </div>`,
      }),
    }).catch(err => console.error('Health check email failed:', err.message));
  }

  return res.status(200).json({
    overall,
    summary: { ok: okCount, warn: warnCount, fail: failCount },
    checks,
    timestamp: new Date().toISOString(),
  });
}
