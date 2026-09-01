import assert from 'node:assert/strict';
import { jobAgentLaunchManifest } from '../lib/job-agent-launch-manifest.js';
import { buildJobAgentLaunchEvidence } from '../lib/job-agent-launch-evidence.js';
import { JOB_AGENT_LAUNCH_BLOCKERS, jobAgentLaunchActionPlan, publicJobAgentLaunchActionPlan } from '../lib/job-agent-launch-plan.js';
import { JOB_AGENT_INCIDENT_RUNBOOK_SHA256 } from '../lib/job-agent-support-ownership.js';
import { CONTROLLED_GREENHOUSE_EXTENSION_SHA256 } from '../lib/controlled-extension-release.js';

await import('./job-agent-support-ownership-test.mjs');

const now = new Date('2026-08-30T16:00:00.000Z');
const key = Buffer.alloc(32, 7).toString('base64');
const readyEnv = {
  VERCEL_ENV: 'production',
  UPSTASH_REDIS_REST_URL: 'https://synthetic-redis.example.test',
  UPSTASH_REDIS_REST_TOKEN: 'synthetic-token',
  RATE_LIMIT_HASH_SECRET: 'r'.repeat(48),
  JOB_AGENT_AUDIT_SECRET: 'a'.repeat(48),
  JOB_AGENT_AUDIT_EXPORT_SECRET: 'e'.repeat(48),
  JOB_AGENT_AUDIT_ARCHIVE_ENABLED: 'true',
  JOB_AGENT_AUDIT_ARCHIVE_APPROVED: 'true',
  JOB_AGENT_AUDIT_ARCHIVE_APPROVAL_VERSION: 'archive-approval-2026-08',
  JOB_AGENT_AUDIT_ARCHIVE_CONTRACT_VERSION: 'archive-contract-1',
  JOB_AGENT_AUDIT_ARCHIVE_LEGAL_HOLD_POLICY_VERSION: 'legal-hold-1',
  JOB_AGENT_AUDIT_ARCHIVE_URL: 'https://audit-archive.example.test/v1/heads',
  JOB_AGENT_AUDIT_ARCHIVE_ALLOWED_HOSTS: 'audit-archive.example.test',
  JOB_AGENT_AUDIT_ARCHIVE_BEARER_TOKEN: 'u'.repeat(48),
  JOB_AGENT_AUDIT_ARCHIVE_ACK_SECRET: 'k'.repeat(48),
  JOB_AGENT_AUDIT_ARCHIVE_RETENTION_DAYS: '365',
  JOB_AGENT_LAUNCH_EVIDENCE_SECRET: 'l'.repeat(48),
  BETA_DATA_ENCRYPTION_KEY: key,
  BETA_DATA_ENCRYPTION_KEY_ID: 'beta-2026-08',
  JOB_AGENT_OBJECT_STORAGE_ENABLED: 'true',
  BLOB_READ_WRITE_TOKEN: 'b'.repeat(32),
  JOB_AGENT_MALWARE_SCANNER_ENABLED: 'true',
  JOB_AGENT_MALWARE_SCANNER_URL: 'https://scanner.example.test/scan',
  JOB_AGENT_MALWARE_SCANNER_HOST: 'scanner.example.test',
  JOB_AGENT_MALWARE_SCANNER_BEARER_TOKEN: 'm'.repeat(48),
  JOB_AGENT_COUNSEL_APPROVED: 'true',
  JOB_AGENT_CONSENT_ENFORCEMENT: 'true',
  JOB_AGENT_TERMS_VERSION: 'terms-1',
  JOB_AGENT_PRIVACY_VERSION: 'privacy-1',
  JOB_AGENT_AUTHORIZATION_VERSION: 'authorization-1',
  JOB_AGENT_SCHEDULE_ENABLED: 'true',
  JOB_AGENT_SCHEDULE_GLOBAL_DAILY_RUNS: '25',
  JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED: 'true',
  RESEND_API_KEY: 'resend'.padEnd(32, 'x'),
  RESEND_FROM: 'alerts@example.test',
  RESEND_WEBHOOK_SECRET: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
  JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS: '365',
  JOB_AGENT_ALERT_WEBHOOK_URL: 'https://alerts.example.test/job-agent',
  JOB_AGENT_ALERT_ALLOWED_HOSTS: 'alerts.example.test',
  JOB_AGENT_ALERT_BEARER_TOKEN: 'w'.repeat(48),
  JOB_AGENT_ALERT_CONTRACT_VERSION: 'alerts-2026-08',
  STRIPE_WEBHOOK_IDEMPOTENCY_SECRET: 'i'.repeat(48),
  JOB_AGENT_RECEIPT_SECRET: 'q'.repeat(48),
  AI_GLOBAL_DAILY_UNITS: '200',
  CLAUDE_GLOBAL_DAILY_UNITS: '200',
  JOB_SEARCH_GLOBAL_DAILY_CALLS: '100',
  DISCOVERY_GLOBAL_DAILY_CALLS: '100',
  PACKAGE_GLOBAL_DAILY_UNITS: '20',
  JOB_AGENT_COST_LIMITS_APPROVED: 'true',
  JOB_AGENT_COST_LIMITS_APPROVAL_VERSION: 'cost-2026-08',
  JOB_AGENT_MONETARY_BUDGET_ENABLED: 'true',
  JOB_AGENT_MONETARY_BUDGET_APPROVED: 'true',
  JOB_AGENT_MONETARY_BUDGET_APPROVAL_VERSION: 'budget-2026-08',
  JOB_AGENT_MONETARY_BUDGET_CURRENCY: 'USD',
  JOB_AGENT_GLOBAL_DAILY_BUDGET_CENTS: '1000',
  JOB_AGENT_AI_DAILY_BUDGET_CENTS: '400', JOB_AGENT_AI_MAX_REQUEST_CENTS: '100',
  JOB_AGENT_PACKAGE_AI_DAILY_BUDGET_CENTS: '300', JOB_AGENT_PACKAGE_AI_MAX_REQUEST_CENTS: '150',
  JOB_AGENT_DOCUMENT_RENDER_DAILY_BUDGET_CENTS: '200', JOB_AGENT_DOCUMENT_RENDER_MAX_REQUEST_CENTS: '50',
  JOB_AGENT_EMPLOYER_BROWSER_DAILY_BUDGET_CENTS: '300', JOB_AGENT_EMPLOYER_BROWSER_MAX_SESSION_CENTS: '100',
  JOB_AGENT_EMAIL_DAILY_BUDGET_CENTS: '100', JOB_AGENT_EMAIL_MAX_REQUEST_CENTS: '5',
  JOB_AGENT_OBJECT_STORAGE_DAILY_BUDGET_CENTS: '100', JOB_AGENT_OBJECT_STORAGE_MAX_REQUEST_CENTS: '10',
  JOB_AGENT_CONTROLLED_BETA_APPROVED: 'true',
  JOB_AGENT_CONTROLLED_BETA_APPROVAL_VERSION: 'pilot-2026-08',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
  JOB_AGENT_RELEASE_RUNTIME_SHA256: 'b'.repeat(64),
  JOB_AGENT_PILOT_MAX_USERS: '5',
  JOB_AGENT_PILOT_ENFORCEMENT: 'true',
  JOB_AGENT_PILOT_ALLOWED_TENANTS: '1'.repeat(40),
  JOB_AGENT_ACCESS_POLICY_VERSION: 'controlled-beta-2026-08',
  JOB_AGENT_CONTROLLED_BETA_INCLUDED_TIERS: 'complete',
  JOB_AGENT_SUPPORT_OWNER: 'support@example.test',
  JOB_AGENT_INCIDENT_OWNER: 'incident@example.test',
  JOB_AGENT_SUPPORT_INCIDENT_APPROVED: 'true',
  JOB_AGENT_SUPPORT_INCIDENT_CONTRACT_VERSION: 'support-incident-1',
  JOB_AGENT_SUPPORT_COVERAGE_VERSION: 'coverage-1',
  JOB_AGENT_INCIDENT_ESCALATION_POLICY_VERSION: 'escalation-1',
  JOB_AGENT_INCIDENT_RUNBOOK_VERSION: 'runbook-1',
  JOB_AGENT_INCIDENT_RUNBOOK_SHA256,
};

