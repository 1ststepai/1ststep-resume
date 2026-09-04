import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { jobAgentTenantId } from './job-agent-run-store.js';
import { reserveConfiguredJobAgentSpend, settleConfiguredJobAgentSpend } from './job-agent-spend-ledger.js';
import { readDurableApplicationSessionForTenant } from './application-session-store.js';
import { deleteJobAgentEmailSuppression, jobAgentEmailSuppressionConfiguration, readJobAgentEmailSuppression } from './job-agent-email-suppression.js';

const BASE = '1ststep:job-agent-notification:v1';
const PREFERENCE_TTL_SECONDS = 365 * 24 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const DELIVERY_TTL_SECONDS = 30 * 24 * 60 * 60;
const LEASE_SECONDS = 90;
const MAX_ATTEMPTS = 4;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,128}$/;
const SAFE_ACTION_ID = /^[A-Za-z0-9:_-]{8,160}$/;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export const NEEDS_YOU_NOTIFICATION_CONSENT_VERSION = 'needs-you-email-v1';
const PREFERENCE_KEYS = new Set(['schemaVersion', 'enabled', 'channel', 'consentVersion', 'consentedAt', 'createdAt', 'updatedAt']);

const SAVE_SCRIPT = `
local replay = redis.call('GET', KEYS[2])
if replay then return {'replayed', replay} end
local raw = redis.call('GET', KEYS[1])
local current = 0
if raw then current = tonumber(cjson.decode(raw).version) or 0 end
if current ~= tonumber(ARGV[1]) then return {'conflict', tostring(current)} end
redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[5], 'NX')
redis.call('SADD', KEYS[3], KEYS[2])
redis.call('EXPIRE', KEYS[3], ARGV[4])
return {'saved', ARGV[2]}
`;

const ENQUEUE_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then return {'replayed'} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SADD', KEYS[2], KEYS[1])
redis.call('EXPIRE', KEYS[2], ARGV[2])
redis.call('ZADD', KEYS[3], ARGV[3], KEYS[1])
return {'queued'}
`;

const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) then return {'not_claimable'} end
if record.status ~= 'queued' and record.status ~= 'retry' and not (record.status == 'leased' and record.leaseUntil <= ARGV[7]) then return {'not_claimable'} end
record.version = record.version + 1
record.status = 'leased'
record.attempt = record.attempt + 1
record.leaseTokenHash = ARGV[2]
record.leaseUntil = ARGV[3]
record.updatedAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
redis.call('ZADD', KEYS[2], ARGV[6], KEYS[1])
return {'claimed', cjson.encode(record)}
`;

const COMPLETE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.status ~= 'leased' or record.leaseTokenHash ~= ARGV[1] then return {'lease_lost'} end
record.version = record.version + 1
record.status = 'accepted'
record.nextAttemptAt = ''
record.leaseTokenHash = ''
record.leaseUntil = ''
record.updatedAt = ARGV[2]
record.providerAcceptedAt = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[3])
redis.call('ZREM', KEYS[2], KEYS[1])
return {'accepted', cjson.encode(record)}
`;

const FAIL_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.status ~= 'leased' or record.leaseTokenHash ~= ARGV[1] then return {'lease_lost'} end
record.version = record.version + 1
record.status = ARGV[2]
record.nextAttemptAt = ARGV[3]
record.leaseTokenHash = ''
record.leaseUntil = ''
record.updatedAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
redis.call('ZREM', KEYS[2], KEYS[1])
if ARGV[2] == 'retry' then redis.call('ZADD', KEYS[2], ARGV[6], KEYS[1]) end
return {ARGV[2], cjson.encode(record)}
`;

function preferenceKey(tenantId) { return `${BASE}:tenant:${tenantId}:preference`; }
function idempotencyKey(tenantId, value) { return `${BASE}:tenant:${tenantId}:idem:${createHash('sha256').update(String(value)).digest('hex')}`; }
function deliveryIndexKey(tenantId) { return `${BASE}:tenant:${tenantId}:delivery-index`; }
function deliveryKey(tenantId, actionId) { return `${BASE}:tenant:${tenantId}:delivery:${createHash('sha256').update(String(actionId)).digest('hex')}`; }
function dueDeliveryKey() { return `${BASE}:due`; }
function decode(raw) { return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; }
function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) throw new Error('A valid notification-preference timestamp is required.');
  return date.toISOString();
}

