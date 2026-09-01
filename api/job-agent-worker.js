import { timingSafeEqual } from 'node:crypto';
import { applyApiHeaders } from '../lib/api-security.js';
import { jobAgentRuntimeConfiguration, processNextJobAgentRun } from '../lib/job-agent-worker.js';
import { processNextJobAgentSchedule } from '../lib/job-agent-schedule-store.js';
import { recordJobAgentOperationalEvent, recordJobAgentWorkerHeartbeat } from '../lib/job-agent-operational-metrics.js';
import { processNextNeedsYouNotification } from '../lib/job-agent-notification-store.js';
import { processExpiredApplicationPackageArtifacts } from '../lib/job-agent-object-storage.js';
import { processNextEmployerBrowserTask, reconcileNextStaleEmployerBrowserTask } from '../lib/employer-browser-task-worker.js';
import { employerBrowserWorkerConfiguration } from '../lib/employer-browser-worker.js';
import { processNextExpiredEmployerBrowserSession } from '../lib/employer-browser-session-cleanup.js';
import { reconcileStaleJobAgentSpendReservations } from '../lib/job-agent-spend-ledger.js';
import { processNextApplicationFollowUpReminder } from '../lib/application-follow-up-store.js';
import { applicationSubmissionTaskWorkerConfiguration, processNextApplicationSubmissionTask, reconcileNextStaleApplicationSubmissionTask } from '../lib/application-submission-task-worker.js';
import { applicationReceiptTaskWorkerConfiguration, processNextApplicationReceiptTask } from '../lib/application-receipt-task-worker.js';
import { sendConfiguredJobAgentOperatorAlert } from '../lib/job-agent-operator-alert.js';
import { processNextJobAgentOperatorAlert, readJobAgentOperatorAlertQueueHealth } from '../lib/job-agent-operator-alert-outbox.js';
import { readApplicationSubmissionTaskQueueHealth } from '../lib/application-submission-task-store.js';
import { readApplicationReceiptTaskQueueHealth } from '../lib/application-receipt-task-store.js';
import { processExpiredAccountDataExports, processNextAccountDataExportTask, readAccountDataExportQueueHealth } from '../lib/account-data-export-task.js';
import { buildCompleteAccountDataExport } from '../lib/account-data-export-builder.js';

export const maxDuration = 180;

