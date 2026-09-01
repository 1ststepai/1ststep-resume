import { createHash, createHmac } from 'node:crypto';
import { validateApplicantVault } from './applicant-vault-domain.js';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';

const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,128}$/;
const VAULT_TTL_SECONDS = 365 * 24 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export function tenantVaultKey(subject, secret) {
  if (String(secret || '').length < 32) throw new Error('A 32-character tenant partition secret is required.');
  const tenantId = createHmac('sha256', secret).update(String(subject || '')).digest('hex').slice(0, 40);
  return `1ststep:vault:v1:${tenantId}`;
}

export function encryptApplicantVault(vault, { key, tenantKey }) {
  return encryptJsonEnvelope(validateApplicantVault(vault), { dataEncryptionKey: key, aad: tenantKey });
}

export function decryptApplicantVault(envelope, { key, tenantKey }) {
  return validateApplicantVault(decryptJsonEnvelope(envelope, { dataEncryptionKey: key, aad: tenantKey }));
}

function decode(raw) { return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; }

export async function readApplicantVault({ redis, subject, partitionSecret, dataEncryptionKey }) {
  const key = tenantVaultKey(subject, partitionSecret);
  const record = decode(await redis.get(key));
  if (!record) return { vault: null, version: 0, updatedAt: null };
  return { vault: decryptApplicantVault(record.envelope, { key: dataEncryptionKey, tenantKey: key }), version: Number(record.version) || 0, updatedAt: record.updatedAt || null };
}

export async function readApplicantVaultForTenant({ redis, tenantId, dataEncryptionKey }) {
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || ''))) throw new Error('A valid tenant partition is required.');
  const key = `1ststep:vault:v1:${tenantId}`;
  const record = decode(await redis.get(key));
  if (!record) return { vault: null, version: 0, updatedAt: null };
  return { vault: decryptApplicantVault(record.envelope, { key: dataEncryptionKey, tenantKey: key }), version: Number(record.version) || 0, updatedAt: record.updatedAt || null };
}

export async function deleteApplicantVault({ redis, subject, partitionSecret }) {
  await redis.del(tenantVaultKey(subject, partitionSecret));
  return { ok: true, deleted: true };
}

const CAS_SCRIPT = `
local replay = redis.call('GET', KEYS[2])
if replay then return {'replayed', replay} end
local raw = redis.call('GET', KEYS[1])
local current = 0
if raw then current = tonumber(cjson.decode(raw).version) or 0 end
if current ~= tonumber(ARGV[1]) then return {'conflict', tostring(current)} end
redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[5], 'NX')
return {'saved', ARGV[2]}
`;

export async function saveApplicantVault({ redis, subject, partitionSecret, dataEncryptionKey, vault, expectedVersion, idempotencyKey, now = new Date() }) {
  if (!SAFE_IDEMPOTENCY_KEY.test(String(idempotencyKey || ''))) throw new Error('A safe Idempotency-Key is required.');
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('A non-negative expected version is required.');
  const safeVault = validateApplicantVault(vault);
  const key = tenantVaultKey(subject, partitionSecret);
  const version = expectedVersion + 1;
  const updatedAt = now.toISOString();
  const record = JSON.stringify({ version, updatedAt, envelope: encryptApplicantVault(safeVault, { key: dataEncryptionKey, tenantKey: key }) });
  const idemHash = createHash('sha256').update(idempotencyKey).digest('hex');
  const result = await redis.eval(CAS_SCRIPT, [key, `${key}:idem:${idemHash}`], [String(expectedVersion), String(version), record, String(VAULT_TTL_SECONDS), String(IDEMPOTENCY_TTL_SECONDS)]);
  const [status, resultVersion] = Array.isArray(result) ? result : ['error', '0'];
  if (status === 'conflict') return { ok: false, conflict: true, version: Number(resultVersion) || 0 };
  if (!['saved', 'replayed'].includes(status)) throw new Error('Applicant vault write failed.');
  return { ok: true, replayed: status === 'replayed', version: Number(resultVersion), updatedAt };
}
