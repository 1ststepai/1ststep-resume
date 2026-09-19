import assert from 'node:assert/strict';
import { captureReferral, readReferral, submitReferral, REFERRAL_WINDOW_MS } from '../client/referral-attribution.js';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const t0 = Date.parse('2026-09-18T00:00:00Z');

const storage = memory();
assert.equal(captureReferral('?utm_source=partner', storage, t0), null, 'no code, nothing stored');
assert.equal(captureReferral('?ref=Career_Coach Sarah!', storage, t0).referralCode, 'career-coach-sarah');
assert.equal(captureReferral('?ref=other-partner', storage, t0 + 1000).referralCode, 'career-coach-sarah', 'first touch wins');
assert.equal(readReferral(storage, t0 + REFERRAL_WINDOW_MS + 1), null, 'expires after 60 days');
assert.equal(captureReferral('?ref=later', storage, t0 + REFERRAL_WINDOW_MS + 1).referralCode, 'later', 'new touch after expiry');

const calls = [];
const respond = status => async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { status }; };
const s2 = memory();
captureReferral('?ref=coach', s2, t0);
assert.equal(await submitReferral({ storage: s2, fetchImpl: respond(401), now: t0 }), null, 'unsigned: retry later');
assert.equal(await submitReferral({ storage: s2, fetchImpl: respond(200), now: t0 }), 200);
assert.deepEqual(calls.at(-1), { url: '/api/partner?action=attribute', body: { code: 'coach' } });
assert.equal(await submitReferral({ storage: s2, fetchImpl: respond(200), now: t0 }), null, 'submitted once');
const s3 = memory();
captureReferral('?ref=unapproved', s3, t0);
assert.equal(await submitReferral({ storage: s3, fetchImpl: respond(409), now: t0 }), 409, 'server rejection is final');
assert.equal(calls.length, 3);
console.log('Referral attribution: first touch, 60-day expiry, submit once after sign-in.');
