import { deleteApplicantVault } from './applicant-vault-store.js';
import { deleteAllApplicationFollowUpRemindersForTenant } from './application-follow-up-store.js';
import { deleteAllApplicationReceiptTasks } from './application-receipt-task-store.js';
import { deleteAllDurableApplicationSessions } from './application-session-store.js';
import { deleteAllApplicationSubmissionTasks } from './application-submission-task-store.js';
import { deleteAllEmployerBrowserTasks } from './employer-browser-task-store.js';
import { deleteJobAgentConsent } from './job-agent-consent-store.js';
import { deleteJobAgentNotificationPreference } from './job-agent-notification-store.js';
import { deleteAllApplicationPackageArtifactsForTenant } from './job-agent-object-storage.js';
import { deleteAllJobAgentRuns, jobAgentTenantId } from './job-agent-run-store.js';
import { deleteJobAgentSchedule } from './job-agent-schedule-store.js';
import { deleteTenantCampaignState } from './tenant-campaign-store.js';
import { deleteTenantResidualIdempotencyKeys } from './account-data-lifecycle.js';
import { deleteAllAccountDataExportTasks } from './account-data-export-task.js';
import { deleteJobAgentLearningState } from './job-agent-learning-store.js';

const DEFAULT_OPERATIONS = Object.freeze({
  deleteArtifacts: deleteAllApplicationPackageArtifactsForTenant,
  deleteAccountExports: deleteAllAccountDataExportTasks,
  deleteFollowUps: deleteAllApplicationFollowUpRemindersForTenant,
  deleteRuns: deleteAllJobAgentRuns,
  deleteSessions: deleteAllDurableApplicationSessions,
  deleteBrowserTasks: deleteAllEmployerBrowserTasks,
  deleteSubmissionTasks: deleteAllApplicationSubmissionTasks,
  deleteReceiptTasks: deleteAllApplicationReceiptTasks,
  deleteVault: deleteApplicantVault,
  deleteLearning: deleteJobAgentLearningState,
  deleteCampaign: deleteTenantCampaignState,
  deleteConsent: deleteJobAgentConsent,
  deleteSchedule: deleteJobAgentSchedule,
  deleteNotifications: deleteJobAgentNotificationPreference,
  deleteResidualKeys: deleteTenantResidualIdempotencyKeys,
});

export async function deleteTenantJobAgentOperationalData({ config, subject, operations = {} }) {
  if (!config?.redis || String(config.partitionSecret || '').length < 32 || !subject) throw new Error('Secure tenant deletion is not configured.');
  const execute = { ...DEFAULT_OPERATIONS, ...operations };
  const tenantId = jobAgentTenantId(subject, config.partitionSecret);

  // Provider-backed exports and binaries must be gone before their only durable metadata is removed.
  const accountExports = await execute.deleteAccountExports({ ...config, subject });
  const artifacts = await execute.deleteArtifacts({ tenantId, redis: config.redis, configuration: config.objectStorage });
  // Sweep the authoritative reminder index before session cleanup can remove it.
  const followUps = await execute.deleteFollowUps({ redis: config.redis, tenantId });
  const [runs, sessions, browserTasks, submissionTasks, receiptTasks, vault, learning, campaign, consent, schedule, notifications] = await Promise.all([
    execute.deleteRuns({ ...config, subject }),
    execute.deleteSessions({ ...config, subject }),
    execute.deleteBrowserTasks({ ...config, subject }),
    execute.deleteSubmissionTasks({ ...config, subject }),
    execute.deleteReceiptTasks({ ...config, subject }),
    execute.deleteVault({ ...config, subject }),
    execute.deleteLearning({ ...config, subject }),
    execute.deleteCampaign({ ...config, subject }),
    execute.deleteConsent({ ...config, subject }),
    execute.deleteSchedule({ ...config, subject }),
    execute.deleteNotifications({ ...config, subject }),
  ]);
  const residualKeys = await execute.deleteResidualKeys({ redis: config.redis, tenantId });
  return {
    tenantId, accountExports, artifacts, followUps, runs, sessions, browserTasks, submissionTasks, receiptTasks,
    vault, learning, campaign, consent, schedule, notifications, residualKeys,
  };
}