function signedEvidence(env, kind, verifiedAt, evidenceId, artifactByte = '1') {
  return JSON.stringify(buildJobAgentLaunchEvidence({ kind, verifiedAt, evidenceId, artifactSha256: artifactByte.repeat(64) }, env));
}

Object.assign(readyEnv, {
  JOB_AGENT_NOTIFICATION_DELIVERY_EVIDENCE: signedEvidence(readyEnv, 'notification-delivery', '2026-08-29T12:00:00.000Z', 'notification-2026-08', '1'),
  JOB_AGENT_ALERT_DELIVERY_EVIDENCE: signedEvidence(readyEnv, 'operator-alert-delivery', '2026-08-29T12:00:00.000Z', 'alert-2026-08', '2'),
  JOB_AGENT_RECOVERY_DRILL_EVIDENCE: signedEvidence(readyEnv, 'recovery-drill', '2026-08-20T12:00:00.000Z', 'recovery-2026-08', '3'),
  JOB_AGENT_BACKUP_RESTORE_EVIDENCE: signedEvidence(readyEnv, 'backup-restore', '2026-08-20T12:00:00.000Z', 'restore-2026-08', '4'),
  JOB_AGENT_OBJECT_STORAGE_DRILL_EVIDENCE: signedEvidence(readyEnv, 'private-object-storage', '2026-08-20T12:00:00.000Z', 'object-storage-2026-08', '5'),
  JOB_AGENT_AUDIT_ARCHIVE_EVIDENCE: signedEvidence(readyEnv, 'audit-archive', '2026-08-20T12:00:00.000Z', 'audit-archive-2026-08', '7'),
  JOB_AGENT_CONTROLLED_BETA_RELEASE_EVIDENCE: signedEvidence(readyEnv, 'controlled-beta-release', '2026-08-29T12:00:00.000Z', 'release-2026-08', '6'),
});

