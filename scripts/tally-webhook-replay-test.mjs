import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { handleTallyWebhookRequest } from '../api/tally-webhook.js';

const secret = 'tally-signing-secret-that-is-at-least-32-characters';
const env = {
  TALLY_SIGNING_SECRET: secret,
  GHL_API_KEY: 'test-ghl-key',
  GHL_LOCATION_ID: 'test-location',
};

function signedRequest(payload) {
  const body = Buffer.from(JSON.stringify(payload));
  const req = Readable.from([body]);
  req.method = 'POST';
  req.headers = { 'tally-signature': createHmac('sha256', secret).update(body).digest('base64') };
  return req;
}

function response() {
  return {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

const states = new Map();
let notePosts = 0;
const idempotencyOperations = {
  async claim({ eventId }) {
    const state = states.get(eventId);
    if (state === 'completed') return { status: 'completed', eventReference: `ref-${eventId}` };
    if (state === 'processing') return { status: 'busy', eventReference: `ref-${eventId}` };
    states.set(eventId, 'processing');
    return { status: 'claimed', eventReference: `ref-${eventId}`, leaseToken: `lease-${eventId}` };
  },
  async complete({ eventId }) { states.set(eventId, 'completed'); return { status: 'completed' }; },
  async release({ eventId }) { states.delete(eventId); return { status: 'released' }; },
};
const idempotencyConfiguration = () => ({ redis: {}, secret });
const notes = [];
const fetchImpl = async (url, options = {}) => {
  if (url.endsWith('/contacts/upsert')) return { ok: true, status: 200, json: async () => ({ contact: { id: 'contact-1' } }) };
  if (options.method === 'GET') return { ok: true, status: 200, json: async () => ({ notes }) };
  if (options.method === 'POST' && url.endsWith('/notes')) {
    notePosts += 1;
    const body = JSON.parse(options.body).body;
    notes.push({ id: `note-${notePosts}`, body });
    return { ok: true, status: 200, json: async () => ({ note: { id: `note-${notePosts}` } }) };
  }
  throw new Error(`Unexpected request: ${options.method} ${url}`);
};

const payload = {
  eventId: '75f4b67e-34e8-4d09-8c91-91946bcfcf43',
  eventType: 'FORM_RESPONSE',
  createdAt: '2026-09-10T12:00:00.000Z',
  data: { formName: 'Feedback', fields: [{ label: 'Email', type: 'INPUT_EMAIL', value: 'person@example.com' }, { label: 'Answer', type: 'INPUT_TEXT', value: 'Useful' }] },
};
const dependencies = { env, fetchImpl, idempotencyConfiguration, idempotencyOperations, sleep: async () => {}, now: Date.parse('2026-09-10T12:01:00.000Z') };

const first = response();
await handleTallyWebhookRequest(signedRequest(payload), first, dependencies);
assert.equal(first.statusCode, 200);
assert.equal(notePosts, 1);

const replay = response();
await handleTallyWebhookRequest(signedRequest(payload), replay, dependencies);
assert.equal(replay.statusCode, 200);
assert.equal(replay.body.duplicate, true, 'valid processed replays must be successful no-ops');
assert.equal(notePosts, 1, 'sequential replay must not create another CRM note');

states.clear(); notes.length = 0; notePosts = 0;
await Promise.all([
  handleTallyWebhookRequest(signedRequest(payload), response(), dependencies),
  handleTallyWebhookRequest(signedRequest(payload), response(), dependencies),
]);
assert.equal(notePosts, 1, 'concurrent delivery must create exactly one CRM note');

const invalid = signedRequest(payload);
invalid.headers['tally-signature'] = 'invalid';
const invalidResponse = response();
await handleTallyWebhookRequest(invalid, invalidResponse, dependencies);
assert.equal(invalidResponse.statusCode, 401, 'invalid signatures must be rejected before processing');

const stalePayload = { ...payload, eventId: 'ad5c2466-a7ad-49af-96e2-8e6c87b70e3c', createdAt: '2026-08-01T12:00:00.000Z' };
const staleResponse = response();
await handleTallyWebhookRequest(signedRequest(stalePayload), staleResponse, dependencies);
assert.equal(staleResponse.statusCode, 401, 'an old captured valid delivery must be rejected after the freshness window');
assert.equal(notePosts, 1, 'stale signed replays must not cause CRM side effects');

let oversizedClaimed = false;
const oversized = Readable.from([Buffer.alloc(256_001)]);
oversized.method = 'POST';
oversized.headers = {};
const oversizedResponse = response();
await handleTallyWebhookRequest(oversized, oversizedResponse, {
  ...dependencies,
  idempotencyOperations: { ...idempotencyOperations, claim: async () => { oversizedClaimed = true; throw new Error('must not run'); } },
});
assert.equal(oversizedResponse.statusCode, 413);
assert.equal(oversizedClaimed, false, 'oversized requests must be rejected before signature or side effects');

console.log('Tally webhook replay regression tests passed');
