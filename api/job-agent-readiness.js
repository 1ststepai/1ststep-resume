import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { applyApiHeaders, authenticateApiRequest, isOriginAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { claimJobAgentRun, createJobAgentRun, deleteJobAgentRun, finishJobAgentRun, readJobAgentRun } from '../lib/job-agent-run-store.js';
import { jobAgentRuntimeConfiguration } from '../lib/job-agent-runtime-configuration.js';
import { grantVaultConsent, upsertVaultFact } from '../lib/applicant-vault-domain.js';
import { deleteApplicantVault, readApplicantVault, saveApplicantVault } from '../lib/applicant-vault-store.js';
import { documentRenderSandboxConfiguration } from '../lib/application-package-render-sandbox.js';
import { employerBrowserWorkerConfiguration } from '../lib/employer-browser-worker.js';
import { employerBrowserSessionProviderConfiguration } from '../lib/employer-browser-session-provider.js';
import { createApplicationSession, pauseApplicationSession } from '../lib/application-session-domain.js';
import { createDurableApplicationSession, deleteDurableApplicationSession, listDurableApplicationSessionAudit, readDurableApplicationSession, updateDurableApplicationSession } from '../lib/application-session-store.js';
import { createUserSession, readUserSession, revokeUserSession } from '../lib/user-session-store.js';
import { readJobAgentWorkerExecutionHealth, recordConfiguredJobAgentOperationalEvent } from '../lib/job-agent-operational-metrics.js';
import { jobAgentOperatorAlertConfiguration, sendConfiguredJobAgentOperatorAlert } from '../lib/job-agent-operator-alert.js';
import { jobAgentConsentPolicyConfiguration } from '../lib/job-agent-consent-domain.js';
import { jobAgentConsentEnforcementRequired } from '../lib/job-agent-consent-store.js';
import { jobAgentScheduleConfiguration } from '../lib/job-agent-schedule-store.js';
import { applicationAuditHeadExportConfiguration, buildApplicationAuditHeadExport, verifyApplicationAuditHeadExport } from '../lib/application-audit-head-export.js';
import { applicationAuditArchiveConfiguration, publicApplicationAuditArchiveConfiguration } from '../lib/application-audit-archive-provider.js';
import { deleteJobAgentNotificationPreference, enqueueNeedsYouNotification, jobAgentNeedsYouNotificationConfiguration, readJobAgentNotificationPreference, readNeedsYouNotificationOutbox, saveJobAgentNotificationPreference } from '../lib/job-agent-notification-store.js';
import { deleteApplicationPackageArtifacts, jobAgentObjectStorageConfiguration, persistApplicationPackageArtifacts, readApplicationPackageArtifact } from '../lib/job-agent-object-storage.js';
import { jobAgentLaunchManifest } from '../lib/job-agent-launch-manifest.js';
import { publicJobAgentLaunchActionPlan } from '../lib/job-agent-launch-plan.js';
import { authorizeReadinessDrillRequest } from '../lib/job-agent-readiness-drill-contract.js';
import { isAdminSubject } from './session-capabilities.js';

export const maxDuration = 30;

function readinessErrorCode(error) {
  const message = String(error?.message || '');
  if (error?.code === 'ERR_MODULE_NOT_FOUND' || /cannot find (?:module|package)/i.test(message)) return 'MODULE_NOT_FOUND';
  if (error?.code === 'ENOENT' || /no such file/i.test(message)) return 'ASSET_NOT_FOUND';
  if (/worker/i.test(message)) return 'PDF_WORKER_SETUP';
  if (/font/i.test(message)) return 'FONT_RESOURCE';
  if (/Synthetic package artifact generation failed/i.test(message)) return 'ARTIFACT_QA_REJECTED';
  if (/payload exceeds/i.test(message)) return 'PAYLOAD_LIMIT';
  if (/lease/i.test(message)) return 'LEASE_STATE';
  if (/audit/i.test(message)) return 'AUDIT_INTEGRITY';
  if (/signed-user session/i.test(message)) return 'SIGNED_USER_SESSION';
  return 'UNCLASSIFIED';
}

function missingModuleIdentifier(error) {
  const message = String(error?.message || '');
  const match = /Cannot find (?:module|package) ['"]([^'"]+)['"]/.exec(message);
  const identifier = String(match?.[1] || '').replace(/[^@A-Za-z0-9_./-]/g, '').slice(0, 160);
  return identifier || undefined;
}

function exactSecretMatch(value, expected) {
  const supplied = Buffer.from(String(value || ''));
  const configured = Buffer.from(String(expected || ''));
  return configured.length > 0 && supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

export async function authorizeJobAgentReadinessRequest(req, { env = process.env, sessionRuntime = null } = {}) {
  const authorization = String(req.headers?.authorization || '');
  if (authorization.startsWith('Bearer ') && exactSecretMatch(authorization.slice(7), env.CRON_SECRET)) {
    return { ok: true, actor: 'cron', rateLimitSubject: 'job-agent-readiness-cron' };
  }
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true, env, sessionRuntime });
  if (!auth.ok) return auth;
  if (auth.localDevelopment !== true && !isAdminSubject(auth.subject, env)) {
    return { ok: false, status: 403, code: 'ADMIN_ACCESS_REQUIRED' };
  }
  return { ok: true, actor: auth.localDevelopment ? 'development-admin' : 'administrator', rateLimitSubject: auth.subject };
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const authorization = await authorizeJobAgentReadinessRequest(req);
  if (!authorization.ok) return res.status(authorization.status || 401).json({ error: authorization.code === 'ADMIN_ACCESS_REQUIRED' ? 'Administrator access is required.' : 'Request not authorized.', code: authorization.code || 'AUTH_REQUIRED' });
  const drillAuthorization = authorizeReadinessDrillRequest(req, authorization);
  if (!drillAuthorization.ok) return res.status(drillAuthorization.status).json({
    error: 'Synthetic readiness lifecycle checks require the protected operator command and explicit action confirmation.',
    code: drillAuthorization.code, externalApplicationExecution: false, submissionsEnabled: false,
  });
  const launchManifest = jobAgentLaunchManifest();
  const launchActionPlan = publicJobAgentLaunchActionPlan(launchManifest.actionPlan);
  const objectStorage = jobAgentObjectStorageConfiguration();
  if (String(process.env.VERCEL_ENV || '').toLowerCase() === 'production' && !objectStorage.ready) return res.status(503).json({
    status: 'unavailable', durableStore: 'unknown', failedStage: 'encrypted-object-storage',
    encryptedObjectStorage: 'not-configured', malwareScanning: objectStorage.scanner?.enabled ? 'configured' : 'not-configured',
    launchActionPlan, externalApplicationExecution: false,
  });
  const config = jobAgentRuntimeConfiguration();
  if (!config) return res.status(503).json({ status: 'unavailable', durableStore: 'not-configured', launchActionPlan, externalApplicationExecution: false });
  const consentControlConfigured = jobAgentConsentPolicyConfiguration().ready && jobAgentConsentEnforcementRequired();
  if (jobAgentConsentEnforcementRequired() && !consentControlConfigured) return res.status(503).json({
    status: 'unavailable', durableStore: 'unknown', failedStage: 'job-agent-consent-control',
    jobAgentConsentControl: 'not-configured', launchActionPlan, externalApplicationExecution: false,
  });
  const backgroundScheduling = jobAgentScheduleConfiguration();
  if (String(process.env.VERCEL_ENV || '').toLowerCase() === 'production' && !backgroundScheduling.enabled) return res.status(503).json({
    status: 'unavailable', durableStore: 'unknown', failedStage: 'background-scheduling',
    jobAgentConsentControl: consentControlConfigured ? 'configured' : 'not-configured', backgroundScheduling: 'not-configured', launchActionPlan, externalApplicationExecution: false,
  });
  const auditHeadExportConfig = applicationAuditHeadExportConfiguration();
  const auditArchiveConfig = applicationAuditArchiveConfiguration();
  if (String(process.env.VERCEL_ENV || '').toLowerCase() === 'production' && (!auditHeadExportConfig || !auditArchiveConfig.ready)) return res.status(503).json({
    status: 'unavailable', durableStore: 'unknown', failedStage: 'audit-retention-archive',
    jobAgentConsentControl: consentControlConfigured ? 'configured' : 'not-configured', backgroundScheduling: backgroundScheduling.enabled ? 'configured' : 'not-configured',
    retentionAuditHeadExport: 'not-configured', retentionAuditArchive: publicApplicationAuditArchiveConfiguration(auditArchiveConfig), launchActionPlan, externalApplicationExecution: false,
  });
  const needsYouNotificationConfig = jobAgentNeedsYouNotificationConfiguration();
  if (String(process.env.VERCEL_ENV || '').toLowerCase() === 'production' && !needsYouNotificationConfig.enabled) return res.status(503).json({
    status: 'unavailable', durableStore: 'unknown', failedStage: 'needs-you-notifications',
    jobAgentConsentControl: consentControlConfigured ? 'configured' : 'not-configured', backgroundScheduling: backgroundScheduling.enabled ? 'configured' : 'not-configured',
    retentionAuditHeadExport: auditHeadExportConfig && auditArchiveConfig.ready ? 'configured' : 'not-configured', retentionAuditArchive: publicApplicationAuditArchiveConfiguration(auditArchiveConfig), needsYouNotifications: 'not-configured', launchActionPlan, externalApplicationExecution: false,
  });
  if (String(process.env.VERCEL_ENV || '').toLowerCase() === 'production' && !launchManifest.capabilities.signedBeta.eligible) return res.status(503).json({
    status: 'unavailable', durableStore: 'unknown', failedStage: 'controlled-beta-launch-manifest',
    launchMode: launchManifest.currentMode, requiredLaunchMode: 'signed-beta',
    assistedExecutionMode: launchManifest.assistedExecutionMode, extensionHandoff: launchManifest.extensionHandoff,
    supportAndIncidentOwnership: launchManifest.supportAndIncidentOwnership,
    launchBlockers: launchManifest.capabilities.signedBeta.blockers, launchActionPlan,
    externalApplicationExecution: false, submissionsEnabled: false,
  });
  const limit = await enforceDurableRateLimit(req, {
    scope: 'job-agent-readiness', subject: authorization.rateLimitSubject,
    ipRule: { limit: 5, window: '1 m' }, accountRule: { limit: 50, window: '1 d' }, globalRule: { limit: 200, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Readiness checks are temporarily rate limited.');
  let readinessStage = 'redis-ping';
  let durableStore = 'unknown';
  let backgroundWorker = { status: backgroundScheduling.enabled ? 'unknown' : 'not-configured', lastSeenAt: null, outcome: null, ageSeconds: null };
  try {
    const response = await config.redis.ping();
    if (String(response).toUpperCase() !== 'PONG') throw new Error('Unexpected store response.');
    durableStore = 'reachable';
    if (backgroundScheduling.enabled) {
      readinessStage = 'background-worker-execution';
      backgroundWorker = await readJobAgentWorkerExecutionHealth({ redis: config.redis });
      if (String(process.env.VERCEL_ENV || '').toLowerCase() === 'production' && !['healthy', 'running'].includes(backgroundWorker.status)) {
        throw new Error('Background worker execution is not healthy.');
      }
    }
    readinessStage = 'durable-lifecycle';
    let durableRunLifecycle = 'not-requested';
    let applicantVaultLifecycle = 'not-requested';
    let applicationPackageLifecycle = 'not-requested';
    let applicationPackageArtifactLifecycle = 'not-requested';
    let applicationSessionLifecycle = 'not-requested';
    let applicationAuditLifecycle = 'not-requested';
    let signedUserSessionLifecycle = 'not-requested';
    let auditHeadExportLifecycle = 'not-requested';
    let notificationPreferenceLifecycle = 'not-requested';
    if (String(req.query?.session || '') === '1') {
      const sessionLimit = await enforceDurableRateLimit(req, {
        scope: 'job-agent-readiness-session', ipRule: { limit: 2, window: '1 h' }, globalRule: { limit: 10, window: '1 d' },
      });
      if (!sessionLimit.ok) return sendRateLimitResult(res, sessionLimit, 'Signed-user session readiness verification is temporarily rate limited.');
      const sessionNonce = randomBytes(12).toString('hex');
      const sessionSubject = `readiness-session-${sessionNonce}@example.test`;
      let syntheticSession = null;
      try {
        readinessStage = 'signed-user-session-create';
        syntheticSession = await createUserSession({ ...config, subject: sessionSubject, tier: 'complete', ttlSeconds: 300 });
        readinessStage = 'signed-user-session-restore';
        const restoredSession = await readUserSession({ ...config, token: syntheticSession.token });
        if (restoredSession?.subject !== sessionSubject || restoredSession?.tier !== 'complete' || restoredSession?.authentication !== 'opaque-session') throw new Error('Encrypted signed-user session restore failed.');
        readinessStage = 'signed-user-session-revoke';
        await revokeUserSession({ ...config, token: syntheticSession.token, subject: sessionSubject });
        syntheticSession = null;
        if (await readUserSession({ ...config, token: restoredSession.sessionToken })) throw new Error('Signed-user session revocation failed.');
        signedUserSessionLifecycle = 'verified';
      } finally {
        if (syntheticSession) await revokeUserSession({ ...config, token: syntheticSession.token, subject: sessionSubject }).catch(() => false);
      }
    }
    if (String(req.query?.notification || '') === '1') {
      const notificationLimit = await enforceDurableRateLimit(req, {
        scope: 'job-agent-readiness-notification', ipRule: { limit: 2, window: '1 h' }, globalRule: { limit: 10, window: '1 d' },
      });
      if (!notificationLimit.ok) return sendRateLimitResult(res, notificationLimit, 'Notification-preference readiness verification is temporarily rate limited.');
      const notificationNonce = randomBytes(12).toString('hex');
      const notificationSubject = `readiness-notification-${notificationNonce}@example.test`;
      try {
        readinessStage = 'notification-preference-create';
        const savedPreference = await saveJobAgentNotificationPreference({
          ...config, subject: notificationSubject, enabled: true, expectedVersion: 0,
          idempotencyKey: `notification_readiness_${notificationNonce}`,
        });
        readinessStage = 'notification-preference-restore';
        const restoredPreference = await readJobAgentNotificationPreference({ ...config, subject: notificationSubject });
        if (savedPreference.preference?.enabled !== true || restoredPreference.preference?.enabled !== true || restoredPreference.version !== 1) throw new Error('Encrypted notification preference restore failed.');
        readinessStage = 'notification-outbox-create';
        const actionId = `action_notification_${notificationNonce}`;
        const syntheticNotificationEnv = { JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED: 'true', RESEND_API_KEY: 'readiness-no-send-key'.padEnd(32, 'x'), RESEND_FROM: 'readiness@example.test', RESEND_WEBHOOK_SECRET: `whsec_${'r'.repeat(40)}`, JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS: '365' };
        const queued = await enqueueNeedsYouNotification({ ...config, subject: notificationSubject, actionId, env: syntheticNotificationEnv });
        const restoredOutbox = await readNeedsYouNotificationOutbox({ ...config, subject: notificationSubject, actionId });
        if (queued.status !== 'queued' || restoredOutbox?.status !== 'queued' || restoredOutbox.recipientActionVerified !== false) throw new Error('Encrypted notification outbox restore failed.');
        notificationPreferenceLifecycle = 'verified';
      } finally {
        await deleteJobAgentNotificationPreference({ ...config, subject: notificationSubject }).catch(() => false);
      }
    }
    if (String(req.query?.audit || '') === '1') {
      const auditLimit = await enforceDurableRateLimit(req, {
        scope: 'job-agent-readiness-audit', ipRule: { limit: 2, window: '1 h' }, globalRule: { limit: 10, window: '1 d' },
      });
      if (!auditLimit.ok) return sendRateLimitResult(res, auditLimit, 'Application-audit readiness verification is temporarily rate limited.');
      const auditNonce = randomBytes(12).toString('hex');
      const auditSubject = `readiness-audit-${auditNonce}@example.test`;
      const auditSession = createApplicationSession({
        packageRunId: `run_audit_${auditNonce}`, packageQaVerified: true, documentVersion: `audit-v1-${auditNonce}`,
        employer: 'Synthetic Employer', title: 'Synthetic Role', requisitionId: `SYNTH-${auditNonce}`,
        directEmployerUrl: `https://example.test/jobs/${auditNonce}`, proposedFields: [],
      });
      try {
        readinessStage = 'application-audit-create';
        const createdAuditSession = await createDurableApplicationSession({ ...config, subject: auditSubject, session: auditSession, idempotencyKey: `audit_readiness_${auditNonce}` });
        const { version: auditVersion, audit: _createdAuditHead, ...auditEditable } = createdAuditSession.session;
        const pausedAuditSession = pauseApplicationSession(auditEditable, 'Synthetic audit readiness checkpoint.');
        readinessStage = 'application-audit-update';
        await updateDurableApplicationSession({ ...config, subject: auditSubject, sessionId: auditSession.id, expectedVersion: auditVersion, session: pausedAuditSession });
        readinessStage = 'application-audit-verify';
        const verifiedAudit = await listDurableApplicationSessionAudit({ ...config, subject: auditSubject, sessionId: auditSession.id });
        if (verifiedAudit?.integrityVerified !== true || verifiedAudit.count !== 2 || !verifiedAudit.headHash || !verifiedAudit.headSignature) throw new Error('Signed application-audit lifecycle failed.');
        if (auditHeadExportConfig) {
          const exportedHead = buildApplicationAuditHeadExport({ audit: verifiedAudit, exportSigningSecret: auditHeadExportConfig.secret });
          if (verifyApplicationAuditHeadExport(exportedHead, auditHeadExportConfig.secret).verified !== true) throw new Error('Signed audit-head export lifecycle failed.');
          auditHeadExportLifecycle = 'verified';
        }
        applicationSessionLifecycle = 'verified';
        applicationAuditLifecycle = 'verified';
      } finally {
        await deleteDurableApplicationSession({ ...config, subject: auditSubject, sessionId: auditSession.id }).catch(() => false);
      }
    }
    const deepRequested = String(req.query?.deep || '') === '1';
    const packageRequested = String(req.query?.package || '') === '1';
    if (deepRequested || packageRequested) {
      const deepLimit = await enforceDurableRateLimit(req, {
        scope: packageRequested && !deepRequested ? 'job-agent-readiness-package' : 'job-agent-readiness-deep', ipRule: { limit: 2, window: '1 h' }, globalRule: { limit: 10, window: '1 d' },
      });
      if (!deepLimit.ok) return sendRateLimitResult(res, deepLimit, 'Deep readiness verification is temporarily rate limited.');
      const nonce = randomBytes(12).toString('hex');
      const subject = `readiness-${nonce}@example.test`;
      let runId = '';
      let packageRunId = '';
      let packageArtifacts = [];
      let applicationSessionId = '';
      try {
        if (deepRequested) {
          readinessStage = 'durable-run';
          const created = await createJobAgentRun({
            ...config, subject, idempotencyKey: `readiness_${nonce}`,
            mission: { role: 'readiness fixture', workModes: ['Remote'], location: 'United States', target: 1 },
          });
          runId = created.run.id;
          const claimed = await claimJobAgentRun({ ...config, runId });
          if (!claimed) throw new Error('Lease claim failed.');
          await finishJobAgentRun({
            ...config, runId, leaseToken: claimed.leaseToken,
            result: { jobs: [], sourceSummary: [], authority: 'readiness-no-external-call', externalApplicationExecution: false },
          });
          const restored = await readJobAgentRun({ ...config, subject, runId });
          if (restored?.status !== 'Finished' || restored?.result?.externalApplicationExecution !== false) throw new Error('Encrypted restore failed.');
          durableRunLifecycle = 'verified';
          readinessStage = 'applicant-vault';
          let vault = grantVaultConsent({ scopes: ['confirmed-facts', 'documents'] });
          vault = upsertVaultFact(vault, { fieldKey: 'skills', label: 'Readiness fixture', value: 'Synthetic readiness fixture', provenance: 'synthetic readiness probe', confidence: 1, verificationState: 'user-confirmed', autoReuse: true });
          await saveApplicantVault({ ...config, subject, vault, expectedVersion: 0, idempotencyKey: `vault_readiness_${nonce}` });
          const restoredVault = await readApplicantVault({ ...config, subject });
          if (restoredVault.version !== 1 || restoredVault.vault?.facts?.[0]?.versions?.[0]?.value !== 'Synthetic readiness fixture') throw new Error('Encrypted vault restore failed.');
          applicantVaultLifecycle = 'verified';
        }
        readinessStage = 'application-package-create';
        const packageCreated = await createJobAgentRun({
          ...config, subject, taskType: 'application_package', idempotencyKey: `package_readiness_${nonce}`,
          mission: {
            roleId: 'synthetic-readiness-role', employer: 'Synthetic Employer', title: 'Synthetic Role', requisitionId: 'SYNTH-1',
            directEmployerUrl: 'https://example.test/jobs/synth-1', applyPathActive: true,
            jobDescription: 'Synthetic verified employer job description for encrypted lifecycle testing only. '.repeat(5),
            resumeText: 'Synthetic candidate-reviewed resume content for encrypted lifecycle testing only. '.repeat(5), includeCoverLetter: true,
          },
        });
        packageRunId = packageCreated.run.id;
        readinessStage = 'application-package-claim';
        const packageClaimed = await claimJobAgentRun({ ...config, runId: packageRunId });
        if (!packageClaimed) throw new Error('Package lease claim failed.');
        const syntheticResume = `SYNTHETIC CANDIDATE\nsynthetic@example.test\n\nSUMMARY\nSynthetic private package result for an encrypted artifact lifecycle check.\n\nEXPERIENCE\n- Synthetic candidate-reviewed responsibility used only by this readiness probe.\n- Synthetic verified application-document generation and extraction experience.\n\nEDUCATION\nSynthetic verified education fixture.\n\nSKILLS\nSynthetic document verification.`;
        readinessStage = 'application-package-artifacts';
        const { buildApplicationPackageArtifacts } = await import('../lib/application-package-artifacts.js');
        const artifactBuild = await buildApplicationPackageArtifacts({
          employer: 'Synthetic Employer', title: 'Synthetic Role', documentVersion: `${packageRunId}_v1`,
          resumeText: syntheticResume, coverLetterText: 'Dear Hiring Team,\n\nThis is a synthetic private cover-letter artifact used only for an encrypted readiness check.\n\nSincerely,\nSynthetic Candidate',
        });
        if (artifactBuild.qa.issues.length || artifactBuild.artifacts.length !== 4) throw new Error('Synthetic package artifact generation failed.');
        readinessStage = 'application-package-object-storage';
        packageArtifacts = await persistApplicationPackageArtifacts({
          artifacts: artifactBuild.artifacts, tenantId: packageClaimed.tenantId, runId: packageRunId,
          dataEncryptionKey: config.dataEncryptionKey, redis: config.redis, configuration: config.objectStorage,
        });
        readinessStage = 'application-package-finish';
        await finishJobAgentRun({
          ...config, runId: packageRunId, leaseToken: packageClaimed.leaseToken,
          result: { roleId: 'synthetic-readiness-role', documentVersion: `${packageRunId}_v1`, resumeText: syntheticResume, coverLetterText: '', artifacts: packageArtifacts, qa: artifactBuild.qa, qaStatus: 'synthetic-artifact-lifecycle-only', transmission: 'none', submission: 'none', externalApplicationExecution: false },
        });
        readinessStage = 'application-package-restore';
        const restoredPackage = await readJobAgentRun({ ...config, subject, runId: packageRunId });
        if (restoredPackage?.taskType !== 'application_package' || restoredPackage?.result?.transmission !== 'none') throw new Error('Encrypted package restore failed.');
        const restoredArtifact = restoredPackage.result.artifacts?.find(artifact => artifact.key === 'resume_pdf');
        const restoredBytes = await readApplicationPackageArtifact({ artifact: restoredArtifact, tenantId: packageClaimed.tenantId, runId: packageRunId, dataEncryptionKey: config.dataEncryptionKey, configuration: config.objectStorage });
        if (!restoredBytes.length || createHash('sha256').update(restoredBytes).digest('hex') !== restoredArtifact.sha256) throw new Error('Encrypted package artifact restore failed.');
        applicationPackageLifecycle = 'verified';
        applicationPackageArtifactLifecycle = 'verified';
        if (deepRequested) {
          readinessStage = 'application-session';
          const applicationSession = createApplicationSession({
            packageRunId, packageQaVerified: true, documentVersion: restoredPackage.result.documentVersion,
            employer: 'Synthetic Employer', title: 'Synthetic Role', requisitionId: 'SYNTH-1',
            directEmployerUrl: 'https://example.test/jobs/synth-1', proposedFields: [],
          });
          applicationSessionId = applicationSession.id;
          await createDurableApplicationSession({ ...config, subject, session: applicationSession, idempotencyKey: `application_readiness_${nonce}` });
          const restoredApplication = await readDurableApplicationSession({ ...config, subject, sessionId: applicationSessionId });
          if (restoredApplication?.state !== 'Waiting for You' || restoredApplication?.externalApplicationExecution !== false || restoredApplication?.actions?.[0]?.type !== 'TRANSMISSION_APPROVAL') throw new Error('Encrypted application-session restore failed.');
          applicationSessionLifecycle = 'verified';
          readinessStage = 'application-audit';
          const restoredAudit = await listDurableApplicationSessionAudit({ ...config, subject, sessionId: applicationSessionId });
          if (restoredAudit?.integrityVerified !== true || restoredAudit.count !== 1 || !restoredAudit.headHash || !restoredAudit.headSignature) throw new Error('Signed application-audit lifecycle failed.');
          if (auditHeadExportConfig) {
            const exportedHead = buildApplicationAuditHeadExport({ audit: restoredAudit, exportSigningSecret: auditHeadExportConfig.secret });
            if (verifyApplicationAuditHeadExport(exportedHead, auditHeadExportConfig.secret).verified !== true) throw new Error('Signed audit-head export lifecycle failed.');
            auditHeadExportLifecycle = 'verified';
          }
          applicationAuditLifecycle = 'verified';
        }
      } finally {
        if (runId) await deleteJobAgentRun({ ...config, subject, runId }).catch(() => false);
        if (packageRunId) {
          const packageRun = await readJobAgentRun({ ...config, subject, runId: packageRunId }).catch(() => null);
          await deleteApplicationPackageArtifacts({ artifacts: packageRun?.result?.artifacts?.length ? packageRun.result.artifacts : packageArtifacts, redis: config.redis, configuration: config.objectStorage }).catch(() => false);
          await deleteJobAgentRun({ ...config, subject, runId: packageRunId }).catch(() => false);
        }
        if (applicationSessionId) await deleteDurableApplicationSession({ ...config, subject, sessionId: applicationSessionId }).catch(() => false);
        await deleteApplicantVault({ ...config, subject }).catch(() => false);
      }
    }
    return res.status(200).json({
      status: 'ready', readyFor: launchManifest.currentMode, launchManifest, durableStore: 'reachable', encryptionConfigured: true,
      supportAndIncidentOwnership: launchManifest.supportAndIncidentOwnership,
      encryptedObjectStorage: config.objectStorage.mode === 'vercel-blob-private' ? 'configured' : 'development-fallback',
      malwareScanning: config.objectStorage.scanner?.enabled ? 'configured' : 'development-deterministic-only',
      tenantPartitioningConfigured: true, directEmployerDiscovery: true,
      documentRenderSandbox: documentRenderSandboxConfiguration().enabled ? 'configured' : 'not-configured',
      employerBrowserWorker: employerBrowserWorkerConfiguration().enabled ? 'configured' : 'not-configured',
      employerBrowserSessionProvider: (() => {
        const provider = employerBrowserSessionProviderConfiguration();
        return {
          status: provider.enabled === true && provider.provider === 'remote-stream' && provider.interactive === true ? 'configured' : 'not-configured',
          provider: provider.provider,
          viewMode: provider.viewMode || null,
          interactive: provider.interactive === true,
          reason: provider.enabled === true ? null : provider.reason,
        };
      })(),
      authoritativeReceiptIngestion: String(process.env.JOB_AGENT_RECEIPT_SECRET || '').length >= 32 ? 'configured' : 'not-configured',
      authoritativeReceiptCaptureConnector: launchManifest.authoritativeReceiptCapture.ready ? 'configured' : 'not-configured',
      authoritativeReceiptVerificationWorker: launchManifest.authoritativeReceiptVerification.ready ? 'configured' : 'not-configured',
      jobAgentConsentControl: consentControlConfigured ? 'configured' : 'not-configured',
      backgroundScheduling: backgroundScheduling.enabled ? 'configured' : 'not-configured',
      backgroundWorker,
      tamperEvidentApplicationAudit: String(process.env.JOB_AGENT_AUDIT_SECRET || '').length >= 32 ? 'configured' : 'not-configured',
      retentionAuditHeadExport: auditHeadExportConfig && auditArchiveConfig.ready ? 'configured' : 'not-configured',
      retentionAuditArchive: publicApplicationAuditArchiveConfiguration(auditArchiveConfig),
      needsYouNotifications: needsYouNotificationConfig.enabled ? 'configured' : 'not-configured',
      revocableSignedUserSessions: true,
      subscriberAuthentication: 'opaque-http-only-required',
      tenantDataLifecycle: true,
      contentFreeOperationalMetrics: true,
      contentFreeOperatorAlerts: jobAgentOperatorAlertConfiguration() ? 'configured' : 'not-configured',
      durableApplicationSessions: true, signedUserSessionLifecycle, durableRunLifecycle, applicantVaultLifecycle, applicationPackageLifecycle, applicationPackageArtifactLifecycle, applicationSessionLifecycle, applicationAuditLifecycle, auditHeadExportLifecycle, notificationPreferenceLifecycle, externalApplicationExecution: false, submissionsEnabled: launchManifest.submissionsEnabled,
    });
  } catch (error) {
    await recordConfiguredJobAgentOperationalEvent('readiness_failure');
    await sendConfiguredJobAgentOperatorAlert('readiness_failure');
    console.error(JSON.stringify({
      type: 'job-agent-readiness-error', stage: readinessStage, code: readinessErrorCode(error),
      name: error?.name || 'unknown', missingModule: missingModuleIdentifier(error),
    }));
    return res.status(503).json({
      status: 'unavailable', durableStore: readinessStage === 'redis-ping' ? 'unreachable' : durableStore,
      failedStage: String(readinessStage).replace(/[^a-z0-9-]/gi, '').slice(0, 80) || 'unknown',
      ...(readinessStage === 'background-worker-execution' ? { backgroundScheduling: 'configured', backgroundWorker } : {}),
      externalApplicationExecution: false, submissionsEnabled: false,
    });
  }
}