let manifest = jobAgentLaunchManifest({}, { now });
assert.equal(manifest.currentMode, 'preview');
assert.equal(manifest.capabilities.preview.eligible, true);
assert.equal(manifest.capabilities.signedBeta.eligible, false);
assert.equal(manifest.externalApplicationExecution, false);
assert.equal(manifest.submissionsEnabled, false);
assert.equal(manifest.actionPlan.nextStage, 'signed-beta');
assert.equal(manifest.actionPlan.nextAction.blocker, 'DURABLE_RUNTIME_NOT_CONFIGURED');
assert.equal(manifest.actionPlan.contentFree, true);
assert.equal(manifest.actionPlan.containsCandidateValues, false);
assert.ok(manifest.actionPlan.remainingActions > 0);
assert.equal(Object.values(manifest.actionPlan.stageCounts).reduce((sum, count) => sum + count, 0), manifest.actionPlan.remainingActions);
const publicPlan = publicJobAgentLaunchActionPlan(manifest.actionPlan, 2);
assert.equal(publicPlan.topActions.length, 2);
assert.equal(publicPlan.truncated, true);
assert.equal('actions' in publicPlan, false);

manifest = jobAgentLaunchManifest(readyEnv, { now });
assert.equal(manifest.currentMode, 'signed-beta');
assert.equal(manifest.capabilities.signedBeta.eligible, true);
assert.equal(manifest.capabilities.packageReady.eligible, false);
assert.deepEqual(manifest.capabilities.signedBeta.blockers, []);
assert.equal(manifest.actionPlan.nextStage, 'package-ready');
assert.equal(manifest.actionPlan.nextAction.blocker, 'DOCUMENT_RENDER_SANDBOX_NOT_CONFIGURED');
assert.equal(manifest.monetarySpendControl.ready, true);
assert.deepEqual(manifest.needsYouEmailSuppression, { ready: true, provider: 'resend', contractVersion: 'resend-suppression-v1', retentionDays: 365, storesRecipient: false });
assert.equal(manifest.stripeWebhookIdempotency.ready, true);
assert.equal(manifest.stripeWebhookIdempotency.storesRawEventIds, false);
assert.equal(manifest.evidence.privateObjectStorage.verified, true);
assert.equal(manifest.evidence.auditArchive.verified, true);
assert.equal(manifest.auditArchive.ready, true);
assert.equal(manifest.auditArchive.retentionDays, 365);
assert.equal(manifest.auditArchive.contentFree, true);
assert.equal(manifest.evidence.controlledBetaRelease.verified, true);
assert.equal(manifest.accessPolicy.ready, true);
assert.equal(manifest.accessPolicy.createsCharges, false);
assert.equal(manifest.supportAndIncidentOwnership.ready, true);
assert.equal(manifest.supportAndIncidentOwnership.supportOwnerAssigned, true);
assert.equal(manifest.supportAndIncidentOwnership.incidentOwnerAssigned, true);
assert.equal(manifest.supportAndIncidentOwnership.runbookFingerprintMatches, true);
assert.equal(manifest.supportAndIncidentOwnership.containsOwnerIdentifiers, false);
assert.equal(manifest.assistedExecutionMode, 'greenhouse-extension');
assert.ok(manifest.capabilities.assistedApplication.blockers.includes('GREENHOUSE_EXTENSION_HANDOFF_NOT_CONFIGURED'));
assert.ok(manifest.capabilities.assistedApplication.blockers.includes('ASSISTED_APPLICATION_NOT_APPROVED'));
assert.ok(manifest.capabilities.assistedApplication.blockers.includes('GREENHOUSE_EXTENSION_REVIEW_NOT_RECORDED'));
assert.ok(manifest.capabilities.finalSubmission.blockers.includes('AUTHORITATIVE_RECEIPT_CAPTURE_NOT_CONFIGURED'));
assert.ok(manifest.capabilities.finalSubmission.blockers.includes('AUTHORITATIVE_RECEIPT_WORKER_NOT_CONFIGURED'));
assert.equal(manifest.authoritativeReceiptVerification.ready, false);
manifest = jobAgentLaunchManifest({ ...readyEnv, JOB_AGENT_OBJECT_STORAGE_DRILL_EVIDENCE: '' }, { now });
assert.equal(manifest.capabilities.signedBeta.eligible, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('PRIVATE_DOCUMENT_STORAGE_DRILL_NOT_VERIFIED'));
manifest = jobAgentLaunchManifest({ ...readyEnv, JOB_AGENT_MALWARE_SCANNER_URL: 'https://scanner.example.test/v2/scan' }, { now });
assert.equal(manifest.evidence.privateObjectStorage.verified, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('PRIVATE_DOCUMENT_STORAGE_DRILL_NOT_VERIFIED'));
manifest = jobAgentLaunchManifest(readyEnv, { now });
const serialized = JSON.stringify(manifest);
for (const secret of [readyEnv.RESEND_API_KEY, readyEnv.RESEND_WEBHOOK_SECRET, readyEnv.JOB_AGENT_AUDIT_SECRET, readyEnv.JOB_AGENT_LAUNCH_EVIDENCE_SECRET, readyEnv.JOB_AGENT_ALERT_BEARER_TOKEN, readyEnv.JOB_AGENT_AUDIT_ARCHIVE_BEARER_TOKEN, readyEnv.JOB_AGENT_AUDIT_ARCHIVE_ACK_SECRET, readyEnv.BETA_DATA_ENCRYPTION_KEY]) assert.equal(serialized.includes(secret), false);
assert.equal(serialized.includes(readyEnv.JOB_AGENT_SUPPORT_OWNER), false);
assert.equal(serialized.includes(readyEnv.JOB_AGENT_INCIDENT_OWNER), false);
assert.equal(serialized.includes(JOB_AGENT_INCIDENT_RUNBOOK_SHA256), false);
assert.equal(String(readyEnv.JOB_AGENT_CONTROLLED_BETA_RELEASE_EVIDENCE).includes(readyEnv.JOB_AGENT_PILOT_ALLOWED_TENANTS), false);
const allManifestBlockers = [...new Set(Object.values(manifest.capabilities).flatMap(value => value.blockers || []))];
assert.ok(allManifestBlockers.every(blocker => JOB_AGENT_LAUNCH_BLOCKERS.includes(blocker)), 'every emitted launch blocker must have an operator action definition');
const unknownPlan = jobAgentLaunchActionPlan({ signedBeta: { eligible: false, blockers: ['UNRECOGNIZED_RELEASE_BLOCKER'] } });
assert.equal(unknownPlan.nextAction.proof, 'unknown-blocker');
assert.match(unknownPlan.nextAction.summary, /Stop release/);

