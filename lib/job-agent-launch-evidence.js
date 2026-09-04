import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { employerBrowserSessionProviderConfiguration } from './employer-browser-session-provider.js';
import { employerBrowserWorkerConfiguration } from './employer-browser-worker.js';
import { applicationReceiptCaptureConfiguration } from './application-receipt-capture-provider.js';
import { applicationSubmissionProviderConfiguration } from './application-submission-provider.js';
import { applicationAuditArchiveConfiguration } from './application-audit-archive-provider.js';
import { jobAgentNeedsYouNotificationConfiguration } from './job-agent-notification-store.js';
import { jobAgentEmailSuppressionConfiguration } from './job-agent-email-suppression.js';
import { jobAgentObjectStorageConfiguration } from './job-agent-object-storage.js';
import { JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST, jobAgentOperatorAlertConfiguration } from './job-agent-operator-alert.js';

const SCHEMA_VERSION = 1;
const SECRET_MINIMUM_BYTES = 32;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const KINDS = Object.freeze({
  'notification-delivery': { maxAgeDays: 30 },
  'operator-alert-delivery': { maxAgeDays: 30 },
  'recovery-drill': { maxAgeDays: 90 },
  'backup-restore': { maxAgeDays: 90 },
  'private-object-storage': { maxAgeDays: 90 },
  'audit-archive': { maxAgeDays: 90 },
  'controlled-beta-release': { maxAgeDays: 30 },
  'employer-browser-runner': { maxAgeDays: 90 },
  'employer-browser-session-recovery': { maxAgeDays: 90 },
  'final-submission-execution': { maxAgeDays: 30 },
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function urlScope(value, { originOnly = false } = {}) {
  try {
    const url = new URL(String(value || ''));
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return originOnly ? url.origin : url.href.replace(/\/$/, '');
  } catch { return ''; }
}

function publicScope(kind, env) {
  const storage = jobAgentObjectStorageConfiguration(env);
  if (kind === 'notification-delivery') {
    const notifications = jobAgentNeedsYouNotificationConfiguration(env);
    const suppression = jobAgentEmailSuppressionConfiguration(env);
    return {
      channel: 'email', provider: 'resend', sender: String(notifications.from || '').trim().toLowerCase(),
      suppressionContractVersion: suppression.contractVersion,
      suppressionRetentionDays: String(suppression.retentionDays || ''),
      webhookSecretDigest: createHash('sha256').update(String(env.RESEND_WEBHOOK_SECRET || '')).digest('hex'),
    };
  }
  if (kind === 'operator-alert-delivery') {
    const alerting = jobAgentOperatorAlertConfiguration(env);
    return {
      channel: 'webhook',
      endpoint: urlScope(alerting?.url),
      contractVersion: String(alerting?.contractVersion || ''),
      contractDigest: JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST,
      retentionDays: String(alerting?.retentionDays || ''),
      acknowledgementWindowMinutes: String(alerting?.acknowledgementWindowMinutes || ''),
    };
  }
  if (kind === 'recovery-drill' || kind === 'backup-restore') {
    return {
      environment: String(env.VERCEL_ENV || env.NODE_ENV || 'development').trim().toLowerCase(),
      encryptionKeyId: String(env.BETA_DATA_ENCRYPTION_KEY_ID || ''),
      redisEndpoint: urlScope(env.UPSTASH_REDIS_REST_URL, { originOnly: true }),
      storageMode: storage.mode,
    };
  }
  if (kind === 'private-object-storage') {
    return {
      environment: String(env.VERCEL_ENV || env.NODE_ENV || 'development').trim().toLowerCase(),
      encryptionKeyId: String(env.BETA_DATA_ENCRYPTION_KEY_ID || ''),
      storageMode: storage.mode,
      scannerEndpoint: urlScope(storage.scanner?.url),
      scannerHost: String(storage.scanner?.allowedHost || ''),
      scannerRequired: storage.scanner?.required === true,
    };
  }
  if (kind === 'audit-archive') {
    const archive = applicationAuditArchiveConfiguration(env);
    return {
      provider: String(archive.provider || ''), endpoint: urlScope(archive.url),
      approvalVersion: String(archive.approvalVersion || ''), contractVersion: String(archive.contractVersion || ''),
      legalHoldPolicyVersion: String(archive.legalHoldPolicyVersion || ''), retentionDays: String(archive.retentionDays || ''),
    };
  }
  if (kind === 'controlled-beta-release') {
    const values = name => String(env[name] || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean).sort();
    const digestValues = name => createHash('sha256').update(canonical(values(name))).digest('hex');
    const digestValue = name => createHash('sha256').update(String(env[name] || '').trim().toLowerCase()).digest('hex');
    const budgetNames = [
      'AI_GLOBAL_DAILY_UNITS', 'CLAUDE_GLOBAL_DAILY_UNITS', 'JOB_SEARCH_GLOBAL_DAILY_CALLS', 'DISCOVERY_GLOBAL_DAILY_CALLS', 'PACKAGE_GLOBAL_DAILY_UNITS',
      'JOB_AGENT_GLOBAL_DAILY_BUDGET_CENTS', 'JOB_AGENT_AI_DAILY_BUDGET_CENTS', 'JOB_AGENT_AI_MAX_REQUEST_CENTS',
      'JOB_AGENT_PACKAGE_AI_DAILY_BUDGET_CENTS', 'JOB_AGENT_PACKAGE_AI_MAX_REQUEST_CENTS', 'JOB_AGENT_DOCUMENT_RENDER_DAILY_BUDGET_CENTS',
      'JOB_AGENT_DOCUMENT_RENDER_MAX_REQUEST_CENTS', 'JOB_AGENT_EMPLOYER_BROWSER_DAILY_BUDGET_CENTS', 'JOB_AGENT_EMPLOYER_BROWSER_MAX_SESSION_CENTS',
      'JOB_AGENT_EMAIL_DAILY_BUDGET_CENTS', 'JOB_AGENT_EMAIL_MAX_REQUEST_CENTS', 'JOB_AGENT_OBJECT_STORAGE_DAILY_BUDGET_CENTS', 'JOB_AGENT_OBJECT_STORAGE_MAX_REQUEST_CENTS',
    ];
    const activationNames = [
      'DOCUMENT_RENDER_SANDBOX_ENABLED', 'DOCUMENT_RENDER_SANDBOX_SNAPSHOT_ID', 'JOB_AGENT_EXTENSION_HANDOFF_ENABLED',
      'JOB_AGENT_ASSISTED_APPLICATION_APPROVED', 'JOB_AGENT_ASSISTED_APPLICATION_APPROVAL_VERSION', 'JOB_AGENT_GREENHOUSE_EXTENSION_APPROVED',
      'JOB_AGENT_GREENHOUSE_EXTENSION_REVIEW_VERSION', 'JOB_AGENT_GREENHOUSE_EXTENSION_SHA256', 'EMPLOYER_TERMS_REVIEW_VERSION', 'EMPLOYER_BROWSER_REMOTE_STREAM_ENABLED',
      'EMPLOYER_BROWSER_WORKER_ENABLED', 'EMPLOYER_BROWSER_WORKER_SNAPSHOT_ID', 'EMPLOYER_BROWSER_DURABLE_EXECUTION_ENABLED', 'EMPLOYER_BROWSER_SESSION_PROVIDER',
      'EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVAL_VERSION', 'EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVAL_VERSION',
      'JOB_AGENT_FINAL_SUBMISSION_EXECUTION_ENABLED', 'JOB_AGENT_FINAL_SUBMISSION_EXECUTION_APPROVED', 'JOB_AGENT_FINAL_SUBMISSION_EXECUTION_APPROVAL_VERSION',
      'JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_ENABLED', 'JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_APPROVED', 'JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_APPROVAL_VERSION',
      'JOB_AGENT_RECEIPT_CAPTURE_ENABLED', 'JOB_AGENT_RECEIPT_CAPTURE_APPROVED', 'JOB_AGENT_RECEIPT_CAPTURE_APPROVAL_VERSION',
      'JOB_AGENT_RECEIPT_VERIFICATION_WORKER_ENABLED', 'JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVED', 'JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVAL_VERSION',
    ];
    return {
      environment: String(env.VERCEL_ENV || env.NODE_ENV || 'development').trim().toLowerCase(),
      gitCommitSha: String(env.VERCEL_GIT_COMMIT_SHA || '').trim().toLowerCase(),
      runtimeSha256: String(env.JOB_AGENT_RELEASE_RUNTIME_SHA256 || '').trim().toLowerCase(),
      controlledBetaApprovalVersion: String(env.JOB_AGENT_CONTROLLED_BETA_APPROVAL_VERSION || ''),
      pilotMaxUsers: String(env.JOB_AGENT_PILOT_MAX_USERS || ''),
      pilotAllowlistDigest: digestValues('JOB_AGENT_PILOT_ALLOWED_TENANTS'),
      scheduleGlobalDailyRuns: String(env.JOB_AGENT_SCHEDULE_GLOBAL_DAILY_RUNS || ''),
      accessPolicyVersion: String(env.JOB_AGENT_ACCESS_POLICY_VERSION || ''),
      includedTiersDigest: digestValues('JOB_AGENT_CONTROLLED_BETA_INCLUDED_TIERS'),
      termsVersion: String(env.JOB_AGENT_TERMS_VERSION || ''),
      privacyVersion: String(env.JOB_AGENT_PRIVACY_VERSION || ''),
      authorizationVersion: String(env.JOB_AGENT_AUTHORIZATION_VERSION || ''),
      costLimitsApprovalVersion: String(env.JOB_AGENT_COST_LIMITS_APPROVAL_VERSION || ''),
      monetaryBudgetApprovalVersion: String(env.JOB_AGENT_MONETARY_BUDGET_APPROVAL_VERSION || ''),
      monetaryBudgetCurrency: String(env.JOB_AGENT_MONETARY_BUDGET_CURRENCY || '').trim().toUpperCase(),
      budgets: Object.fromEntries(budgetNames.map(name => [name, String(env[name] || '')])),
      supportIncidentContractVersion: String(env.JOB_AGENT_SUPPORT_INCIDENT_CONTRACT_VERSION || ''),
      supportOwnerDigest: digestValue('JOB_AGENT_SUPPORT_OWNER'),
      incidentOwnerDigest: digestValue('JOB_AGENT_INCIDENT_OWNER'),
      supportCoverageVersion: String(env.JOB_AGENT_SUPPORT_COVERAGE_VERSION || ''),
      incidentEscalationPolicyVersion: String(env.JOB_AGENT_INCIDENT_ESCALATION_POLICY_VERSION || ''),
      incidentRunbookVersion: String(env.JOB_AGENT_INCIDENT_RUNBOOK_VERSION || ''),
      incidentRunbookSha256: String(env.JOB_AGENT_INCIDENT_RUNBOOK_SHA256 || '').trim().toLowerCase(),
      notificationSender: String(env.RESEND_FROM || '').trim().toLowerCase(),
      operatorAlertContractVersion: String(env.JOB_AGENT_ALERT_CONTRACT_VERSION || ''),
      operatorAlertContractDigest: JOB_AGENT_OPERATOR_ALERT_CONTRACT_DIGEST,
      operatorAlertRetentionDays: String(env.JOB_AGENT_ALERT_RETENTION_DAYS || ''),
      operatorAlertAcknowledgementMinutes: String(env.JOB_AGENT_ALERT_ACKNOWLEDGEMENT_MINUTES || ''),
      assistedExecutionMode: String(env.JOB_AGENT_ASSISTED_EXECUTION_MODE || 'greenhouse-extension').trim().toLowerCase(),
      capabilityActivations: Object.fromEntries(activationNames.map(name => [name, String(env[name] || '').trim()])),
    };
  }
  if (kind === 'employer-browser-runner') {
    const browser = employerBrowserWorkerConfiguration(env);
    return {
      snapshotId: String(browser.snapshotId || ''),
      runnerVersion: String(browser.runner?.runnerVersion || ''),
      runnerSha256: String(browser.runner?.runnerSha256 || '').toLowerCase(),
      runnerPath: String(browser.runner?.runnerPath || ''),
    };
  }
  if (kind === 'employer-browser-session-recovery') {
    const provider = employerBrowserSessionProviderConfiguration(env);
    return {
      provider: String(provider.provider || ''),
      apiEndpoint: urlScope(provider.apiBaseUrl),
      streamOrigin: urlScope(provider.streamOrigin, { originOnly: true }),
      costApprovalVersion: String(env.EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVAL_VERSION || ''),
      cspApprovalVersion: String(env.EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVAL_VERSION || ''),
    };
  }
  if (kind === 'final-submission-execution') {
    const submission = applicationSubmissionProviderConfiguration(env);
    const receipt = applicationReceiptCaptureConfiguration(env);
    return {
      environment: String(env.VERCEL_ENV || env.NODE_ENV || 'development').trim().toLowerCase(),
      provider: String(submission.provider || ''),
      apiEndpoint: urlScope(submission.browser?.apiBaseUrl),
      streamOrigin: urlScope(submission.browser?.streamOrigin, { originOnly: true }),
      browserCostApprovalVersion: String(env.EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVAL_VERSION || ''),
      browserCspApprovalVersion: String(env.EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVAL_VERSION || ''),
      submissionApprovalVersion: String(submission.approvalVersion || ''),
      durableExecutionApprovalVersion: String(env.JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_APPROVAL_VERSION || ''),
      receiptVerificationWorkerApprovalVersion: String(env.JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVAL_VERSION || ''),
      receiptHost: String(receipt.host || ''),
      receiptKinds: [...(receipt.kinds || [])].sort(),
      receiptEmailDomains: String(env.JOB_AGENT_RECEIPT_EMAIL_DOMAINS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean).sort(),
      receiptApiProviders: String(env.JOB_AGENT_RECEIPT_API_PROVIDERS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean).sort(),
      receiptApprovalVersion: String(receipt.approvalVersion || ''),
      monetaryBudgetApprovalVersion: String(env.JOB_AGENT_MONETARY_BUDGET_APPROVAL_VERSION || ''),
      termsVersion: String(env.JOB_AGENT_TERMS_VERSION || ''),
      privacyVersion: String(env.JOB_AGENT_PRIVACY_VERSION || ''),
      authorizationVersion: String(env.JOB_AGENT_AUTHORIZATION_VERSION || ''),
      employerTermsReviewVersion: String(env.EMPLOYER_TERMS_REVIEW_VERSION || ''),
      assistedApplicationApproved: String(env.JOB_AGENT_ASSISTED_APPLICATION_APPROVED || '').toLowerCase() === 'true',
      assistedApplicationApprovalVersion: String(env.JOB_AGENT_ASSISTED_APPLICATION_APPROVAL_VERSION || ''),
      controlledBetaApproved: String(env.JOB_AGENT_CONTROLLED_BETA_APPROVED || '').toLowerCase() === 'true',
      controlledBetaApprovalVersion: String(env.JOB_AGENT_CONTROLLED_BETA_APPROVAL_VERSION || ''),
    };
  }
  throw new Error('Unsupported launch-evidence kind.');
}

function payloadDigest(payload) {
  return createHash('sha256').update(canonical(payload)).digest('hex');
}

function signature(payload, secret) {
  return createHmac('sha256', secret).update(`job-agent-launch-evidence.v1.${payloadDigest(payload)}`).digest('hex');
}

function exactSignature(actual, expected) {
  const left = Buffer.from(String(actual || ''), 'hex');
  const right = Buffer.from(String(expected || ''), 'hex');
  return left.length === 32 && right.length === 32 && timingSafeEqual(left, right);
}

export function jobAgentLaunchEvidenceConfiguration(env = process.env) {
  const secret = String(env.JOB_AGENT_LAUNCH_EVIDENCE_SECRET || '');
  return { ready: Buffer.byteLength(secret, 'utf8') >= SECRET_MINIMUM_BYTES, secret };
}

export function jobAgentLaunchEvidenceScopeDigest(kind, env = process.env) {
  if (!KINDS[kind]) throw new Error('Unsupported launch-evidence kind.');
  return createHash('sha256').update(canonical({ schemaVersion: SCHEMA_VERSION, kind, scope: publicScope(kind, env) })).digest('hex');
}

export function buildJobAgentLaunchEvidence({ kind, verifiedAt, evidenceId, artifactSha256 }, env = process.env) {
  const configuration = jobAgentLaunchEvidenceConfiguration(env);
  if (!configuration.ready) throw new Error('JOB_AGENT_LAUNCH_EVIDENCE_SECRET is not configured.');
  if (!KINDS[kind] || !SAFE_ID.test(String(evidenceId || '')) || !SHA256.test(String(artifactSha256 || '').toLowerCase())) throw new Error('Launch evidence metadata is invalid.');
  const date = new Date(String(verifiedAt || ''));
  if (!Number.isFinite(date.getTime())) throw new Error('Launch evidence timestamp is invalid.');
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    kind,
    verifiedAt: date.toISOString(),
    evidenceId: String(evidenceId),
    artifactSha256: String(artifactSha256).toLowerCase(),
    scopeDigest: jobAgentLaunchEvidenceScopeDigest(kind, env),
  };
  return { ...payload, signature: signature(payload, configuration.secret) };
}

export function verifyJobAgentLaunchEvidence(value, { kind, env = process.env, now = new Date() } = {}) {
  const unavailable = { verified: false, verifiedAt: null, evidenceId: null, integrity: null };
  const configuration = jobAgentLaunchEvidenceConfiguration(env);
  if (!configuration.ready || !KINDS[kind]) return unavailable;
  let envelope;
  try { envelope = typeof value === 'string' ? JSON.parse(value) : value; } catch { return unavailable; }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return unavailable;
  const allowedKeys = ['artifactSha256', 'evidenceId', 'kind', 'schemaVersion', 'scopeDigest', 'signature', 'verifiedAt'];
  if (Object.keys(envelope).sort().join('|') !== allowedKeys.sort().join('|')) return unavailable;
  if (envelope.schemaVersion !== SCHEMA_VERSION || envelope.kind !== kind || !SAFE_ID.test(String(envelope.evidenceId || ''))
    || !SHA256.test(String(envelope.artifactSha256 || '').toLowerCase()) || !SHA256.test(String(envelope.scopeDigest || '').toLowerCase())) return unavailable;
  const verifiedAt = new Date(String(envelope.verifiedAt || ''));
  const current = new Date(now);
  const at = verifiedAt.getTime();
  const currentAt = current.getTime();
  if (!Number.isFinite(at) || !Number.isFinite(currentAt) || verifiedAt.toISOString() !== envelope.verifiedAt
    || at > currentAt + 5 * 60_000 || currentAt - at > KINDS[kind].maxAgeDays * 86_400_000) return unavailable;
  const expectedScopeDigest = jobAgentLaunchEvidenceScopeDigest(kind, env);
  if (String(envelope.scopeDigest).toLowerCase() !== expectedScopeDigest) return unavailable;
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    kind,
    verifiedAt: envelope.verifiedAt,
    evidenceId: envelope.evidenceId,
    artifactSha256: String(envelope.artifactSha256).toLowerCase(),
    scopeDigest: expectedScopeDigest,
  };
  if (!exactSignature(envelope.signature, signature(payload, configuration.secret))) return unavailable;
  return { verified: true, verifiedAt: envelope.verifiedAt, evidenceId: envelope.evidenceId, integrity: 'signed-scope-bound' };
}

export const JOB_AGENT_LAUNCH_EVIDENCE_KINDS = Object.freeze(Object.keys(KINDS));
