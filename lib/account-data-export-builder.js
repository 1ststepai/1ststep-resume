import { ACCOUNT_EXPORT_MAX_RECORDS_PER_COLLECTION, buildAccountDataExport, collectCompleteAccountCollection } from './account-data-lifecycle.js';
import { readApplicantVault } from './applicant-vault-store.js';
import { listApplicationReceiptTaskSummaries } from './application-receipt-task-store.js';
import { listDurableApplicationSessions } from './application-session-store.js';
import { listApplicationSubmissionTaskSummaries } from './application-submission-task-store.js';
import { listEmployerBrowserSessionSummaries } from './employer-browser-session-store.js';
import { listEmployerBrowserTaskSummaries } from './employer-browser-task-store.js';
import { readJobAgentConsent } from './job-agent-consent-store.js';
import { readJobAgentEmailSuppression } from './job-agent-email-suppression.js';
import { readJobAgentNotificationPreference } from './job-agent-notification-store.js';
import { jobAgentTenantId, listJobAgentRuns } from './job-agent-run-store.js';
import { readJobAgentSchedule } from './job-agent-schedule-store.js';
import { readTenantCampaignState } from './tenant-campaign-store.js';
import { readJobAgentLearningState } from './job-agent-learning-store.js';

export async function buildCompleteAccountDataExport({ config, subject, now = new Date() }) {
  const page = read => collectCompleteAccountCollection({ readPage: values => read({ ...config, subject, ...values }) });
  const tenantId = jobAgentTenantId(subject, config.partitionSecret);
  const [consent, schedule, notifications, emailSuppression, vault, learning, campaign, runs, sessions, browserTasks, submissionTasks, receiptTasks, browserSessions] = await Promise.all([
    readJobAgentConsent({ ...config, subject }), readJobAgentSchedule({ ...config, subject }),
    readJobAgentNotificationPreference({ ...config, subject }),
    readJobAgentEmailSuppression({ redis: config.redis, tenantId, dataEncryptionKey: config.dataEncryptionKey }),
    readApplicantVault({ ...config, subject }),
    readJobAgentLearningState({ ...config, subject }),
    readTenantCampaignState({ ...config, subject }), page(listJobAgentRuns), page(listDurableApplicationSessions),
    page(listEmployerBrowserTaskSummaries), page(listApplicationSubmissionTaskSummaries),
    page(listApplicationReceiptTaskSummaries), page(listEmployerBrowserSessionSummaries),
  ]);
  const collections = { jobAgentRuns: runs, applicationSessions: sessions, employerBrowserTasks: browserTasks, applicationSubmissionTasks: submissionTasks, applicationReceiptTasks: receiptTasks, employerBrowserSessions: browserSessions };
  const collectionCompleteness = {
    complete: Object.values(collections).every(collection => collection.complete === true),
    maximumRecordsPerCollection: ACCOUNT_EXPORT_MAX_RECORDS_PER_COLLECTION,
    collections: Object.fromEntries(Object.entries(collections).map(([name, { items: _items, ...summary }]) => [name, summary])),
  };
  return buildAccountDataExport({
    subject, consent, schedule, notifications, emailSuppression, vault, learning, campaign, now,
    runs: runs.items, applicationSessions: sessions.items, employerBrowserTasks: browserTasks.items,
    applicationSubmissionTasks: submissionTasks.items, applicationReceiptTasks: receiptTasks.items,
    employerBrowserSessions: browserSessions.items, collectionCompleteness,
  });
}