const tamperedNotificationEvidence = JSON.parse(readyEnv.JOB_AGENT_NOTIFICATION_DELIVERY_EVIDENCE);
tamperedNotificationEvidence.artifactSha256 = 'f'.repeat(64);
manifest = jobAgentLaunchManifest({ ...readyEnv, JOB_AGENT_NOTIFICATION_DELIVERY_EVIDENCE: JSON.stringify(tamperedNotificationEvidence) }, { now });
assert.ok(manifest.capabilities.signedBeta.blockers.includes('NEEDS_YOU_DELIVERY_NOT_VERIFIED'));

manifest = jobAgentLaunchManifest({ ...readyEnv, JOB_AGENT_AUDIT_ARCHIVE_EVIDENCE: '' }, { now });
assert.ok(manifest.capabilities.signedBeta.blockers.includes('AUDIT_ARCHIVE_NOT_VERIFIED'));
manifest = jobAgentLaunchManifest({ ...readyEnv, JOB_AGENT_AUDIT_ARCHIVE_ENABLED: 'false' }, { now });
assert.ok(manifest.capabilities.signedBeta.blockers.includes('AUDIT_ARCHIVE_NOT_CONFIGURED'));
manifest = jobAgentLaunchManifest({ ...readyEnv, JOB_AGENT_AUDIT_ARCHIVE_RETENTION_DAYS: '730' }, { now });
assert.equal(manifest.evidence.auditArchive.verified, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('AUDIT_ARCHIVE_NOT_VERIFIED'));

manifest = jobAgentLaunchManifest({
  ...readyEnv,
  JOB_AGENT_NOTIFICATION_DELIVERY_EVIDENCE: '',
  JOB_AGENT_NOTIFICATION_DELIVERY_VERIFIED_AT: '2026-08-29T12:00:00.000Z',
  JOB_AGENT_NOTIFICATION_DELIVERY_VERIFIED_FROM: readyEnv.RESEND_FROM,
}, { now });
assert.ok(manifest.capabilities.signedBeta.blockers.includes('NEEDS_YOU_DELIVERY_NOT_VERIFIED'));

const packageEnv = { ...readyEnv, DOCUMENT_RENDER_SANDBOX_ENABLED: 'true', DOCUMENT_RENDER_SANDBOX_SNAPSHOT_ID: 'snap_12345678' };
packageEnv.JOB_AGENT_CONTROLLED_BETA_RELEASE_EVIDENCE = signedEvidence(packageEnv, 'controlled-beta-release', '2026-08-29T12:00:00.000Z', 'release-package-2026-08', '6');
manifest = jobAgentLaunchManifest(packageEnv, { now });
assert.equal(manifest.currentMode, 'package-ready');
assert.equal(manifest.capabilities.packageReady.eligible, true);
assert.equal(manifest.capabilities.assistedApplication.eligible, false);

