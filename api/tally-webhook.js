/**
 * POST /api/tally-webhook
 *
 * Receives Tally form submissions and syncs them into GHL:
 *   1. Finds the email field in the submission
 *   2. Upserts the GHL contact (creates if new, updates if existing) + tags 'feedback_given'
 *   3. Adds a note to the contact with all the feedback answers
 *
 * Setup in Tally:
 *   Form → Integrations → Webhooks → Add endpoint URL:
 *   https://app.1ststep.ai/api/tally-webhook
 *
 * Env vars required:
 *   GHL_API_KEY      — pit-... (GoHighLevel Private Integration Token)
 *   GHL_LOCATION_ID  — GHL Location ID
 *   TALLY_SIGNING_SECRET — (optional) from Tally webhook settings — enables signature verification
 */

import { createHmac, timingSafeEqual } from 'crypto';

export const maxDuration = 15;

// ── Optional signature verification ──────────────────────────────────────────
// Tally signs webhook payloads with HMAC-SHA256 when a signing secret is set.
// Set TALLY_SIGNING_SECRET in Vercel to enable verification.
// If the env var is not set, fail closed unless ALLOW_UNSIGNED_TALLY_WEBHOOKS=true
// is set for a temporary local/test environment.
function verifyTallySignature(rawBody, signature) {
  const secret = process.env.TALLY_SIGNING_SECRET;
  if (!secret) return process.env.ALLOW_UNSIGNED_TALLY_WEBHOOKS === 'true';
  if (!signature) return false;
  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(String(signature));
  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}

// ── Parse Tally fields into { email, answers[] } ─────────────────────────────
// Tally payload: data.fields = [{ key, label, type, value }]
function parseTallyFields(fields = []) {
  let email = '';
  const answers = [];

  for (const field of fields) {
    const label = (field.label || '').trim();
    const value = field.value;
    const type  = (field.type  || '').toUpperCase();

    // Skip hidden / empty fields
    if (value === null || value === undefined || value === '') continue;

    // Detect email field
    if (
      type === 'INPUT_EMAIL' ||
      /email/i.test(label)
    ) {
      if (typeof value === 'string' && value.includes('@')) {
        email = value.trim().toLowerCase();
        continue; // don't add email as an answer line
      }
    }

    // Format value for the note
    let displayValue;
    if (Array.isArray(value)) {
      displayValue = value.join(', ');
    } else if (typeof value === 'object') {
      displayValue = JSON.stringify(value);
    } else {
      displayValue = String(value);
    }

    if (displayValue.trim()) {
      answers.push({ label, value: displayValue.trim() });
    }
  }

  return { email, answers };
}

// ── GHL helpers ───────────────────────────────────────────────────────────────

async function upsertGHLContact(email) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Version':       '2021-07-28',
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ locationId, email, tags: ['feedback_given'] }),
      });
      if (!r.ok) throw new Error(`GHL returned ${r.status}`);
      const data = await r.json();
      const contactId = data.contact?.id;
      if (contactId) {
        console.log(`✅ GHL contact upserted [feedback] (attempt ${attempt}): ${contactId} (${email})`);
        return contactId;
      } else {
        console.error(`GHL contact upsert failed (attempt ${attempt}):`, JSON.stringify(data));
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error(`GHL upsert error (attempt ${attempt}):`, err.message);
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

async function addGHLNote(contactId, noteBody) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId || !contactId) return;

  try {
    const r = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/notes`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version':       '2021-07-28',
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ userId: locationId, body: noteBody }),
    });
    if (!r.ok) throw new Error(`GHL returned ${r.status}`);
    const data = await r.json();
    if (data.note?.id) {
      console.log(`✅ GHL note added: ${data.note.id}`);
    } else {
      console.error('GHL note creation failed:', JSON.stringify(data));
    }
  } catch (err) {
    console.error('GHL note error:', err.message);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const config = { api: { bodyParser: false } }; // need raw body for signature check

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody  = await getRawBody(req);
  if (rawBody.length > 256_000) {
    return res.status(413).json({ error: 'Payload too large' });
  }
  const bodyStr  = rawBody.toString('utf8');
  const signature = req.headers['tally-signature'] || '';

  // Verify signature if secret is configured
  if (!verifyTallySignature(bodyStr, signature)) {
    console.error('Tally webhook signature mismatch');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(bodyStr);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // Only handle form response events
  if (payload.eventType !== 'FORM_RESPONSE') {
    return res.status(200).json({ ok: true, skipped: true, reason: `Event type: ${payload.eventType}` });
  }

  const fields   = payload.data?.fields || [];
  const { email, answers } = parseTallyFields(fields);
  const formName = payload.data?.formName || 'Beta Feedback';
  const submittedAt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  if (!email) {
    console.warn('Tally webhook: no email field found in submission — skipping GHL sync');
    console.log('Fields received:', fields.map(f => `${f.label} (${f.type})`).join(', '));
    return res.status(200).json({ ok: true, skipped: true, reason: 'No email field found' });
  }

  // Build the note body
  const noteLines = [
    `📋 ${formName}`,
    `Submitted: ${submittedAt}`,
    `---`,
    ...answers.map(a => `${a.label}:\n${a.value}`),
  ];
  const noteBody = noteLines.join('\n\n');

  // Upsert contact + add note
  const contactId = await upsertGHLContact(email);
  if (contactId) {
    await addGHLNote(contactId, noteBody);
  }

  return res.status(200).json({ ok: true, email, answersCount: answers.length });
}
