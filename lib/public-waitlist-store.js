import { createHmac } from 'node:crypto';
import { Redis } from '@upstash/redis';

const EMAIL = /^[^\s@]{1,128}@[^\s@]{1,190}$/;
const ALLOWED_SOURCES = new Set(['landing', 'concierge', 'resume', 'pricing', 'unknown']);
const WAITLIST_PREFIX = '1ststep:public-waitlist:v1:';

export function normalizeWaitlistEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.includes('..')) return '';
  return email;
}

export function waitlistRecordKey(email, secret) {
  const normalized = normalizeWaitlistEmail(email);
  const keySecret = String(secret || '');
  if (!normalized || keySecret.length < 32) return '';
  const digest = createHmac('sha256', keySecret).update(`public-waitlist|${normalized}`).digest('hex');
  return `${WAITLIST_PREFIX}${digest}`;
}

export function sanitizeWaitlistName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function sanitizeWaitlistAttribution(value, max = 80) {
  return String(value || '').trim().slice(0, max).replace(/[^\w .:/?&=+-]/g, '');
}

export function memoryWaitlistKv() {
  const values = new Map();
  return {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); return 'OK'; },
  };
}

export function publicWaitlistRedis(env = process.env) {
  const url = String(env.UPSTASH_REDIS_REST_URL || '');
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || '');
  if (!url || !token) return null;
  return Redis.fromEnv();
}

export async function upsertPublicWaitlistLead(input = {}, { kv, secret, now = new Date() } = {}) {
  if (Object.prototype.hasOwnProperty.call(input, 'pilotTenants') || Object.prototype.hasOwnProperty.call(input, 'JOB_AGENT_PILOT_ALLOWED_TENANTS')) {
    return { ok: false, code: 'PILOT_FIELDS_REJECTED' };
  }
  const email = normalizeWaitlistEmail(input.email);
  if (!email) return { ok: false, code: 'INVALID_EMAIL' };
  const keySecret = String(secret || '');
  if (keySecret.length < 32) return { ok: false, code: 'WAITLIST_SECRET_MISSING' };
  if (!kv) return { ok: false, code: 'WAITLIST_STORE_UNAVAILABLE' };
  const key = waitlistRecordKey(email, keySecret);
  const existing = await kv.get(key);
  const timestamp = now.toISOString();
  const source = ALLOWED_SOURCES.has(String(input.source || '')) ? String(input.source) : 'unknown';
  const next = {
    email,
    name: sanitizeWaitlistName(input.name) || existing?.name || '',
    marketingConsent: existing?.marketingConsent === true || input.marketingConsent === true,
    source: existing?.source && existing.source !== 'unknown' ? existing.source : source,
    page: existing?.page || sanitizeWaitlistAttribution(input.page, 120),
    campaign: existing?.campaign || sanitizeWaitlistAttribution(input.campaign),
    createdAt: existing?.createdAt || timestamp,
    lastSeenAt: timestamp,
  };
  await kv.set(key, next);
  return { ok: true, duplicate: Boolean(existing), createdAt: next.createdAt };
}
