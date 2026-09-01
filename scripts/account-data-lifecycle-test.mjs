import assert from 'node:assert/strict';
import { ACCOUNT_DELETE_CONFIRMATION, FRESH_DELETE_SESSION_MS, assertFreshOpaqueSession, buildAccountDataExport, deleteTenantResidualIdempotencyKeys } from '../lib/account-data-lifecycle.js';

const now = new Date('2026-08-29T19:20:00.000Z');
assert.equal(ACCOUNT_DELETE_CONFIRMATION, 'DELETE MY JOB AGENT CLOUD DATA');
assert.equal(assertFreshOpaqueSession({ authentication: 'opaque-session', createdAt: new Date(now.getTime() - FRESH_DELETE_SESSION_MS + 1).toISOString() }, now), true);
assert.throws(() => assertFreshOpaqueSession({ authentication: 'bearer', createdAt: now.toISOString() }, now), /RECENT_SIGN_IN_REQUIRED/);
assert.throws(() => assertFreshOpaqueSession({ authentication: 'opaque-session', createdAt: new Date(now.getTime() - FRESH_DELETE_SESSION_MS - 1).toISOString() }, now), /RECENT_SIGN_IN_REQUIRED/);

const exported = buildAccountDataExport({
  subject: 'candidate@example.com',
  consent: { version: 1, consent: { status: 'active', policy: { termsVersion: 'terms-v1' } } },
  schedule: { version: 1, schedule: { status: 'active', cadence: 'daily' } },
  notifications: { version: 1, preference: { enabled: true, channel: 'email' } },
  emailSuppression: { suppressed: true, reason: 'permanent-bounce', suppressedAt: now.toISOString(), storesRecipient: false },
  vault: { version: 2, vault: { facts: [{ id: 'fact_1', value: 'confirmed' }] } },
  campaign: { version: 1, state: { campaigns: [] } },
  runs: [{ id: 'run_12345678', result: { resumeText: 'candidate-owned draft', artifacts: [{ key: 'resume_pdf', filename: 'resume.pdf', sha256: 'abc', bytes: 123, contentBase64: 'TOP-SECRET-BINARY' }] } }],
  applicationSessions: [{ id: 'session_12345678', audit: { count: 2, headHash: 'hash', headSignature: 'signature' } }],
  employerBrowserTasks: [{ id: 'browser_task_12345678', status: 'completed', linkedApplicationSessionId: 'session_12345678', stagedFieldCount: 2, containsCandidateFieldValues: false }],
  applicationSubmissionTasks: [{ id: 'submission_task_12345678', status: 'completed', linkedApplicationSessionId: 'session_12345678', containsCandidateFieldValues: false, authoritativeReceiptVerified: false }],
  applicationReceiptTasks: [{ id: 'receipt_task_12345678', status: 'queued', linkedApplicationSessionId: 'session_12345678', containsCandidateValues: false, containsReceiptEvidence: false }],
  employerBrowserSessions: [{ id: 'browser_session_12345678', applicationSessionId: 'session_12345678', status: 'ready', viewMode: 'synthetic-static', interactive: false, containsCandidateFieldValues: false }],
  now,
});
assert.equal(exported.account.subject, 'candidate@example.com');
assert.equal(exported.scope.artifactBinariesIncluded, false);
assert.equal(exported.scope.jobAgentConsent, true);
assert.equal(exported.scope.jobAgentSchedule, true);
assert.equal(exported.scope.needsYouNotificationPreference, true);
assert.equal(exported.scope.needsYouEmailSuppression, true);
assert.equal(exported.needsYouNotificationPreference.preference.enabled, true);
assert.deepEqual(exported.needsYouEmailSuppression, { suppressed: true, reason: 'permanent-bounce', suppressedAt: now.toISOString(), storesRecipient: false });
assert.doesNotMatch(JSON.stringify(exported.needsYouEmailSuppression), /candidate@example\.com/);
assert.equal(exported.jobAgentSchedule.schedule.cadence, 'daily');
assert.equal(exported.jobAgentConsent.consent.status, 'active');
assert.equal(exported.scope.billingAndSubscriptionRecordsIncluded, false);
assert.equal(exported.scope.retentionLockedAuditRecordsIncluded, false);
assert.match(exported.scope.accountRecordNote, /retention-locked audit heads/);
assert.equal(exported.jobAgentRuns[0].result.resumeText, 'candidate-owned draft');
assert.equal(exported.jobAgentRuns[0].result.artifacts[0].binaryIncluded, false);
assert.equal(exported.jobAgentRuns[0].result.artifacts[0].contentBase64, undefined);
assert.doesNotMatch(JSON.stringify(exported), /TOP-SECRET-BINARY/);
assert.equal(exported.applicationSessions[0].audit.count, 2);
assert.equal(exported.scope.employerBrowserTaskMetadata, true);
assert.equal(exported.employerBrowserTasks[0].containsCandidateFieldValues, false);
assert.equal(exported.scope.applicationSubmissionTaskMetadata, true);
assert.equal(exported.applicationSubmissionTasks[0].authoritativeReceiptVerified, false);
assert.equal(exported.applicationSubmissionTasks[0].containsCandidateFieldValues, false);
assert.equal(exported.scope.applicationReceiptTaskMetadata, true);
assert.equal(exported.applicationReceiptTasks[0].containsReceiptEvidence, false);
assert.equal(exported.scope.employerBrowserSessionMetadata, true);
assert.equal(exported.employerBrowserSessions[0].containsCandidateFieldValues, false);

class FakeRedis {
  constructor(values) { this.values = new Map(values.map(key => [key, '1'])); }
  async scan(_cursor, { match }) {
    const prefix = String(match).slice(0, -1);
    return ['0', [...this.values.keys()].filter(key => key.startsWith(prefix))];
  }
  async del(...keys) { let deleted = 0; for (const key of keys) if (this.values.delete(key)) deleted += 1; return deleted; }
}
const tenantId = 'a'.repeat(40);
const otherTenantId = 'b'.repeat(40);
const residualRedis = new FakeRedis([
  `1ststep:vault:v1:${tenantId}:idem:${'1'.repeat(64)}`,
  `1ststep:consent:v1:${tenantId}:idem:${'2'.repeat(64)}`,
  `1ststep:beta:v1:${tenantId}:campaign:idem:${'3'.repeat(64)}`,
  `1ststep:job-agent-schedule:v1:tenant:${tenantId}:idem:${'4'.repeat(64)}`,
  `1ststep:job-agent:v1:tenant:${tenantId}:idem:${'5'.repeat(64)}`,
  `1ststep:application-session:v1:tenant:${tenantId}:idem:${'6'.repeat(64)}`,
  `1ststep:vault:v1:${otherTenantId}:idem:${'7'.repeat(64)}`,
]);
assert.deepEqual(await deleteTenantResidualIdempotencyKeys({ redis: residualRedis, tenantId }), {
  deleted: 6, patternsExamined: 6, contentFree: true, containsCandidateValues: false,
});
assert.equal(residualRedis.values.size, 1);
assert.equal(residualRedis.values.has(`1ststep:vault:v1:${otherTenantId}:idem:${'7'.repeat(64)}`), true);

console.log('Account data lifecycle tests passed.');
