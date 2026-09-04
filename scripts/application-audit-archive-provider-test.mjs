import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { buildApplicationAuditHeadExport } from '../lib/application-audit-head-export.js';
import {
  applicationAuditArchiveConfiguration, archiveApplicationAuditHeadExport,
  publicApplicationAuditArchiveConfiguration, verifyApplicationAuditArchiveAcknowledgement,
} from '../lib/application-audit-archive-provider.js';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function signAcknowledgement(value, secret) {
  const { ackSignature: _ignored, ...payload } = value;
  return createHmac('sha256', secret).update(`audit-archive-ack.v1.${digest(payload)}`).digest('hex');
}

const exportSecret = 'audit-export-provider-test-secret'.padEnd(48, 'x');
const ackSecret = 'audit-archive-acknowledgement-secret'.padEnd(48, 'x');
const env = {
  JOB_AGENT_AUDIT_ARCHIVE_ENABLED: 'true', JOB_AGENT_AUDIT_ARCHIVE_APPROVED: 'true',
  JOB_AGENT_AUDIT_ARCHIVE_APPROVAL_VERSION: 'archive-approval-v1',
  JOB_AGENT_AUDIT_ARCHIVE_CONTRACT_VERSION: 'archive-contract-v1',
  JOB_AGENT_AUDIT_ARCHIVE_LEGAL_HOLD_POLICY_VERSION: 'legal-hold-v1',
  JOB_AGENT_AUDIT_ARCHIVE_URL: 'https://audit-archive.example.test/v1/heads',
  JOB_AGENT_AUDIT_ARCHIVE_ALLOWED_HOSTS: 'audit-archive.example.test',
  JOB_AGENT_AUDIT_ARCHIVE_BEARER_TOKEN: 'archive-bearer-token'.padEnd(48, 'x'),
  JOB_AGENT_AUDIT_ARCHIVE_ACK_SECRET: ackSecret,
  JOB_AGENT_AUDIT_ARCHIVE_RETENTION_DAYS: '365', JOB_AGENT_AUDIT_EXPORT_SECRET: exportSecret,
};
const configuration = applicationAuditArchiveConfiguration(env);
assert.equal(configuration.ready, true);
assert.deepEqual(publicApplicationAuditArchiveConfiguration(configuration), {
  ready: true, enabled: true, provider: 'retention-locked-https', approvalVersion: 'archive-approval-v1',
  contractVersion: 'archive-contract-v1', legalHoldPolicyVersion: 'legal-hold-v1', retentionDays: 365,
  contentFree: true, containsCandidateValues: false,
});
assert.equal(applicationAuditArchiveConfiguration({ ...env, JOB_AGENT_AUDIT_ARCHIVE_ENABLED: 'false' }).reason, 'disabled');
assert.equal(applicationAuditArchiveConfiguration({ ...env, JOB_AGENT_AUDIT_ARCHIVE_APPROVED: 'false' }).reason, 'approval-required');
assert.equal(applicationAuditArchiveConfiguration({ ...env, JOB_AGENT_AUDIT_ARCHIVE_URL: 'https://different.example.test/v1/heads' }).reason, 'endpoint-invalid');
assert.equal(applicationAuditArchiveConfiguration({ ...env, JOB_AGENT_AUDIT_ARCHIVE_URL: 'https://audit-archive.example.test/v1/heads?secret=value' }).reason, 'endpoint-invalid');
assert.equal(applicationAuditArchiveConfiguration({ ...env, JOB_AGENT_AUDIT_ARCHIVE_RETENTION_DAYS: '364' }).reason, 'retention-invalid');

