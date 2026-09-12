import { createHmac } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { dataEncryptionKeyringFromEnvironment, decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';

const CODE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const PATHS = new Set(['existing-user', 'affiliate-only']);
const REVIEW_STATUSES = new Set(['approved', 'rejected']);

function safeCode(value) {
  const code = String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  if (!CODE.test(code)) throw new Error('PARTNER_CODE_INVALID');
  return code;
}

export function normalizePartnerApplication(input = {}) {
  const displayName = String(input.displayName || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
  const code = safeCode(input.code);
  const path = String(input.path || '');
  if (displayName.length < 2) throw new Error('PARTNER_NAME_INVALID');
  if (!PATHS.has(path)) throw new Error('PARTNER_PATH_INVALID');
  if (input.acceptedTerms !== true) throw new Error('PARTNER_TERMS_REQUIRED');
  return { displayName, code, path };
}

export function partnerAccountConfiguration(env = process.env, createRedis = () => Redis.fromEnv()) {
  const secret = String(env.RATE_LIMIT_HASH_SECRET || env.TIER_SECRET || '');
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN || secret.length < 32) return null;
  try {
    return { redis: createRedis(), secret, dataEncryptionKey: dataEncryptionKeyringFromEnvironment(env) };
  } catch {
    return null;
  }
}

export function partnerSubjectHash(subject, secret) {
  return createHmac('sha256', secret).update(`partner-account.v2|${String(subject || '').trim().toLowerCase()}`).digest('hex');
}

const subjectKey = hash => `partner:v2:subject:${hash}`;
const codeKey = code => `partner:v2:code:${code}`;
const attributionKey = hash => `partner:v2:attribution:${hash}`;
const reviewKey = (idempotencyKey, secret) => `partner:v2:review:${createHmac('sha256', secret).update(String(idempotencyKey || '')).digest('hex')}`;
const decode = value => value ? (typeof value === 'string' ? JSON.parse(value) : value) : null;

function decryptRecord(raw, hash, dataEncryptionKey) {
  const record = decode(raw);
  return record?.envelope ? decryptJsonEnvelope(record.envelope, { dataEncryptionKey, aad: subjectKey(hash) }) : null;
}

async function readByHash({ hash, redis, dataEncryptionKey }) {
  return decryptRecord(await redis.get(subjectKey(hash)), hash, dataEncryptionKey);
}

async function writeByHash(record, { hash, redis, dataEncryptionKey }) {
  const stored = JSON.stringify({
    version: 2,
    envelope: encryptJsonEnvelope(record, { dataEncryptionKey, aad: subjectKey(hash) }),
  });
  await redis.set(subjectKey(hash), stored);
  return record;
}

export async function readPartnerAccount({ subject, redis, secret, dataEncryptionKey }) {
  return readByHash({ hash: partnerSubjectHash(subject, secret), redis, dataEncryptionKey });
}

export async function exportPartnerAccount({ subject, redis, secret, dataEncryptionKey }) {
  const record = await readPartnerAccount({ subject, redis, secret, dataEncryptionKey });
  if (!record) return null;
  const review = record.review ? { status: record.review.status, reviewedAt: record.review.reviewedAt } : null;
  return { ...record, review };
}

export async function deletePartnerAccount({ subject, redis, secret, dataEncryptionKey }) {
  const hash = partnerSubjectHash(subject, secret);
  const record = await readByHash({ hash, redis, dataEncryptionKey });
  if (record?.code && await redis.get(codeKey(record.code)) === hash) await redis.del(codeKey(record.code));
  const deleted = await redis.del(subjectKey(hash));
  const attributionDeleted = await redis.del(attributionKey(hash));
  return { deleted: deleted > 0, attributionDeleted: attributionDeleted > 0 };
}

export async function savePartnerApplication(input, { subject, redis, secret, dataEncryptionKey, now = new Date() }) {
  const application = normalizePartnerApplication(input);
  const hash = partnerSubjectHash(subject, secret);
  const existing = await readByHash({ hash, redis, dataEncryptionKey });
  const owner = await redis.get(codeKey(application.code));
  if (owner && owner !== hash) throw new Error('PARTNER_CODE_TAKEN');
  if (!owner && await redis.set(codeKey(application.code), hash, { nx: true }) !== 'OK') throw new Error('PARTNER_CODE_TAKEN');
  const timestamp = now.toISOString();
  const record = {
    displayName: application.displayName,
    code: application.code,
    path: application.path,
    status: existing?.status || 'pending',
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    termsVersion: 'partner-beta-2026-09',
    jobAgentEntitlementGranted: false,
    jobSeekerDataCreated: false,
    review: existing?.review || null,
  };
  await writeByHash(record, { hash, redis, dataEncryptionKey });
  if (existing?.code && existing.code !== record.code) await redis.del(codeKey(existing.code));
  return record;
}

export async function reviewPartnerApplication({ code, status, reviewerSubject, idempotencyKey, redis, secret, dataEncryptionKey, now = new Date() }) {
  const normalizedCode = safeCode(code);
  if (!REVIEW_STATUSES.has(status)) throw new Error('PARTNER_REVIEW_STATUS_INVALID');
  if (String(reviewerSubject || '').trim().length < 3) throw new Error('PARTNER_REVIEWER_REQUIRED');
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(String(idempotencyKey || ''))) throw new Error('PARTNER_IDEMPOTENCY_KEY_REQUIRED');
  const hash = await redis.get(codeKey(normalizedCode));
  if (!hash) throw new Error('PARTNER_NOT_FOUND');
  const current = await readByHash({ hash, redis, dataEncryptionKey });
  if (!current) throw new Error('PARTNER_NOT_FOUND');
  const key = reviewKey(idempotencyKey, secret);
  if (await redis.set(key, 'reserved', { nx: true, ex: 86400 }) !== 'OK') throw new Error('PARTNER_REVIEW_REPLAYED');
  try {
    const timestamp = now.toISOString();
    const updated = {
      ...current,
      status,
      updatedAt: timestamp,
      review: { status, reviewedAt: timestamp, reviewerHash: partnerSubjectHash(reviewerSubject, secret) },
    };
    await writeByHash(updated, { hash, redis, dataEncryptionKey });
    await redis.set(key, JSON.stringify({ code: normalizedCode, status, completedAt: timestamp }), { ex: 86400 });
    return updated;
  } catch (error) {
    await redis.del(key).catch(() => false);
    throw error;
  }
}

export async function recordPartnerAttribution({ subject, code, redis, secret, dataEncryptionKey, now = new Date() }) {
  const normalizedCode = safeCode(code);
  const partnerHash = await redis.get(codeKey(normalizedCode));
  if (!partnerHash) throw new Error('PARTNER_CODE_UNKNOWN');
  const partner = await readByHash({ hash: partnerHash, redis, dataEncryptionKey });
  if (partner?.status !== 'approved') throw new Error('PARTNER_APPROVAL_REQUIRED');
  const hash = partnerSubjectHash(subject, secret);
  if (hash === partnerHash) throw new Error('PARTNER_SELF_REFERRAL');
  const record = { code: normalizedCode, capturedAt: now.toISOString(), commissionEligible: false };
  const stored = await redis.set(attributionKey(hash), JSON.stringify(record), { nx: true });
  return { recorded: stored === 'OK', code: normalizedCode, commissionEligible: false };
}
