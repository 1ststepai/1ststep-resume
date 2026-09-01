import { Redis } from '@upstash/redis';
import { ACCOUNT_DELETE_CONFIRMATION, assertFreshOpaqueSession } from '../lib/account-data-lifecycle.js';
import { deleteTenantJobAgentOperationalData } from '../lib/account-data-deletion.js';
import { buildCompleteAccountDataExport } from '../lib/account-data-export-builder.js';
import { createAccountDataExportTask, readAccountDataExportDownload, readAccountDataExportTask } from '../lib/account-data-export-task.js';
import { applyApiHeaders, authenticateApiRequest, clearAccessSessionCookie, hasJsonContentType, isOriginAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { recordConfiguredJobAgentOperationalEvent } from '../lib/job-agent-operational-metrics.js';
import { revokeAllUserSessions } from '../lib/user-session-store.js';
import { dataEncryptionKeyringFromEnvironment } from '../lib/data-encryption-keyring.js';
import { jobAgentObjectStorageConfiguration } from '../lib/job-agent-object-storage.js';
import { BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED, closeAllEmployerBrowserSessionsBeforeDelete } from '../lib/employer-browser-session-lifecycle.js';
import { shutdownTenantJobAgentAuthorization } from '../lib/job-agent-authorization-shutdown.js';

export const maxDuration = 30;

function configuration() {
  const partitionSecret = String(process.env.RATE_LIMIT_HASH_SECRET || process.env.TIER_SECRET || '');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN || partitionSecret.length < 32) return null;
  let dataEncryptionKey;
  try { dataEncryptionKey = dataEncryptionKeyringFromEnvironment(process.env); } catch { return null; }
  const objectStorage = jobAgentObjectStorageConfiguration(process.env);
  if (String(process.env.VERCEL_ENV || '').toLowerCase() === 'production' && !objectStorage.ready) return null;
  return { redis: Redis.fromEnv(), partitionSecret, dataEncryptionKey, objectStorage };
}