const extensionAssistedEnv = {
  ...packageEnv,
  JOB_AGENT_EXTENSION_HANDOFF_ENABLED: 'true',
  JOB_AGENT_EXTENSION_HANDOFF_SECRET: 'extension-secret'.padEnd(48, 'x'),
  JOB_AGENT_GREENHOUSE_EXTENSION_APPROVED: 'true',
  JOB_AGENT_GREENHOUSE_EXTENSION_REVIEW_VERSION: 'greenhouse-review-v1',
  JOB_AGENT_GREENHOUSE_EXTENSION_SHA256: CONTROLLED_GREENHOUSE_EXTENSION_SHA256,
  EMPLOYER_TERMS_REVIEW_VERSION: 'employer-terms-v1',
  JOB_AGENT_ASSISTED_APPLICATION_APPROVED: 'true',
  JOB_AGENT_ASSISTED_APPLICATION_APPROVAL_VERSION: 'assisted-extension-v1',
};
extensionAssistedEnv.JOB_AGENT_CONTROLLED_BETA_RELEASE_EVIDENCE = signedEvidence(extensionAssistedEnv, 'controlled-beta-release', '2026-08-29T12:00:00.000Z', 'release-extension-2026-08', '6');
manifest = jobAgentLaunchManifest(extensionAssistedEnv, { now });
assert.equal(manifest.currentMode, 'assisted-application');
assert.equal(manifest.capabilities.assistedApplication.eligible, true);
assert.equal(manifest.extensionHandoff.ready, true);
assert.equal(manifest.extensionHandoff.valuesPersistedByExtension, false);
assert.equal(manifest.extensionHandoff.submissionsEnabled, false);
assert.equal(manifest.extensionHandoff.release.ready, true);
assert.equal(manifest.extensionHandoff.release.includesLegacyModules, false);
assert.equal(JSON.stringify(manifest).includes(extensionAssistedEnv.JOB_AGENT_EXTENSION_HANDOFF_SECRET), false);
assert.equal(manifest.capabilities.finalSubmission.eligible, false);

manifest = jobAgentLaunchManifest({ ...extensionAssistedEnv, JOB_AGENT_GREENHOUSE_EXTENSION_SHA256: 'f'.repeat(64) }, { now });
assert.equal(manifest.capabilities.assistedApplication.eligible, false);
assert.ok(manifest.capabilities.assistedApplication.blockers.includes('GREENHOUSE_EXTENSION_ARTIFACT_NOT_VERIFIED'));

manifest = jobAgentLaunchManifest({
  ...readyEnv,
  JOB_AGENT_ALERT_DELIVERY_EVIDENCE: signedEvidence(readyEnv, 'operator-alert-delivery', '2026-06-01T00:00:00.000Z', 'alert-old', '2'),
}, { now });
assert.equal(manifest.capabilities.signedBeta.eligible, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('OPERATOR_ALERT_DELIVERY_NOT_VERIFIED'));

manifest = jobAgentLaunchManifest({ ...readyEnv, JOB_AGENT_ALERT_CONTRACT_VERSION: 'alerts-2026-09' }, { now });
assert.equal(manifest.capabilities.signedBeta.eligible, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('OPERATOR_ALERT_DELIVERY_NOT_VERIFIED'));

manifest = jobAgentLaunchManifest({ ...readyEnv, JOB_AGENT_ALERT_CONTRACT_VERSION: '' }, { now });
assert.equal(manifest.capabilities.signedBeta.eligible, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('OPERATOR_ALERTING_NOT_CONFIGURED'));

manifest = jobAgentLaunchManifest({ ...readyEnv, JOB_AGENT_MONETARY_BUDGET_APPROVED: 'false' }, { now });
assert.equal(manifest.capabilities.signedBeta.eligible, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('MONETARY_SPEND_CONTROL_NOT_CONFIGURED'));

manifest = jobAgentLaunchManifest({ ...readyEnv, STRIPE_WEBHOOK_IDEMPOTENCY_SECRET: '' }, { now });
assert.equal(manifest.capabilities.signedBeta.eligible, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('STRIPE_WEBHOOK_IDEMPOTENCY_NOT_CONFIGURED'));

manifest = jobAgentLaunchManifest({ ...readyEnv, RESEND_FROM: 'changed@example.test' }, { now });
assert.equal(manifest.capabilities.signedBeta.eligible, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('NEEDS_YOU_DELIVERY_NOT_VERIFIED'));

manifest = jobAgentLaunchManifest({ ...readyEnv, RESEND_WEBHOOK_SECRET: '' }, { now });
assert.equal(manifest.capabilities.signedBeta.eligible, false);
assert.equal(manifest.needsYouEmailSuppression.ready, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('NEEDS_YOU_SUPPRESSION_NOT_CONFIGURED'));

manifest = jobAgentLaunchManifest({ ...readyEnv, JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS: '30' }, { now });
assert.equal(manifest.needsYouEmailSuppression.ready, true);
assert.equal(manifest.evidence.notificationDelivery.verified, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('NEEDS_YOU_DELIVERY_NOT_VERIFIED'));

manifest = jobAgentLaunchManifest({ ...readyEnv, JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS: '0' }, { now });
assert.equal(manifest.needsYouEmailSuppression.ready, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('NEEDS_YOU_SUPPRESSION_NOT_CONFIGURED'));

manifest = jobAgentLaunchManifest({ ...readyEnv, JOB_AGENT_PILOT_MAX_USERS: '11' }, { now });
assert.equal(manifest.capabilities.signedBeta.eligible, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('CONTROLLED_BETA_NOT_APPROVED'));

manifest = jobAgentLaunchManifest({ ...readyEnv, JOB_AGENT_ACCESS_POLICY_VERSION: '' }, { now });
assert.equal(manifest.capabilities.signedBeta.eligible, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('JOB_AGENT_ACCESS_POLICY_NOT_CONFIGURED'));