export function validateJobAgentNotificationPreference(input) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? structuredClone(input) : null;
  if (!value || value.schemaVersion !== 1 || typeof value.enabled !== 'boolean' || value.channel !== 'email' || value.consentVersion !== NEEDS_YOU_NOTIFICATION_CONSENT_VERSION) throw new Error('A valid Needs You notification preference is required.');
  if (Object.keys(value).some(key => !PREFERENCE_KEYS.has(key))) throw new Error('Notification preferences cannot contain recipient or message data.');
  if (!Number.isFinite(new Date(value.createdAt).getTime()) || !Number.isFinite(new Date(value.updatedAt).getTime())) throw new Error('Valid notification-preference timestamps are required.');
  if (value.enabled && !Number.isFinite(new Date(value.consentedAt).getTime())) throw new Error('Email notification opt-in requires a consent timestamp.');
  if (!value.enabled && value.consentedAt !== null) throw new Error('Disabled email notifications cannot retain active consent.');
  return value;
}

function publicPreference(value) {
  return value ? {
    schemaVersion: 1, enabled: value.enabled, channel: 'email', consentVersion: value.consentVersion,
    consentedAt: value.consentedAt, updatedAt: value.updatedAt,
  } : null;
}

export function jobAgentNeedsYouNotificationConfiguration(env = process.env) {
  const enabled = String(env.JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) return { enabled: false, reason: 'disabled' };
  const apiKey = String(env.RESEND_API_KEY || '');
  const from = String(env.RESEND_FROM || '').trim();
  if (apiKey.length < 20 || !from || from.length > 200 || /[\r\n]/.test(from) || !from.includes('@')) return { enabled: false, reason: 'provider-not-configured' };
  const suppression = jobAgentEmailSuppressionConfiguration(env);
  if (!suppression.ready) return { enabled: false, reason: 'suppression-not-configured' };
  return { enabled: true, reason: null, apiKey, from, suppressionContractVersion: suppression.contractVersion };
}

export async function readJobAgentNotificationPreference({ redis, subject, partitionSecret, dataEncryptionKey }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const key = preferenceKey(tenantId);
  const record = decode(await redis.get(key));
  if (!record) return { preference: null, version: 0 };
  if (record.tenantId !== tenantId) throw new Error('Notification preference tenant mismatch.');
  const preference = validateJobAgentNotificationPreference(decryptJsonEnvelope(record.envelope, { dataEncryptionKey, aad: key }));
  return { preference: publicPreference(preference), version: Number(record.version) || 0 };
}

export async function saveJobAgentNotificationPreference({ redis, subject, partitionSecret, dataEncryptionKey, enabled, expectedVersion, idempotencyKey: idem, now = new Date() }) {
  if (typeof enabled !== 'boolean') throw new Error('Notification preference enabled must be true or false.');
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('A non-negative notification-preference version is required.');
  if (!SAFE_IDEMPOTENCY_KEY.test(String(idem || ''))) throw new Error('A safe Idempotency-Key is required.');
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const key = preferenceKey(tenantId);
  const existingRecord = decode(await redis.get(key));
  const existing = existingRecord ? validateJobAgentNotificationPreference(decryptJsonEnvelope(existingRecord.envelope, { dataEncryptionKey, aad: key })) : null;
  const at = timestamp(now);
  const preference = validateJobAgentNotificationPreference({
    schemaVersion: 1, enabled, channel: 'email', consentVersion: NEEDS_YOU_NOTIFICATION_CONSENT_VERSION,
    consentedAt: enabled ? at : null, createdAt: existing?.createdAt || at, updatedAt: at,
  });
  const version = expectedVersion + 1;
  const record = { version, tenantId, envelope: encryptJsonEnvelope(preference, { dataEncryptionKey, aad: key }), updatedAt: at };
  const response = await redis.eval(SAVE_SCRIPT, [key, idempotencyKey(tenantId, idem), deliveryIndexKey(tenantId)], [
    String(expectedVersion), String(version), JSON.stringify(record), String(PREFERENCE_TTL_SECONDS), String(IDEMPOTENCY_TTL_SECONDS),
  ]);
  const [status, resultVersion] = Array.isArray(response) ? response : ['error', '0'];
  if (status === 'conflict') return { conflict: true, version: Number(resultVersion) || 0 };
  if (!['saved', 'replayed'].includes(status)) throw new Error('Notification preference could not be saved.');
  const stored = await readJobAgentNotificationPreference({ redis, subject, partitionSecret, dataEncryptionKey });
  return { ...stored, version: Number(resultVersion), replayed: status === 'replayed' };
}

