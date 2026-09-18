import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import Stripe from 'stripe';
import { handleStripeWebhookRequest } from '../api/stripe-webhook.js';

function request(chunks, headers = {}) {
  const req = Readable.from(chunks);
  req.method = 'POST';
  req.headers = headers;
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

const webhookSecret = 'whsec_test_webhook_secret';
const payload = JSON.stringify({ id: 'evt_1SafeSyntheticBody0001', type: 'test.unhandled', data: { object: {} } });
const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
let claimed = 0;
let completed = 0;
const dependencies = {
  env: { STRIPE_SECRET_KEY: 'sk_test_synthetic', STRIPE_WEBHOOK_SECRET: webhookSecret },
  idempotencyConfiguration: () => ({ redis: {}, secret: 'idempotency-secret-that-is-at-least-32-characters' }),
  idempotencyOperations: {
    claim: async () => { claimed += 1; return { status: 'claimed', eventReference: 'safe-reference', leaseToken: 'safe-lease' }; },
    complete: async () => { completed += 1; return { status: 'completed' }; },
    release: async () => ({ status: 'released' }),
  },
};

const validResponse = response();
await handleStripeWebhookRequest(request([Buffer.from(payload.slice(0, 17)), Buffer.from(payload.slice(17))], { 'stripe-signature': signature }), validResponse, dependencies);
assert.equal(validResponse.statusCode, 200, 'a valid signed Stripe event must still process');
assert.deepEqual(validResponse.body, { received: true });
assert.equal(claimed, 1);
assert.equal(completed, 1);

let constructCalls = 0;
class ObservedStripe {
  constructor() { this.webhooks = { constructEvent() { constructCalls += 1; throw new Error('must not run'); } }; }
}
const oversizedResponse = response();
await handleStripeWebhookRequest(
  request([], { 'stripe-signature': 'unused', 'content-length': '1048577' }),
  oversizedResponse,
  { ...dependencies, StripeImpl: ObservedStripe },
);
assert.equal(oversizedResponse.statusCode, 413, 'oversized Stripe requests must return 413');
assert.equal(constructCalls, 0, 'oversized bodies must be rejected before signature parsing');

console.log('Stripe raw-body endpoint integration tests passed');
