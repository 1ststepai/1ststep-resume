import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { verifyApplicationAuditHeadExport } from './application-audit-head-export.js';
import { reserveConfiguredJobAgentSpend, settleConfiguredJobAgentSpend } from './job-agent-spend-ledger.js';

const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
const SAFE_OBJECT_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:/+=-]{2,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ACK_KEYS = Object.freeze([
  'schemaVersion', 'status', 'contractVersion', 'objectVersion', 'storedDigest', 'retainUntil',
  'lockedAt', 'retentionLockVerified', 'contentFree', 'containsCandidateValues', 'ackSignature',
]);
export const APPLICATION_AUDIT_ARCHIVE_PROVIDER = 'retention-locked-https';

function enabled(value) { return String(value || '').toLowerCase() === 'true'; }
function allowedHosts(value) { return new Set(String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean)); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function exactHex(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ''), 'hex');
  const right = Buffer.from(String(rightValue || ''), 'hex');
  return left.length === 32 && right.length === 32 && timingSafeEqual(left, right);
}
function acknowledgementPayload(value) {
  return {
    schemaVersion: value.schemaVersion, status: value.status, contractVersion: value.contractVersion,
    objectVersion: value.objectVersion, storedDigest: value.storedDigest, retainUntil: value.retainUntil,
    lockedAt: value.lockedAt, retentionLockVerified: value.retentionLockVerified,
    contentFree: value.contentFree, containsCandidateValues: value.containsCandidateValues,
  };
}
function acknowledgementSignature(value, secret) {
  return createHmac('sha256', secret).update(`audit-archive-ack.v1.${digest(acknowledgementPayload(value))}`).digest('hex');
}

export function applicationAuditArchiveConfiguration(env = process.env) {
  const disabled = reason => ({ ready: false, enabled: false, provider: APPLICATION_AUDIT_ARCHIVE_PROVIDER, reason });
  if (!enabled(env.JOB_AGENT_AUDIT_ARCHIVE_ENABLED)) return disabled('disabled');
  if (!enabled(env.JOB_AGENT_AUDIT_ARCHIVE_APPROVED)) return disabled('approval-required');
  const approvalVersion = String(env.JOB_AGENT_AUDIT_ARCHIVE_APPROVAL_VERSION || '').trim();
  const contractVersion = String(env.JOB_AGENT_AUDIT_ARCHIVE_CONTRACT_VERSION || '').trim();
  const legalHoldPolicyVersion = String(env.JOB_AGENT_AUDIT_ARCHIVE_LEGAL_HOLD_POLICY_VERSION || '').trim();
  const bearerToken = String(env.JOB_AGENT_AUDIT_ARCHIVE_BEARER_TOKEN || '');
  const acknowledgementSecret = String(env.JOB_AGENT_AUDIT_ARCHIVE_ACK_SECRET || '');
  const exportSigningSecret = String(env.JOB_AGENT_AUDIT_EXPORT_SECRET || '');
  const retentionDays = Number(env.JOB_AGENT_AUDIT_ARCHIVE_RETENTION_DAYS);
  let url;
  try { url = new URL(String(env.JOB_AGENT_AUDIT_ARCHIVE_URL || '').trim()); } catch { return disabled('endpoint-invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search
    || !allowedHosts(env.JOB_AGENT_AUDIT_ARCHIVE_ALLOWED_HOSTS).has(url.hostname.toLowerCase())) return disabled('endpoint-invalid');
  if (![approvalVersion, contractVersion, legalHoldPolicyVersion].every(value => SAFE_VERSION.test(value))) return disabled('policy-version-invalid');
  if (bearerToken.length < 32 || acknowledgementSecret.length < 32 || exportSigningSecret.length < 32) return disabled('secret-not-configured');
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 365 || retentionDays > 3650) return disabled('retention-invalid');
  return {
    ready: true, enabled: true, provider: APPLICATION_AUDIT_ARCHIVE_PROVIDER, reason: null,
    url: url.toString(), bearerToken, acknowledgementSecret, exportSigningSecret,
    approvalVersion, contractVersion, legalHoldPolicyVersion, retentionDays,
  };
}

export function publicApplicationAuditArchiveConfiguration(configuration) {
  return {
    ready: configuration?.ready === true, enabled: configuration?.enabled === true,
    provider: APPLICATION_AUDIT_ARCHIVE_PROVIDER,
    approvalVersion: configuration?.ready ? configuration.approvalVersion : null,
    contractVersion: configuration?.ready ? configuration.contractVersion : null,
    legalHoldPolicyVersion: configuration?.ready ? configuration.legalHoldPolicyVersion : null,
    retentionDays: configuration?.ready ? configuration.retentionDays : null,
    contentFree: true, containsCandidateValues: false,
  };
}