function safeEquals(value, expected) {
  const left = Buffer.from(String(value || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function recordSafely(action) {
  try { await action(); }
  catch (error) { console.error(JSON.stringify({ type: 'job-agent-worker-metric-error', name: error?.name || 'unknown' })); }
}

export async function executeJobAgentWorkerCycle({
  config, env = process.env, query = {},
  processSchedule = processNextJobAgentSchedule, processRun = processNextJobAgentRun,
  processNotification = processNextNeedsYouNotification,
  processFollowUp = processNextApplicationFollowUpReminder,
  processBrowserTask = processNextEmployerBrowserTask, browserConfiguration = employerBrowserWorkerConfiguration,
  reconcileBrowserTask = reconcileNextStaleEmployerBrowserTask,
  processBrowserSessionCleanup = processNextExpiredEmployerBrowserSession,
  processSubmissionTask = processNextApplicationSubmissionTask,
  reconcileSubmissionTask = reconcileNextStaleApplicationSubmissionTask,
  submissionConfiguration = applicationSubmissionTaskWorkerConfiguration,
  processReceiptTask = processNextApplicationReceiptTask, receiptConfiguration = applicationReceiptTaskWorkerConfiguration,
  processArtifactCleanup = processExpiredApplicationPackageArtifacts,
  processAccountExport = processNextAccountDataExportTask,
  processAccountExportCleanup = processExpiredAccountDataExports,
  reconcileSpend = reconcileStaleJobAgentSpendReservations,
  recordEvent = recordJobAgentOperationalEvent, recordHeartbeat = recordJobAgentWorkerHeartbeat,
  sendAlert = sendConfiguredJobAgentOperatorAlert,
  processOperatorAlert = processNextJobAgentOperatorAlert,
  readOperatorAlertQueue = readJobAgentOperatorAlertQueueHealth,
  readSubmissionQueue = readApplicationSubmissionTaskQueueHealth,
  readReceiptQueue = readApplicationReceiptTaskQueueHealth,
  readAccountExportQueue = readAccountDataExportQueueHealth,
  clock = () => new Date(), logError = value => console.error(value),
}) {
  const startedAt = clock();
  await recordSafely(() => recordHeartbeat({ redis: config.redis, now: startedAt, outcome: 'started' }));
  await recordSafely(() => recordEvent('background_worker_invocation', { redis: config.redis, now: startedAt }));
  const processed = [];
  const scheduled = [];
  const notifications = [];
  const followUps = [];
  const browserTasks = [];
  const browserSessionCleanup = [];
  const submissionTasks = [];
  const receiptTasks = [];
  const operatorAlerts = [];
  let consequentialQueueHealth = { status: 'unknown', contentFree: true, containsCandidateValues: false, submission: null, receipt: null };
  let operatorAlertQueueHealth = { status: 'unknown', pending: null, overdue: null, failed: null, contentFree: true, containsCandidateValues: false };
  let browserReconciliation = { status: 'not-run' };
  let submissionReconciliation = { status: 'not-run' };
  let artifactCleanup = { status: 'not-run', deleted: 0 };
  let accountExport = { status: 'not-run' };
  let accountExportCleanup = { status: 'not-run', deleted: 0 };
  let accountExportQueueHealth = { status: 'unknown', pending: null, overdue: null, overdueAfterSeconds: null, contentFree: true, containsCandidateValues: false, containsAccountIdentifiers: false };
  let monetarySpendReconciliation = { status: 'not-run', examined: 0, settledAtMaximum: 0, staleIndexEntriesRemoved: 0, releasedCents: 0 };
  let failed = false;
  try {
    monetarySpendReconciliation = await reconcileSpend({ redis: config.redis, now: startedAt, limit: Math.min(25, Math.max(1, Number(query.spendReconciliationLimit) || 10)) });
    if (monetarySpendReconciliation.settledAtMaximum > 0) {
      await recordSafely(() => recordEvent('monetary_spend_reconciled', { redis: config.redis, now: clock(), amount: monetarySpendReconciliation.settledAtMaximum }));
    }
  } catch (error) {
    failed = true;
    monetarySpendReconciliation = { status: 'failed', examined: 0, settledAtMaximum: 0, staleIndexEntriesRemoved: 0, releasedCents: 0 };
    await recordSafely(() => recordEvent('monetary_spend_reconciliation_failure', { redis: config.redis, now: clock() }));
    logError(JSON.stringify({ type: 'job-agent-monetary-spend-reconciliation-error', name: error?.name || 'unknown' }));
  }
  const browserCleanupLimit = Math.min(3, Math.max(0, Number(query.browserCleanupLimit) || 3));
  for (let index = 0; index < browserCleanupLimit; index += 1) {
    try {
      const result = await processBrowserSessionCleanup({ ...config, env, now: clock() });
      if (!result || result.status === 'idle') break;
      browserSessionCleanup.push({ status: result.status, providerConfirmed: result.providerConfirmed === true });
      await recordSafely(() => recordEvent(result.status === 'cleaned' ? 'employer_browser_session_cleanup_completed' : 'employer_browser_session_cleanup_retry', { redis: config.redis, now: clock() }));
    } catch (error) {
      failed = true;
      await recordSafely(() => recordEvent('employer_browser_session_cleanup_failure', { redis: config.redis, now: clock() }));
      logError(JSON.stringify({ type: 'job-agent-browser-session-cleanup-error', name: error?.name || 'unknown' }));
      break;
    }
  }
  try {
    artifactCleanup = await processArtifactCleanup({ redis: config.redis, configuration: config.objectStorage, now: startedAt, limit: 25 });
  } catch (error) {
    failed = true;
    artifactCleanup = { status: 'failed', deleted: 0 };
    logError(JSON.stringify({ type: 'job-agent-artifact-cleanup-error', name: error?.name || 'unknown' }));
  }
  try {
    accountExportCleanup = await processAccountExportCleanup({ redis: config.redis, objectStorage: config.objectStorage, now: clock(), limit: 10 });
    accountExport = config.objectStorage
      ? await processAccountExport({ config, buildExport: buildCompleteAccountDataExport, now: clock() })
      : { status: 'not-configured' };
    if (accountExport.status === 'ready') await recordSafely(() => recordEvent('account_export_completed', { redis: config.redis, now: clock() }));
    if (accountExport.status === 'failed') await recordSafely(() => recordEvent('account_data_failure', { redis: config.redis, now: clock() }));
  } catch (error) {
    failed = true;
    accountExport = { status: 'failed' };
    await recordSafely(() => recordEvent('account_data_failure', { redis: config.redis, now: clock() }));
    logError(JSON.stringify({ type: 'account-export-worker-error', name: error?.name || 'unknown' }));
  }
  try {
    accountExportQueueHealth = await readAccountExportQueue({ redis: config.redis, now: clock() });
    if (accountExportQueueHealth.status === 'attention-required') {
      await recordSafely(() => recordEvent('account_export_queue_attention_required', { redis: config.redis, now: clock() }));
      await recordSafely(() => sendAlert('account_export_queue_attention_required', { env, now: clock() }));
    }
  } catch (error) {
    failed = true;
    accountExportQueueHealth = { status: 'unknown', pending: null, overdue: null, overdueAfterSeconds: null, contentFree: true, containsCandidateValues: false, containsAccountIdentifiers: false };
    await recordSafely(() => recordEvent('account_export_queue_observation_failure', { redis: config.redis, now: clock() }));
    await recordSafely(() => sendAlert('account_export_queue_observation_failure', { env, now: clock() }));
    logError(JSON.stringify({ type: 'account-export-queue-observation-error', name: error?.name || 'unknown' }));
  }
  const scheduleLimit = Math.min(3, Math.max(0, Number(query.scheduleLimit) || 3));
  for (let index = 0; index < scheduleLimit; index += 1) {
    try {
      const result = await processSchedule({ ...config, env });
      if (!result || result.status === 'not-configured') break;
      scheduled.push({ status: result.status, runId: result.runId || null, reason: result.reason || null, replayed: result.replayed === true });
      const event = result.status === 'enqueued' && result.replayed ? 'schedule_replayed' : `schedule_${result.status}`;
      if (['schedule_enqueued', 'schedule_replayed', 'schedule_paused', 'schedule_deferred'].includes(event)) {
        await recordSafely(() => recordEvent(event, { redis: config.redis, now: clock() }));
      }
    } catch (error) {
      failed = true;
      await recordSafely(() => recordEvent('schedule_failure', { redis: config.redis, now: clock() }));
      logError(JSON.stringify({ type: 'job-agent-schedule-worker-error', name: error?.name || 'unknown' }));
      break;
    }
  }
  const limit = Math.min(3, Math.max(1, Number(query.limit) || 1));
  for (let index = 0; index < limit; index += 1) {
    try {
      const run = await processRun(config);
      if (!run) break;
      processed.push({ id: run.id, status: run.status, attempt: run.attempt, errorCode: run.lastErrorCode || null });
      const freshness = run.result?.freshnessSummary;
      if (freshness?.contentFree === true && freshness?.containsCandidateValues === false) {
        const observations = [
          ['job_card_freshness_checked', freshness.checked],
          ['job_card_freshness_closed', freshness.closed],
          ['job_card_freshness_changed', freshness.changed],
          ['job_card_freshness_failure', freshness.failures],
          ['job_card_freshness_conflict', freshness.conflict ? 1 : 0],
        ];
        for (const [event, amount] of observations) {
          const boundedAmount = Math.max(0, Math.min(10, Number(amount) || 0));
          if (boundedAmount > 0) await recordSafely(() => recordEvent(event, { redis: config.redis, now: clock(), amount: boundedAmount }));
        }
      }
    } catch (error) {
      failed = true;
      await recordSafely(() => recordEvent('durable_run_failure', { redis: config.redis, now: clock() }));
      logError(JSON.stringify({ type: 'job-agent-durable-worker-error', name: error?.name || 'unknown' }));
      break;
    }
  }
  const notificationLimit = Math.min(3, Math.max(0, Number(query.notificationLimit) || 1));
  const followUpLimit = Math.min(3, Math.max(0, Number(query.followUpLimit) || 1));
  for (let index = 0; index < followUpLimit; index += 1) {
    try {
      const result = await processFollowUp({ ...config, env, now: clock() });
      if (!result || result.status === 'not-configured') break;
      followUps.push({ status: result.status, attempt: result.attempt || 0 });
      const event = result.status === 'enqueued' ? 'needs_you_notification_queued'
        : ['retry', 'failed'].includes(result.status) ? 'needs_you_notification_failure' : null;
      if (event) await recordSafely(() => recordEvent(event, { redis: config.redis, now: clock() }));
    } catch (error) {
      failed = true;
      await recordSafely(() => recordEvent('needs_you_notification_failure', { redis: config.redis, now: clock() }));
      logError(JSON.stringify({ type: 'job-agent-follow-up-worker-error', name: error?.name || 'unknown' }));
      break;
    }
  }
  for (let index = 0; index < notificationLimit; index += 1) {
    try {
      const result = await processNotification({ ...config, env, now: clock() });
      if (!result || result.status === 'not-configured') break;
      notifications.push({ status: result.status, attempt: result.attempt || 0 });
      const event = result.status === 'provider-accepted' ? 'needs_you_notification_provider_accepted'
        : result.status === 'retry' ? 'needs_you_notification_retry'
          : result.status === 'failed' ? 'needs_you_notification_failure' : null;
      if (event) await recordSafely(() => recordEvent(event, { redis: config.redis, now: clock() }));
    } catch (error) {
      failed = true;
      await recordSafely(() => recordEvent('needs_you_notification_failure', { redis: config.redis, now: clock() }));
      logError(JSON.stringify({ type: 'job-agent-notification-worker-error', name: error?.name || 'unknown' }));
      break;
    }
  }
  const browserConfig = browserConfiguration(env);
  if (browserConfig.enabled) {
    try {
      browserReconciliation = await reconcileBrowserTask({ ...config, now: clock() });
      if (browserReconciliation.status === 'outcome-unknown') await recordSafely(() => recordEvent('employer_browser_task_outcome_unknown', { redis: config.redis, now: clock() }));
      if (browserReconciliation.status === 'manual-reconciliation-required') {
        failed = true;
        await recordSafely(() => recordEvent('employer_browser_task_failure', { redis: config.redis, now: clock() }));
      }
    } catch (error) {
      failed = true;
      browserReconciliation = { status: 'failed' };
      await recordSafely(() => recordEvent('employer_browser_task_failure', { redis: config.redis, now: clock() }));
      logError(JSON.stringify({ type: 'job-agent-employer-browser-reconciliation-error', name: error?.name || 'unknown' }));
    }
    const browserLimit = Math.min(1, Math.max(0, Number(query.browserLimit) || 1));
    for (let index = 0; index < browserLimit; index += 1) {
      try {
        const result = await processBrowserTask({ ...config, env, now: clock() });
        if (!result || result.status === 'idle') break;
        browserTasks.push({ status: result.status, transmittedFieldCount: Math.max(0, Number(result.transmittedFieldCount) || 0), submitted: false });
        const event = result.status === 'completed' ? 'employer_browser_task_completed'
          : result.status === 'approval-expired' || (result.status === 'cancelled-from-session-checkpoint' && result.reasonCode === 'TRANSMISSION_APPROVAL_EXPIRED') ? 'employer_browser_task_approval_expired'
          : result.status === 'outcome-unknown' ? 'employer_browser_task_outcome_unknown' : null;
        if (event) await recordSafely(() => recordEvent(event, { redis: config.redis, now: clock() }));
      } catch (error) {
        failed = true;
        await recordSafely(() => recordEvent('employer_browser_task_failure', { redis: config.redis, now: clock() }));
        logError(JSON.stringify({ type: 'job-agent-employer-browser-worker-error', name: error?.name || 'unknown' }));
        break;
      }
    }
  }
  const submissionConfig = submissionConfiguration(env, { now: startedAt });
  if (submissionConfig.ready) {
    try {
      submissionReconciliation = await reconcileSubmissionTask({ ...config, now: clock() });
      if (submissionReconciliation.status === 'outcome-unknown') await recordSafely(() => recordEvent('application_submission_outcome_unknown', { redis: config.redis, now: clock() }));
      if (submissionReconciliation.status === 'manual-reconciliation-required') {
        failed = true;
        await recordSafely(() => recordEvent('application_submission_failure', { redis: config.redis, now: clock() }));
        await recordSafely(() => sendAlert('application_submission_failure', { env, now: clock() }));
      }
    } catch (error) {
      failed = true;
      submissionReconciliation = { status: 'failed' };
      await recordSafely(() => recordEvent('application_submission_failure', { redis: config.redis, now: clock() }));
      await recordSafely(() => sendAlert('application_submission_failure', { env, now: clock() }));
      logError(JSON.stringify({ type: 'job-agent-submission-reconciliation-error', name: error?.name || 'unknown' }));
    }
    const submissionLimit = Math.min(1, Math.max(0, Number(query.submissionLimit) || 1));
    for (let index = 0; index < submissionLimit; index += 1) {
      try {
        const result = await processSubmissionTask({ ...config, env, now: clock() });
        if (!result || result.status === 'idle' || result.status === 'not-configured') break;
        submissionTasks.push({ status: result.status, submitted: result.submitted, authoritativeReceiptVerified: false });
        const event = result.status === 'attempt-recorded' ? 'application_submission_attempt_recorded'
          : result.status === 'approval-expired' ? 'application_submission_approval_expired'
            : result.status === 'outcome-unknown' ? 'application_submission_outcome_unknown' : null;
        if (event) await recordSafely(() => recordEvent(event, { redis: config.redis, now: clock() }));
        if (result.status === 'outcome-unknown') await recordSafely(() => sendAlert('application_submission_outcome_unknown', { env, now: clock() }));
      } catch (error) {
        failed = true;
        await recordSafely(() => recordEvent('application_submission_failure', { redis: config.redis, now: clock() }));
        await recordSafely(() => sendAlert('application_submission_failure', { env, now: clock() }));
        logError(JSON.stringify({ type: 'job-agent-submission-worker-error', name: error?.name || 'unknown' }));
        break;
      }
    }
  }
  const receiptConfig = receiptConfiguration(env);
  if (receiptConfig.ready) {
    const receiptLimit = Math.min(3, Math.max(0, Number(query.receiptLimit) || 1));
    for (let index = 0; index < receiptLimit; index += 1) {
      try {
        const result = await processReceiptTask({ ...config, env, now: clock() });
        if (!result || result.status === 'idle' || result.status === 'not-configured') break;
        receiptTasks.push({ status: result.status, authoritativeReceiptVerified: result.authoritativeReceiptVerified === true });
        const event = ['verified', 'verified-from-session-checkpoint'].includes(result.status) ? 'authoritative_receipt_verified'
          : result.status === 'needs-human' ? 'authoritative_receipt_review_required'
            : result.status === 'waiting' ? 'authoritative_receipt_pending'
              : ['manual-reconciliation-required', 'orphaned'].includes(result.status) ? 'authoritative_receipt_failure' : null;
        if (event) await recordSafely(() => recordEvent(event, { redis: config.redis, now: clock() }));
        if (event === 'authoritative_receipt_failure') await recordSafely(() => sendAlert('authoritative_receipt_failure', { env, now: clock() }));
      } catch (error) {
        failed = true;
        await recordSafely(() => recordEvent('authoritative_receipt_failure', { redis: config.redis, now: clock() }));
        await recordSafely(() => sendAlert('authoritative_receipt_failure', { env, now: clock() }));
        logError(JSON.stringify({ type: 'job-agent-receipt-worker-error', name: error?.name || 'unknown' }));
        break;
      }
    }
  }
  try {
    const observedAt = clock();
    const [submission, receipt] = await Promise.all([
      readSubmissionQueue({ redis: config.redis, now: observedAt }),
      readReceiptQueue({ redis: config.redis, now: observedAt }),
    ]);
    consequentialQueueHealth = {
      status: submission?.status === 'attention-required' || receipt?.status === 'attention-required' ? 'attention-required'
        : submission?.status === 'pending' || receipt?.status === 'pending' ? 'pending'
          : submission?.status === 'idle' && receipt?.status === 'idle' ? 'idle' : 'unknown',
      contentFree: true, containsCandidateValues: false, submission, receipt,
    };
    if (consequentialQueueHealth.status === 'attention-required') {
      await recordSafely(() => recordEvent('consequential_queue_attention_required', { redis: config.redis, now: clock() }));
      await recordSafely(() => sendAlert('consequential_queue_attention_required', { env, now: clock() }));
    }
  } catch (error) {
    failed = true;
    consequentialQueueHealth = { status: 'unknown', contentFree: true, containsCandidateValues: false, submission: null, receipt: null };
    await recordSafely(() => recordEvent('consequential_queue_observation_failure', { redis: config.redis, now: clock() }));
    await recordSafely(() => sendAlert('consequential_queue_observation_failure', { env, now: clock() }));
    logError(JSON.stringify({ type: 'job-agent-consequential-queue-observation-error', name: error?.name || 'unknown' }));
  }
  const operatorAlertLimit = Math.min(3, Math.max(0, Number(query.operatorAlertLimit) || 1));
  for (let index = 0; index < operatorAlertLimit; index += 1) {
    try {
      const delivery = await processOperatorAlert({ redis: config.redis, env, now: clock() });
      if (!delivery || delivery.status === 'idle' || delivery.status === 'not-configured') break;
      operatorAlerts.push(delivery);
      const event = delivery.status === 'provider-accepted'
        ? 'operator_alert_provider_accepted'
        : delivery.status === 'failed'
          ? 'operator_alert_delivery_failed'
          : 'operator_alert_retry';
      await recordSafely(() => recordEvent(event, { redis: config.redis, now: clock() }));
    } catch (error) {
      await recordSafely(() => recordEvent('operator_alert_delivery_failed', { redis: config.redis, now: clock() }));
      logError(JSON.stringify({ type: 'job-agent-operator-alert-delivery-error', name: error?.name || 'unknown' }));
      break;
    }
  }
  try {
    operatorAlertQueueHealth = await readOperatorAlertQueue({ redis: config.redis, now: clock() });
    if (operatorAlertQueueHealth.status === 'attention-required') {
      await recordSafely(() => recordEvent('operator_alert_queue_attention_required', { redis: config.redis, now: clock() }));
    }
  } catch (error) {
    operatorAlertQueueHealth = { status: 'unknown', pending: null, overdue: null, failed: null, contentFree: true, containsCandidateValues: false };
    await recordSafely(() => recordEvent('operator_alert_queue_observation_failure', { redis: config.redis, now: clock() }));
    logError(JSON.stringify({ type: 'job-agent-operator-alert-queue-observation-error', name: error?.name || 'unknown' }));
  }
  await recordSafely(() => recordHeartbeat({ redis: config.redis, now: clock(), outcome: failed ? 'failed' : 'succeeded' }));
  return {
    httpStatus: failed ? 500 : 200,
    body: { ok: !failed, scheduled, scheduledCount: scheduled.length, processed, count: processed.length, followUps, followUpCount: followUps.length, notifications, notificationCount: notifications.length, browserReconciliation, browserTasks, browserTaskCount: browserTasks.length, submissionReconciliation, submissionTasks, submissionTaskCount: submissionTasks.length, receiptTasks, receiptTaskCount: receiptTasks.length, consequentialQueueHealth, operatorAlerts, operatorAlertCount: operatorAlerts.length, operatorAlertQueueHealth, browserSessionCleanup, browserSessionCleanupCount: browserSessionCleanup.length, artifactCleanup, accountExport, accountExportCleanup, accountExportQueueHealth, monetarySpendReconciliation, submissionsEnabled: submissionConfig.ready === true },
  };
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const expected = `Bearer ${String(process.env.CRON_SECRET || '')}`;
  if (!process.env.CRON_SECRET || !safeEquals(req.headers?.authorization, expected)) return res.status(401).json({ error: 'Unauthorized' });
  const config = jobAgentRuntimeConfiguration();
  if (!config) return res.status(503).json({ error: 'Durable Job Agent execution is not configured.' });
  const result = await executeJobAgentWorkerCycle({ config, env: process.env, query: req.query || {} });
  return res.status(result.httpStatus).json(result.body);
}
