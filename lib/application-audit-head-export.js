import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const HEX_64 = /^[a-f0-9]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
export const APPLICATION_AUDIT_HEAD_EXPORT_POLICY = 'job-agent-audit-head-365d-v1';
const EXPORT_KEYS = new Set([
  'schemaVersion', 'type', 'policy', 'recordReference', 'count', 'headHash', 'headSignature',
  'integrityVerified', 'ledgerRetentionDays', 'exportedAt', 'containsCandidateFieldValues',
  'includesTimelineEntries', 'externalApplicationExecution', 'retentionLockVerified', 'digest', 'exportSignature',
]);

function signingSecret(value) {
  const secret = String(value || '');
  if (secret.length < 32) throw new Error('A separate 32-character application-audit export secret is required.');
  return secret;
}

function canonicalPayload(value) {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    type: value.type,
    policy: value.policy,
    recordReference: value.recordReference,
    count: value.count,
    headHash: value.headHash,
    headSignature: value.headSignature,
    integrityVerified: value.integrityVerified,
    ledgerRetentionDays: value.ledgerRetentionDays,
    exportedAt: value.exportedAt,
    containsCandidateFieldValues: value.containsCandidateFieldValues,
    includesTimelineEntries: value.includesTimelineEntries,
    externalApplicationExecution: value.externalApplicationExecution,
    retentionLockVerified: value.retentionLockVerified,
  });
}

function safeEqualHex(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ''), 'hex');
  const right = Buffer.from(String(rightValue || ''), 'hex');
  return left.length === 32 && right.length === 32 && timingSafeEqual(left, right);
}

export function applicationAuditHeadExportConfiguration(env = process.env) {
  const secret = String(env.JOB_AGENT_AUDIT_EXPORT_SECRET || '');
  return secret.length >= 32 ? { secret } : null;
}

export function buildApplicationAuditHeadExport({ audit, exportSigningSecret, now = new Date() }) {
  const secret = signingSecret(exportSigningSecret);
  if (!audit || audit.integrityVerified !== true || !Number.isSafeInteger(Number(audit.count)) || Number(audit.count) < 1 || Number(audit.count) > 500) throw new Error('A verified bounded application-audit ledger is required.');
  if (!HEX_64.test(String(audit.headHash || '')) || !HEX_64.test(String(audit.headSignature || ''))) throw new Error('A valid signed application-audit head is required.');
  if (!String(audit.sessionId || '') || String(audit.sessionId).length > 200) throw new Error('A bounded application-audit record identity is required.');
  const ledgerRetentionDays = Number(audit.retentionDays || 365);
  if (!Number.isSafeInteger(ledgerRetentionDays) || ledgerRetentionDays < 1 || ledgerRetentionDays > 3650) throw new Error('A valid application-audit retention period is required.');
  const exportedAt = now.toISOString();
  const payload = {
    schemaVersion: 1,
    type: '1ststep-application-audit-head',
    policy: APPLICATION_AUDIT_HEAD_EXPORT_POLICY,
    recordReference: createHmac('sha256', secret).update(`application-audit|${String(audit.sessionId || '')}`).digest('hex'),
    count: Number(audit.count),
    headHash: audit.headHash,
    headSignature: audit.headSignature,
    integrityVerified: true,
    ledgerRetentionDays,
    exportedAt,
    containsCandidateFieldValues: false,
    includesTimelineEntries: false,
    externalApplicationExecution: false,
    retentionLockVerified: false,
  };
  const digest = createHash('sha256').update(canonicalPayload(payload)).digest('hex');
  const exportSignature = createHmac('sha256', secret).update(`audit-head-export.v1.${digest}`).digest('hex');
  return { ...payload, digest, exportSignature };
}

export function verifyApplicationAuditHeadExport(value, exportSigningSecret) {
  const secret = signingSecret(exportSigningSecret);
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!input || input.schemaVersion !== 1 || input.type !== '1ststep-application-audit-head' || input.policy !== APPLICATION_AUDIT_HEAD_EXPORT_POLICY) return { verified: false, code: 'AUDIT_HEAD_EXPORT_SCHEMA' };
  if (Object.keys(input).some(key => !EXPORT_KEYS.has(key))) return { verified: false, code: 'AUDIT_HEAD_EXPORT_CONTENT' };
  if (!HEX_64.test(String(input.recordReference || '')) || !HEX_64.test(String(input.headHash || '')) || !HEX_64.test(String(input.headSignature || '')) || !HEX_64.test(String(input.digest || '')) || !HEX_64.test(String(input.exportSignature || ''))) return { verified: false, code: 'AUDIT_HEAD_EXPORT_FORMAT' };
  if (!Number.isSafeInteger(Number(input.count)) || Number(input.count) < 1 || Number(input.count) > 500 || !Number.isSafeInteger(Number(input.ledgerRetentionDays)) || Number(input.ledgerRetentionDays) < 1 || Number(input.ledgerRetentionDays) > 3650) return { verified: false, code: 'AUDIT_HEAD_EXPORT_RANGE' };
  if (!ISO_UTC.test(String(input.exportedAt || '')) || !Number.isFinite(new Date(input.exportedAt).getTime())) return { verified: false, code: 'AUDIT_HEAD_EXPORT_TIMESTAMP' };
  if (input.integrityVerified !== true || input.containsCandidateFieldValues !== false || input.includesTimelineEntries !== false || input.externalApplicationExecution !== false || input.retentionLockVerified !== false) return { verified: false, code: 'AUDIT_HEAD_EXPORT_CONTENT' };
  const expectedDigest = createHash('sha256').update(canonicalPayload(input)).digest('hex');
  if (!safeEqualHex(input.digest, expectedDigest)) return { verified: false, code: 'AUDIT_HEAD_EXPORT_DIGEST' };
  const expectedSignature = createHmac('sha256', secret).update(`audit-head-export.v1.${expectedDigest}`).digest('hex');
  if (!safeEqualHex(input.exportSignature, expectedSignature)) return { verified: false, code: 'AUDIT_HEAD_EXPORT_SIGNATURE' };
  return { verified: true, code: null, recordReference: input.recordReference, count: input.count, headHash: input.headHash, exportedAt: input.exportedAt, policy: input.policy, containsCandidateFieldValues: false };
}
