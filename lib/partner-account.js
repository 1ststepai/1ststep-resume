import { createHmac } from 'node:crypto';
import { Redis } from '@upstash/redis';

const CODE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function normalizePartnerApplication(input = {}) {
  const displayName = String(input.displayName || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
  const code = String(input.code || '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  if (displayName.length < 2) throw new Error('PARTNER_NAME_INVALID');
  if (!CODE.test(code)) throw new Error('PARTNER_CODE_INVALID');
  if (input.acceptedTerms !== true) throw new Error('PARTNER_TERMS_REQUIRED');
  return { displayName, code };
}

export function partnerAccountConfiguration(env = process.env, createRedis = () => Redis.fromEnv()) {
  const secret = String(env.RATE_LIMIT_HASH_SECRET || env.TIER_SECRET || '');
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN || secret.length < 32) return null;
  return { redis: createRedis(), secret };
}

export function partnerSubjectHash(subject, secret) {
  return createHmac('sha256', secret).update(`partner-account.v1|${String(subject || '').toLowerCase()}`).digest('hex');
}

const subjectKey = hash => `partner:v1:subject:${hash}`;
const codeKey = code => `partner:v1:code:${code}`;
const attributionKey = hash => `partner:v1:attribution:${hash}`;

export async function readPartnerAccount({ subject, redis, secret }) {
  return await redis.get(subjectKey(partnerSubjectHash(subject, secret))) || null;
}

export async function savePartnerApplication(input, { subject, redis, secret, now = new Date() }) {
  const application = normalizePartnerApplication(input);
  const hash = partnerSubjectHash(subject, secret);
  const existing = await redis.get(subjectKey(hash));
  const owner = await redis.get(codeKey(application.code));
  if (owner && owner !== hash) throw new Error('PARTNER_CODE_TAKEN');
  if (!owner && await redis.set(codeKey(application.code), hash, { nx: true }) !== 'OK') throw new Error('PARTNER_CODE_TAKEN');
  const timestamp = now.toISOString();
  const record = {
    displayName: application.displayName,
    code: application.code,
    status: existing?.status || 'pending',
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    termsVersion: 'beta-2026-09',
  };
  await redis.set(subjectKey(hash), record);
  if (existing?.code && existing.code !== record.code) await redis.del(codeKey(existing.code));
  return record;
}

export async function recordPartnerAttribution({ subject, code, redis, secret, now = new Date() }) {
  const normalized = normalizePartnerApplication({ displayName: 'Referral', code, acceptedTerms: true }).code;
  const partnerHash = await redis.get(codeKey(normalized));
  if (!partnerHash) throw new Error('PARTNER_CODE_UNKNOWN');
  const hash = partnerSubjectHash(subject, secret);
  const record = { code: normalized, capturedAt: now.toISOString(), commissionEligible: false };
  const stored = await redis.set(attributionKey(hash), record, { nx: true });
  return { recorded: stored === 'OK', code: normalized, commissionEligible: false };
}
