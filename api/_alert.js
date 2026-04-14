/**
 * Shared admin alert helper — used by claude.js, jobs.js, stripe-webhook.js
 *
 * Sends a debounced email via Resend when an abuse event is detected.
 * Debounce: one alert per (event + identifier) per 10 minutes — prevents
 * inbox flooding if a single attacker hammers the same endpoint repeatedly.
 *
 * Env vars required:
 *   RESEND_API_KEY — re_... (from resend.com)
 */

const alertDebounce = new Map(); // "event:identifier" → last alert timestamp
const DEBOUNCE_MS   = 10 * 60 * 1000; // 10 minutes

// Events that always alert (no debounce) — these are always worth knowing
const ALWAYS_ALERT = new Set([
  'webhook_sig_failure',   // someone forging Stripe webhooks
  'jsearch_auth_failure',  // RapidAPI key invalid or revoked
  'anthropic_auth_failure' // Anthropic API key invalid or revoked
]);

export async function alertOnAbuse(event, identifier = '', details = '') {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return; // silent if Resend not configured

  // Debounce — skip if we already alerted for this event+identifier recently
  if (!ALWAYS_ALERT.has(event)) {
    const key  = `${event}:${identifier}`;
    const last = alertDebounce.get(key) || 0;
    if (Date.now() - last < DEBOUNCE_MS) return;
    alertDebounce.set(key, Date.now());
    // Trim map to prevent unbounded growth
    if (alertDebounce.size > 1000) {
      [...alertDebounce.keys()].slice(0, 200).forEach(k => alertDebounce.delete(k));
    }
  }

  const LABELS = {
    rate_limited:          '⚡ Rate limit tripped',
    monthly_limit:         '📊 Monthly limit exhausted',
    model_restricted:      '🚫 Model restriction violation',
    tier_required:         '🔒 Premium bypass attempt',
    webhook_sig_failure:   '🚨 Stripe webhook forgery attempt',
    jsearch_auth_failure:  '🚨 JSearch API key failure',
    anthropic_auth_failure:'🚨 Anthropic API key failure',
    cors_rejected:         '🌐 CORS rejection spike',
    origin_missing:        '🌐 Missing origin header (bot probe)',
  };

  const label   = LABELS[event] || `⚠️ Security event: ${event}`;
  const safeId  = String(identifier).slice(0, 80).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeDet = String(details).slice(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const time    = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  try {
    await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'onboarding@resend.dev',
        to:      'evan@1ststep.ai',
        subject: `1stStep.ai alert: ${label}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <h2 style="margin:0 0 16px;color:#0F172A">${label}</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:6px 0;color:#64748B;width:110px">Event</td><td style="padding:6px 0;font-weight:600;color:#0F172A">${event}</td></tr>
              <tr><td style="padding:6px 0;color:#64748B">Identifier</td><td style="padding:6px 0;color:#0F172A">${safeId || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#64748B">Details</td><td style="padding:6px 0;color:#0F172A">${safeDet || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#64748B">Time (ET)</td><td style="padding:6px 0;color:#0F172A">${time}</td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0">
            <p style="font-size:12px;color:#9CA3AF">1stStep.ai automated security alert — debounced 10 min per source.</p>
          </div>`,
      }),
    });
  } catch (err) {
    // Never let alert failure crash the main request
    console.error('Alert send failed:', err.message);
  }
}
