import { applicationAuditHeadExportConfiguration } from './application-audit-head-export.js';
import { applicationAuditArchiveConfiguration, publicApplicationAuditArchiveConfiguration } from './application-audit-archive-provider.js';
import { documentRenderSandboxConfiguration } from './application-package-render-sandbox.js';
import { employerBrowserWorkerConfiguration } from './employer-browser-worker.js';
import { employerBrowserSessionProviderConfiguration } from './employer-browser-session-provider.js';
import { jobAgentConsentPolicyConfiguration } from './job-agent-consent-domain.js';
import { jobAgentConsentEnforcementRequired } from './job-agent-consent-store.js';
import { jobAgentNeedsYouNotificationConfiguration } from './job-agent-notification-store.js';
import { jobAgentEmailSuppressionConfiguration } from './job-agent-email-suppression.js';
import { jobAgentObjectStorageConfiguration } from './job-agent-object-storage.js';
import { jobAgentOperatorAlertConfiguration, publicJobAgentOperatorAlertConfiguration } from './job-agent-operator-alert.js';
import { jobAgentScheduleConfiguration } from './job-agent-schedule-store.js';
import { dataEncryptionKeyringFromEnvironment } from './data-encryption-keyring.js';
import { jobAgentPilotConfiguration } from './job-agent-pilot-access.js';
import { applicationReceiptCaptureConfiguration, publicApplicationReceiptCaptureConfiguration } from './application-receipt-capture-provider.js';
import { applicationSubmissionProviderConfiguration, publicApplicationSubmissionProviderConfiguration } from './application-submission-provider.js';
import { applicationSubmissionTaskWorkerConfiguration, publicApplicationSubmissionTaskWorkerConfiguration } from './application-submission-task-worker.js';
import { jobAgentMonetaryBudgetConfiguration, publicJobAgentMonetaryBudgetConfiguration } from './job-agent-spend-ledger.js';
import { verifyJobAgentLaunchEvidence } from './job-agent-launch-evidence.js';
import { applicationReceiptTaskWorkerConfiguration, publicApplicationReceiptTaskWorkerConfiguration } from './application-receipt-task-worker.js';
import { publicStripeWebhookIdempotencyConfiguration, stripeWebhookIdempotencyConfiguration } from './stripe-webhook-idempotency.js';
import { jobAgentLaunchActionPlan } from './job-agent-launch-plan.js';
import { jobAgentEntitlementConfiguration } from './job-agent-entitlement.js';
import { extensionApplicationHandoffConfiguration } from './extension-application-handoff.js';
import { jobAgentSupportOwnershipConfiguration, publicJobAgentSupportOwnershipConfiguration } from './job-agent-support-ownership.js';
import { controlledExtensionReleaseConfiguration } from './controlled-extension-release.js';

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
const BUDGETS = Object.freeze([
  'AI_GLOBAL_DAILY_UNITS',
  'CLAUDE_GLOBAL_DAILY_UNITS',
  'JOB_SEARCH_GLOBAL_DAILY_CALLS',
  'DISCOVERY_GLOBAL_DAILY_CALLS',
  'PACKAGE_GLOBAL_DAILY_UNITS',
]);

function enabled(value) { return String(value || '').toLowerCase() === 'true'; }
function positiveInteger(value, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max ? parsed : null;
}
function capability(eligible, blockers = []) { return { eligible, blockers: [...new Set(blockers)] }; }
function durableRuntimeConfigured(env, storage, production) {
  const partitionSecret = String(env.RATE_LIMIT_HASH_SECRET || env.TIER_SECRET || '');
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN || partitionSecret.length < 32 || String(env.JOB_AGENT_AUDIT_SECRET || '').length < 32) return false;
  if (production && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(String(env.BETA_DATA_ENCRYPTION_KEY_ID || ''))) return false;
  if (production && !storage.ready) return false;
  try { dataEncryptionKeyringFromEnvironment(env); return true; } catch { return false; }
}