export async function deleteJobAgentNotificationPreference({ redis, subject, partitionSecret }) {
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const index = deliveryIndexKey(tenantId);
  const tenantKeys = typeof redis.smembers === 'function' ? await redis.smembers(index) : [];
  const keys = [preferenceKey(tenantId), index, ...(tenantKeys || []).filter(value => {
    const key = String(value);
    return key.startsWith(`${BASE}:tenant:${tenantId}:delivery:`) || key.startsWith(`${BASE}:tenant:${tenantId}:idem:`);
  })];
  if (keys.length) {
    for (const key of keys.slice(2)) await redis.zrem(dueDeliveryKey(), key);
    await redis.del(...keys);
  }
  const suppression = await deleteJobAgentEmailSuppression({ redis, tenantId });
  return { deleted: true, auxiliaryRecordsDeleted: Math.max(0, keys.length - 2) + (suppression.deleted ? 1 : 0) };
}

export async function enqueueNeedsYouNotification({ redis, subject, partitionSecret, dataEncryptionKey, actionId, env = process.env, now = new Date() }) {
  const configuration = jobAgentNeedsYouNotificationConfiguration(env);
  if (!configuration.enabled) return { status: 'not-configured', reason: configuration.reason };
  if (!EMAIL.test(String(subject || '')) || !SAFE_ACTION_ID.test(String(actionId || ''))) return { status: 'skipped', reason: 'ineligible-identity-or-action' };
  const { preference } = await readJobAgentNotificationPreference({ redis, subject, partitionSecret, dataEncryptionKey });
  if (preference?.enabled !== true) return { status: 'skipped', reason: 'not-opted-in' };
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const key = deliveryKey(tenantId, actionId);
  const at = timestamp(now);
  const payload = { schemaVersion: 1, subject: String(subject).toLowerCase(), actionId: String(actionId) };
  const record = {
    version: 1, tenantId, status: 'queued', attempt: 0, nextAttemptAt: at, leaseTokenHash: '', leaseUntil: '',
    envelope: encryptJsonEnvelope(payload, { dataEncryptionKey, aad: key }), createdAt: at, updatedAt: at, providerAcceptedAt: '',
  };
  const index = deliveryIndexKey(tenantId);
  const response = await redis.eval(ENQUEUE_SCRIPT, [key, index, dueDeliveryKey()], [
    JSON.stringify(record), String(DELIVERY_TTL_SECONDS), String(now.getTime()),
  ]);
  if (!Array.isArray(response) || !['queued', 'replayed'].includes(response[0])) throw new Error('Needs You notification could not be queued.');
  if (response[0] === 'replayed') return { status: 'replayed' };
  return { status: 'queued', recipientActionVerified: false, externalApplicationExecution: false };
}

function publicDelivery(record) {
  return {
    status: record.status, attempt: Number(record.attempt) || 0, nextAttemptAt: record.nextAttemptAt || null,
    providerAcceptedAt: record.providerAcceptedAt || null, recipientActionVerified: false, externalApplicationExecution: false,
  };
}

export async function readNeedsYouNotificationOutbox({ redis, subject, partitionSecret, dataEncryptionKey, actionId }) {
  if (!EMAIL.test(String(subject || '')) || !SAFE_ACTION_ID.test(String(actionId || ''))) return null;
  const tenantId = jobAgentTenantId(subject, partitionSecret);
  const key = deliveryKey(tenantId, actionId);
  const record = decode(await redis.get(key));
  if (!record) return null;
  if (record.tenantId !== tenantId) throw new Error('Notification outbox tenant mismatch.');
  const payload = decryptJsonEnvelope(record.envelope, { dataEncryptionKey, aad: key });
  if (payload?.schemaVersion !== 1 || payload.subject !== String(subject).toLowerCase() || payload.actionId !== String(actionId)) throw new Error('Encrypted notification outbox identity is invalid.');
  return publicDelivery(record);
}

