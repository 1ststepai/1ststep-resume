import { createHash } from 'node:crypto';
import { Webhook } from 'svix';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { jobAgentTenantId } from './job-agent-run-store.js';

const BASE = '1ststep:job-agent-email-suppression:v1';
const EVENT_TTL_SECONDS = 30 * 24 * 60 * 60;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const TENANT_ID = /^[a-f0-9]{40}$/;
const SUPPRESSED_EVENTS = new Map([
  ['email.bounced', 'permanent-bounce'],
  ['email.complained', 'spam-complaint'],
]);
export const JOB_AGENT_EMAIL_SUPPRESSION_CONTRACT_VERSION = 'resend-suppression-v1';

const STORE_SCRIPT = `
if redis.call('EXISTS', KEYS[2]) == 1 then return {'replayed'} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[2], '1', 'EX', ARGV[3], 'NX')
return {'suppressed'}
`;

function suppressionKey(tenantId) { return `${BASE}:tenant:${tenantId}`; }
function eventKey(eventId) { return `${BASE}:event:${createHash('sha256').update(String(eventId)).digest('hex')}`; }
function decode(raw) { return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; }
function senderAddress(value) {
  const source = String(value || '').trim().toLowerCase();
  const match = /<([^<>]+)>$/.exec(source);
  return String(match?.[1] || source).trim();
}
function eventTags(value) {
  if (Array.isArray(value)) return Object.fromEntries(value.filter(item => item && typeof item === 'object').map(item => [String(item.name || ''), String(item.value || '')]));
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [String(key), String(item)])) : {};
}

export function jobAgentEmailSuppressionConfiguration(env = process.env) {
  const webhookSecret = String(env.RESEND_WEBHOOK_SECRET || '');
  const retentionDays = Number(env.JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS);
  if (!/^whsec_[A-Za-z0-9_+/=-]{32,}$/.test(webhookSecret)) {
    return { ready: false, provider: 'resend', contractVersion: JOB_AGENT_EMAIL_SUPPRESSION_CONTRACT_VERSION, reason: 'webhook-secret-not-configured', retentionDays: null };
  }
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 30 || retentionDays > 730) {
    return { ready: false, provider: 'resend', contractVersion: JOB_AGENT_EMAIL_SUPPRESSION_CONTRACT_VERSION, reason: 'retention-not-configured', retentionDays: null };
  }
  return { ready: true, provider: 'resend', contractVersion: JOB_AGENT_EMAIL_SUPPRESSION_CONTRACT_VERSION, webhookSecret, retentionDays, ttlSeconds: retentionDays * 24 * 60 * 60 };
}

export function verifyJobAgentResendWebhook({ rawBody, headers = {}, env = process.env }) {
  const configuration = jobAgentEmailSuppressionConfiguration(env);
  if (!configuration.ready) throw new Error('RESEND_WEBHOOK_SUPPRESSION_NOT_CONFIGURED');
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  if (!payload.length || payload.length > 128 * 1024) throw new Error('RESEND_WEBHOOK_PAYLOAD_INVALID');
  const required = {
    'svix-id': String(headers['svix-id'] || ''),
    'svix-timestamp': String(headers['svix-timestamp'] || ''),
    'svix-signature': String(headers['svix-signature'] || ''),
  };
  if (Object.values(required).some(value => !value)) throw new Error('RESEND_WEBHOOK_SIGNATURE_INVALID');
  try { return new Webhook(configuration.webhookSecret).verify(payload, required); }
  catch { throw new Error('RESEND_WEBHOOK_SIGNATURE_INVALID'); }
}