for (const [key, value] of [
  ['JOB_AGENT_CONTROLLED_BETA_RELEASE_EVIDENCE', ''],
  ['VERCEL_GIT_COMMIT_SHA', 'c'.repeat(40)],
  ['JOB_AGENT_RELEASE_RUNTIME_SHA256', 'd'.repeat(64)],
  ['JOB_AGENT_PILOT_ALLOWED_TENANTS', '2'.repeat(40)],
  ['JOB_AGENT_CONTROLLED_BETA_INCLUDED_TIERS', 'job-agent-beta'],
  ['JOB_AGENT_INCIDENT_RUNBOOK_VERSION', 'runbook-2'],
  ['JOB_AGENT_MONETARY_BUDGET_APPROVAL_VERSION', 'budget-2026-09'],
  ['JOB_AGENT_GLOBAL_DAILY_BUDGET_CENTS', '1001'],
  ['JOB_AGENT_SUPPORT_OWNER', 'new-support@example.test'],
  ['JOB_AGENT_SCHEDULE_GLOBAL_DAILY_RUNS', '24'],
  ['JOB_AGENT_ASSISTED_EXECUTION_MODE', 'cloud-browser'],
  ['JOB_AGENT_FINAL_SUBMISSION_EXECUTION_ENABLED', 'true'],
]) {
  manifest = jobAgentLaunchManifest({ ...readyEnv, [key]: value }, { now });
  assert.equal(manifest.evidence.controlledBetaRelease.verified, false, `${key} must invalidate release approval evidence`);
  assert.ok(manifest.capabilities.signedBeta.blockers.includes('CONTROLLED_BETA_RELEASE_NOT_VERIFIED'));
}

manifest = jobAgentLaunchManifest({ ...readyEnv, VERCEL_GIT_COMMIT_SHA: 'not-a-commit' }, { now });
assert.equal(manifest.capabilities.signedBeta.eligible, false);
assert.ok(manifest.capabilities.signedBeta.blockers.includes('CONTROLLED_BETA_RELEASE_NOT_VERIFIED'));

for (const [key, value] of [
  ['JOB_AGENT_SUPPORT_INCIDENT_APPROVED', 'false'],
  ['JOB_AGENT_SUPPORT_INCIDENT_CONTRACT_VERSION', ''],
  ['JOB_AGENT_SUPPORT_OWNER', ''],
  ['JOB_AGENT_INCIDENT_OWNER', ''],
  ['JOB_AGENT_SUPPORT_COVERAGE_VERSION', ''],
  ['JOB_AGENT_INCIDENT_ESCALATION_POLICY_VERSION', ''],
  ['JOB_AGENT_INCIDENT_RUNBOOK_VERSION', ''],
  ['JOB_AGENT_INCIDENT_RUNBOOK_SHA256', 'f'.repeat(64)],
]) {
  manifest = jobAgentLaunchManifest({ ...readyEnv, [key]: value }, { now });
  assert.equal(manifest.capabilities.signedBeta.eligible, false);
  assert.ok(manifest.capabilities.signedBeta.blockers.includes('SUPPORT_AND_INCIDENT_OWNERSHIP_NOT_CONFIGURED'));
}

manifest = jobAgentLaunchManifest({
  ...packageEnv,
  JOB_AGENT_ASSISTED_EXECUTION_MODE: 'cloud-browser',
  EMPLOYER_BROWSER_WORKER_ENABLED: 'true',
  EMPLOYER_BROWSER_WORKER_SNAPSHOT_ID: 'snap_abcdefgh',
  EMPLOYER_BROWSER_ACCOUNT_DAILY_UNITS: '5',
  EMPLOYER_BROWSER_GLOBAL_DAILY_UNITS: '20',
}, { now });
assert.equal(manifest.capabilities.assistedApplication.eligible, false);
assert.equal(manifest.capabilities.finalSubmission.eligible, false);

const assistedEnv = {
  ...packageEnv,
  JOB_AGENT_ASSISTED_EXECUTION_MODE: 'cloud-browser',
  EMPLOYER_BROWSER_WORKER_ENABLED: 'true',
  EMPLOYER_BROWSER_WORKER_SNAPSHOT_ID: 'snap_abcdefgh',
  EMPLOYER_BROWSER_ACCOUNT_DAILY_UNITS: '5',
  EMPLOYER_BROWSER_GLOBAL_DAILY_UNITS: '20',
  EMPLOYER_BROWSER_WORKER_RUNNER_VERSION: 'runner-v1',
  EMPLOYER_BROWSER_WORKER_RUNNER_SHA256: 'b'.repeat(64),
  EMPLOYER_BROWSER_DURABLE_EXECUTION_ENABLED: 'true',
  EMPLOYER_TERMS_REVIEW_VERSION: 'terms-review-v1',
  JOB_AGENT_ASSISTED_APPLICATION_APPROVED: 'true',
  JOB_AGENT_ASSISTED_APPLICATION_APPROVAL_VERSION: 'assisted-pilot-v1',
};
assistedEnv.JOB_AGENT_CONTROLLED_BETA_RELEASE_EVIDENCE = signedEvidence(assistedEnv, 'controlled-beta-release', '2026-08-29T12:00:00.000Z', 'release-cloud-2026-08', '6');
assistedEnv.EMPLOYER_BROWSER_RUNNER_EVIDENCE = signedEvidence(assistedEnv, 'employer-browser-runner', '2026-08-29T12:00:00.000Z', 'browser-runner-v1', '5');
manifest = jobAgentLaunchManifest(assistedEnv, { now });
assert.equal(manifest.capabilities.assistedApplication.eligible, false);
assert.ok(manifest.capabilities.assistedApplication.blockers.includes('EMPLOYER_BROWSER_REMOTE_STREAM_NOT_READY'));
assert.ok(manifest.capabilities.assistedApplication.blockers.includes('EMPLOYER_BROWSER_SESSION_RECOVERY_NOT_VERIFIED'));
assert.equal(manifest.externalApplicationExecution, false);
assert.equal(manifest.capabilities.finalSubmission.eligible, false);
assert.equal(manifest.submissionsEnabled, false);

