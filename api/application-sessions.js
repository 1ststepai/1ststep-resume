import { createHash } from 'node:crypto';
import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed, jobAgentAccessAllowed } from '../lib/api-security.js';
import { assertNoApplicationSecrets, cancelArmedApplicationSubmissionBeforeProvider, cancelReservedApplicationSubmission, confirmApplicationApproval, confirmExternalApplicationStep, createApplicationSession, pauseApplicationSession, reconcileUnknownApplicationTransmission, recordPostSubmissionOutcome, refreshApplicationSubmissionApproval, refreshApplicationTransmissionApproval, requestApplicationSubmissionApproval, reserveApplicationSubmissionExecution, reserveApplicationTransmission, resumeApplicationSession } from '../lib/application-session-domain.js';
import { createDurableApplicationSession, deleteDurableApplicationSession, listDurableApplicationSessions, readDurableApplicationSession, updateDurableApplicationSession } from '../lib/application-session-store.js';
import { prepareEmployerBrowserTaskRecord } from '../lib/employer-browser-task-store.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { readJobAgentRun } from '../lib/job-agent-run-store.js';
import { jobAgentRuntimeConfiguration } from '../lib/job-agent-runtime-configuration.js';
import { recordConfiguredJobAgentOperationalEvent } from '../lib/job-agent-operational-metrics.js';
import { jobAgentConsentGate } from '../lib/job-agent-consent-store.js';
import { JOB_AGENT_POLICY_LEVELS, requireJobAgentPolicyLevel } from '../lib/job-agent-policy-levels.js';
import { notifyNewApplicationNeedsYouAction } from '../lib/application-needs-you-notifier.js';
import { employerBrowserWorkerConfiguration } from '../lib/employer-browser-worker.js';
import { executeEmployerBrowserInspection, planEmployerFormStep } from '../lib/employer-browser-worker.js';
import { applyEmployerInspectionPlan } from '../lib/employer-browser-orchestrator.js';
import { jobAgentTenantId } from '../lib/job-agent-run-store.js';
import { BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED, closeEmployerBrowserSessionBeforeDelete } from '../lib/employer-browser-session-lifecycle.js';
import { prepareApplicationFollowUpReminderReservation } from '../lib/application-follow-up-store.js';
import { cancelApplicationSubmissionTaskBeforeStart, deleteApplicationSubmissionTask, prepareApplicationSubmissionTaskRecord, readApplicationSubmissionTask } from '../lib/application-submission-task-store.js';
import { applicationSubmissionTaskWorkerConfiguration } from '../lib/application-submission-task-worker.js';
import { cancelApplicationReceiptTask, deleteApplicationReceiptTask, readApplicationReceiptTask } from '../lib/application-receipt-task-store.js';

export const maxDuration = 180;

/* Every action that touches an employer system, transmits data, confirms a submission,
   or records the result of one. Adding an action here is safe; omitting one is not. */
export const EXTERNAL_APPLICATION_SESSION_ACTIONS = Object.freeze([
  'confirm-external-step', 'reconcile-employer-failure', 'request-final-review', 'refresh-final-approval',
  'confirm-submission', 'confirm-transmission', 'record-post-submission',
]);

/* Actions where the agent resumes working unattended on the user's behalf. */
export const AUTHORIZED_APPLICATION_SESSION_ACTIONS = Object.freeze(['resume']);

/* This module mixes internal preparation state with employer-facing steps. Classify per
   ACTION, never per file: an internal operation must not inherit a weaker gate because
   it shares a handler with an external one, and vice versa. */
export function applicationSessionPolicyLevel(body = {}) {
  const action = String(body.action || '');
  if (EXTERNAL_APPLICATION_SESSION_ACTIONS.includes(action)) return JOB_AGENT_POLICY_LEVELS.EXTERNAL;
  if (AUTHORIZED_APPLICATION_SESSION_ACTIONS.includes(action)) return JOB_AGENT_POLICY_LEVELS.AUTHORIZATION;
  return JOB_AGENT_POLICY_LEVELS.DATA_CONSENT;
}