export function jobAgentLaunchManifest(env = process.env, { now = new Date() } = {}) {
  const production = String(env.VERCEL_ENV || '').toLowerCase() === 'production';
  const policy = jobAgentConsentPolicyConfiguration(env);
  const storage = jobAgentObjectStorageConfiguration(env);
  const schedule = jobAgentScheduleConfiguration(env);
  const notifications = jobAgentNeedsYouNotificationConfiguration(env);
  const emailSuppression = jobAgentEmailSuppressionConfiguration(env);
  const auditExport = applicationAuditHeadExportConfiguration(env);
  const auditArchive = applicationAuditArchiveConfiguration(env);
  const alerting = jobAgentOperatorAlertConfiguration(env);
  const render = documentRenderSandboxConfiguration(env);
  const browser = employerBrowserWorkerConfiguration(env);
  const browserSessionProvider = employerBrowserSessionProviderConfiguration(env);
  const receiptCapture = applicationReceiptCaptureConfiguration(env);
  const receiptWorker = applicationReceiptTaskWorkerConfiguration(env);
  const submissionProvider = applicationSubmissionProviderConfiguration(env);
  const submissionWorker = applicationSubmissionTaskWorkerConfiguration(env, { now });
  const monetaryBudget = jobAgentMonetaryBudgetConfiguration(env);
  const stripeWebhookIdempotency = stripeWebhookIdempotencyConfiguration(env);
  const entitlementPolicy = jobAgentEntitlementConfiguration(env);
  const extensionHandoff = extensionApplicationHandoffConfiguration(env);
  const runtimeConfigured = durableRuntimeConfigured(env, storage, production);
  const notificationDelivery = verifyJobAgentLaunchEvidence(env.JOB_AGENT_NOTIFICATION_DELIVERY_EVIDENCE, { kind: 'notification-delivery', env, now });
  const alertDelivery = verifyJobAgentLaunchEvidence(env.JOB_AGENT_ALERT_DELIVERY_EVIDENCE, { kind: 'operator-alert-delivery', env, now });
  const recoveryDrill = verifyJobAgentLaunchEvidence(env.JOB_AGENT_RECOVERY_DRILL_EVIDENCE, { kind: 'recovery-drill', env, now });
  const backupRestore = verifyJobAgentLaunchEvidence(env.JOB_AGENT_BACKUP_RESTORE_EVIDENCE, { kind: 'backup-restore', env, now });
  const objectStorageDrill = verifyJobAgentLaunchEvidence(env.JOB_AGENT_OBJECT_STORAGE_DRILL_EVIDENCE, { kind: 'private-object-storage', env, now });
  const auditArchiveEvidence = verifyJobAgentLaunchEvidence(env.JOB_AGENT_AUDIT_ARCHIVE_EVIDENCE, { kind: 'audit-archive', env, now });
  const controlledBetaRelease = verifyJobAgentLaunchEvidence(env.JOB_AGENT_CONTROLLED_BETA_RELEASE_EVIDENCE, { kind: 'controlled-beta-release', env, now });
  const pilotMaxUsers = positiveInteger(env.JOB_AGENT_PILOT_MAX_USERS, 10);
  const pilotAdmission = jobAgentPilotConfiguration(env);
  const supportOwnership = jobAgentSupportOwnershipConfiguration(env);
  const budgetsConfigured = BUDGETS.every(name => positiveInteger(env[name]));
  const receiptIngestionConfigured = String(env.JOB_AGENT_RECEIPT_SECRET || '').length >= 32;
  const releaseIdentityConfigured = /^[a-f0-9]{40}$/.test(String(env.VERCEL_GIT_COMMIT_SHA || '').trim().toLowerCase())
    && /^[a-f0-9]{64}$/.test(String(env.JOB_AGENT_RELEASE_RUNTIME_SHA256 || '').trim().toLowerCase());
  const browserRunnerEvidence = verifyJobAgentLaunchEvidence(env.EMPLOYER_BROWSER_RUNNER_EVIDENCE, { kind: 'employer-browser-runner', env, now });
  const browserProviderReady = browserSessionProvider.enabled === true
    && browserSessionProvider.provider === 'remote-stream'
    && browserSessionProvider.viewMode === 'interactive-stream'
    && browserSessionProvider.interactive === true;
  const browserSessionRecovery = verifyJobAgentLaunchEvidence(env.EMPLOYER_BROWSER_SESSION_RECOVERY_EVIDENCE, { kind: 'employer-browser-session-recovery', env, now });
  const finalSubmissionExecutionEvidence = verifyJobAgentLaunchEvidence(env.JOB_AGENT_FINAL_SUBMISSION_EXECUTION_EVIDENCE, { kind: 'final-submission-execution', env, now });
  const employerTermsReviewRecorded = VERSION.test(String(env.EMPLOYER_TERMS_REVIEW_VERSION || ''));
  const assistedApplicationApproved = enabled(env.JOB_AGENT_ASSISTED_APPLICATION_APPROVED)
    && VERSION.test(String(env.JOB_AGENT_ASSISTED_APPLICATION_APPROVAL_VERSION || ''));
  const assistedExecutionMode = String(env.JOB_AGENT_ASSISTED_EXECUTION_MODE || 'greenhouse-extension').trim().toLowerCase();
  const extensionSelected = assistedExecutionMode === 'greenhouse-extension';
  const cloudBrowserSelected = assistedExecutionMode === 'cloud-browser';
  const extensionReviewed = enabled(env.JOB_AGENT_GREENHOUSE_EXTENSION_APPROVED)
    && VERSION.test(String(env.JOB_AGENT_GREENHOUSE_EXTENSION_REVIEW_VERSION || ''));
  const extensionRelease = controlledExtensionReleaseConfiguration(env);

  const signedBetaBlockers = [];
  if (!runtimeConfigured) signedBetaBlockers.push('DURABLE_RUNTIME_NOT_CONFIGURED');
  if (production && !storage.ready) signedBetaBlockers.push('PRIVATE_DOCUMENT_STORAGE_NOT_CONFIGURED');
  if (production && !objectStorageDrill.verified) signedBetaBlockers.push('PRIVATE_DOCUMENT_STORAGE_DRILL_NOT_VERIFIED');
  if (!policy.ready || !jobAgentConsentEnforcementRequired(env)) signedBetaBlockers.push('COUNSEL_APPROVED_CONSENT_NOT_CONFIGURED');
  if (!schedule.enabled) signedBetaBlockers.push('BACKGROUND_SCHEDULING_NOT_CONFIGURED');
  if (!notifications.enabled) signedBetaBlockers.push('NEEDS_YOU_NOTIFICATIONS_NOT_CONFIGURED');
  if (!emailSuppression.ready) signedBetaBlockers.push('NEEDS_YOU_SUPPRESSION_NOT_CONFIGURED');
  if (!notificationDelivery.verified) signedBetaBlockers.push('NEEDS_YOU_DELIVERY_NOT_VERIFIED');
  if (!auditExport || !auditArchive.ready) signedBetaBlockers.push('AUDIT_ARCHIVE_NOT_CONFIGURED');
  if (!auditArchiveEvidence.verified) signedBetaBlockers.push('AUDIT_ARCHIVE_NOT_VERIFIED');
  if (!alerting) signedBetaBlockers.push('OPERATOR_ALERTING_NOT_CONFIGURED');
  if (!alertDelivery.verified) signedBetaBlockers.push('OPERATOR_ALERT_DELIVERY_NOT_VERIFIED');
  if (!stripeWebhookIdempotency) signedBetaBlockers.push('STRIPE_WEBHOOK_IDEMPOTENCY_NOT_CONFIGURED');
  if (!recoveryDrill.verified) signedBetaBlockers.push('RECOVERY_DRILL_NOT_VERIFIED');
  if (!backupRestore.verified) signedBetaBlockers.push('BACKUP_RESTORE_NOT_VERIFIED');
  if (!budgetsConfigured || !enabled(env.JOB_AGENT_COST_LIMITS_APPROVED) || !VERSION.test(String(env.JOB_AGENT_COST_LIMITS_APPROVAL_VERSION || ''))) signedBetaBlockers.push('COST_LIMITS_NOT_APPROVED');
  if (!monetaryBudget.ready) signedBetaBlockers.push('MONETARY_SPEND_CONTROL_NOT_CONFIGURED');
  if (!receiptIngestionConfigured) signedBetaBlockers.push('RECEIPT_INGESTION_NOT_CONFIGURED');
  if (!enabled(env.JOB_AGENT_CONTROLLED_BETA_APPROVED) || !pilotMaxUsers || !VERSION.test(String(env.JOB_AGENT_CONTROLLED_BETA_APPROVAL_VERSION || ''))) signedBetaBlockers.push('CONTROLLED_BETA_NOT_APPROVED');
  if (!releaseIdentityConfigured || !controlledBetaRelease.verified) signedBetaBlockers.push('CONTROLLED_BETA_RELEASE_NOT_VERIFIED');
  if (!pilotAdmission.ready || pilotAdmission.maxUsers !== pilotMaxUsers) signedBetaBlockers.push('PILOT_ADMISSION_CONTROL_NOT_CONFIGURED');
  if (!entitlementPolicy.ready) signedBetaBlockers.push('JOB_AGENT_ACCESS_POLICY_NOT_CONFIGURED');
  if (!supportOwnership.ready) signedBetaBlockers.push('SUPPORT_AND_INCIDENT_OWNERSHIP_NOT_CONFIGURED');

  const signedBeta = capability(signedBetaBlockers.length === 0, signedBetaBlockers);
  const packageBlockers = [...signedBetaBlockers];
  if (!render.enabled) packageBlockers.push('DOCUMENT_RENDER_SANDBOX_NOT_CONFIGURED');
  const packageReady = capability(packageBlockers.length === 0, packageBlockers);
  const assistedBlockers = [...packageBlockers];
  if (!employerTermsReviewRecorded) assistedBlockers.push('EMPLOYER_TERMS_REVIEW_NOT_RECORDED');
  if (!assistedApplicationApproved) assistedBlockers.push('ASSISTED_APPLICATION_NOT_APPROVED');
  if (!extensionSelected && !cloudBrowserSelected) assistedBlockers.push('ASSISTED_EXECUTION_MODE_INVALID');
  else if (extensionSelected) {
    if (!extensionHandoff.ready) assistedBlockers.push('GREENHOUSE_EXTENSION_HANDOFF_NOT_CONFIGURED');
    if (!extensionReviewed) assistedBlockers.push('GREENHOUSE_EXTENSION_REVIEW_NOT_RECORDED');
    if (!extensionRelease.ready) assistedBlockers.push('GREENHOUSE_EXTENSION_ARTIFACT_NOT_VERIFIED');
  } else if (cloudBrowserSelected) {
    if (!browser.enabled) assistedBlockers.push('EMPLOYER_BROWSER_CONFIGURATION_NOT_READY');
    if (!browserRunnerEvidence.verified) assistedBlockers.push('EMPLOYER_BROWSER_RUNNER_EVIDENCE_NOT_VERIFIED');
    if (!browserProviderReady) assistedBlockers.push('EMPLOYER_BROWSER_REMOTE_STREAM_NOT_READY');
    if (!browserSessionRecovery.verified) assistedBlockers.push('EMPLOYER_BROWSER_SESSION_RECOVERY_NOT_VERIFIED');
  }
  const assistedApplication = capability(assistedBlockers.length === 0, assistedBlockers);
  const finalSubmissionBlockers = [
    ...assistedBlockers,
    ...(!submissionProvider.ready ? ['FINAL_SUBMISSION_EXECUTION_NOT_CONFIGURED'] : []),
    ...(!submissionWorker.ready ? ['FINAL_SUBMISSION_DURABLE_EXECUTION_NOT_CONFIGURED'] : []),
    ...(!finalSubmissionExecutionEvidence.verified ? ['FINAL_SUBMISSION_SUPERVISED_EXECUTION_NOT_VERIFIED'] : []),
    ...(!receiptCapture.ready ? ['AUTHORITATIVE_RECEIPT_CAPTURE_NOT_CONFIGURED'] : []),
    ...(!receiptWorker.ready ? ['AUTHORITATIVE_RECEIPT_WORKER_NOT_CONFIGURED'] : []),
  ];
  const finalSubmission = capability(finalSubmissionBlockers.length === 0, finalSubmissionBlockers);
  const currentMode = finalSubmission.eligible ? 'final-submission'
    : assistedApplication.eligible ? 'assisted-application'
      : packageReady.eligible ? 'package-ready'
        : signedBeta.eligible ? 'signed-beta' : 'preview';

  const capabilities = {
    preview: capability(true),
    signedBeta,
    packageReady,
    assistedApplication,
    finalSubmission,
  };
  return {
    schemaVersion: 1,
    releaseClass: 'controlled-production-beta',
    currentMode,
    pilot: {
      approved: enabled(env.JOB_AGENT_CONTROLLED_BETA_APPROVED) && Boolean(pilotMaxUsers), maxUsers: pilotMaxUsers,
      admissionEnforced: pilotAdmission.ready, invitedTenantCount: pilotAdmission.invitedTenantCount,
    },
    accessPolicy: entitlementPolicy,
    supportAndIncidentOwnership: publicJobAgentSupportOwnershipConfiguration(supportOwnership),
    assistedExecutionMode,
    extensionHandoff: { ready: extensionHandoff.ready === true, provider: extensionHandoff.provider || 'greenhouse', valuesPersistedByExtension: false, submissionsEnabled: false, release: extensionRelease },
    authoritativeReceiptCapture: publicApplicationReceiptCaptureConfiguration(receiptCapture),
    authoritativeReceiptVerification: publicApplicationReceiptTaskWorkerConfiguration(receiptWorker),
    finalSubmissionExecution: publicApplicationSubmissionProviderConfiguration(submissionProvider),
    finalSubmissionOrchestration: publicApplicationSubmissionTaskWorkerConfiguration(submissionWorker),
    monetarySpendControl: publicJobAgentMonetaryBudgetConfiguration(monetaryBudget),
    needsYouEmailSuppression: { ready: emailSuppression.ready === true, provider: 'resend', contractVersion: emailSuppression.contractVersion, retentionDays: emailSuppression.retentionDays, storesRecipient: false },
    operatorAlerting: publicJobAgentOperatorAlertConfiguration(alerting),
    auditArchive: publicApplicationAuditArchiveConfiguration(auditArchive),
    stripeWebhookIdempotency: publicStripeWebhookIdempotencyConfiguration(stripeWebhookIdempotency),
    evidence: {
      notificationDelivery,
      operatorAlertDelivery: alertDelivery,
      recoveryDrill,
      backupRestore,
      privateObjectStorage: objectStorageDrill,
      auditArchive: auditArchiveEvidence,
      controlledBetaRelease,
      employerBrowserRunner: browserRunnerEvidence,
      employerBrowserSessionRecovery: browserSessionRecovery,
      finalSubmissionExecution: finalSubmissionExecutionEvidence,
    },
    capabilities,
    actionPlan: jobAgentLaunchActionPlan(capabilities),
    externalApplicationExecution: false,
    submissionsEnabled: finalSubmission.eligible,
  };
}