export function accountDataRateLimitPolicy(req = {}) {
  const taskId = String(req.query?.taskId || '');
  const download = taskId && String(req.query?.download || '') === '1';
  if (req.method === 'GET' && taskId && !download) return {
    scope: 'account-data:export-status', message: 'Export status checks are temporarily rate limited.',
    ipRule: { limit: 240, window: '1 h' }, accountRule: { limit: 240, window: '1 h' }, globalRule: { limit: 50_000, window: '1 d' },
  };
  if (req.method === 'GET' && download) return {
    scope: 'account-data:export-download', message: 'Export downloads are temporarily rate limited.',
    ipRule: { limit: 20, window: '1 h' }, accountRule: { limit: 20, window: '1 d' }, globalRule: { limit: 2_000, window: '1 d' },
  };
  if (req.method === 'POST') return {
    scope: 'account-data:export-create', message: 'Export requests are temporarily rate limited.',
    ipRule: { limit: 8, window: '1 h' }, accountRule: { limit: 10, window: '1 d' }, globalRule: { limit: 1_000, window: '1 d' },
  };
  if (req.method === 'DELETE') return {
    scope: 'account-data:delete', message: 'Account-deletion attempts are temporarily rate limited.',
    ipRule: { limit: 6, window: '1 h' }, accountRule: { limit: 10, window: '1 d' }, globalRule: { limit: 500, window: '1 d' },
  };
  return {
    scope: 'account-data:legacy-export', message: 'Legacy export requests are temporarily rate limited.',
    ipRule: { limit: 4, window: '1 h' }, accountRule: { limit: 6, window: '1 d' }, globalRule: { limit: 500, window: '1 d' },
  };
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  const config = configuration();
  if (!config) return res.status(503).json({ error: 'Secure account-data controls are not configured.', code: 'ACCOUNT_DATA_NOT_CONFIGURED' });
  const ratePolicy = accountDataRateLimitPolicy(req);
  const limit = await enforceDurableRateLimit(req, { ...ratePolicy, message: undefined, subject: auth.subject });
  if (!limit.ok) return sendRateLimitResult(res, limit, ratePolicy.message);

  try {
    if (req.method === 'POST') {
      if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
      const created = await createAccountDataExportTask({ ...config, subject: auth.subject });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(created.task.ready ? 200 : 202).json({ task: created.task, replayed: created.replayed, partialExportReturned: false });
    }
    if (req.method === 'GET') {
      const taskId = String(req.query?.taskId || '');
      if (taskId) {
        if (String(req.query?.download || '') === '1') {
          const json = await readAccountDataExportDownload({ ...config, subject: auth.subject, taskId });
          if (json === null) return res.status(409).json({ error: 'The complete export is not ready.', code: 'ACCOUNT_EXPORT_NOT_READY', partialExportReturned: false });
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="1ststep-account-data-${new Date().toISOString().slice(0, 10)}.json"`);
          return res.status(200).send(json);
        }
        const task = await readAccountDataExportTask({ ...config, subject: auth.subject, taskId });
        if (!task) return res.status(404).json({ error: 'Export request not found.', code: 'ACCOUNT_EXPORT_NOT_FOUND' });
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ task, partialExportReturned: false });
      }
      // Retained for older signed clients. The guided UI uses the durable POST/status/download flow.
      const payload = await buildCompleteAccountDataExport({ config, subject: auth.subject });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="1ststep-account-data-${new Date().toISOString().slice(0, 10)}.json"`);
      console.info(JSON.stringify({ type: 'account-data-export', outcome: 'completed', complete: true, delivery: 'legacy-synchronous' }));
      await recordConfiguredJobAgentOperationalEvent('account_export_completed');
      return res.status(200).send(JSON.stringify(payload, null, 2));
    }

    if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    assertFreshOpaqueSession(auth);
    if (String(req.body?.confirmation || '') !== ACCOUNT_DELETE_CONFIRMATION) {
      return res.status(400).json({ error: `Type ${ACCOUNT_DELETE_CONFIRMATION} to confirm permanent Job Agent cloud-data deletion.`, code: 'CONFIRMATION_REQUIRED' });
    }
    const shutdown = await shutdownTenantJobAgentAuthorization({ config, subject: auth.subject });
    if (shutdown.submissionTaskReconciliationRequired || shutdown.browserTaskReconciliationRequired || shutdown.browserSessionCloseRetryRequired || shutdown.authorizationShutdownReconciliationRequired) {
      return res.status(503).json({
        error: 'Active employer work was paused, but one or more started actions still require safe reconciliation before account deletion can finish.',
        code: shutdown.submissionTaskReconciliationRequired ? 'SUBMISSION_TASK_RECONCILIATION_REQUIRED' : shutdown.browserSessionCloseRetryRequired ? BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED : 'AUTHORIZATION_SHUTDOWN_RECONCILIATION_REQUIRED',
        deletionComplete: false, cancelledSubmissionTasks: shutdown.cancelledSubmissionTasks,
        executingSubmissionTasks: shutdown.executingSubmissionTasks, employerBrowserSessionsRequiringRetry: shutdown.retainedBrowserSessions,
      });
    }
    let browserSessions;
    try {
      const remainingBrowserSessions = await closeAllEmployerBrowserSessionsBeforeDelete({ config, subject: auth.subject });
      browserSessions = {
        closed: shutdown.closedBrowserSessions + remainingBrowserSessions.closed,
        deleted: shutdown.closedBrowserSessions + remainingBrowserSessions.deleted,
      };
    } catch (error) {
      if (error?.code === BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED) return res.status(503).json({
        error: 'One or more employer browser sessions could not be safely closed. Encrypted recovery references were preserved; retry account deletion.',
        code: BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED,
        deletionComplete: false,
        closedEmployerBrowserSessionsThisAttempt: Math.max(0, Number(error.closed) || 0),
        deletedEmployerBrowserSessionsThisAttempt: Math.max(0, Number(error.deleted) || 0),
        employerBrowserSessionsRequiringRetry: Math.max(1, Number(error.retryRequired) || 1),
      });
      throw error;
    }
    const { accountExports, artifacts, followUps, runs, sessions, browserTasks, submissionTasks, receiptTasks, vault, learning, campaign, consent, schedule, notifications, residualKeys } = await deleteTenantJobAgentOperationalData({ config, subject: auth.subject });
    const revoked = await revokeAllUserSessions({ ...config, subject: auth.subject });
    clearAccessSessionCookie(res);
    console.info(JSON.stringify({ type: 'account-data-deletion', outcome: 'completed', deletedAccountExports: accountExports.deleted, deletedRuns: runs.deleted, deletedArtifacts: artifacts.deleted, deletedApplicationSessions: sessions.deleted, deletedFollowUpReminders: followUps.deleted, deletedResidualIdempotencyKeys: residualKeys.deleted, deletedEmployerBrowserTasks: browserTasks.deleted, deletedApplicationSubmissionTasks: submissionTasks.deleted, deletedApplicationReceiptTasks: receiptTasks.deleted, deletedApplicantVault: vault.deleted === true, deletedLearningProfile: learning.deleted === true, deletedCampaignState: campaign.deleted === true, deletedConsent: consent.deleted === true, deletedSchedule: schedule.deleted === true, deletedNotificationPreference: notifications.deleted === true, deletedNotificationAuxiliaryRecords: Math.max(0, Number(notifications.auxiliaryRecordsDeleted) || 0), deletedEmployerBrowserSessions: browserSessions.deleted, revokedSessions: revoked.revoked }));
    await recordConfiguredJobAgentOperationalEvent('account_deletion_completed');
    return res.status(200).json({ deleted: true, scope: 'job-agent-operational-data', billingAndSubscriptionRecordsDeleted: false, retentionLockedAuditRecordsDeleted: false, legalRetentionExceptionsDisclosed: true, deletedAccountExports: accountExports.deleted, deletedRuns: runs.deleted, deletedArtifacts: artifacts.deleted, deletedApplicationSessions: sessions.deleted, deletedFollowUpReminders: followUps.deleted, deletedResidualIdempotencyKeys: residualKeys.deleted, deletedEmployerBrowserTasks: browserTasks.deleted, deletedApplicationSubmissionTasks: submissionTasks.deleted, deletedApplicationReceiptTasks: receiptTasks.deleted, deletedApplicantVault: vault.deleted === true, deletedLearningProfile: learning.deleted === true, deletedCampaignState: campaign.deleted === true, deletedConsent: consent.deleted === true, deletedSchedule: schedule.deleted === true, deletedNotificationPreference: notifications.deleted === true, deletedNotificationAuxiliaryRecords: Math.max(0, Number(notifications.auxiliaryRecordsDeleted) || 0), deletedEmployerBrowserSessions: browserSessions.deleted, revokedSessions: revoked.revoked, signedOut: true });
  } catch (error) {
    const message = String(error?.message || '');
    if (message === 'RECENT_SIGN_IN_REQUIRED') return res.status(403).json({ error: 'Sign in again before permanently deleting cloud data.', code: message });
    if (error?.code === 'ACCOUNT_EXPORT_COLLECTION_INCOMPLETE') return res.status(409).json({ error: 'A stable complete account export could not be created. Retry after active Job Agent work finishes or contact support for an assisted complete export.', code: error.code, partialExportReturned: false });
    await recordConfiguredJobAgentOperationalEvent('account_data_failure');
    console.error(JSON.stringify({ type: 'account-data-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'The account-data request could not be completed.' });
  }
}
