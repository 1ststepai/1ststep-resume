import assert from 'node:assert/strict';
import { applicationAuditHeadExportConfiguration, buildApplicationAuditHeadExport, verifyApplicationAuditHeadExport } from '../lib/application-audit-head-export.js';

const secret = 'audit-export-fixture-secret'.padEnd(48, 'x');
const audit = {
  sessionId: 'application_candidate_private_fixture', retentionDays: 365, count: 2,
  headHash: 'a'.repeat(64), headSignature: 'b'.repeat(64), integrityVerified: true,
  entries: [{ event: { summary: 'Candidate private timeline detail must not export.' } }],
};
const exported = buildApplicationAuditHeadExport({ audit, exportSigningSecret: secret, now: new Date('2026-08-30T05:00:00.000Z') });
assert.equal(exported.containsCandidateFieldValues, false);
assert.equal(exported.includesTimelineEntries, false);
assert.equal(exported.externalApplicationExecution, false);
assert.equal(exported.retentionLockVerified, false);
assert.equal('entries' in exported, false);
assert.equal('sessionId' in exported, false);
assert.match(exported.recordReference, /^[a-f0-9]{64}$/);
assert.equal(verifyApplicationAuditHeadExport(exported, secret).verified, true);
assert.doesNotMatch(JSON.stringify(exported), /candidate|private|timeline|application_candidate/);

for (const [field, value, code] of [
  ['count', 3, 'AUDIT_HEAD_EXPORT_DIGEST'],
  ['headHash', 'c'.repeat(64), 'AUDIT_HEAD_EXPORT_DIGEST'],
  ['digest', '0'.repeat(64), 'AUDIT_HEAD_EXPORT_DIGEST'],
  ['exportSignature', '0'.repeat(64), 'AUDIT_HEAD_EXPORT_SIGNATURE'],
]) {
  const result = verifyApplicationAuditHeadExport({ ...exported, [field]: value }, secret);
  assert.equal(result.verified, false);
  assert.equal(result.code, code);
}
assert.equal(verifyApplicationAuditHeadExport({ ...exported, entries: [] }, secret).code, 'AUDIT_HEAD_EXPORT_CONTENT');
assert.equal(verifyApplicationAuditHeadExport({ ...exported, candidateEmail: 'private@example.test' }, secret).code, 'AUDIT_HEAD_EXPORT_CONTENT');
assert.equal(verifyApplicationAuditHeadExport(exported, 'wrong-secret'.padEnd(48, 'z')).code, 'AUDIT_HEAD_EXPORT_SIGNATURE');
assert.equal(applicationAuditHeadExportConfiguration({}), null);
assert.equal(applicationAuditHeadExportConfiguration({ JOB_AGENT_AUDIT_EXPORT_SECRET: secret }).secret, secret);
assert.throws(() => buildApplicationAuditHeadExport({ audit: { ...audit, integrityVerified: false }, exportSigningSecret: secret }), /verified/);
assert.throws(() => buildApplicationAuditHeadExport({ audit: { ...audit, sessionId: '' }, exportSigningSecret: secret }), /identity/);
assert.throws(() => buildApplicationAuditHeadExport({ audit: { ...audit, retentionDays: 5000 }, exportSigningSecret: secret }), /retention/);

console.log('Content-free signed audit-head export, redaction, deterministic verification, tamper, and separate-secret tests passed.');