const now = new Date('2026-08-30T16:00:00.000Z');
const auditHeadExport = buildApplicationAuditHeadExport({
  audit: { sessionId: 'session_archive_fixture', retentionDays: 365, count: 3, headHash: 'a'.repeat(64), headSignature: 'b'.repeat(64), integrityVerified: true },
  exportSigningSecret: exportSecret, now,
});
let providerCalls = 0;
const fetchImpl = async (url, options) => {
  providerCalls += 1;
  assert.equal(url, env.JOB_AGENT_AUDIT_ARCHIVE_URL);
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, `Bearer ${env.JOB_AGENT_AUDIT_ARCHIVE_BEARER_TOKEN}`);
  assert.equal(options.headers['Idempotency-Key'], `audit-${auditHeadExport.digest}`);
  const request = JSON.parse(options.body);
  assert.equal(request.auditHeadExport.digest, auditHeadExport.digest);
  assert.equal(request.contentFree, true);
  assert.equal(request.containsCandidateValues, false);
  assert.doesNotMatch(options.body, /candidate@example|password|otp|captcha/i);
  assert.equal(options.headers['X-1stStep-Archive-Digest'], digest(request));
  const acknowledgement = {
    schemaVersion: 1, status: 'locked', contractVersion: configuration.contractVersion,
    objectVersion: 'audit-object:v1:fixture-001', storedDigest: auditHeadExport.digest,
    retainUntil: request.retainUntil, lockedAt: now.toISOString(), retentionLockVerified: true,
    contentFree: true, containsCandidateValues: false,
  };
  acknowledgement.ackSignature = signAcknowledgement(acknowledgement, ackSecret);
  return { ok: true, text: async () => JSON.stringify(acknowledgement) };
};
const archived = await archiveApplicationAuditHeadExport({ auditHeadExport, configuration, now, fetchImpl });
assert.equal(archived.archived, true);
assert.equal(archived.retentionLockVerified, true);
assert.equal(archived.objectVersion, 'audit-object:v1:fixture-001');
assert.equal(providerCalls, 1);
const retried = await archiveApplicationAuditHeadExport({ auditHeadExport, configuration, now: new Date(now.getTime() + 60_000), fetchImpl });
assert.equal(retried.idempotencyKey, archived.idempotencyKey);
assert.equal(retried.objectVersion, archived.objectVersion);
assert.equal(retried.retainUntil, archived.retainUntil);
assert.equal(providerCalls, 2);

const badSignature = {
  schemaVersion: 1, status: 'locked', contractVersion: configuration.contractVersion,
  objectVersion: 'audit-object:v1:fixture-001', storedDigest: auditHeadExport.digest,
  retainUntil: new Date(now.getTime() + 365 * 86_400_000).toISOString(), lockedAt: now.toISOString(),
  retentionLockVerified: true, contentFree: true, containsCandidateValues: false, ackSignature: '0'.repeat(64),
};
assert.equal(verifyApplicationAuditArchiveAcknowledgement(badSignature, {
  configuration, expectedDigest: auditHeadExport.digest, expectedRetainUntil: badSignature.retainUntil, now,
}).code, 'AUDIT_ARCHIVE_ACK_SIGNATURE');
await assert.rejects(() => archiveApplicationAuditHeadExport({
  auditHeadExport: { ...auditHeadExport, count: 4 }, configuration, now, fetchImpl,
}), /AUDIT_ARCHIVE_EXPORT_INVALID/);
await assert.rejects(() => archiveApplicationAuditHeadExport({
  auditHeadExport, configuration, now, fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify(badSignature) }),
}), /AUDIT_ARCHIVE_ACK_SIGNATURE/);
assert.equal((await archiveApplicationAuditHeadExport({ auditHeadExport, configuration: null, now, fetchImpl })).archived, false);
let budgetBlockedProviderCalls = 0;
await assert.rejects(() => archiveApplicationAuditHeadExport({
  auditHeadExport, configuration, env: { ...env, VERCEL_ENV: 'production' }, now,
  fetchImpl: async () => { budgetBlockedProviderCalls += 1; return fetchImpl(); },
}), /MONETARY_SPEND_CONTROL_NOT_CONFIGURED/);
assert.equal(budgetBlockedProviderCalls, 0);

console.log('Exact-host content-free audit archive, idempotency, retention scope, signed lock acknowledgement, and fail-closed tests passed.');
