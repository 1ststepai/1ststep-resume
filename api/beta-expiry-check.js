/**
 * GET /api/beta-expiry-check
 *
 * Daily cron job — finds beta users approaching expiry and moves them to
 * the "Trial Ending" pipeline stage in GHL so automations can fire.
 *
 * Logic:
 *   - Fetch all GHL contacts tagged 'beta' (and NOT already tagged 'trial_ending')
 *   - Beta TTL is 15 days from dateAdded
 *   - If contact is within NOTIFY_DAYS_BEFORE (default 3) days of expiry → move to Trial Ending
 *   - Idempotent: adds 'trial_ending' tag so it won't fire again on the next run
 *
 * Triggered by Vercel cron (see vercel.json).
 * Can also be called manually: GET /api/beta-expiry-check?secret=<CRON_SECRET>
 *
 * Env vars required:
 *   GHL_API_KEY         — GHL private integration key
 *   GHL_LOCATION_ID     — GHL location / subaccount ID
 *   GHL_PIPELINE_ID     — pipeline ID (1stStep.ai Users)
 *   GHL_STAGE_TRIAL_ENDING — stage ID for "Trial Ending"
 *   CRON_SECRET         — simple shared secret to prevent public access
 */

const BETA_TTL_DAYS       = 15;
const NOTIFY_DAYS_BEFORE  = 3;  // fire when ≤ 3 days left
const GHL_BASE            = 'https://services.leadconnectorhq.com';
const GHL_VERSION         = '2021-07-28';

function ghlHeaders(apiKey) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       GHL_VERSION,
    'Content-Type':  'application/json',
  };
}

// Fetch all contacts with a given tag (handles pagination)
async function fetchContactsByTag(apiKey, locationId, tag) {
  const contacts = [];
  let after = null;

  for (let page = 0; page < 20; page++) {  // hard cap: 20 pages × 100 = 2000 contacts max
    const params = new URLSearchParams({
      locationId,
      tags: tag,
      limit: '100',
    });
    if (after) params.set('startAfter', after);

    const res = await fetch(`${GHL_BASE}/contacts/?${params}`, {
      headers: ghlHeaders(apiKey),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GHL contacts fetch failed ${res.status}: ${body}`);
    }

    const data = await res.json();
    const batch = data.contacts || [];
    contacts.push(...batch);

    // GHL pagination — stop if fewer results than page size or no next cursor
    if (batch.length < 100) break;
    after = data.meta?.startAfter || null;
    if (!after) break;
  }

  return contacts;
}

// Find the open opportunity for a contact in the 1stStep pipeline
async function findOpportunity(apiKey, locationId, pipelineId, contactId) {
  const params = new URLSearchParams({ location_id: locationId, contact_id: contactId });
  const res = await fetch(`${GHL_BASE}/opportunities/search?${params}`, {
    headers: ghlHeaders(apiKey),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const opps = (data.opportunities || []).filter(
    o => o.pipelineId === pipelineId && o.status === 'open'
  );
  return opps[0] || null;
}

// Move an opportunity to a new stage
async function moveOpportunityStage(apiKey, opportunityId, stageId) {
  const res = await fetch(`${GHL_BASE}/opportunities/${opportunityId}`, {
    method:  'PUT',
    headers: ghlHeaders(apiKey),
    body:    JSON.stringify({ pipelineStageId: stageId }),
  });
  return res.ok;
}

// Add a tag to a contact
async function addTag(apiKey, contactId, tag) {
  await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
    method:  'POST',
    headers: ghlHeaders(apiKey),
    body:    JSON.stringify({ tags: [tag] }),
  }).catch(() => {});
}

export default async function handler(req, res) {
  // Auth check — Vercel cron sends Authorization header; manual callers send ?secret=
  const cronSecret = process.env.CRON_SECRET || '';
  const authHeader  = req.headers['authorization'] || '';
  const querySecret = req.query?.secret || '';

  if (cronSecret) {
    const validBearer = authHeader === `Bearer ${cronSecret}`;
    const validQuery  = querySecret === cronSecret;
    if (!validBearer && !validQuery) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const pipelineId = process.env.GHL_PIPELINE_ID;
  const trialStageId = process.env.GHL_STAGE_TRIAL_ENDING;

  if (!apiKey || !locationId) {
    return res.status(200).json({ skipped: true, reason: 'GHL not configured' });
  }

  if (!pipelineId || !trialStageId) {
    return res.status(200).json({ skipped: true, reason: 'Pipeline/stage IDs not configured — run fetch-ghl-ids.js first' });
  }

  const now          = Date.now();
  const betaTtlMs    = BETA_TTL_DAYS * 24 * 60 * 60 * 1000;
  const notifyMs     = NOTIFY_DAYS_BEFORE * 24 * 60 * 60 * 1000;

  const results = { processed: 0, moved: 0, skipped: 0, errors: [] };

  try {
    // Get all beta contacts that haven't been notified yet
    const betaContacts = await fetchContactsByTag(apiKey, locationId, 'beta');
    const eligible = betaContacts.filter(c => !(c.tags || []).includes('trial_ending'));

    console.log(`Beta expiry check: ${betaContacts.length} beta contacts, ${eligible.length} not yet notified`);

    for (const contact of eligible) {
      results.processed++;
      try {
        const dateAdded  = new Date(contact.dateAdded).getTime();
        const expiresAt  = dateAdded + betaTtlMs;
        const msLeft     = expiresAt - now;

        // Within the notify window: ≤ NOTIFY_DAYS_BEFORE days left AND not yet expired
        if (msLeft > 0 && msLeft <= notifyMs) {
          const opp = await findOpportunity(apiKey, locationId, pipelineId, contact.id);

          if (opp) {
            const moved = await moveOpportunityStage(apiKey, opp.id, trialStageId);
            if (moved) {
              await addTag(apiKey, contact.id, 'trial_ending');
              results.moved++;
              console.log(`✅ Moved to Trial Ending: ${contact.email} (${Math.ceil(msLeft / (1000*60*60*24))}d left)`);
            } else {
              results.skipped++;
            }
          } else {
            // No opportunity found — create one in Trial Ending stage
            await fetch(`${GHL_BASE}/opportunities/`, {
              method:  'POST',
              headers: ghlHeaders(apiKey),
              body:    JSON.stringify({
                locationId,
                pipelineId,
                pipelineStageId: trialStageId,
                contactId:  contact.id,
                name:       `${contact.firstName || ''} ${contact.lastName || ''} — Beta Expiring`.trim(),
                status:     'open',
                source:     '1stStep.ai Beta Expiry',
              }),
            }).catch(() => {});
            await addTag(apiKey, contact.id, 'trial_ending');
            results.moved++;
            console.log(`✅ Created Trial Ending opportunity: ${contact.email}`);
          }
        }
      } catch (err) {
        results.errors.push({ contact: contact.email, error: err.message });
        console.error(`Error processing ${contact.email}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Beta expiry check failed:', err.message);
    return res.status(500).json({ error: err.message, results });
  }

  console.log(`Beta expiry check complete:`, results);
  return res.status(200).json({ ok: true, ...results });
}
