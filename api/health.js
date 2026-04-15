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

export const maxDuration = 30;

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
  // Count only 1stStep.ai app users — tagged 'signup' at registration
  return countByTag('signup');
}

async function getRecentContacts(limit = 15) {
  try {
    const url = `${GHL_BASE}/contacts/?locationId=${encodeURIComponent(process.env.GHL_LOCATION_ID)}&limit=${limit}&sortBy=dateAdded&sortOrder=desc`;
    const r = await fetch(url, { headers: ghlHeaders() });
    if (!r.ok) return [];
    const d = await r.json();
    const contacts = (d.contacts || []).map(c => ({
      id: c.id,
      name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Unknown',
      email: c.email || '',
      tags: c.tags || [],
      dateAdded: c.dateAdded || c.createdAt || null,
    }));
    // Ensure newest first in case API ignores sort param
    return contacts.sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0));
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
    const [totalR, betaR, activeR, powerR, essentialR, completeR, recentR, stripeR] =
      await Promise.allSettled([
        countTotal(),
        countByTag('beta'),
        countByTag('active_user'),
        countByTag('power_user'),
        countByTag('converted_essential'),
        countByTag('converted_complete'),
        getRecentContacts(15),
        getStripePaidCount(),
      ]);
    const v = (r, fb) => r.status === 'fulfilled' ? (r.value ?? fb) : fb;
    return res.status(200).json({
      funnel: {
        total:       v(totalR,     null),
        beta:        v(betaR,      null),
        activeUsers: v(activeR,    null),
        powerUsers:  v(powerR,     null),
        paid:        v(stripeR,    0),
        essential:   v(essentialR, null),
        complete:    v(completeR,  null),
      },
      recent:    v(recentR, []),
      updatedAt: new Date().toISOString(),
    });
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
  try {
    const r = await fetch(`https://services.leadconnectorhq.com/locations/${process.env.GHL_LOCATION_ID}`, {
      headers: {
        'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
        'Version': '2021-07-28',
      },
    });
    if (r.ok) {
      check('GHL CRM API', 'OK', 'API key valid and location reachable');
    } else if (r.status === 401 || r.status === 403) {
      check('GHL CRM API', 'FAIL', `API key rejected (${r.status}) — check GHL_API_KEY in Vercel`);
    } else {
      check('GHL CRM API', 'WARN', `Status ${r.status} — may be temporary`);
    }
  } catch (err) {
    check('GHL CRM API', 'WARN', `Network error: ${err.message}`);
  }

  // ── 5. Resend API connectivity ───────────────────────────────────────────────
  try {
    const r = await fetch('https://api.resend.com/domains', {
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (r.ok) {
      const data = await r.json();
      const domains = data.data || [];
      const verified = domains.find(d => d.name === '1ststep.ai' && d.status === 'verified');
      const pending  = domains.find(d => d.name === '1ststep.ai' && d.status !== 'verified');
      if (verified) {
        check('Resend Email', 'OK', '1ststep.ai domain verified — emails send from notifications@1ststep.ai');
      } else if (pending) {
        check('Resend Email', 'WARN', '1ststep.ai domain not fully verified (SPF pending) — check resend.com/domains.');
      } else {
        check('Resend Email', 'OK', 'API key valid (domain check inconclusive)');
      }
    } else {
      check('Resend Email', 'FAIL', `API key rejected (${r.status}) — check RESEND_API_KEY in Vercel`);
    }
  } catch (err) {
    check('Resend Email', 'WARN', `Network error: ${err.message}`);
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
