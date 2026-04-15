/**
 * POST /api/ghl-stage
 *
 * Internal endpoint — moves a GHL contact's pipeline opportunity
 * to a new stage. Called from the app when key milestones happen:
 *   - first resume tailored  → Active User
 *   - 5th tailor             → Power User
 *
 * Body: { email, stage }
 *   stage: 'active_user' | 'power_user' | 'trial_ending' | 'churned'
 *
 * Env vars required (set after running setup-ghl-pipeline.js):
 *   GHL_API_KEY, GHL_LOCATION_ID, GHL_PIPELINE_ID,
 *   GHL_STAGE_ACTIVE_USER, GHL_STAGE_POWER_USER,
 *   GHL_STAGE_TRIAL_ENDING, GHL_STAGE_CHURNED
 */

const STAGE_ENV_MAP = {
  active_user:           'GHL_STAGE_ACTIVE_USER',
  power_user:            'GHL_STAGE_POWER_USER',
  trial_ending:          'GHL_STAGE_TRIAL_ENDING',
  converted_essential:   'GHL_STAGE_CONVERTED_ESSENTIAL',
  converted_complete:    'GHL_STAGE_CONVERTED_COMPLETE',
  churned:               'GHL_STAGE_CHURNED',
};

const ALLOWED_ORIGINS = [
  'https://1ststep.ai',
  'https://www.1ststep.ai',
  'https://app.1ststep.ai',
];

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
  if (req.method === 'OPTIONS') return res.status(204).set(headers).end();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const pipelineId = process.env.GHL_PIPELINE_ID;

  // Silently succeed if GHL is not configured — don't break the app
  if (!apiKey || !locationId || !pipelineId) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const { email = '', stage = '' } = req.body || {};
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const stageEnvKey = STAGE_ENV_MAP[stage];
  if (!stageEnvKey) {
    return res.status(400).json({ error: `Unknown stage: ${stage}` });
  }

  const stageId = process.env[stageEnvKey];
  if (!stageId) {
    // Stage env var not set yet — silently skip
    return res.status(200).json({ ok: true, skipped: true, reason: `${stageEnvKey} not configured` });
  }

  const GHL_HEADERS = {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       '2021-07-28',
    'Content-Type':  'application/json',
  };

  try {
    // ── Find the contact by email ─────────────────────────────────────────
    const searchRes = await fetch(
      `https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&email=${encodeURIComponent(cleanEmail)}`,
      { headers: GHL_HEADERS }
    );
    if (!searchRes.ok) throw new Error(`Contact search failed: ${searchRes.status}`);
    const searchData = await searchRes.json();
    const contact = searchData?.contacts?.[0];
    if (!contact?.id) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'Contact not found in GHL' });
    }

    // ── Find their open opportunity in this pipeline ───────────────────────
    const oppRes = await fetch(
      `https://services.leadconnectorhq.com/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&contact_id=${contact.id}`,
      { headers: GHL_HEADERS }
    );
    if (!oppRes.ok) throw new Error(`Opportunity search failed: ${oppRes.status}`);
    const oppData = await oppRes.json();
    const opportunity = oppData?.opportunities?.[0];

    if (!opportunity?.id) {
      // No opportunity yet — create one in the target stage
      await fetch('https://services.leadconnectorhq.com/opportunities/', {
        method:  'POST',
        headers: GHL_HEADERS,
        body: JSON.stringify({
          locationId,
          pipelineId,
          pipelineStageId: stageId,
          contactId: contact.id,
          name:   `${contact.firstName || cleanEmail} — 1stStep.ai`,
          status: 'open',
        }),
      });
    } else {
      // Move existing opportunity to new stage
      await fetch(`https://services.leadconnectorhq.com/opportunities/${opportunity.id}`, {
        method:  'PUT',
        headers: GHL_HEADERS,
        body: JSON.stringify({ pipelineStageId: stageId }),
      });
    }

    console.log(`✅ GHL stage updated: ${cleanEmail} → ${stage}`);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('GHL stage update error:', err.message);
    // Don't fail the user-facing request over a CRM update
    return res.status(200).json({ ok: true, skipped: true, error: err.message });
  }
}
