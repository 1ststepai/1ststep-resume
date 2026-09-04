import { createHmac, randomBytes } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { dataEncryptionKeyringFromEnvironment, decryptJsonEnvelope, encryptJsonEnvelope, normalizeDataEncryptionKeyring } from './data-encryption-keyring.js';

const SESSION_TOKEN = /^s1\.[A-Za-z0-9_-]{43}$/;
const EMAIL = /^[^\s@|]{1,128}@[^\s@|]{1,190}$/;
const TIERS = new Set(['free', 'essential', 'complete']);
const ENTITLEMENTS = new Set(['job-agent-controlled-beta', 'job-agent']);
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_SESSIONS_PER_SUBJECT = 20;
const redisClients = new Map();

function safeSubject(value) {
  const subject = String(value || '').trim().toLowerCase();
  if (!EMAIL.test(subject)) throw new Error('A valid signed-user subject is required.');
  return subject;
}

function safeTier(value) {
  const tier = String(value || '');
  if (!TIERS.has(tier)) throw new Error('A valid signed-user tier is required.');
  return tier;
}

function safeEntitlements(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Signed-user entitlements must be an array.');
  const normalized = [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
  if (!normalized.every(item => ENTITLEMENTS.has(item))) throw new Error('A signed-user entitlement is not recognized.');
  return normalized.sort();
}

function sessionKey(token, partitionSecret) {
  if (!SESSION_TOKEN.test(String(token || '')) || String(partitionSecret || '').length < 32) return '';
  const id = createHmac('sha256', partitionSecret).update(`session|${token}`).digest('hex');
  return `1ststep:user-session:v1:${id}`;
}

function subjectIndexKey(subject, partitionSecret) {
  const id = createHmac('sha256', partitionSecret).update(`subject|${safeSubject(subject)}`).digest('hex').slice(0, 48);
  return `1ststep:user-session-index:v1:${id}`;
}

function encryptSession(session, { dataEncryptionKey, aad }) {
  return encryptJsonEnvelope(session, { dataEncryptionKey, aad });
}

function decryptSession(envelope, { dataEncryptionKey, aad }) {
  return decryptJsonEnvelope(envelope, { dataEncryptionKey, aad });
}

function decode(raw) { return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; }

const CREATE_SCRIPT = `
local members = redis.call('SMEMBERS', KEYS[2])
for _, key in ipairs(members) do
  if redis.call('EXISTS', key) == 0 then redis.call('SREM', KEYS[2], key) end
end
if redis.call('SCARD', KEYS[2]) >= tonumber(ARGV[3]) then return 'limit' end
local created = redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2], 'NX')
if not created then return 'collision' end
redis.call('SADD', KEYS[2], KEYS[1])
redis.call('EXPIRE', KEYS[2], ARGV[2])
return 'created'
`;

const DELETE_SCRIPT = `
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[2], KEYS[1])
return 1
`;

const REVOKE_ALL_SCRIPT = `
local members = redis.call('SMEMBERS', KEYS[1])
for _, key in ipairs(members) do redis.call('DEL', key) end
redis.call('DEL', KEYS[1])
return #members
`;

export function userSessionRuntimeConfiguration(env = process.env) {
  const url = String(env.UPSTASH_REDIS_REST_URL || '');
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || '');
  const partitionSecret = String(env.RATE_LIMIT_HASH_SECRET || env.TIER_SECRET || '');
  if (!url || !token || partitionSecret.length < 32) return null;
  let dataEncryptionKey;
  try { dataEncryptionKey = dataEncryptionKeyringFromEnvironment(env); normalizeDataEncryptionKeyring(dataEncryptionKey); } catch { return null; }
  const cacheKey = `${url}|${token.slice(-8)}`;
  if (!redisClients.has(cacheKey)) redisClients.set(cacheKey, new Redis({ url, token }));
  return { redis: redisClients.get(cacheKey), partitionSecret, dataEncryptionKey };
}

export async function createUserSession({ redis, subject, tier, entitlements = [], partitionSecret, dataEncryptionKey, now = new Date(), ttlSeconds = SESSION_TTL_SECONDS, maxSessions = MAX_SESSIONS_PER_SUBJECT }) {
  const normalizedSubject = safeSubject(subject);
  const normalizedTier = safeTier(tier);
  const normalizedEntitlements = safeEntitlements(entitlements);
  const ttl = Math.max(60, Math.min(SESSION_TTL_SECONDS, Number(ttlSeconds) || 0));
  const token = `s1.${randomBytes(32).toString('base64url')}`;
  const key = sessionKey(token, partitionSecret);
  const indexKey = subjectIndexKey(normalizedSubject, partitionSecret);
  const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
  const record = JSON.stringify({
    version: 1,
    envelope: encryptSession({ version: 2, subject: normalizedSubject, tier: normalizedTier, entitlements: normalizedEntitlements, createdAt: now.toISOString(), expiresAt }, { dataEncryptionKey, aad: key }),
  });
  const sessionLimit = Math.max(1, Math.min(100, Number(maxSessions) || MAX_SESSIONS_PER_SUBJECT));
  const result = await redis.eval(CREATE_SCRIPT, [key, indexKey], [record, String(ttl), String(sessionLimit)]);
  if (result === 'limit') throw new Error('Signed-user session limit reached. Sign out other devices before continuing.');
  if (result !== 'created') throw new Error('Could not create a unique signed-user session.');
  return { token, subject: normalizedSubject, tier: normalizedTier, entitlements: normalizedEntitlements, createdAt: now.toISOString(), expiresAt, maxAgeSeconds: ttl };
}

export async function readUserSession({ redis, token, partitionSecret, dataEncryptionKey, now = new Date() }) {
  const key = sessionKey(token, partitionSecret);
  if (!key) return null;
  try {
    const record = decode(await redis.get(key));
    if (!record) return null;
    const session = decryptSession(record.envelope, { dataEncryptionKey, aad: key });
    const subject = safeSubject(session.subject);
    const tier = safeTier(session.tier);
    const entitlements = safeEntitlements(session.entitlements);
    const expiresAt = new Date(session.expiresAt);
    if (![1, 2].includes(session.version) || !Number.isFinite(expiresAt.getTime()) || expiresAt <= now) {
      await redis.eval(DELETE_SCRIPT, [key, subjectIndexKey(subject, partitionSecret)], []).catch(() => false);
      return null;
    }
    return { subject, tier, entitlements, createdAt: session.createdAt, expiresAt: expiresAt.getTime(), sessionToken: token, authentication: 'opaque-session' };
  } catch {
    return null;
  }
}

export async function revokeUserSession({ redis, token, subject, partitionSecret }) {
  const key = sessionKey(token, partitionSecret);
  if (!key) return { revoked: false };
  const indexKey = subjectIndexKey(subject, partitionSecret);
  await redis.eval(DELETE_SCRIPT, [key, indexKey], []);
  return { revoked: true };
}

export async function revokeAllUserSessions({ redis, subject, partitionSecret }) {
  const count = await redis.eval(REVOKE_ALL_SCRIPT, [subjectIndexKey(subject, partitionSecret)], []);
  return { revoked: Number(count) || 0 };
}

export const USER_SESSION_TTL_SECONDS = SESSION_TTL_SECONDS;