export function validateApplicationSessionMutationBody(body = {}) {
  assertNoApplicationSecrets(body, 'applicationSessionRequest');
  if (String(body.action || '') === 'confirm-external-step') {
    const allowed = new Set(['action', 'actionId', 'confirmed', 'sessionId', 'version']);
    if (Object.keys(body).some(key => !allowed.has(key))) throw new Error('Employer-site completion accepts only a value-free action confirmation.');
  }
  if (String(body.action || '') === 'reconcile-employer-failure') {
    const allowed = new Set(['action', 'actionId', 'confirmed', 'outcome', 'sessionId', 'version']);
    if (Object.keys(body).some(key => !allowed.has(key))) throw new Error('Employer failure reconciliation accepts only a value-free review outcome.');
  }
  if (String(body.action || '') === 'request-final-review') {
    const allowed = new Set(['action', 'confirmed', 'sessionId', 'version']);
    if (Object.keys(body).some(key => !allowed.has(key))) throw new Error('Final review accepts only a value-free user confirmation.');
  }
  if (String(body.action || '') === 'refresh-final-approval') {
    const allowed = new Set(['action', 'sessionId', 'version']);
    if (Object.keys(body).some(key => !allowed.has(key))) throw new Error('Final-approval renewal accepts only the saved session version.');
  }
  return true;
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
    return res.status(204).end();
  }
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  if (!jobAgentAccessAllowed(auth)) return res.status(403).json({ error: 'Job Agent access is required.', code: 'JOB_AGENT_ACCESS_REQUIRED' });
  const config = jobAgentRuntimeConfiguration();
  if (!config) return res.status(503).json({ error: 'Durable application sessions are not configured.', code: 'APPLICATION_SESSION_RUNTIME_NOT_CONFIGURED' });
  const submissionWorkerConfiguration = applicationSubmissionTaskWorkerConfiguration(process.env);
  const submissionsEnabled = submissionWorkerConfiguration.ready === true;
  const limit = await enforceDurableRateLimit(req, {
    scope: 'application-sessions', subject: auth.subject,
    ipRule: { limit: 30, window: '1 m' }, accountRule: { limit: 500, window: '1 d' }, globalRule: { limit: 20_000, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Application-session requests are temporarily rate limited. Saved checkpoints remain intact.');
  const sessionId = String(req.query?.id || req.body?.sessionId || '');
  try {
    if (req.method === 'GET') {
      if (sessionId) {
        const session = await readDurableApplicationSession({ ...config, subject: auth.subject, sessionId });
        return session ? res.status(200).json({ session, externalApplicationExecution: false, submissionsEnabled }) : res.status(404).json({ error: 'Application session not found.' });
      }
      const sessions = await listDurableApplicationSessions({ ...config, subject: auth.subject });
      return res.status(200).json({ sessions, externalApplicationExecution: false, submissionsEnabled });
    }
    if (req.method === 'DELETE') {
      let currentForDelete = await readDurableApplicationSession({ ...config, subject: auth.subject, sessionId });
      if (!currentForDelete) return res.status(404).json({ error: 'Application session not found.' });
      const submissionTaskId = currentForDelete.submissionExecution?.id;
      const submissionStatus = currentForDelete.submissionExecution?.status;
      if (submissionTaskId && ['queued', 'executing'].includes(submissionStatus)) {
        const task = await readApplicationSubmissionTask({ ...config, subject: auth.subject, taskId: submissionTaskId });
        if (!task || task.status === 'executing') return res.status(503).json({
          error: 'A started final-submission action must be reconciled before this application can be deleted.',
          code: 'SUBMISSION_TASK_RECONCILIATION_REQUIRED', deletionComplete: false,
        });
        if (!['queued', 'leased', 'cancelled'].includes(task.status)) return res.status(503).json({ error: 'The final-submission task state must be reconciled before deletion.', code: 'SUBMISSION_TASK_RECONCILIATION_REQUIRED', deletionComplete: false });
        if (['queued', 'leased'].includes(task.status)) {
          const cancelledTask = await cancelApplicationSubmissionTaskBeforeStart({ ...config, taskId: submissionTaskId, reasonCode: 'APPLICATION_SESSION_DELETED' });
          if (!cancelledTask) return res.status(503).json({ error: 'The final-submission task changed while deletion was being prepared.', code: 'SUBMISSION_TASK_RECONCILIATION_REQUIRED', deletionComplete: false });
        }
        const { version, audit: _audit, ...privateSession } = currentForDelete;
        const cancelledSession = submissionStatus === 'executing'
          ? cancelArmedApplicationSubmissionBeforeProvider(privateSession, { taskId: submissionTaskId, failureCode: 'APPLICATION_SESSION_DELETED' })
          : cancelReservedApplicationSubmission(privateSession, { taskId: submissionTaskId, failureCode: 'APPLICATION_SESSION_DELETED' });
        currentForDelete = await updateDurableApplicationSession({ ...config, subject: auth.subject, sessionId, expectedVersion: version, session: cancelledSession });
      }
      const receiptTaskId = currentForDelete.receiptVerification?.id;
      if (receiptTaskId) {
        const receiptTask = await readApplicationReceiptTask({ ...config, subject: auth.subject, taskId: receiptTaskId });
        if (receiptTask && ['queued', 'leased'].includes(receiptTask.status)) {
          const cancelled = await cancelApplicationReceiptTask({ ...config, subject: auth.subject, taskId: receiptTaskId, reasonCode: 'APPLICATION_SESSION_DELETED' });
          if (!cancelled) return res.status(503).json({ error: 'The receipt-verification task changed while deletion was being prepared.', code: 'RECEIPT_TASK_RECONCILIATION_REQUIRED', deletionComplete: false });
        }
      }
      try {
        await closeEmployerBrowserSessionBeforeDelete({ config, subject: auth.subject, applicationSessionId: sessionId });
      } catch (error) {
        if (error?.code === BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED) return res.status(503).json({
          error: 'The employer browser session could not be safely closed. Its encrypted recovery reference remains available for retry.',
          code: BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED,
        });
        throw error;
      }
      if (submissionTaskId) await deleteApplicationSubmissionTask({ ...config, subject: auth.subject, taskId: submissionTaskId });
      if (receiptTaskId) await deleteApplicationReceiptTask({ ...config, subject: auth.subject, taskId: receiptTaskId });
      const deleted = await deleteDurableApplicationSession({ ...config, subject: auth.subject, sessionId });
      return deleted ? res.status(200).json({ ok: true, deleted: true }) : res.status(404).json({ error: 'Application session not found.' });
    }
    if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    if (JSON.stringify(req.body || {}).length > 40_000) return res.status(413).json({ error: 'Application-session request is too large.' });
    try { validateApplicationSessionMutationBody(req.body || {}); }
    catch { return res.status(400).json({ error: 'Passwords, challenge values, and employer-site answers must stay on the employer page.', code: 'APPLICATION_SESSION_VALUE_INPUT_FORBIDDEN' }); }
    if (req.method === 'POST') {
      const policyLevel = applicationSessionPolicyLevel(req.body || {});
      const consent = await requireJobAgentPolicyLevel(policyLevel, { config, subject: auth.subject });
      if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code, policyLevel });
      const packageRunId = String(req.body?.packageRunId || '');
      const packageRun = await readJobAgentRun({ ...config, subject: auth.subject, runId: packageRunId });
      const result = packageRun?.result;
      if (packageRun?.taskType !== 'application_package' || packageRun.status !== 'Finished' || result?.renderEvidence?.complete !== true || result?.qa?.visualPageInspection !== true || result?.qa?.issues?.length) {
        return res.status(409).json({ error: 'The exact signed package version must pass isolated render QA before an application session starts.', code: 'PACKAGE_NOT_READY' });
      }
      const session = createApplicationSession({
        packageRunId, packageQaVerified: true, documentVersion: result.documentVersion, employer: result.employer,
        title: result.title, requisitionId: result.requisitionId, directEmployerUrl: packageRun.mission.directEmployerUrl,
        proposedFields: req.body?.proposedFields,
      });
      const created = await createDurableApplicationSession({ ...config, subject: auth.subject, session, idempotencyKey: String(req.headers?.['idempotency-key'] || '') });
      await notifyNewApplicationNeedsYouAction({ config, subject: auth.subject, session: created.session });
      return res.status(created.replayed ? 200 : 201).json({ ...created, externalApplicationExecution: false, submissionsEnabled });
    }
    const current = await readDurableApplicationSession({ ...config, subject: auth.subject, sessionId });
    if (!current) return res.status(404).json({ error: 'Application session not found.' });
    const { version, audit: _auditHead, ...session } = current;
    const action = String(req.body?.action || '');
    if (action !== 'pause') {
      // Same per-action classification as POST. Submission-consequential actions keep
      // the full external gate; internal state edits require Terms + Privacy only.
      const patchPolicyLevel = applicationSessionPolicyLevel(req.body || {});
      const consent = await requireJobAgentPolicyLevel(patchPolicyLevel, { config, subject: auth.subject });
      if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code, policyLevel: patchPolicyLevel });
    }
    let updated;
    let workerResult = null;
    let browserTaskReservation = null;
    let submissionTaskReservation = null;
    let followUpReminderReservation = null;
    if (action === 'pause') updated = pauseApplicationSession(session, 'Application paused by the job seeker.');
    else if (action === 'resume') updated = resumeApplicationSession(session);
    else if (action === 'confirm-transmission') updated = confirmApplicationApproval(session, { kind: 'transmission', confirmed: req.body?.confirmed === true });
    else if (action === 'request-final-review') updated = requestApplicationSubmissionApproval(session, { confirmed: req.body?.confirmed === true });
    else if (action === 'refresh-final-approval') updated = refreshApplicationSubmissionApproval(session);
    else if (action === 'confirm-submission') {
      const mutationNow = new Date();
      updated = confirmApplicationApproval(session, { kind: 'submission', confirmed: req.body?.confirmed === true }, mutationNow);
      if (submissionWorkerConfiguration.ready) {
        const tenantId = jobAgentTenantId(auth.subject, config.partitionSecret);
        const idempotencyKey = `submission_queue_${createHash('sha256').update(`${session.id}.${updated.approvals.submission.id}.${updated.approvals.submission.scopeHash}`).digest('hex').slice(0, 32)}`;
        submissionTaskReservation = prepareApplicationSubmissionTaskRecord({
          tenantId, dataEncryptionKey: config.dataEncryptionKey, sessionId: session.id,
          scopeHash: updated.approvals.submission.scopeHash, documentVersion: updated.documentVersion,
          fieldSchemaHash: updated.formCheckpoint.fieldSchemaHash, idempotencyKey, now: mutationNow,
        });
        updated = reserveApplicationSubmissionExecution(updated, { taskId: submissionTaskReservation.taskId }, mutationNow);
        workerResult = { planStatus: 'final-submission-approved', executionStatus: 'queued' };
      }
    }
    else if (action === 'confirm-external-step') updated = confirmExternalApplicationStep(session, { actionId: req.body?.actionId, confirmed: req.body?.confirmed === true });
    else if (action === 'reconcile-employer-failure') updated = reconcileUnknownApplicationTransmission(session, { actionId: req.body?.actionId, outcome: req.body?.outcome, confirmed: req.body?.confirmed === true });
    else if (action === 'record-post-submission') {
      const mutationNow = new Date();
      updated = recordPostSubmissionOutcome(session, {
        outcome: req.body?.outcome, dueAt: req.body?.dueAt, occurredAt: req.body?.occurredAt, confirmed: req.body?.confirmed === true,
      }, mutationNow);
      const previousFollowUp = JSON.stringify(session.postSubmission?.followUp || null);
      const nextFollowUp = JSON.stringify(updated.postSubmission?.followUp || null);
      if (previousFollowUp !== nextFollowUp) {
        const tenantId = jobAgentTenantId(auth.subject, config.partitionSecret);
        followUpReminderReservation = prepareApplicationFollowUpReminderReservation({
          tenantId, subject: auth.subject, sessionId: session.id,
          recordVersion: Number(current.version) + 1,
          dueAt: updated.postSubmission?.followUp?.status === 'SCHEDULED' ? updated.postSubmission.followUp.dueAt : null,
          dataEncryptionKey: config.dataEncryptionKey, now: mutationNow,
        });
      }
    }
    else if (action === 'prepare-employer-step') {
      const approvalChecked = refreshApplicationTransmissionApproval(session);
      if (approvalChecked !== session) {
        updated = approvalChecked;
        workerResult = { planStatus: 'waiting-for-renewed-approval', executionStatus: 'not-started' };
      } else {
      const workerConfig = employerBrowserWorkerConfiguration();
      if (workerConfig.enabled) {
        const workerLimit = await enforceDurableRateLimit(req, {
          scope: 'employer-browser-worker', subject: auth.subject,
          ipRule: { limit: 3, window: '5 m' },
          accountRule: { limit: workerConfig.accountDailyUnits, window: '1 d' },
          globalRule: { limit: workerConfig.globalDailyUnits, window: '1 d' },
        });
        if (!workerLimit.ok) return sendRateLimitResult(res, workerLimit, 'The isolated employer browser is temporarily at its safety budget. Your checkpoint remains saved.');
      }
      const inspection = await executeEmployerBrowserInspection({ session, pageUrl: req.body?.pageUrl || session.role.directEmployerUrl });
      if (inspection.status !== 'inspected') {
        updated = pauseApplicationSession(session, 'The isolated employer inspector is not configured. No employer page or personal data was accessed.');
        workerResult = { planStatus: 'not-started', executionStatus: inspection.status, reason: inspection.reason };
      } else {
        const plan = planEmployerFormStep({ session, pageUrl: inspection.pageUrl, fields: inspection.fields });
        updated = applyEmployerInspectionPlan(session, plan);
        workerResult = { planStatus: plan.status, executionStatus: 'inspection-complete' };
        if (plan.status === 'ready-to-fill') {
          const tenantId = jobAgentTenantId(auth.subject, config.partitionSecret);
          const idempotencyKey = `browser_queue_${createHash('sha256').update(`${session.id}.${plan.fieldSchemaHash}.${session.approvals?.transmission?.id || ''}`).digest('hex').slice(0, 32)}`;
          browserTaskReservation = prepareEmployerBrowserTaskRecord({
            tenantId, dataEncryptionKey: config.dataEncryptionKey, sessionId: session.id,
            fieldSchemaHash: plan.fieldSchemaHash, stagedFieldKeys: plan.stagedFields.map(item => item.fieldKey), stagedFields: plan.stagedFields, idempotencyKey,
          });
          updated = reserveApplicationTransmission(updated, {
            taskId: browserTaskReservation.taskId, fieldSchemaHash: plan.fieldSchemaHash,
            stagedFieldKeys: plan.stagedFields.map(item => item.fieldKey),
          });
          workerResult.executionStatus = 'queued';
        }
        await recordConfiguredJobAgentOperationalEvent('provider_request_completed');
      }
      }
    } else return res.status(400).json({ error: 'Use action pause, resume, confirm-transmission, request-final-review, refresh-final-approval, confirm-submission, confirm-external-step, reconcile-employer-failure, record-post-submission, or prepare-employer-step.' });
    if (updated === session) return res.status(200).json({ session: current, externalApplicationExecution: false, submissionsEnabled, replayed: true });
    const saved = await updateDurableApplicationSession({ ...config, subject: auth.subject, sessionId, expectedVersion: Number(req.body?.version), session: updated, browserTaskReservation, submissionTaskReservation, followUpReminderReservation });
    await notifyNewApplicationNeedsYouAction({ config, subject: auth.subject, session: saved, previousSession: current });
    return res.status(200).json({ session: saved, worker: workerResult ? { planStatus: workerResult.planStatus, executionStatus: workerResult.executionStatus } : undefined, externalApplicationExecution: false, submissionsEnabled });
  } catch (error) {
    const message = String(error?.message || '');
    if (/required|not allowed|cannot|only|changed|invalid|safe session|Idempotency|approval|credentials|challenge/i.test(message)) return res.status(400).json({ error: message });
    await recordConfiguredJobAgentOperationalEvent('application_session_failure');
    console.error(JSON.stringify({ type: 'application-session-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'The durable application session could not be updated.' });
  }
}