export async function claimNextNeedsYouNotification({ redis, dataEncryptionKey, now = new Date() }) {
  const keys = await redis.zrange(dueDeliveryKey(), 0, now.getTime(), { byScore: true, offset: 0, count: 10 });
  for (const key of keys || []) {
    if (!/^1ststep:job-agent-notification:v1:tenant:[a-f0-9]{40}:delivery:[a-f0-9]{64}$/.test(String(key))) { await redis.zrem(dueDeliveryKey(), key); continue; }
    const raw = decode(await redis.get(key));
    const expiredLease = raw?.status === 'leased' && raw.leaseUntil && new Date(raw.leaseUntil) <= now;
    if (!raw || (!['queued', 'retry'].includes(raw.status) && !expiredLease)) { await redis.zrem(dueDeliveryKey(), key); continue; }
    if (raw.nextAttemptAt && new Date(raw.nextAttemptAt) > now) continue;
    const leaseToken = randomBytes(32).toString('base64url');
    const leaseUntil = new Date(now.getTime() + LEASE_SECONDS * 1000);
    const response = await redis.eval(CLAIM_SCRIPT, [key, dueDeliveryKey()], [
      String(raw.version), createHash('sha256').update(leaseToken).digest('hex'), leaseUntil.toISOString(), timestamp(now), String(DELIVERY_TTL_SECONDS), String(leaseUntil.getTime()), timestamp(now),
    ]);
    if (!Array.isArray(response) || response[0] !== 'claimed') continue;
    const claimed = decode(response[1]);
    const payload = decryptJsonEnvelope(claimed.envelope, { dataEncryptionKey, aad: key });
    if (payload?.schemaVersion !== 1 || !EMAIL.test(String(payload.subject || '')) || !SAFE_ACTION_ID.test(String(payload.actionId || ''))) throw new Error('Encrypted notification outbox payload is invalid.');
    return { key, tenantId: claimed.tenantId, leaseToken, record: publicDelivery(claimed), subject: payload.subject, actionId: payload.actionId };
  }
  return null;
}

export async function completeNeedsYouNotification({ redis, key, leaseToken, now = new Date() }) {
  const leaseTokenHash = createHash('sha256').update(String(leaseToken || '')).digest('hex');
  const response = await redis.eval(COMPLETE_SCRIPT, [key, dueDeliveryKey()], [leaseTokenHash, timestamp(now), String(DELIVERY_TTL_SECONDS)]);
  return Array.isArray(response) && response[0] === 'accepted' ? publicDelivery(decode(response[1])) : null;
}

export async function failNeedsYouNotification({ redis, key, leaseToken, retryable = true, now = new Date() }) {
  const record = decode(await redis.get(key));
  const leaseTokenHash = createHash('sha256').update(String(leaseToken || '')).digest('hex');
  const expected = Buffer.from(String(record?.leaseTokenHash || ''));
  const actual = Buffer.from(leaseTokenHash);
  if (!record || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const terminal = retryable !== true || Number(record.attempt) >= MAX_ATTEMPTS;
  const delaySeconds = Math.min(6 * 60 * 60, 60 * (2 ** Math.max(0, Number(record.attempt) - 1)));
  const nextAttemptAt = terminal ? '' : new Date(now.getTime() + delaySeconds * 1000).toISOString();
  const status = terminal ? 'failed' : 'retry';
  const response = await redis.eval(FAIL_SCRIPT, [key, dueDeliveryKey()], [
    leaseTokenHash, status, nextAttemptAt, timestamp(now), String(DELIVERY_TTL_SECONDS), String(nextAttemptAt ? new Date(nextAttemptAt).getTime() : 0),
  ]);
  return Array.isArray(response) && response[0] === status ? publicDelivery(decode(response[1])) : null;
}

async function cancelNeedsYouNotification({ redis, key }) {
  await redis.zrem(dueDeliveryKey(), key);
  await redis.del(key);
  return { status: 'cancelled', recipientActionVerified: false, externalApplicationExecution: false };
}

export async function sendNeedsYouProviderEmail({ subject, tenantId, actionId, attempt = 1, redis, dataEncryptionKey, env = process.env, fetchImpl = fetch, now = new Date() }) {
  const configuration = jobAgentNeedsYouNotificationConfiguration(env);
  if (!configuration.enabled) return { status: 'not-configured', reason: configuration.reason };
  if (!EMAIL.test(String(subject || '')) || !/^[a-f0-9]{40}$/.test(String(tenantId || '')) || !SAFE_ACTION_ID.test(String(actionId || ''))) return { status: 'skipped', reason: 'ineligible-identity-or-action' };
  if (await readJobAgentEmailSuppression({ redis, tenantId, dataEncryptionKey })) {
    return { status: 'suppressed', reason: 'recipient-suppressed', retryable: false, recipientActionVerified: false, externalApplicationExecution: false };
  }
  let spend;
  try {
    const actionHash = createHash('sha256').update(String(actionId)).digest('hex');
    spend = await reserveConfiguredJobAgentSpend({ category: 'email', operationId: `email:${tenantId}:${actionHash}:${Math.max(1, Number(attempt) || 1)}`, env, redis, now });
    if (!spend.ok) return { status: 'failed', reason: spend.code, retryable: true, recipientActionVerified: false, externalApplicationExecution: false };
    let providerCallStarted = false;
    try {
      providerCallStarted = true;
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `needs-you-${createHash('sha256').update(`${tenantId}:${actionId}`).digest('hex')}`,
      },
      body: JSON.stringify({
        from: configuration.from, to: [subject], subject: 'Your 1stStep Job Agent needs you',
        text: 'Your Job Agent paused at a step that only you can complete. Open 1stStep.ai to review it. No application was submitted by this notification.',
        html: '<p>Your Job Agent paused at a step that only you can complete.</p><p><a href="https://app.1ststep.ai/concierge#needs-you">Open your Needs You queue</a></p><p>No application was submitted by this notification.</p>',
        tags: [{ name: 'product', value: 'job_agent_needs_you' }, { name: 'tenant_id', value: tenantId }],
      }),
    });
    if (!response.ok) return { status: 'failed', retryable: response.status === 408 || response.status === 429 || response.status >= 500, recipientActionVerified: false, externalApplicationExecution: false };
    return { status: 'provider-accepted', recipientActionVerified: false, externalApplicationExecution: false };
    } finally {
      await settleConfiguredJobAgentSpend({ control: spend.control, providerCallStarted }).catch(error => {
        console.error(JSON.stringify({ type: 'monetary-spend-settlement-error', category: 'email', name: error?.name || 'unknown' }));
      });
    }
  } catch {
    return { status: 'failed', retryable: true, recipientActionVerified: false, externalApplicationExecution: false };
  }
}