const remoteAssistedEnv = {
  ...assistedEnv,
  EMPLOYER_BROWSER_SESSION_PROVIDER: 'remote-stream', EMPLOYER_BROWSER_REMOTE_STREAM_ENABLED: 'true',
  EMPLOYER_BROWSER_REMOTE_STREAM_API_URL: 'https://browser-api.vendor.example.com',
  EMPLOYER_BROWSER_REMOTE_STREAM_ORIGIN: 'https://browser-stream.vendor.example.com/',
  EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY: 'r'.repeat(48),
  EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVED: 'true', EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVAL_VERSION: 'browser-cost-v1',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED: 'true', EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVAL_VERSION: 'browser-csp-v1',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED_ORIGIN: 'https://browser-stream.vendor.example.com',
};
remoteAssistedEnv.JOB_AGENT_CONTROLLED_BETA_RELEASE_EVIDENCE = signedEvidence(remoteAssistedEnv, 'controlled-beta-release', '2026-08-29T12:00:00.000Z', 'release-remote-2026-08', '6');
remoteAssistedEnv.EMPLOYER_BROWSER_SESSION_RECOVERY_EVIDENCE = signedEvidence(remoteAssistedEnv, 'employer-browser-session-recovery', '2026-08-29T12:00:00.000Z', 'browser-recovery-v1', '6');
manifest = jobAgentLaunchManifest(remoteAssistedEnv, { now });
assert.equal(manifest.capabilities.assistedApplication.eligible, true);
assert.equal(manifest.currentMode, 'assisted-application');
assert.equal(manifest.capabilities.assistedApplication.blockers.includes('EMPLOYER_BROWSER_REMOTE_STREAM_NOT_READY'), false);
assert.equal(manifest.capabilities.assistedApplication.blockers.includes('EMPLOYER_BROWSER_SESSION_RECOVERY_NOT_VERIFIED'), false);
assert.equal(manifest.capabilities.finalSubmission.eligible, false);
assert.equal(manifest.submissionsEnabled, false);
assert.equal(JSON.stringify(manifest).includes(remoteAssistedEnv.EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY), false);

const receiptCaptureEnv = {
  ...remoteAssistedEnv,
  JOB_AGENT_RECEIPT_CAPTURE_ENABLED: 'true', JOB_AGENT_RECEIPT_CAPTURE_APPROVED: 'true',
  JOB_AGENT_RECEIPT_CAPTURE_APPROVAL_VERSION: 'receipt-capture-v1',
  JOB_AGENT_RECEIPT_CAPTURE_URL: 'https://app.example.test/api/application-receipts',
  JOB_AGENT_RECEIPT_CAPTURE_HOST: 'app.example.test', JOB_AGENT_RECEIPT_CAPTURE_KINDS: 'page',
};
receiptCaptureEnv.JOB_AGENT_CONTROLLED_BETA_RELEASE_EVIDENCE = signedEvidence(receiptCaptureEnv, 'controlled-beta-release', '2026-08-29T12:00:00.000Z', 'release-receipt-2026-08', '6');
manifest = jobAgentLaunchManifest(receiptCaptureEnv, { now });
assert.equal(manifest.authoritativeReceiptCapture.ready, true);
assert.equal(manifest.capabilities.finalSubmission.blockers.includes('AUTHORITATIVE_RECEIPT_CAPTURE_NOT_CONFIGURED'), false);
assert.ok(manifest.capabilities.finalSubmission.blockers.includes('FINAL_SUBMISSION_EXECUTION_NOT_CONFIGURED'));
assert.ok(manifest.capabilities.finalSubmission.blockers.includes('FINAL_SUBMISSION_DURABLE_EXECUTION_NOT_CONFIGURED'));
assert.ok(manifest.capabilities.finalSubmission.blockers.includes('FINAL_SUBMISSION_SUPERVISED_EXECUTION_NOT_VERIFIED'));
assert.equal(manifest.capabilities.finalSubmission.eligible, false);
assert.equal(manifest.submissionsEnabled, false);
assert.equal(JSON.stringify(manifest).includes(receiptCaptureEnv.JOB_AGENT_RECEIPT_SECRET), false);

