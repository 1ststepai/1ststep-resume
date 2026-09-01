import { jobAgentLaunchManifest } from './job-agent-launch-manifest.js';
import { verifyJobAgentLaunchEvidence } from './job-agent-launch-evidence.js';

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;

const requirement = (id, variableNames, kind = 'present') => Object.freeze({
  id,
  variableNames: Object.freeze(Array.isArray(variableNames) ? variableNames : [variableNames]),
  kind,
});

export const PRODUCTION_ENVIRONMENT_CONTROLS = Object.freeze([
  Object.freeze({ id: 'durable-runtime', requirements: Object.freeze([
    requirement('redis-url', 'UPSTASH_REDIS_REST_URL', 'https-url'),
    requirement('redis-token', 'UPSTASH_REDIS_REST_TOKEN', 'secret24'),
    requirement('tenant-partition-secret', ['RATE_LIMIT_HASH_SECRET', 'TIER_SECRET'], 'secret32'),
    requirement('audit-signing-secret', 'JOB_AGENT_AUDIT_SECRET', 'secret32'),
    requirement('receipt-signing-secret', 'JOB_AGENT_RECEIPT_SECRET', 'secret32'),
    requirement('active-encryption-key', 'BETA_DATA_ENCRYPTION_KEY', 'encryption-key'),
    requirement('active-encryption-key-id', 'BETA_DATA_ENCRYPTION_KEY_ID', 'key-id'),
  ]) }),
  Object.freeze({ id: 'private-document-storage', requirements: Object.freeze([
    requirement('storage-enabled', 'JOB_AGENT_OBJECT_STORAGE_ENABLED', 'enabled'),
    requirement('private-blob-token', 'BLOB_READ_WRITE_TOKEN', 'secret24'),
    requirement('scanner-enabled', 'JOB_AGENT_MALWARE_SCANNER_ENABLED', 'enabled'),
    requirement('scanner-url', 'JOB_AGENT_MALWARE_SCANNER_URL', 'https-url'),
    requirement('scanner-host', 'JOB_AGENT_MALWARE_SCANNER_HOST', 'host'),
    requirement('scanner-bearer-token', 'JOB_AGENT_MALWARE_SCANNER_BEARER_TOKEN', 'secret24'),
  ]) }),
  Object.freeze({ id: 'consent-policy', requirements: Object.freeze([
    requirement('consent-enforcement', 'JOB_AGENT_CONSENT_ENFORCEMENT', 'enabled'),
    requirement('counsel-approval', 'JOB_AGENT_COUNSEL_APPROVED', 'enabled'),
    requirement('terms-version', 'JOB_AGENT_TERMS_VERSION', 'version'),
    requirement('privacy-version', 'JOB_AGENT_PRIVACY_VERSION', 'version'),
    requirement('authorization-version', 'JOB_AGENT_AUTHORIZATION_VERSION', 'version'),
  ]) }),
  Object.freeze({ id: 'background-scheduling', requirements: Object.freeze([
    requirement('scheduler-enabled', 'JOB_AGENT_SCHEDULE_ENABLED', 'enabled'),
    requirement('global-daily-run-cap', 'JOB_AGENT_SCHEDULE_GLOBAL_DAILY_RUNS', 'positive-integer'),
  ]) }),
  Object.freeze({ id: 'needs-you-delivery', requirements: Object.freeze([
    requirement('email-enabled', 'JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED', 'enabled'),
    requirement('email-provider-key', 'RESEND_API_KEY', 'secret24'),
    requirement('email-from', 'RESEND_FROM', 'email'),
    requirement('suppression-webhook-secret', 'RESEND_WEBHOOK_SECRET', 'resend-webhook-secret'),
    requirement('suppression-retention', 'JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS', 'retention-days'),
  ]) }),
  Object.freeze({ id: 'cost-controls', requirements: Object.freeze([
    requirement('cost-limits-approved', 'JOB_AGENT_COST_LIMITS_APPROVED', 'enabled'),
    requirement('cost-limits-version', 'JOB_AGENT_COST_LIMITS_APPROVAL_VERSION', 'version'),
    requirement('ai-daily-cap', 'AI_GLOBAL_DAILY_UNITS', 'positive-integer'),
    requirement('claude-daily-cap', 'CLAUDE_GLOBAL_DAILY_UNITS', 'positive-integer'),
    requirement('job-search-daily-cap', 'JOB_SEARCH_GLOBAL_DAILY_CALLS', 'positive-integer'),
    requirement('discovery-daily-cap', 'DISCOVERY_GLOBAL_DAILY_CALLS', 'positive-integer'),
    requirement('package-daily-cap', 'PACKAGE_GLOBAL_DAILY_UNITS', 'positive-integer'),
    requirement('monetary-budget-enabled', 'JOB_AGENT_MONETARY_BUDGET_ENABLED', 'enabled'),
    requirement('monetary-budget-approved', 'JOB_AGENT_MONETARY_BUDGET_APPROVED', 'enabled'),
    requirement('monetary-budget-version', 'JOB_AGENT_MONETARY_BUDGET_APPROVAL_VERSION', 'version'),
    requirement('monetary-budget-currency', 'JOB_AGENT_MONETARY_BUDGET_CURRENCY', 'usd'),
    requirement('global-daily-budget', 'JOB_AGENT_GLOBAL_DAILY_BUDGET_CENTS', 'positive-integer'),
    requirement('ai-monetary-daily-cap', 'JOB_AGENT_AI_DAILY_BUDGET_CENTS', 'positive-integer'),
    requirement('ai-monetary-request-cap', 'JOB_AGENT_AI_MAX_REQUEST_CENTS', 'positive-integer'),
    requirement('package-monetary-daily-cap', 'JOB_AGENT_PACKAGE_AI_DAILY_BUDGET_CENTS', 'positive-integer'),
    requirement('package-monetary-request-cap', 'JOB_AGENT_PACKAGE_AI_MAX_REQUEST_CENTS', 'positive-integer'),
    requirement('render-monetary-daily-cap', 'JOB_AGENT_DOCUMENT_RENDER_DAILY_BUDGET_CENTS', 'positive-integer'),
    requirement('render-monetary-request-cap', 'JOB_AGENT_DOCUMENT_RENDER_MAX_REQUEST_CENTS', 'positive-integer'),
    requirement('browser-monetary-daily-cap', 'JOB_AGENT_EMPLOYER_BROWSER_DAILY_BUDGET_CENTS', 'positive-integer'),
    requirement('browser-monetary-session-cap', 'JOB_AGENT_EMPLOYER_BROWSER_MAX_SESSION_CENTS', 'positive-integer'),
    requirement('email-monetary-daily-cap', 'JOB_AGENT_EMAIL_DAILY_BUDGET_CENTS', 'positive-integer'),
    requirement('email-monetary-request-cap', 'JOB_AGENT_EMAIL_MAX_REQUEST_CENTS', 'positive-integer'),
    requirement('storage-monetary-daily-cap', 'JOB_AGENT_OBJECT_STORAGE_DAILY_BUDGET_CENTS', 'positive-integer'),
    requirement('storage-monetary-request-cap', 'JOB_AGENT_OBJECT_STORAGE_MAX_REQUEST_CENTS', 'positive-integer'),
  ]) }),
  Object.freeze({ id: 'controlled-beta', requirements: Object.freeze([
    requirement('beta-approved', 'JOB_AGENT_CONTROLLED_BETA_APPROVED', 'enabled'),
    requirement('beta-approval-version', 'JOB_AGENT_CONTROLLED_BETA_APPROVAL_VERSION', 'version'),
    requirement('pilot-cap', 'JOB_AGENT_PILOT_MAX_USERS', 'pilot-cap'),
    requirement('access-policy', 'JOB_AGENT_ACCESS_POLICY_VERSION', 'version'),
    requirement('included-legacy-tiers', 'JOB_AGENT_CONTROLLED_BETA_INCLUDED_TIERS', 'controlled-beta-tiers'),
    requirement('stripe-idempotency-secret', 'STRIPE_WEBHOOK_IDEMPOTENCY_SECRET', 'secret32'),
    requirement('pilot-enforcement', 'JOB_AGENT_PILOT_ENFORCEMENT', 'enabled'),
    requirement('pilot-allowed-tenants', 'JOB_AGENT_PILOT_ALLOWED_TENANTS', 'csv'),
  ]) }),
  Object.freeze({ id: 'audit-archive', requirements: Object.freeze([
    requirement('audit-export-secret', 'JOB_AGENT_AUDIT_EXPORT_SECRET', 'secret32'),
    requirement('archive-enabled', 'JOB_AGENT_AUDIT_ARCHIVE_ENABLED', 'enabled'),
    requirement('archive-approved', 'JOB_AGENT_AUDIT_ARCHIVE_APPROVED', 'enabled'),
    requirement('archive-approval-version', 'JOB_AGENT_AUDIT_ARCHIVE_APPROVAL_VERSION', 'version'),
    requirement('archive-contract-version', 'JOB_AGENT_AUDIT_ARCHIVE_CONTRACT_VERSION', 'version'),
    requirement('archive-legal-hold-version', 'JOB_AGENT_AUDIT_ARCHIVE_LEGAL_HOLD_POLICY_VERSION', 'version'),
    requirement('archive-retention-days', 'JOB_AGENT_AUDIT_ARCHIVE_RETENTION_DAYS', 'archive-retention-days'),
    requirement('archive-url', 'JOB_AGENT_AUDIT_ARCHIVE_URL', 'https-url'),
    requirement('archive-allowed-hosts', 'JOB_AGENT_AUDIT_ARCHIVE_ALLOWED_HOSTS', 'csv'),
    requirement('archive-bearer-token', 'JOB_AGENT_AUDIT_ARCHIVE_BEARER_TOKEN', 'secret24'),
    requirement('archive-ack-secret', 'JOB_AGENT_AUDIT_ARCHIVE_ACK_SECRET', 'secret32'),
  ]) }),
  Object.freeze({ id: 'operator-alerting', requirements: Object.freeze([
    requirement('alert-url', 'JOB_AGENT_ALERT_WEBHOOK_URL', 'https-url'),
    requirement('alert-allowed-hosts', 'JOB_AGENT_ALERT_ALLOWED_HOSTS', 'csv'),
    requirement('alert-bearer-token', 'JOB_AGENT_ALERT_BEARER_TOKEN', 'secret24'),
    requirement('alert-contract-version', 'JOB_AGENT_ALERT_CONTRACT_VERSION', 'version'),
    requirement('alert-cooldown', 'JOB_AGENT_ALERT_COOLDOWN_SECONDS', 'positive-integer'),
  ]) }),
  Object.freeze({ id: 'signed-launch-evidence', requirements: Object.freeze([
    requirement('notification-delivery', 'JOB_AGENT_NOTIFICATION_DELIVERY_EVIDENCE', 'evidence:notification-delivery'),
    requirement('operator-alert-delivery', 'JOB_AGENT_ALERT_DELIVERY_EVIDENCE', 'evidence:operator-alert-delivery'),
    requirement('recovery-drill', 'JOB_AGENT_RECOVERY_DRILL_EVIDENCE', 'evidence:recovery-drill'),
    requirement('backup-restore', 'JOB_AGENT_BACKUP_RESTORE_EVIDENCE', 'evidence:backup-restore'),
    requirement('private-object-storage', 'JOB_AGENT_OBJECT_STORAGE_DRILL_EVIDENCE', 'evidence:private-object-storage'),
    requirement('audit-archive', 'JOB_AGENT_AUDIT_ARCHIVE_EVIDENCE', 'evidence:audit-archive'),
    requirement('controlled-beta-release', 'JOB_AGENT_CONTROLLED_BETA_RELEASE_EVIDENCE', 'evidence:controlled-beta-release'),
  ]) }),
  Object.freeze({ id: 'support-ownership', requirements: Object.freeze([
    requirement('ownership-approved', 'JOB_AGENT_SUPPORT_INCIDENT_APPROVED', 'enabled'),
    requirement('ownership-contract-version', 'JOB_AGENT_SUPPORT_INCIDENT_CONTRACT_VERSION', 'version'),
    requirement('support-owner', 'JOB_AGENT_SUPPORT_OWNER', 'present'),
    requirement('incident-owner', 'JOB_AGENT_INCIDENT_OWNER', 'present'),
    requirement('coverage-version', 'JOB_AGENT_SUPPORT_COVERAGE_VERSION', 'version'),
    requirement('escalation-version', 'JOB_AGENT_INCIDENT_ESCALATION_POLICY_VERSION', 'version'),
    requirement('runbook-version', 'JOB_AGENT_INCIDENT_RUNBOOK_VERSION', 'version'),
    requirement('runbook-fingerprint', 'JOB_AGENT_INCIDENT_RUNBOOK_SHA256', 'sha256'),
  ]) }),
  Object.freeze({ id: 'document-render', stage: 'package-ready', requirements: Object.freeze([
    requirement('render-sandbox-enabled', 'DOCUMENT_RENDER_SANDBOX_ENABLED', 'enabled'),
    requirement('render-snapshot-id', 'DOCUMENT_RENDER_SANDBOX_SNAPSHOT_ID', 'version'),
  ]) }),
  Object.freeze({ id: 'assisted-greenhouse', stage: 'assisted-application', requirements: Object.freeze([
    requirement('employer-terms-review', 'EMPLOYER_TERMS_REVIEW_VERSION', 'version'),
    requirement('assisted-application-approved', 'JOB_AGENT_ASSISTED_APPLICATION_APPROVED', 'enabled'),
    requirement('assisted-application-version', 'JOB_AGENT_ASSISTED_APPLICATION_APPROVAL_VERSION', 'version'),
    requirement('extension-handoff-enabled', 'JOB_AGENT_EXTENSION_HANDOFF_ENABLED', 'enabled'),
    requirement('extension-handoff-secret', 'JOB_AGENT_EXTENSION_HANDOFF_SECRET', 'secret32'),
    requirement('extension-review-approved', 'JOB_AGENT_GREENHOUSE_EXTENSION_APPROVED', 'enabled'),
    requirement('extension-review-version', 'JOB_AGENT_GREENHOUSE_EXTENSION_REVIEW_VERSION', 'version'),
    requirement('extension-artifact-sha256', 'JOB_AGENT_GREENHOUSE_EXTENSION_SHA256', 'sha256'),
  ]) }),
  Object.freeze({ id: 'final-submission', stage: 'final-submission', requirements: Object.freeze([
    requirement('submission-enabled', 'JOB_AGENT_FINAL_SUBMISSION_EXECUTION_ENABLED', 'enabled'),
    requirement('submission-approved', 'JOB_AGENT_FINAL_SUBMISSION_EXECUTION_APPROVED', 'enabled'),
    requirement('submission-approval-version', 'JOB_AGENT_FINAL_SUBMISSION_EXECUTION_APPROVAL_VERSION', 'version'),
    requirement('durable-submission-enabled', 'JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_ENABLED', 'enabled'),
    requirement('durable-submission-approved', 'JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_APPROVED', 'enabled'),
    requirement('durable-submission-version', 'JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_APPROVAL_VERSION', 'version'),
    requirement('submission-evidence', 'JOB_AGENT_FINAL_SUBMISSION_EXECUTION_EVIDENCE', 'evidence:final-submission-execution'),
    requirement('receipt-capture-enabled', 'JOB_AGENT_RECEIPT_CAPTURE_ENABLED', 'enabled'),
    requirement('receipt-capture-approved', 'JOB_AGENT_RECEIPT_CAPTURE_APPROVED', 'enabled'),
    requirement('receipt-capture-version', 'JOB_AGENT_RECEIPT_CAPTURE_APPROVAL_VERSION', 'version'),
    requirement('receipt-capture-url', 'JOB_AGENT_RECEIPT_CAPTURE_URL', 'https-url'),
    requirement('receipt-capture-host', 'JOB_AGENT_RECEIPT_CAPTURE_HOST', 'host'),
    requirement('receipt-capture-kinds', 'JOB_AGENT_RECEIPT_CAPTURE_KINDS', 'csv'),
    requirement('receipt-worker-enabled', 'JOB_AGENT_RECEIPT_VERIFICATION_WORKER_ENABLED', 'enabled'),
    requirement('receipt-worker-approved', 'JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVED', 'enabled'),
    requirement('receipt-worker-version', 'JOB_AGENT_RECEIPT_VERIFICATION_WORKER_APPROVAL_VERSION', 'version'),
    requirement('remote-browser-enabled', 'EMPLOYER_BROWSER_REMOTE_STREAM_ENABLED', 'enabled'),
    requirement('remote-browser-api-url', 'EMPLOYER_BROWSER_REMOTE_STREAM_API_URL', 'https-url'),
    requirement('remote-browser-api-key', 'EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY', 'secret24'),
    requirement('remote-browser-origin', 'EMPLOYER_BROWSER_REMOTE_STREAM_ORIGIN', 'https-origin'),
    requirement('remote-browser-csp-approved', 'EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED', 'enabled'),
    requirement('remote-browser-csp-version', 'EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVAL_VERSION', 'version'),
    requirement('remote-browser-costs-approved', 'EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVED', 'enabled'),
    requirement('remote-browser-costs-version', 'EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVAL_VERSION', 'version'),
  ]) }),
]);

