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

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { isRequestBodyTooLarge, readBoundedRawRequestBody } from '../lib/bounded-raw-request-body.js';
import {
  claimTallyWebhookEvent, completeTallyWebhookEvent, releaseTallyWebhookEvent,
  tallyWebhookIdempotencyConfiguration,
} from '../lib/tally-webhook-idempotency.js';

export const maxDuration = 15;

// ── Optional signature verification ──────────────────────────────────────────
// Tally signs webhook payloads with HMAC-SHA256 when a signing secret is set.
// TALLY_SIGNING_SECRET is mandatory in every deployed environment.
function verifyTallySignature(rawBody, signature, env = process.env) {
  const secret = env.TALLY_SIGNING_SECRET;
  if (!secret || secret.length < 32) return false;
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

async function upsertGHLContact(email, { env = process.env, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const apiKey     = env.GHL_API_KEY;
  const locationId = env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetchImpl('https://services.leadconnectorhq.com/contacts/upsert', {
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
        console.log(`GHL feedback contact captured on attempt ${attempt}.`);
        return contactId;
      } else {
        console.error(JSON.stringify({ type: 'ghl-feedback-upsert-failed', attempt, status: r.status }));
        if (attempt < 2) await sleep(1000);
      }
    } catch (err) {
      console.error(JSON.stringify({ type: 'ghl-feedback-upsert-error', attempt, name: err?.name || 'unknown' }));
      if (attempt < 2) await sleep(1000);
    }
  }
  throw new Error('GHL feedback contact upsert failed.');
}

async function addGHLNote(contactId, noteBody, eventReference, { env = process.env, fetchImpl = fetch } = {}) {
  const apiKey     = env.GHL_API_KEY;
  const locationId = env.GHL_LOCATION_ID;
  if (!apiKey || !locationId || !contactId) return;

  const url = `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}/notes`;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       '2021-07-28',
    'Content-Type':  'application/json',
  };
  const marker = `[tally-event:${eventReference}]`;
  const existingResponse = await fetchImpl(url, { method: 'GET', headers });
  if (!existingResponse.ok) throw new Error(`GHL note lookup returned ${existingResponse.status}`);
  const existing = await existingResponse.json();
  const notes = Array.isArray(existing.notes) ? existing.notes : [];
  if (notes.some(note => String(note?.body || '').includes(marker))) return { status: 'exists' };

  const r = await fetchImpl(url, {
      method:  'POST',
      headers,
      body: JSON.stringify({ userId: locationId, body: `${noteBody}\n\n${marker}` }),
  });
  if (!r.ok) throw new Error(`GHL returned ${r.status}`);
  const data = await r.json();
  if (!data.note?.id) throw new Error('GHL feedback note response was missing an ID.');
  console.log(JSON.stringify({ type: 'ghl-feedback-note', outcome: 'created' }));
  return { status: 'created' };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const config = { api: { bodyParser: false } }; // need raw body for signature check

const TALLY_WEBHOOK_BODY_LIMIT_BYTES = 256_000;
const TALLY_EVENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TALLY_EVENT_FUTURE_SKEW_MS = 5 * 60 * 1000;

function tallyEventTimestampIsFresh(payload, now = Date.now()) {
  const createdAt = new Date(payload?.createdAt).getTime();
  return Number.isFinite(createdAt)
    && createdAt <= now + TALLY_EVENT_FUTURE_SKEW_MS
    && createdAt >= now - TALLY_EVENT_MAX_AGE_MS;
}

export async function handleTallyWebhookRequest(req, res, {
  env = process.env,
  fetchImpl = fetch,
  sleep,
  idempotencyConfiguration = tallyWebhookIdempotencyConfiguration,
  idempotencyOperations = { claim: claimTallyWebhookEvent, complete: completeTallyWebhookEvent, release: releaseTallyWebhookEvent },
  now = Date.now(),
} = {}) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let rawBody;
  try {
    rawBody = await readBoundedRawRequestBody(req, { limitBytes: TALLY_WEBHOOK_BODY_LIMIT_BYTES });
  } catch (error) {
    if (isRequestBodyTooLarge(error)) return res.status(413).json({ error: 'Payload too large' });
    throw error;
  }
  const bodyStr  = rawBody.toString('utf8');
  const signature = req.headers['tally-signature'] || '';

  // Verify signature if secret is configured
  if (!verifyTallySignature(rawBody, signature, env)) {
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
  if (!tallyEventTimestampIsFresh(payload, now)) {
    return res.status(401).json({ error: 'Webhook event is outside the accepted time window.' });
  }

  const payloadHash = createHash('sha256').update(rawBody).digest('hex');
  const eventId = String(payload.eventId || '');
  const idempotency = idempotencyConfiguration(env);
  if (!idempotency) return res.status(503).json({ error: 'Webhook processing is temporarily unavailable.' });

  let claim;
  try {
    claim = await idempotencyOperations.claim({ ...idempotency, eventId, payloadHash });
  } catch (error) {
    console.error(JSON.stringify({ type: 'tally-webhook-claim-error', name: error?.name || 'unknown' }));
    return res.status(503).json({ error: 'Webhook processing is temporarily unavailable.' });
  }
  if (claim.status === 'completed' || claim.status === 'busy') {
    return res.status(200).json({ ok: true, duplicate: true });
  }

  const fields   = payload.data?.fields || [];
  const { email, answers } = parseTallyFields(fields);
  const formName = payload.data?.formName || 'Beta Feedback';
  const submittedDate = new Date(payload.createdAt);
  const submittedAt = (Number.isFinite(submittedDate.getTime()) ? submittedDate : new Date()).toLocaleString('en-US', { timeZone: 'America/New_York' });

  if (!email) {
    console.warn('Tally webhook: no email field found in submission — skipping GHL sync');
    console.log('Fields received:', fields.map(f => `${f.label} (${f.type})`).join(', '));
    await idempotencyOperations.complete({ ...idempotency, eventId, payloadHash, leaseToken: claim.leaseToken });
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
  try {
    const contactId = await upsertGHLContact(email, { env, fetchImpl, sleep });
    if (contactId) await addGHLNote(contactId, noteBody, claim.eventReference, { env, fetchImpl });
    await idempotencyOperations.complete({ ...idempotency, eventId, payloadHash, leaseToken: claim.leaseToken });
  } catch (error) {
    await idempotencyOperations.release({ ...idempotency, eventId, payloadHash, leaseToken: claim.leaseToken }).catch(() => {});
    console.error(JSON.stringify({ type: 'tally-webhook-processing-error', name: error?.name || 'unknown' }));
    return res.status(503).json({ error: 'Webhook processing failed and will be retried.' });
  }

  return res.status(200).json({ ok: true, email, answersCount: answers.length });
}

export default function handler(req, res) {
  return handleTallyWebhookRequest(req, res);
}