export function normalizeJobAgentSuppressionEvent(event, { eventId, partitionSecret, env = process.env } = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('RESEND_WEBHOOK_EVENT_INVALID');
  const reason = SUPPRESSED_EVENTS.get(String(event.type || ''));
  if (!reason) return { ignored: true, reason: 'event-type-not-suppressing' };
  const tags = eventTags(event.data?.tags);
  if (tags.product !== 'job_agent_needs_you') return { ignored: true, reason: 'different-product' };
  const recipients = Array.isArray(event.data?.to) ? event.data.to.map(value => String(value || '').trim().toLowerCase()).filter(Boolean) : [];
  if (recipients.length !== 1 || !EMAIL.test(recipients[0])) throw new Error('RESEND_WEBHOOK_RECIPIENT_INVALID');
  const tenantId = jobAgentTenantId(recipients[0], partitionSecret);
  if (!TENANT_ID.test(tags.tenant_id || '') || tags.tenant_id !== tenantId) throw new Error('RESEND_WEBHOOK_TENANT_MISMATCH');
  if (senderAddress(event.data?.from) !== senderAddress(env.RESEND_FROM) || !EMAIL.test(senderAddress(env.RESEND_FROM))) throw new Error('RESEND_WEBHOOK_SENDER_MISMATCH');
  const createdAt = new Date(String(event.created_at || ''));
  if (!Number.isFinite(createdAt.getTime())) throw new Error('RESEND_WEBHOOK_TIMESTAMP_INVALID');
  if (!String(eventId || '') || String(eventId).length > 160) throw new Error('RESEND_WEBHOOK_EVENT_ID_INVALID');
  return {
    ignored: false, tenantId, subject: recipients[0], reason, eventCreatedAt: createdAt.toISOString(),
    providerReferenceHash: createHash('sha256').update(String(event.data?.email_id || '')).digest('hex'),
  };
}

export async function recordJobAgentEmailSuppression({ redis, dataEncryptionKey, event, eventId, partitionSecret, env = process.env, now = new Date() }) {
  const configuration = jobAgentEmailSuppressionConfiguration(env);
  if (!configuration.ready) throw new Error('RESEND_WEBHOOK_SUPPRESSION_NOT_CONFIGURED');
  const normalized = normalizeJobAgentSuppressionEvent(event, { eventId, partitionSecret, env });
  if (normalized.ignored) return { status: 'ignored', reason: normalized.reason, storesRecipient: false };
  const key = suppressionKey(normalized.tenantId);
  const at = new Date(now);
  if (!Number.isFinite(at.getTime())) throw new Error('A valid suppression timestamp is required.');
  const payload = {
    schemaVersion: 1, tenantId: normalized.tenantId, provider: 'resend', reason: normalized.reason,
    eventCreatedAt: normalized.eventCreatedAt, suppressedAt: at.toISOString(), providerReferenceHash: normalized.providerReferenceHash,
  };
  const record = { tenantId: normalized.tenantId, envelope: encryptJsonEnvelope(payload, { dataEncryptionKey, aad: key }), updatedAt: at.toISOString() };
  const response = await redis.eval(STORE_SCRIPT, [key, eventKey(eventId)], [JSON.stringify(record), String(configuration.ttlSeconds), String(EVENT_TTL_SECONDS)]);
  const status = Array.isArray(response) ? response[0] : 'error';
  if (!['suppressed', 'replayed'].includes(status)) throw new Error('RESEND_WEBHOOK_SUPPRESSION_NOT_STORED');
  return { status, reason: normalized.reason, tenantId: normalized.tenantId, storesRecipient: false };
}

export async function readJobAgentEmailSuppression({ redis, tenantId, dataEncryptionKey }) {
  if (!TENANT_ID.test(String(tenantId || ''))) return null;
  const key = suppressionKey(tenantId);
  const record = decode(await redis.get(key));
  if (!record) return null;
  if (record.tenantId !== tenantId) throw new Error('Email suppression tenant mismatch.');
  const payload = decryptJsonEnvelope(record.envelope, { dataEncryptionKey, aad: key });
  if (payload?.schemaVersion !== 1 || payload.tenantId !== tenantId || payload.provider !== 'resend' || !SUPPRESSED_EVENTS.has(payload.reason === 'permanent-bounce' ? 'email.bounced' : payload.reason === 'spam-complaint' ? 'email.complained' : '')) {
    throw new Error('Encrypted email suppression record is invalid.');
  }
  return { suppressed: true, reason: payload.reason, suppressedAt: payload.suppressedAt, storesRecipient: false };
}

export async function deleteJobAgentEmailSuppression({ redis, tenantId }) {
  if (!TENANT_ID.test(String(tenantId || ''))) return { deleted: false };
  return { deleted: Number(await redis.del(suppressionKey(tenantId))) > 0 };
}
