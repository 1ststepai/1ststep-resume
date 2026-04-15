/**
 * POST /api/send-update-email
 *
 * One-time (or repeatable) product update blast to all beta users in GHL.
 * Fetches contacts by tag, sends a Resend email to each, and reports results.
 *
 * Usage:
 *   POST /api/send-update-email
 *   Headers: { "x-admin-secret": "<ADMIN_SECRET>" }
 *   Body:    { "tag": "beta", "dryRun": true }   ← set dryRun:false to actually send
 *
 * Env vars required:
 *   GHL_API_KEY       — GHL private integration key
 *   GHL_LOCATION_ID   — GHL location / subaccount ID
 *   RESEND_API_KEY    — Resend API key
 *   RESEND_FROM       — verified sending address (e.g. notifications@1ststep.ai)
 *   ADMIN_SECRET      — shared secret to prevent public access
 */

export const maxDuration = 60;

const GHL_BASE    = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

function ghlHeaders(apiKey) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       GHL_VERSION,
    'Content-Type':  'application/json',
  };
}

// Fetch all GHL contacts with a given tag (handles pagination, max 2000)
async function fetchContactsByTag(apiKey, locationId, tag) {
  const contacts = [];
  let after = null;

  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ locationId, tags: tag, limit: '100' });
    if (after) params.set('startAfter', after);

    const res = await fetch(`${GHL_BASE}/contacts/?${params}`, {
      headers: ghlHeaders(apiKey),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GHL contacts fetch failed ${res.status}: ${body}`);
    }

    const data  = await res.json();
    const batch = data.contacts || [];
    contacts.push(...batch);

    if (batch.length < 100) break;
    after = data.meta?.startAfter || null;
    if (!after) break;
  }

  return contacts;
}

// HTML escape helper
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Email Template ─────────────────────────────────────────────────────────────
// Edit this function to change the email content for each blast.
function buildEmailHtml(firstName) {
  const name = esc(firstName || 'there');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>New feature just dropped — Interview Cheat Sheet</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Inter',system-ui,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:28px">
    <div style="font-size:22px;font-weight:800;color:#0F172A;letter-spacing:-0.5px">1stStep.ai</div>
    <div style="font-size:12px;color:#94A3B8;margin-top:2px;text-transform:uppercase;letter-spacing:1px">Beta Update</div>
  </div>

  <!-- Card -->
  <div style="background:#fff;border-radius:16px;border:1.5px solid #E2E8F0;overflow:hidden">

    <!-- Hero strip -->
    <div style="background:linear-gradient(135deg,#4338CA 0%,#6366F1 100%);padding:28px 28px 24px">
      <div style="font-size:28px;margin-bottom:8px">🎤</div>
      <div style="font-size:20px;font-weight:700;color:#fff;line-height:1.3;margin-bottom:6px">
        Your Interview Cheat Sheet is here.
      </div>
      <div style="font-size:14px;color:#C7D2FE;line-height:1.5">
        We just shipped a feature that turns your tailored resume into a complete interview prep kit — in about 40 seconds.
      </div>
    </div>

    <!-- Body -->
    <div style="padding:24px 28px">

      <p style="font-size:14px;color:#475569;line-height:1.65;margin:0 0 20px">
        Hey ${name},
      </p>
      <p style="font-size:14px;color:#475569;line-height:1.65;margin:0 0 20px">
        You've already tailored your resume. Now let's make sure you actually nail the interview.
      </p>

      <!-- Feature bullets -->
      <div style="background:#F8FAFC;border-radius:10px;padding:18px 20px;margin-bottom:22px">
        <div style="font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px">What's in your cheat sheet</div>

        <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px">
          <div style="font-size:16px;flex-shrink:0">📋</div>
          <div>
            <div style="font-size:13.5px;font-weight:600;color:#0F172A;margin-bottom:2px">9 predicted interview questions</div>
            <div style="font-size:12.5px;color:#64748B;line-height:1.5">Behavioral, technical, situational — with your personalized talking point for each one.</div>
          </div>
        </div>

        <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px">
          <div style="font-size:16px;flex-shrink:0">💬</div>
          <div>
            <div style="font-size:13.5px;font-weight:600;color:#0F172A;margin-bottom:2px">4 smart questions to ask them</div>
            <div style="font-size:12.5px;color:#64748B;line-height:1.5">Questions that surface real intel and signal you've done your homework.</div>
          </div>
        </div>

        <div style="display:flex;gap:12px;align-items:flex-start">
          <div style="font-size:16px;flex-shrink:0">🛡️</div>
          <div>
            <div style="font-size:13.5px;font-weight:600;color:#0F172A;margin-bottom:2px">Red flags to get ahead of</div>
            <div style="font-size:12.5px;color:#64748B;line-height:1.5">Based on your actual resume — gaps, missing skills, anything they might probe — with a ready reframe for each.</div>
          </div>
        </div>
      </div>

      <!-- How to use it -->
      <div style="background:#EEF2FF;border-radius:10px;padding:16px 18px;margin-bottom:22px">
        <div style="font-size:12px;font-weight:700;color:#4338CA;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">How to use it</div>
        <div style="font-size:13px;color:#475569;line-height:1.7">
          1. Open <a href="https://app.1ststep.ai" style="color:#4338CA;font-weight:600">app.1ststep.ai</a><br>
          2. Go to your <strong>Tailored Resumes</strong> tab<br>
          3. Hit <strong>🎤 Interview Prep</strong> on any saved resume<br>
          4. Your cheat sheet is ready in ~40 seconds
        </div>
      </div>

      <p style="font-size:14px;color:#475569;line-height:1.65;margin:0 0 22px">
        You're one of the first people to use this. If anything feels off — a question that misses the mark, a talking point that doesn't fit — just reply to this email and tell me. Your feedback is literally shaping the product.
      </p>

      <!-- CTA -->
      <a href="https://app.1ststep.ai"
        style="display:block;text-align:center;background:#4338CA;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 24px;border-radius:10px;margin-bottom:20px">
        Open My Interview Cheat Sheet →
      </a>

      <p style="font-size:13px;color:#94A3B8;text-align:center;margin:0;line-height:1.5">
        Go get it. 💪
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:16px 28px;border-top:1px solid #F1F5F9;background:#FAFAFA">
      <p style="font-size:12px;color:#94A3B8;margin:0;text-align:center;line-height:1.6">
        You're receiving this because you're a 1stStep.ai beta user.<br>
        Questions? Reply directly to this email — it goes straight to Evan.<br>
        <a href="https://1ststep.ai" style="color:#CBD5E1;text-decoration:none">1stStep.ai</a>
      </p>
    </div>

  </div>
</div>
</body>
</html>`;
}

function buildEmailText(firstName) {
  const name = firstName || 'there';
  return `Hey ${name},

Your Interview Cheat Sheet just landed at 1stStep.ai.

We shipped a feature that turns your tailored resume into a complete interview prep kit in about 40 seconds.

What's in it:
• 9 predicted interview questions with your personalized talking point for each
• 4 smart questions to ask the interviewer
• Red flags from your actual resume — with a ready reframe for each one

How to use it:
1. Open app.1ststep.ai
2. Go to your Tailored Resumes tab
3. Hit "Interview Prep" on any saved resume
4. Your cheat sheet is ready in ~40 seconds

You're one of the first people to use this. If anything feels off, just reply to this email.

Go get it.
— Evan

---
You're receiving this because you're a 1stStep.ai beta user.
Questions? Reply directly — this goes straight to Evan.
`;
}

// ── Main Handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Admin auth — require x-admin-secret header
  const adminSecret = process.env.ADMIN_SECRET || '';
  const provided    = req.headers['x-admin-secret'] || '';
  if (!adminSecret || provided !== adminSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const ghlKey    = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const resendKey = process.env.RESEND_API_KEY;
  const fromAddr  = process.env.RESEND_FROM || 'evan@1ststep.ai';

  if (!ghlKey || !locationId) return res.status(500).json({ error: 'GHL not configured' });
  if (!resendKey)              return res.status(500).json({ error: 'Resend not configured' });

  const { tag = 'beta', dryRun = true } = req.body || {};

  console.log(`send-update-email: fetching contacts tagged '${tag}' | dryRun=${dryRun}`);

  let contacts;
  try {
    contacts = await fetchContactsByTag(ghlKey, locationId, tag);
  } catch (err) {
    return res.status(500).json({ error: `GHL fetch failed: ${err.message}` });
  }

  // Filter to contacts that have an email address
  const eligible = contacts.filter(c => c.email && c.email.includes('@'));

  console.log(`Found ${eligible.length} eligible contacts with tag '${tag}'`);

  const results = { total: eligible.length, sent: 0, skipped: 0, errors: [], dryRun };

  if (dryRun) {
    // In dry-run mode: return the list without sending anything
    results.preview = eligible.map(c => ({
      email: c.email,
      name: [c.firstName, c.lastName].filter(Boolean).join(' ') || '(no name)',
    }));
    return res.status(200).json(results);
  }

  // Send emails — rate-limited to avoid hammering Resend (1 per 100ms)
  for (const contact of eligible) {
    const { email, firstName } = contact;
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:     fromAddr,
          to:       email,
          reply_to: 'evan@1ststep.ai',
          subject:  `Your Interview Cheat Sheet just dropped 🎤`,
          html:     buildEmailHtml(firstName),
          text:     buildEmailText(firstName),
        }),
      });

      const data = await r.json();

      if (r.ok) {
        results.sent++;
        console.log(`✅ Sent to ${email} (id: ${data.id})`);
      } else {
        results.errors.push({ email, error: data.message || `Resend ${r.status}` });
        results.skipped++;
        console.error(`❌ Failed ${email}:`, data.message);
      }
    } catch (err) {
      results.errors.push({ email, error: err.message });
      results.skipped++;
      console.error(`❌ Exception ${email}:`, err.message);
    }

    // Pace the sends — 100ms between emails
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`send-update-email complete: ${results.sent} sent, ${results.skipped} skipped`);
  return res.status(200).json(results);
}