const submissionProtocolEnv = {
  ...receiptCaptureEnv,
  JOB_AGENT_FINAL_SUBMISSION_EXECUTION_ENABLED: 'true', JOB_AGENT_FINAL_SUBMISSION_EXECUTION_APPROVED: 'true',
  JOB_AGENT_FINAL_SUBMISSION_EXECUTION_APPROVAL_VERSION: 'submission-beta-v1',
};
submissionProtocolEnv.JOB_AGENT_CONTROLLED_BETA_RELEASE_EVIDENCE = signedEvidence(submissionProtocolEnv, 'controlled-beta-release', '2026-08-29T12:00:00.000Z', 'release-submission-protocol-2026-08', '6');
manifest = jobAgentLaunchManifest(submissionProtocolEnv, { now });
assert.equal(manifest.finalSubmissionExecution.ready, true);
assert.equal(manifest.capabilities.finalSubmission.blockers.includes('FINAL_SUBMISSION_EXECUTION_NOT_CONFIGURED'), false);
assert.ok(manifest.capabilities.finalSubmission.blockers.includes('FINAL_SUBMISSION_DURABLE_EXECUTION_NOT_CONFIGURED'));
assert.ok(manifest.capabilities.finalSubmission.blockers.includes('FINAL_SUBMISSION_SUPERVISED_EXECUTION_NOT_VERIFIED'));
assert.equal(manifest.capabilities.finalSubmission.eligible, false);
assert.equal(manifest.submissionsEnabled, false);
assert.equal(JSON.stringify(manifest).includes(submissionProtocolEnv.EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY), false);

const submissionOrchestrationEnv = {
  ...submissionProtocolEnv,
  JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_ENABLED: 'true', JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_APPROVED: 'true',
  JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_APPROVAL_VERSION: 'durable-submission-beta-v1',
  JOB_AGENT_RECEIPT_VERIFICATION_WORKER_ENABLED: 'true', JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVED: 'true',
  JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVAL_VERSION: 'receipt-worker-beta-v1',
};
submissionOrchestrationEnv.JOB_AGENT_CONTROLLED_BETA_RELEASE_EVIDENCE = signedEvidence(submissionOrchestrationEnv, 'controlled-beta-release', '2026-08-29T12:00:00.000Z', 'release-submission-orchestration-2026-08', '6');
manifest = jobAgentLaunchManifest(submissionOrchestrationEnv, { now });
assert.equal(manifest.finalSubmissionOrchestration.ready, false);
assert.ok(manifest.capabilities.finalSubmission.blockers.includes('FINAL_SUBMISSION_DURABLE_EXECUTION_NOT_CONFIGURED'));
assert.ok(manifest.capabilities.finalSubmission.blockers.includes('FINAL_SUBMISSION_SUPERVISED_EXECUTION_NOT_VERIFIED'));
assert.equal(manifest.capabilities.finalSubmission.eligible, false);
assert.equal(manifest.submissionsEnabled, false);

submissionOrchestrationEnv.JOB_AGENT_FINAL_SUBMISSION_EXECUTION_EVIDENCE = signedEvidence(submissionOrchestrationEnv, 'final-submission-execution', '2026-08-29T12:00:00.000Z', 'submission-supervised-v1', '7');
manifest = jobAgentLaunchManifest(submissionOrchestrationEnv, { now });
assert.equal(manifest.finalSubmissionOrchestration.ready, true);
assert.equal(manifest.finalSubmissionOrchestration.evidenceVerified, true);
assert.equal(manifest.evidence.finalSubmissionExecution.verified, true);
assert.equal(manifest.capabilities.finalSubmission.blockers.includes('FINAL_SUBMISSION_DURABLE_EXECUTION_NOT_CONFIGURED'), false);
assert.equal(manifest.capabilities.finalSubmission.blockers.includes('FINAL_SUBMISSION_SUPERVISED_EXECUTION_NOT_VERIFIED'), false);
assert.equal(manifest.capabilities.finalSubmission.eligible, true);
assert.equal(manifest.currentMode, 'final-submission');
assert.equal(manifest.submissionsEnabled, true);

manifest = jobAgentLaunchManifest({ ...submissionOrchestrationEnv, JOB_AGENT_RECEIPT_CAPTURE_APPROVAL_VERSION: 'receipt-capture-v2' }, { now });
assert.equal(manifest.evidence.finalSubmissionExecution.verified, false);
assert.equal(manifest.finalSubmissionOrchestration.ready, false);
assert.equal(manifest.capabilities.finalSubmission.eligible, false);
assert.equal(manifest.submissionsEnabled, false);

manifest = jobAgentLaunchManifest({ ...assistedEnv, EMPLOYER_BROWSER_WORKER_RUNNER_SHA256: 'c'.repeat(64) }, { now });
assert.equal(manifest.capabilities.assistedApplication.eligible, false);
assert.ok(manifest.capabilities.assistedApplication.blockers.includes('EMPLOYER_BROWSER_RUNNER_EVIDENCE_NOT_VERIFIED'));

console.log('Controlled-beta launch manifest tests passed.');