export function verifyApplicationAuditArchiveAcknowledgement(value, { configuration, expectedDigest, expectedRetainUntil, now = new Date() } = {}) {
  const failed = code => ({ verified: false, code, retentionLockVerified: false });
  if (!configuration?.ready) return failed('AUDIT_ARCHIVE_NOT_CONFIGURED');
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!input || Object.keys(input).sort().join('|') !== [...ACK_KEYS].sort().join('|')) return failed('AUDIT_ARCHIVE_ACK_SCHEMA');
  if (input.schemaVersion !== 1 || input.status !== 'locked' || input.contractVersion !== configuration.contractVersion
    || !SAFE_OBJECT_VERSION.test(String(input.objectVersion || '')) || !SHA256.test(String(input.storedDigest || ''))
    || input.retentionLockVerified !== true || input.contentFree !== true || input.containsCandidateValues !== false) return failed('AUDIT_ARCHIVE_ACK_CONTENT');
  if (input.storedDigest !== expectedDigest || input.retainUntil !== expectedRetainUntil) return failed('AUDIT_ARCHIVE_ACK_SCOPE');
  const lockedAt = new Date(String(input.lockedAt || ''));
  const retainUntil = new Date(String(input.retainUntil || ''));
  const current = new Date(now);
  if (![lockedAt, retainUntil, current].every(date => Number.isFinite(date.getTime()))
    || lockedAt.getTime() > current.getTime() + 5 * 60_000 || retainUntil.getTime() <= current.getTime()) return failed('AUDIT_ARCHIVE_ACK_TIME');
  if (!exactHex(input.ackSignature, acknowledgementSignature(input, configuration.acknowledgementSecret))) return failed('AUDIT_ARCHIVE_ACK_SIGNATURE');
  return {
    verified: true, code: null, provider: APPLICATION_AUDIT_ARCHIVE_PROVIDER,
    objectVersion: input.objectVersion, storedDigest: input.storedDigest, retainUntil: input.retainUntil,
    lockedAt: input.lockedAt, retentionLockVerified: true, contentFree: true, containsCandidateValues: false,
  };
}

export async function archiveApplicationAuditHeadExport({ auditHeadExport, configuration, env = process.env, redis, now = new Date(), fetchImpl = fetch }) {
  if (!configuration?.ready) return { archived: false, reason: 'not-configured', retentionLockVerified: false };
  const exportVerification = verifyApplicationAuditHeadExport(auditHeadExport, configuration.exportSigningSecret);
  if (!exportVerification.verified) throw new Error('AUDIT_ARCHIVE_EXPORT_INVALID');
  const exportedAt = new Date(auditHeadExport.exportedAt);
  const retainUntil = new Date(exportedAt.getTime() + configuration.retentionDays * 86_400_000).toISOString();
  const request = {
    schemaVersion: 1, type: '1ststep-application-audit-head-archive', provider: APPLICATION_AUDIT_ARCHIVE_PROVIDER,
    contractVersion: configuration.contractVersion, legalHoldPolicyVersion: configuration.legalHoldPolicyVersion,
    retainUntil, auditHeadExport, contentFree: true, containsCandidateValues: false,
  };
  const requestDigest = digest(request);
  const operationId = `audit-archive:${auditHeadExport.digest}`;
  const spend = await reserveConfiguredJobAgentSpend({ category: 'object-storage', operationId, env, redis, now });
  if (!spend.ok) throw Object.assign(new Error(spend.code || 'MONETARY_SPEND_CONTROL_REJECTED'), { code: spend.code, status: spend.status });
  let providerCallStarted = false;
  let result;
  try {
    providerCallStarted = true;
    const response = await fetchImpl(configuration.url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: `Bearer ${configuration.bearerToken}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `audit-${auditHeadExport.digest}`, 'X-1stStep-Archive-Digest': requestDigest,
      },
      body: JSON.stringify(request),
    });
    if (!response?.ok) throw new Error('AUDIT_ARCHIVE_PROVIDER_REJECTED');
    const raw = await response.text();
    if (Buffer.byteLength(raw) > 32 * 1024) throw new Error('AUDIT_ARCHIVE_ACK_TOO_LARGE');
    let acknowledgement;
    try { acknowledgement = JSON.parse(raw); } catch { throw new Error('AUDIT_ARCHIVE_ACK_INVALID'); }
    const verification = verifyApplicationAuditArchiveAcknowledgement(acknowledgement, {
      configuration, expectedDigest: auditHeadExport.digest, expectedRetainUntil: retainUntil, now,
    });
    if (!verification.verified) throw new Error(verification.code);
    result = { archived: true, ...verification, requestDigest, idempotencyKey: `audit-${auditHeadExport.digest}` };
  } finally {
    const settlement = await settleConfiguredJobAgentSpend({ control: spend.control, providerCallStarted });
    if (settlement?.ok === false) throw new Error('AUDIT_ARCHIVE_SPEND_SETTLEMENT_FAILED');
  }
  return result;
}
