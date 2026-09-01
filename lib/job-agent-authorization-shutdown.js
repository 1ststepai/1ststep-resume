import { cancelArmedApplicationSubmissionBeforeProvider, cancelReservedApplicationSubmission, cancelReservedApplicationTransmission, pauseApplicationSession } from './application-session-domain.js';
import { listDurableApplicationSessions, updateDurableApplicationSession } from './application-session-store.js';
import { closeAllEmployerBrowserSessionsBeforeDelete } from './employer-browser-session-lifecycle.js';
import { cancelPendingEmployerBrowserTasksForTenant } from './employer-browser-task-store.js';
import { cancelPendingApplicationSubmissionTasksForTenant } from './application-submission-task-store.js';
import { cancelPendingApplicationReceiptTasksForTenant } from './application-receipt-task-store.js';
import { jobAgentTenantId, listJobAgentRuns, setJobAgentRunStatus } from './job-agent-run-store.js';
import { pauseJobAgentScheduleForTenant } from './job-agent-schedule-store.js';

const ACTIVE_RUN_STATES = new Set(['Searching', 'Preparing', 'Waiting for You']);

export async function shutdownTenantJobAgentAuthorization({ config, subject, env = process.env, now = new Date(), dependencies = {} }) {
  const deps = {
    cancelTasks: cancelPendingEmployerBrowserTasksForTenant,
    cancelSubmissionTasks: cancelPendingApplicationSubmissionTasksForTenant,
    cancelReceiptTasks: cancelPendingApplicationReceiptTasksForTenant,
    closeSessions: closeAllEmployerBrowserSessionsBeforeDelete,
    listRuns: listJobAgentRuns,
    setRunStatus: setJobAgentRunStatus,
    listApplications: listDurableApplicationSessions,
    updateApplication: updateDurableApplicationSession,
    pauseSchedule: pauseJobAgentScheduleForTenant,
    ...dependencies,
  };
  const tenantId = jobAgentTenantId(subject, config.partitionSecret);
  const result = {
    cancelledBrowserTasks: 0,
    executingBrowserTasks: 0,
    cancelledSubmissionTasks: 0,
    executingSubmissionTasks: 0,
    cancelledReceiptTasks: 0,
    closedBrowserSessions: 0,
    retainedBrowserSessions: 0,
    pausedRuns: 0,
    pausedApplications: 0,
    pausedSchedule: false,
    browserTaskReconciliationRequired: false,
    submissionTaskReconciliationRequired: false,
    browserSessionCloseRetryRequired: false,
    authorizationShutdownReconciliationRequired: false,
  };

  let cancelledTaskIds = new Set();
  let executingTaskIds = new Set();
  let cancelledSubmissionTaskIds = new Set();
  let executingSubmissionTaskIds = new Set();
  try {
    const tasks = await deps.cancelTasks({ ...config, tenantId, now });
    result.cancelledBrowserTasks = Math.max(0, Number(tasks?.cancelled) || 0);
    result.executingBrowserTasks = Math.max(0, Number(tasks?.executing) || 0);
    cancelledTaskIds = new Set(tasks?.cancelledTaskIds || []);
    executingTaskIds = new Set(tasks?.executingTaskIds || []);
    result.browserTaskReconciliationRequired = tasks?.reconciliationRequired === true || result.executingBrowserTasks > 0;
  } catch {
    result.browserTaskReconciliationRequired = true;
  }

  try {
    const tasks = await deps.cancelSubmissionTasks({ ...config, tenantId, now });
    result.cancelledSubmissionTasks = Math.max(0, Number(tasks?.cancelled) || 0);
    result.executingSubmissionTasks = Math.max(0, Number(tasks?.executing) || 0);
    cancelledSubmissionTaskIds = new Set(tasks?.cancelledTaskIds || []);
    executingSubmissionTaskIds = new Set(tasks?.executingTaskIds || []);
    result.submissionTaskReconciliationRequired = tasks?.reconciliationRequired === true || result.executingSubmissionTasks > 0;
  } catch {
    result.submissionTaskReconciliationRequired = true;
  }

  try {
    const tasks = await deps.cancelReceiptTasks({ ...config, tenantId, now });
    result.cancelledReceiptTasks = Math.max(0, Number(tasks?.cancelled) || 0);
  } catch { result.authorizationShutdownReconciliationRequired = true; }

  try {
    const sessions = await deps.closeSessions({ config, subject, env });
    result.closedBrowserSessions = Math.max(0, Number(sessions?.closed) || 0);
  } catch (error) {
    result.closedBrowserSessions = Math.max(0, Number(error?.closed) || 0);
    result.retainedBrowserSessions = Math.max(1, Number(error?.retryRequired) || 1);
    result.browserSessionCloseRetryRequired = true;
  }

  try {
    const runs = await deps.listRuns({ ...config, subject, limit: 500 });
    for (const run of runs) {
      if (!ACTIVE_RUN_STATES.has(run.status)) continue;
      try {
        if (await deps.setRunStatus({ ...config, subject, runId: run.id, status: 'Paused', now })) result.pausedRuns += 1;
        else result.authorizationShutdownReconciliationRequired = true;
      } catch { result.authorizationShutdownReconciliationRequired = true; }
    }
  } catch { result.authorizationShutdownReconciliationRequired = true; }

  try {
    const applications = await deps.listApplications({ ...config, subject, limit: 500 });
    for (const current of applications) {
      if (current.state === 'Finished' || current.state === 'Paused') continue;
      const taskId = current.workerExecution?.id;
      const executionStatus = current.workerExecution?.status;
      const submissionTaskId = current.submissionExecution?.id;
      const submissionStatus = current.submissionExecution?.status;
      if (submissionStatus === 'executing' && submissionTaskId && executingSubmissionTaskIds.has(submissionTaskId)) {
        result.submissionTaskReconciliationRequired = true;
        continue;
      }
      if (executionStatus === 'executing' || (taskId && executingTaskIds.has(taskId))) {
        result.browserTaskReconciliationRequired = true;
        continue;
      }
      const { version, audit: _audit, ...session } = current;
      try {
        const paused = submissionTaskId && cancelledSubmissionTaskIds.has(submissionTaskId)
          ? submissionStatus === 'executing'
            ? cancelArmedApplicationSubmissionBeforeProvider(session, { taskId: submissionTaskId }, now)
            : cancelReservedApplicationSubmission(session, { taskId: submissionTaskId }, now)
          : executionStatus === 'queued' && taskId && cancelledTaskIds.has(taskId)
            ? cancelReservedApplicationTransmission(session, { taskId }, now)
            : pauseApplicationSession(session, 'Job Agent authorization was revoked; saved employer work remains paused.', now);
        if (await deps.updateApplication({ ...config, subject, sessionId: current.id, expectedVersion: version, session: paused })) result.pausedApplications += 1;
        else result.authorizationShutdownReconciliationRequired = true;
      } catch { result.authorizationShutdownReconciliationRequired = true; }
    }
  } catch { result.authorizationShutdownReconciliationRequired = true; }

  try {
    result.pausedSchedule = Boolean(await deps.pauseSchedule({ ...config, tenantId, now }));
  } catch { result.authorizationShutdownReconciliationRequired = true; }

  result.authorizationShutdownReconciliationRequired = result.authorizationShutdownReconciliationRequired
    || result.browserTaskReconciliationRequired || result.submissionTaskReconciliationRequired || result.browserSessionCloseRetryRequired;
  return result;
}