function stateFor(value, kind, env, now) {
  const text = String(value || '').trim();
  if (!text) return 'absent';
  if (kind === 'present') return 'valid';
  if (kind === 'csv') return text.split(',').map(item => item.trim()).filter(Boolean).length > 0 ? 'valid' : 'invalid';
  if (kind === 'enabled') return text.toLowerCase() === 'true' ? 'valid' : 'invalid';
  if (kind === 'secret24') return text.length >= 24 ? 'valid' : 'invalid';
  if (kind === 'secret32') return text.length >= 32 ? 'valid' : 'invalid';
  if (kind === 'encryption-key') {
    try { return Buffer.from(text, 'base64').length === 32 ? 'valid' : 'invalid'; } catch { return 'invalid'; }
  }
  if (kind === 'resend-webhook-secret') return /^whsec_[A-Za-z0-9_+/=-]{32,}$/.test(text) ? 'valid' : 'invalid';
  if (kind === 'usd') return text === 'USD' ? 'valid' : 'invalid';
  if (kind === 'controlled-beta-tiers') {
    const tiers = [...new Set(text.split(',').map(item => item.trim().toLowerCase()).filter(Boolean))];
    return tiers.length > 0 && tiers.every(item => item === 'essential' || item === 'complete') ? 'valid' : 'invalid';
  }
  if (kind === 'version') return VERSION.test(text) ? 'valid' : 'invalid';
  if (kind === 'sha256') return /^[a-f0-9]{64}$/i.test(text) ? 'valid' : 'invalid';
  if (kind === 'key-id') return /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(text) ? 'valid' : 'invalid';
  if (kind === 'host') return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(text) ? 'valid' : 'invalid';
  if (kind === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? 'valid' : 'invalid';
  if (kind === 'https-url') {
    try { return new URL(text).protocol === 'https:' ? 'valid' : 'invalid'; } catch { return 'invalid'; }
  }
  if (kind === 'https-origin') {
    try {
      const url = new URL(text);
      return url.protocol === 'https:' && url.origin === text.replace(/\/$/, '') ? 'valid' : 'invalid';
    } catch { return 'invalid'; }
  }
  if (kind.startsWith('evidence:')) return verifyJobAgentLaunchEvidence(text, { kind: kind.slice(9), env, now }).verified ? 'valid' : 'invalid';
  const integer = Number(text);
  if (kind === 'positive-integer') return Number.isSafeInteger(integer) && integer > 0 ? 'valid' : 'invalid';
  if (kind === 'pilot-cap') return Number.isSafeInteger(integer) && integer >= 1 && integer <= 10 ? 'valid' : 'invalid';
  if (kind === 'retention-days') return Number.isSafeInteger(integer) && integer >= 30 && integer <= 730 ? 'valid' : 'invalid';
  if (kind === 'archive-retention-days') return Number.isSafeInteger(integer) && integer >= 365 && integer <= 3650 ? 'valid' : 'invalid';
  return 'invalid';
}

function inspectRequirement(spec, env, now) {
  const candidates = spec.variableNames.map(name => ({ name, state: stateFor(env[name], spec.kind, env, now) }));
  const valid = candidates.find(candidate => candidate.state === 'valid');
  const state = valid ? 'valid' : candidates.some(candidate => candidate.state === 'invalid') ? 'invalid' : 'absent';
  return {
    id: spec.id,
    variableNames: [...spec.variableNames],
    state,
    satisfiedBy: valid?.name || null,
  };
}

export function productionEnvironmentShapeReport(env = process.env, { now = new Date(), authoritativeProductionRuntimeEvidence = false } = {}) {
  const controls = PRODUCTION_ENVIRONMENT_CONTROLS.map(control => {
    const requirements = control.requirements.map(spec => inspectRequirement(spec, env, now));
    return {
      id: control.id,
      stage: control.stage || 'signed-beta',
      ready: requirements.every(item => item.state === 'valid'),
      requirements,
      missingCount: requirements.filter(item => item.state === 'absent').length,
      invalidCount: requirements.filter(item => item.state === 'invalid').length,
    };
  });
  const manifest = jobAgentLaunchManifest({ ...env, VERCEL_ENV: 'production' }, { now });
  return {
    schemaVersion: 1,
    report: 'job-agent-production-environment-shape',
    contentFree: true,
    containsSecretValues: false,
    writesProductionState: false,
    performsExternalCalls: false,
    evaluatedAs: authoritativeProductionRuntimeEvidence ? 'deployed-production-runtime' : 'production-rules-applied-to-current-process',
    authoritativeProductionRuntimeEvidence: authoritativeProductionRuntimeEvidence === true,
    controls,
    summary: {
      readyControls: controls.filter(control => control.ready).length,
      totalControls: controls.length,
      readyControlsByStage: Object.fromEntries(['signed-beta', 'package-ready', 'assisted-application', 'final-submission'].map(stage => [stage, controls.filter(control => control.stage === stage && control.ready).length])),
      totalControlsByStage: Object.fromEntries(['signed-beta', 'package-ready', 'assisted-application', 'final-submission'].map(stage => [stage, controls.filter(control => control.stage === stage).length])),
      missingRequirements: controls.reduce((sum, control) => sum + control.missingCount, 0),
      invalidRequirements: controls.reduce((sum, control) => sum + control.invalidCount, 0),
      signedBetaEligible: manifest.capabilities.signedBeta.eligible,
      signedBetaBlockers: manifest.capabilities.signedBeta.blockers,
      stages: Object.fromEntries(Object.entries(manifest.capabilities).map(([stage, value]) => [stage, { eligible: value.eligible, blockerCount: value.blockers.length, blockers: value.blockers }])),
      nextAction: manifest.actionPlan.nextAction,
    },
  };
}

export function publicProductionEnvironmentShapeReport(report = productionEnvironmentShapeReport()) {
  return {
    schemaVersion: report.schemaVersion,
    report: report.report,
    contentFree: report.contentFree === true,
    containsSecretValues: false,
    writesProductionState: false,
    performsExternalCalls: false,
    evaluatedAs: report.evaluatedAs,
    authoritativeProductionRuntimeEvidence: report.authoritativeProductionRuntimeEvidence === true,
    controls: report.controls.map(control => ({
      id: control.id,
      stage: control.stage,
      ready: control.ready === true,
      absent: control.requirements.filter(item => item.state === 'absent').map(item => item.id),
      invalid: control.requirements.filter(item => item.state === 'invalid').map(item => item.id),
    })),
    summary: {
      readyControls: report.summary.readyControls,
      totalControls: report.summary.totalControls,
      readyControlsByStage: report.summary.readyControlsByStage,
      totalControlsByStage: report.summary.totalControlsByStage,
      missingRequirements: report.summary.missingRequirements,
      invalidRequirements: report.summary.invalidRequirements,
      signedBetaEligible: report.summary.signedBetaEligible,
      signedBetaBlockerCount: report.summary.signedBetaBlockers.length,
      stages: Object.fromEntries(Object.entries(report.summary.stages).map(([stage, value]) => [stage, { eligible: value.eligible, blockerCount: value.blockerCount }])),
      nextAction: report.summary.nextAction,
    },
  };
}
