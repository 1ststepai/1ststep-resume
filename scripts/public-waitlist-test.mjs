#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryWaitlistKv, upsertPublicWaitlistLead, waitlistRecordKey } from '../lib/public-waitlist-store.js';
import { handlePublicWaitlist } from '../api/public-waitlist.js';
import funnelHandler, { PUBLIC_FUNNEL_EVENTS } from '../api/public-funnel-event.js';

const secret = 'waitlist-test-secret-value-32chars!!';
const kv = memoryWaitlistKv();

const first = await upsertPublicWaitlistLead({
  email: 'Alex@Example.com',
  name: 'Alex',
  marketingConsent: false,
  source: 'landing',
  page: '/',
  campaign: 'homepage',
}, { kv, secret, now: new Date('2026-09-18T00:00:00.000Z') });
assert.equal(first.ok, true);
assert.equal(first.duplicate, false);

const again = await upsertPublicWaitlistLead({
  email: ' alex@example.com ',
  marketingConsent: true,
  source: 'landing',
}, { kv, secret, now: new Date('2026-09-18T01:00:00.000Z') });
assert.equal(again.ok, true);
assert.equal(again.duplicate, true);
const stored = await kv.get(waitlistRecordKey('alex@example.com', secret));
assert.equal(stored.name, 'Alex');
assert.equal(stored.marketingConsent, true);
assert.equal(stored.campaign, 'homepage');
const againQuiet = await upsertPublicWaitlistLead({
  email: 'alex@example.com',
  marketingConsent: false,
  source: 'resume',
}, { kv, secret, now: new Date('2026-09-18T02:00:00.000Z') });
assert.equal(againQuiet.duplicate, true);
const storedQuiet = await kv.get(waitlistRecordKey('alex@example.com', secret));
assert.equal(storedQuiet.marketingConsent, true);
assert.equal(storedQuiet.source, 'landing');

assert.equal((await upsertPublicWaitlistLead({ email: 'bad' }, { kv, secret })).code, 'INVALID_EMAIL');
assert.equal((await upsertPublicWaitlistLead({
  email: 'ok@example.com',
  JOB_AGENT_PILOT_ALLOWED_TENANTS: 'nope',
}, { kv, secret })).code, 'PILOT_FIELDS_REJECTED');

const waitlistSource = readFileSync(new URL('../api/public-waitlist.js', import.meta.url), 'utf8');
const storeSource = readFileSync(new URL('../lib/public-waitlist-store.js', import.meta.url), 'utf8');
assert.doesNotMatch(waitlistSource, /JOB_AGENT_PILOT_ALLOWED_TENANTS/);
assert.match(waitlistSource, /grantsBetaAccess: false/);
assert.match(storeSource, /PILOT_FIELDS_REJECTED/);

class Response {
  constructor() { this.headers = {}; this.statusCode = 0; this.body = null; }
  setHeader(key, value) { this.headers[key] = value; }
  status(code) { this.statusCode = code; return this; }
  json(value) { this.body = value; return this; }
  end() { return this; }
}

const denied = new Response();
await handlePublicWaitlist({
  method: 'POST',
  headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
  body: { email: 'ok@example.com' },
  socket: {},
}, denied, { kv, secret });
assert.equal(denied.statusCode, 403);

const missingStore = new Response();
await handlePublicWaitlist({
  method: 'POST',
  headers: { origin: 'https://app.1ststep.ai', 'content-type': 'application/json' },
  body: { email: 'ok@example.com' },
  socket: { remoteAddress: '127.0.0.1' },
}, missingStore, { kv: null, secret });
assert.equal(missingStore.statusCode, 503);
assert.match(missingStore.body.error, /sales@1ststep.ai/);

const created = new Response();
await handlePublicWaitlist({
  method: 'POST',
  headers: { origin: 'https://app.1ststep.ai', 'content-type': 'application/json' },
  body: { email: 'fresh@example.com', source: 'landing', marketingConsent: false },
  socket: { remoteAddress: '127.0.0.1' },
}, created, { kv, secret });
assert.equal(created.statusCode, 200);
assert.equal(created.body.grantsBetaAccess, false);
assert.equal(created.body.duplicate, false);

const funnelDenied = new Response();
await funnelHandler({
  method: 'POST',
  headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
  body: { event: 'landing_viewed' },
  socket: {},
}, funnelDenied);
assert.equal(funnelDenied.statusCode, 403);

const funnelPii = new Response();
await funnelHandler({
  method: 'POST',
  headers: { origin: 'https://app.1ststep.ai', 'content-type': 'application/json' },
  body: { event: 'landing_viewed', email: 'secret@example.com' },
  socket: { remoteAddress: '127.0.0.1' },
}, funnelPii);
assert.equal(funnelPii.statusCode, 400);

for (const event of PUBLIC_FUNNEL_EVENTS) assert.match(event, /^[a-z_]+$/);
assert.equal(PUBLIC_FUNNEL_EVENTS.includes('landing_viewed'), true);

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /id="waitlistForm"/);
assert.match(html, /Start Job Agent/);
assert.match(html, /Join Early Access/);
assert.match(html, /Needs You/);
assert.match(html, /Saved Info/);
assert.match(html, /Prepared for Review/);
assert.match(html, /does not grant Job Agent beta access/i);
assert.doesNotMatch(html, /AI-powered job search/i);
assert.match(html, /id="heroLeadForm"/);
assert.match(html, /id="lead"/);
assert.match(html, /<script src="\/home-funnel\.js" defer><\/script>/);

console.log('PASS: public waitlist duplicates, beta separation, and funnel-event privacy.');