export async function processNextNeedsYouNotification({ redis, partitionSecret, dataEncryptionKey, env = process.env, fetchImpl = fetch, now = new Date() }) {
  if (!jobAgentNeedsYouNotificationConfiguration(env).enabled) return { status: 'not-configured' };
  const claimed = await claimNextNeedsYouNotification({ redis, dataEncryptionKey, now });
  if (!claimed) return null;
  if (claimed.actionId.startsWith('follow_up_')) {
    const sessionId = claimed.actionId.slice('follow_up_'.length);
    const session = await readDurableApplicationSessionForTenant({ redis, tenantId: claimed.tenantId, dataEncryptionKey, sessionId });
    const followUp = session?.postSubmission?.followUp;
    if (followUp?.status !== 'SCHEDULED' || !Number.isFinite(new Date(followUp.dueAt).getTime()) || new Date(followUp.dueAt) > now) {
      return cancelNeedsYouNotification({ redis, key: claimed.key });
    }
  }
  const { preference } = await readJobAgentNotificationPreference({ redis, subject: claimed.subject, partitionSecret, dataEncryptionKey });
  if (preference?.enabled !== true) return cancelNeedsYouNotification({ redis, key: claimed.key });
  const sent = await sendNeedsYouProviderEmail({ subject: claimed.subject, tenantId: claimed.tenantId, actionId: claimed.actionId, attempt: claimed.record.attempt, redis, dataEncryptionKey, env, fetchImpl, now });
  if (sent.status === 'provider-accepted') return { ...(await completeNeedsYouNotification({ redis, key: claimed.key, leaseToken: claimed.leaseToken, now })), status: 'provider-accepted' };
  if (sent.status === 'suppressed') return { ...(await cancelNeedsYouNotification({ redis, key: claimed.key })), status: 'suppressed' };
  const failed = await failNeedsYouNotification({ redis, key: claimed.key, leaseToken: claimed.leaseToken, retryable: sent.retryable === true, now });
  return { ...failed, status: failed?.status === 'failed' ? 'failed' : 'retry' };
}

export function newestUnnotifiedNeedsYouAction(session, previousSession = null) {
  if (session?.state !== 'Waiting for You') return null;
  const previousOpen = new Set((previousSession?.actions || []).filter(item => item.status === 'open').map(item => item.id));
  return (session.actions || []).find(item => item.status === 'open' && !previousOpen.has(item.id)) || null;
}
