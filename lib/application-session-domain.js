import { createHash, randomUUID } from 'node:crypto';
import { PROHIBITED_CREDENTIAL_KEY, PROHIBITED_SECRET_VALUE } from './prohibited-secret.js';

export const APPLICATION_SESSION_STATES = Object.freeze(['Preparing', 'Waiting for You', 'Paused', 'Finished', 'Failed']);
export const APPLICATION_SESSION_STAGES = Object.freeze([
  'prepare_fields', 'transmission_approval', 'employer_form', 'final_review', 'submission_approval', 'submission_execution', 'receipt_verification',
]);
export const APPLICATION_ACTION_TYPES = Object.freeze([
  'LOGIN', 'OTP', 'CAPTCHA', 'IDENTITY_VERIFICATION', 'AMBIGUOUS_FACT', 'NONSTANDARD_CERTIFICATION',
  'OUTSIDE_EMPLOYMENT_CONFLICT', 'TRANSMISSION_APPROVAL', 'SUBMISSION_APPROVAL', 'EMPLOYER_ATS_FAILURE', 'SUBMISSION_OUTCOME_UNKNOWN',
  'RECEIPT_VERIFICATION',
]);

const FORBIDDEN_KEY = PROHIBITED_CREDENTIAL_KEY;
const FORBIDDEN_VALUE = PROHIBITED_SECRET_VALUE;
const UNMASKED_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const UNMASKED_PHONE = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;
const SAFE_ID = /^[A-Za-z0-9:_-]{8,160}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const RECEIPT_SOURCES = new Set(['EMPLOYER_CONFIRMATION_PAGE', 'EMPLOYER_CONFIRMATION_EMAIL', 'EMPLOYER_ATS_API']);
const RECEIPT_METHODS = new Set(['exact-employer-page', 'employer-sent-email', 'employer-ats-api']);
const POST_SUBMISSION_OUTCOMES = new Set(['INTERVIEW', 'REJECTED_CLOSED', 'FOLLOW_UP_SCHEDULED', 'FOLLOW_UP_COMPLETED']);
const EMPLOYER_SITE_COMPLETION_ACTIONS = new Set([
  'LOGIN', 'OTP', 'CAPTCHA', 'IDENTITY_VERIFICATION',
  'AMBIGUOUS_FACT', 'NONSTANDARD_CERTIFICATION', 'OUTSIDE_EMPLOYMENT_CONFLICT',
]);

function text(value, max = 500) { return String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max); }
function at(value) { return value instanceof Date ? value.toISOString() : new Date(value || Date.now()).toISOString(); }
function hash(value) { return createHash('sha256').update(String(value || '')).digest('hex'); }
function maskedPreview(value) {
  const preview = text(value, 160);
  if (!preview || UNMASKED_PHONE.test(preview) || (UNMASKED_EMAIL.test(preview) && !/[•*]/.test(preview.split('@')[0]))) throw new Error('Proposed field previews must be visibly masked.');
  return preview;
}

function maskedReference(value) {
  const raw = text(value, 180);
  if (!raw) return '';
  const tail = raw.replace(/[^A-Za-z0-9]/g, '').slice(-4);
  return tail ? `••••${tail}` : '••••';
}

function safeEvidenceUrl(value, expectedHostname = '') {
  if (!value) return '';
  const url = new URL(directUrl(value));
  if (expectedHostname && url.hostname.toLowerCase() !== expectedHostname.toLowerCase()) throw new Error('Employer receipt URL must use the verified direct-employer host.');
  url.search = '';
  url.hash = '';
  return url.href;
}

function validDate(value, label) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw new Error(`${label} is required.`);
  return date;
}

export function assertNoApplicationSecrets(value, path = 'session') {
  if (Array.isArray(value)) return value.forEach((entry, index) => assertNoApplicationSecrets(entry, `${path}.${index}`));
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key) && nested !== null && nested !== '' && nested !== false) throw new Error(`Credentials and challenge values are not allowed: ${path}.${key}`);
      assertNoApplicationSecrets(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && FORBIDDEN_VALUE.test(value)) throw new Error(`Credentials and challenge values are not allowed: ${path}`);
}

function directUrl(value) {
  const raw = text(value, 900);
  try { const url = new URL(raw); if (url.protocol !== 'https:') throw new Error('protocol'); return url.href; }
  catch { throw new Error('A verified HTTPS direct-employer Apply URL is required.'); }
}

function actionItem(type, summary, now, metadata = {}) {
  if (!APPLICATION_ACTION_TYPES.includes(type)) throw new Error('Unsupported application action type.');
  assertNoApplicationSecrets(metadata, 'action.metadata');
  return { id: `action_${randomUUID()}`, type, status: 'open', summary: text(summary, 300), metadata, createdAt: at(now), resolvedAt: null };
}

function event(kind, summary, now, metadata = {}) {
  assertNoApplicationSecrets(metadata, 'event.metadata');
  return { id: `event_${randomUUID()}`, kind: text(kind, 80), summary: text(summary, 300), metadata, at: at(now) };
}

function transmissionApprovalScope(session) {
  const fields = [...new Map((session?.proposedFields || []).map(item => [item.fieldKey, { fieldKey: text(item.fieldKey, 120), factId: text(item.factId, 160) }])).values()]
    .filter(item => item.fieldKey && item.factId).sort((left, right) => left.fieldKey.localeCompare(right.fieldKey));
  return {
    employer: text(session?.role?.employer, 160), title: text(session?.role?.title, 200), requisitionId: text(session?.role?.requisitionId, 160),
    directEmployerUrl: directUrl(session?.role?.directEmployerUrl), documentVersion: text(session?.documentVersion, 180), fields,
  };
}

function approvedTransmissionFieldKeys(session) {
  return transmissionApprovalScope(session).fields.map(item => item.fieldKey);
}

function renewedTransmissionApprovalAction(session, now) {
  const existing = (session?.actions || []).find(item => item.type === 'TRANSMISSION_APPROVAL' && item.status === 'open');
  if (existing) return existing;
  const scope = transmissionApprovalScope(session);
  const scopeHash = hash(JSON.stringify(scope));
  const documentVersion = text(session?.documentVersion, 180);
  const employer = text(session?.role?.employer, 160) || 'the verified employer';
  return actionItem('TRANSMISSION_APPROVAL', `Review and approve sharing the staged verified profile fields and ${documentVersion || 'approved document'} with ${employer}. Nothing will be submitted.`, now, { scopeHash, documentVersion, fieldKeys: scope.fields.map(item => item.fieldKey) });
}

export function createApplicationSession(input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'create');
  if (!SAFE_ID.test(text(input.packageRunId, 160))) throw new Error('A signed package run ID is required.');
  if (!text(input.documentVersion, 180) || !text(input.employer, 160) || !text(input.title, 200) || !text(input.requisitionId, 160)) throw new Error('Verified package identity is required.');
  if (input.packageQaVerified !== true) throw new Error('The exact package version must pass isolated render QA before an application session starts.');
  const directEmployerUrl = directUrl(input.directEmployerUrl);
  const documentVersion = text(input.documentVersion, 180);
  const proposedFields = Array.isArray(input.proposedFields) ? input.proposedFields.slice(0, 80).map(item => ({
    fieldKey: text(item.fieldKey, 120), label: text(item.label, 160), factId: text(item.factId, 160),
    maskedPreview: maskedPreview(item.maskedPreview), confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
    provenance: text(item.provenance, 200), ordinaryVerified: item.ordinaryVerified === true,
  })).filter(item => item.fieldKey && item.label && item.factId && item.maskedPreview) : [];
  const role = { employer: text(input.employer, 160), title: text(input.title, 200), requisitionId: text(input.requisitionId, 160), directEmployerUrl };
  const scope = transmissionApprovalScope({ role, documentVersion, proposedFields });
  const transmission = actionItem('TRANSMISSION_APPROVAL', `Approve sharing the staged verified profile fields and ${documentVersion} with ${scope.employer}. Nothing will be submitted.`, now, { scopeHash: hash(JSON.stringify(scope)), documentVersion, fieldKeys: scope.fields.map(item => item.fieldKey) });
  return {
    id: text(input.id, 160) || `application_${randomUUID()}`, packageRunId: text(input.packageRunId, 160),
    role,
    documentVersion, state: 'Waiting for You', stage: 'transmission_approval', externalApplicationExecution: false,
    worker: { mode: 'disabled', isolated: false, browserSessionReference: null },
    proposedFields,
    formCheckpoint: { status: 'not-started', pageUrl: directEmployerUrl, stepKey: null, fieldSchemaHash: null, stagedFieldKeys: [], attachedDocumentVersion: documentVersion, preservedAt: null },
    approvals: { transmission: null, submission: null }, actions: [transmission], transmissionAttempt: null, submissionAttempt: null, receipt: null,
    createdAt: at(now), updatedAt: at(now), timeline: [event('SESSION_CREATED', 'Durable application session created. No employer request or personal-data transmission occurred.', now, { documentVersion, scopeHash: transmission.metadata.scopeHash })],
  };
}

export function pauseApplicationSession(session, reason = 'Application paused safely.', now = new Date()) {
  if (!APPLICATION_SESSION_STATES.includes(session?.state)) throw new Error('Application session state is invalid.');
  if (session.state === 'Finished') throw new Error('A finished application session cannot be paused.');
  return { ...session, state: 'Paused', updatedAt: at(now), timeline: [...session.timeline, event('SESSION_PAUSED', reason, now)].slice(-200) };
}

export function closeApplicationSessionBeforeSubmission(session, input = {}, now = new Date()) {
  const reasonCode = text(input.reasonCode, 100);
  if (!['DIRECT_EMPLOYER_REQUISITION_CLOSED', 'DIRECT_EMPLOYER_REQUISITION_CHANGED'].includes(reasonCode)) throw new Error('A direct-employer closure reason is required.');
  if (session?.receipt || session?.submissionAttempt || session?.transmissionAttempt || session?.workerExecution?.status === 'executing') throw new Error('A session with employer transmission or submission evidence cannot be closed by preflight reverification.');
  if (session?.state === 'Finished' && session?.closedBeforeSubmission?.reasonCode === reasonCode) return session;
  if (!APPLICATION_SESSION_STATES.includes(session?.state) || session.state === 'Finished') throw new Error('Only an active pre-transmission application session can be closed by employer reverification.');
  const closedAt = at(now);
  return {
    ...session,
    state: 'Finished',
    stage: 'review_exception',
    closedBeforeSubmission: { reasonCode, source: 'direct-employer-reverification', closedAt, personalDataTransmitted: false, submitted: false, receiptVerified: false },
    actions: (session.actions || []).map(action => action.status === 'open' ? { ...action, status: 'resolved', resolvedAt: closedAt, resolution: 'employer-requisition-closed' } : action),
    updatedAt: closedAt,
    timeline: [...session.timeline, event('DIRECT_EMPLOYER_REQUISITION_CLOSED', 'The exact employer requisition was reverified before transmission and the saved application was closed. No personal data was transmitted and no submission occurred.', now, { reasonCode })].slice(-200),
  };
}

export function cancelReservedApplicationTransmission(session, input = {}, now = new Date()) {
  const taskId = text(input.taskId, 160);
  const execution = session?.workerExecution;
  if (!execution || execution.id !== taskId || execution.status !== 'queued') throw new Error('A queued transmission reservation is required.');
  const failureCode = text(input.failureCode || 'JOB_AGENT_AUTHORIZATION_REVOKED', 100);
  const action = renewedTransmissionApprovalAction(session, now);
  return {
    ...session,
    state: 'Paused',
    workerExecution: { ...execution, status: 'cancelled', completedAt: at(now), failureCode },
    approvals: session.approvals?.transmission
      ? { ...session.approvals, transmission: { ...session.approvals.transmission, expiresAt: at(now) } }
      : session.approvals,
    actions: (session.actions || []).some(item => item.id === action.id) ? session.actions : [action, ...(session.actions || [])].slice(0, 100),
    updatedAt: at(now),
    timeline: [...session.timeline, event('TRANSMISSION_RESERVATION_CANCELLED', 'The queued employer action was cancelled before execution because Job Agent authorization was revoked. No personal data was transmitted.', now, { taskId, failureCode })].slice(-200),
  };
}

export function expireReservedApplicationTransmission(session, input = {}, now = new Date()) {
  const taskId = text(input.taskId, 160);
  const execution = session?.workerExecution;
  const approval = session?.approvals?.transmission;
  const expiredAt = validDate(now, 'Transmission approval expiry timestamp');
  if (!execution || execution.id !== taskId || execution.status !== 'queued' || !approval || approval.consumedAt) throw new Error('A queued unused transmission approval is required.');
  if (expiredAt <= new Date(approval.expiresAt)) throw new Error('Transmission approval has not expired.');
  const action = renewedTransmissionApprovalAction(session, expiredAt);
  return {
    ...session, state: 'Waiting for You', stage: 'transmission_approval',
    workerExecution: { ...execution, status: 'cancelled', completedAt: expiredAt.toISOString(), failureCode: 'TRANSMISSION_APPROVAL_EXPIRED' },
    actions: (session.actions || []).some(item => item.id === action.id) ? session.actions : [action, ...(session.actions || [])].slice(0, 100),
    updatedAt: expiredAt.toISOString(),
    timeline: [...session.timeline, event('TRANSMISSION_APPROVAL_EXPIRED', 'The action-time sharing approval expired before the isolated worker started. No personal data was transmitted; review and approve again to continue.', expiredAt, { taskId, approvalId: approval.id, scopeHash: approval.scopeHash })].slice(-200),
  };
}

export function resumeApplicationSession(session, now = new Date()) {
  if (session?.state !== 'Paused') throw new Error('Only a paused application session can resume.');
  const waiting = session.actions.some(item => item.status === 'open');
  return { ...session, state: waiting ? 'Waiting for You' : 'Preparing', updatedAt: at(now), timeline: [...session.timeline, event('SESSION_RESUMED', 'Saved form checkpoint restored without credentials or challenge values.', now)].slice(-200) };
}

export function addApplicationAction(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'action');
  if (session?.state === 'Finished') throw new Error('A finished application session cannot accept new actions.');
  const duplicate = session.actions.find(item => item.status === 'open' && item.type === input.type && item.metadata?.fieldKey === input.metadata?.fieldKey);
  if (duplicate) return session;
  const item = actionItem(input.type, input.summary || 'Human action required.', now, input.metadata || {});
  return { ...session, state: 'Waiting for You', actions: [item, ...session.actions].slice(0, 100), updatedAt: at(now), timeline: [...session.timeline, event('ACTION_REQUIRED', item.summary, now, { actionId: item.id, type: item.type })].slice(-200) };
}

export function confirmApplicationApproval(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'approval');
  const kind = input.kind === 'transmission' ? 'transmission' : input.kind === 'submission' ? 'submission' : '';
  if (!kind || input.confirmed !== true) throw new Error('Explicit action-time confirmation is required.');
  const requiredType = kind === 'transmission' ? 'TRANSMISSION_APPROVAL' : 'SUBMISSION_APPROVAL';
  const action = session.actions.find(item => item.type === requiredType && item.status === 'open');
  if (!action) throw new Error(`No open ${kind} approval exists.`);
  if (kind === 'submission' && session.stage !== 'submission_approval') throw new Error('Final submission approval is available only after final review.');
  const transmissionScope = kind === 'transmission' ? transmissionApprovalScope(session) : null;
  const approval = {
    id: `approval_${randomUUID()}`, kind, confirmedAt: at(now), scopeHash: transmissionScope ? hash(JSON.stringify(transmissionScope)) : text(action.metadata?.scopeHash, 64),
    documentVersion: session.documentVersion, expiresAt: new Date(new Date(now).getTime() + 15 * 60_000).toISOString(), consumedAt: null,
    approvedFieldKeys: transmissionScope ? transmissionScope.fields.map(item => item.fieldKey) : undefined,
  };
  const nextStage = kind === 'transmission' ? 'employer_form' : 'submission_execution';
  return {
    ...session, state: 'Preparing', stage: nextStage, approvals: { ...session.approvals, [kind]: approval },
    actions: session.actions.map(item => item.id === action.id ? { ...item, status: 'resolved', resolvedAt: at(now) } : item), updatedAt: at(now),
    timeline: [...session.timeline, event(kind === 'transmission' ? 'TRANSMISSION_APPROVED' : 'SUBMISSION_APPROVED', `${kind === 'transmission' ? 'Personal-data transmission' : 'Final submission'} approved for this exact employer and document version. No action has been executed yet.`, now, { approvalId: approval.id, scopeHash: approval.scopeHash, documentVersion: approval.documentVersion })].slice(-200),
  };
}

export function refreshApplicationTransmissionApproval(session, now = new Date()) {
  if (session?.stage === 'transmission_approval' && (session.actions || []).some(item => item.type === 'TRANSMISSION_APPROVAL' && item.status === 'open')) return session;
  const approval = session?.approvals?.transmission;
  if (session?.stage !== 'employer_form' || !approval || approval.consumedAt || session.workerExecution?.status === 'queued' || session.workerExecution?.status === 'executing') {
    throw new Error('A fresh transmission approval can be requested only before employer execution starts.');
  }
  const checkedAt = validDate(now, 'Transmission approval check timestamp');
  const scope = transmissionApprovalScope(session);
  const expectedFieldKeys = scope.fields.map(item => item.fieldKey);
  const current = checkedAt >= new Date(approval.confirmedAt) && checkedAt <= new Date(approval.expiresAt)
    && approval.scopeHash === hash(JSON.stringify(scope))
    && JSON.stringify(approval.approvedFieldKeys || []) === JSON.stringify(expectedFieldKeys);
  if (current) return session;
  const action = renewedTransmissionApprovalAction(session, checkedAt);
  const reasonCode = checkedAt > new Date(approval.expiresAt) ? 'TRANSMISSION_APPROVAL_EXPIRED' : 'TRANSMISSION_APPROVAL_SCOPE_RENEWAL_REQUIRED';
  return {
    ...session, state: 'Waiting for You', stage: 'transmission_approval',
    approvals: { ...session.approvals, transmission: { ...approval, supersededAt: checkedAt.toISOString() } },
    actions: (session.actions || []).some(item => item.id === action.id) ? session.actions : [action, ...(session.actions || [])].slice(0, 100),
    updatedAt: checkedAt.toISOString(),
    timeline: [...session.timeline, event('TRANSMISSION_REAPPROVAL_REQUIRED', 'The prior sharing approval expired or did not bind the exact current field categories. No employer browser or personal-data transmission started; review and approve again.', checkedAt, { approvalId: approval.id, reasonCode, scopeHash: action.metadata.scopeHash })].slice(-200),
  };
}

export function recordApplicationTransmission(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'transmission');
  const approval = session?.approvals?.transmission;
  if (session?.stage !== 'employer_form' || !approval || approval.consumedAt) throw new Error('An unused transmission approval is required.');
  const transmittedAt = validDate(input.transmittedAt || now, 'Transmission timestamp');
  if (transmittedAt < new Date(approval.confirmedAt) || transmittedAt > new Date(approval.expiresAt)) throw new Error('Transmission approval expired or was not valid at action time.');
  if (text(input.scopeHash, 64) !== approval.scopeHash || text(input.documentVersion, 180) !== session.documentVersion) throw new Error('Transmission scope must match the approved employer and document version.');
  const fieldSchemaHash = text(input.fieldSchemaHash, 64);
  if (!SHA256.test(fieldSchemaHash)) throw new Error('A verified field-schema hash is required.');
  const transmittedFieldKeys = Array.isArray(input.transmittedFieldKeys) ? input.transmittedFieldKeys.slice(0, 120).map(value => text(value, 120)).filter(Boolean) : [];
  if (transmittedFieldKeys.some(key => !(approval.approvedFieldKeys || []).includes(key))) throw new Error('Transmission fields exceed the approved personal-data scope.');
  const transmissionAttempt = { transmittedAt: transmittedAt.toISOString(), scopeHash: approval.scopeHash, documentVersion: session.documentVersion, fieldSchemaHash, transmittedFieldKeys };
  return {
    ...session, approvals: { ...session.approvals, transmission: { ...approval, consumedAt: transmittedAt.toISOString() } }, transmissionAttempt, updatedAt: at(now),
    timeline: [...session.timeline, event('TRANSMISSION_EXECUTED', 'The isolated worker reported transmission of the exact approved masked-field scope. No field values or credentials were retained.', now, { scopeHash: approval.scopeHash, documentVersion: session.documentVersion, fieldSchemaHash, transmittedFieldCount: transmittedFieldKeys.length })].slice(-200),
  };
}

export function reserveApplicationTransmission(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'transmissionReservation');
  const approval = session?.approvals?.transmission;
  if (session?.stage !== 'employer_form' || !approval || approval.consumedAt) throw new Error('An unused transmission approval is required.');
  const reservedAt = validDate(now, 'Transmission reservation timestamp');
  if (reservedAt < new Date(approval.confirmedAt) || reservedAt > new Date(approval.expiresAt)) throw new Error('Transmission approval expired before the worker reservation.');
  const taskId = text(input.taskId, 160);
  const fieldSchemaHash = text(input.fieldSchemaHash, 64);
  const stagedFieldKeys = [...new Set((Array.isArray(input.stagedFieldKeys) ? input.stagedFieldKeys : []).slice(0, 120).map(value => text(value, 120)).filter(Boolean))].sort();
  if (!SAFE_ID.test(taskId) || !SHA256.test(fieldSchemaHash) || !stagedFieldKeys.length) throw new Error('A safe worker task, field schema, and staged-field scope are required.');
  if (stagedFieldKeys.some(key => !(approval.approvedFieldKeys || []).includes(key))) throw new Error('The worker field scope exceeds the action-time sharing approval.');
  if (session.workerExecution) {
    if (session.workerExecution.id === taskId && session.workerExecution.fieldSchemaHash === fieldSchemaHash) return session;
    const priorSafelyReconciled = ['cancelled', 'reconciled-not-filled'].includes(session.workerExecution.status)
      && new Date(approval.confirmedAt) > new Date(session.workerExecution.completedAt || 0);
    if (!priorSafelyReconciled) throw new Error('This application already has an unresolved browser-worker execution record.');
  }
  const workerExecution = { id: taskId, status: 'queued', fieldSchemaHash, stagedFieldKeys, reservedAt: reservedAt.toISOString(), startedAt: null, completedAt: null, failureCode: null };
  return {
    ...session, state: 'Preparing', worker: { ...session.worker, mode: 'isolated-worker', isolated: true }, workerExecution, updatedAt: at(now),
    timeline: [...session.timeline, event('TRANSMISSION_RESERVED', 'The exact approved field scope was durably queued before any employer action. No personal data has been transmitted yet.', now, { taskId, fieldSchemaHash, stagedFieldCount: stagedFieldKeys.length })].slice(-200),
  };
}

export function beginReservedApplicationTransmission(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'transmissionStart');
  const taskId = text(input.taskId, 160);
  const execution = session?.workerExecution;
  const approval = session?.approvals?.transmission;
  const startedAt = validDate(now, 'Transmission start timestamp');
  if (!execution || execution.id !== taskId || execution.status !== 'queued' || !approval || approval.consumedAt) throw new Error('A queued single-use transmission reservation is required.');
  if (startedAt < new Date(approval.confirmedAt) || startedAt > new Date(approval.expiresAt)) throw new Error('Transmission approval expired before execution.');
  if (execution.stagedFieldKeys.some(key => !(approval.approvedFieldKeys || []).includes(key))) throw new Error('The queued field scope exceeds the action-time sharing approval.');
  return {
    ...session, approvals: { ...session.approvals, transmission: { ...approval, consumedAt: startedAt.toISOString() } },
    workerExecution: { ...execution, status: 'executing', startedAt: startedAt.toISOString() }, updatedAt: at(now),
    timeline: [...session.timeline, event('TRANSMISSION_EXECUTION_STARTED', 'The single-use approval was consumed before the isolated worker received any candidate values. A crash will not retry automatically.', now, { taskId, fieldSchemaHash: execution.fieldSchemaHash })].slice(-200),
  };
}

export function completeReservedApplicationTransmission(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'transmissionCompletion');
  const taskId = text(input.taskId, 160);
  const execution = session?.workerExecution;
  if (!execution || execution.id !== taskId || execution.status !== 'executing' || !session?.approvals?.transmission?.consumedAt) throw new Error('An executing single-use transmission reservation is required.');
  const transmittedFieldKeys = [...new Set((Array.isArray(input.transmittedFieldKeys) ? input.transmittedFieldKeys : []).slice(0, 120).map(value => text(value, 120)).filter(Boolean))].sort();
  if (JSON.stringify(transmittedFieldKeys) !== JSON.stringify(execution.stagedFieldKeys)) throw new Error('The completed transmission scope does not match the reserved field scope.');
  const completedAt = validDate(now, 'Transmission completion timestamp');
  if (completedAt < new Date(execution.startedAt)) throw new Error('Transmission completion timestamp is invalid.');
  const approval = session.approvals.transmission;
  const transmissionAttempt = {
    transmittedAt: completedAt.toISOString(), scopeHash: approval.scopeHash, documentVersion: session.documentVersion,
    fieldSchemaHash: execution.fieldSchemaHash, transmittedFieldKeys,
  };
  return {
    ...session, externalApplicationExecution: true, transmissionAttempt,
    workerExecution: { ...execution, status: 'completed', completedAt: completedAt.toISOString() }, updatedAt: at(now),
    timeline: [...session.timeline, event('TRANSMISSION_EXECUTION_COMPLETED', 'The isolated worker filled the exact approved ordinary fields without submitting. No field values were retained.', now, { taskId, fieldSchemaHash: execution.fieldSchemaHash, transmittedFieldCount: transmittedFieldKeys.length })].slice(-200),
  };
}

export function failReservedApplicationTransmission(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'transmissionFailure');
  const taskId = text(input.taskId, 160);
  const execution = session?.workerExecution;
  if (!execution || execution.id !== taskId || execution.status !== 'executing') throw new Error('An executing transmission reservation is required.');
  const failureCode = text(input.failureCode || 'EMPLOYER_WORKER_OUTCOME_UNKNOWN', 80);
  if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(failureCode)) throw new Error('A safe worker failure code is required.');
  const action = actionItem('EMPLOYER_ATS_FAILURE', 'The isolated employer step ended without a verified completion result. It will not retry automatically; review the preserved employer page before authorizing another attempt.', now, { taskId, failureCode });
  return {
    ...session, state: 'Waiting for You', externalApplicationExecution: true,
    workerExecution: { ...execution, status: 'outcome-unknown', failureCode },
    actions: [action, ...session.actions].slice(0, 100), updatedAt: at(now),
    timeline: [...session.timeline, event('TRANSMISSION_EXECUTION_OUTCOME_UNKNOWN', 'The single-use worker attempt stopped without a verified result. Automatic retransmission is blocked.', now, { taskId, failureCode })].slice(-200),
  };
}

export function reconcileUnknownApplicationTransmission(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'transmissionReconciliation');
  if (Object.keys(input).some(key => !['actionId', 'outcome', 'confirmed'].includes(key))) throw new Error('Transmission reconciliation accepts only a value-free review outcome.');
  if (input.confirmed !== true) throw new Error('Explicit confirmation after reviewing the preserved employer form is required.');
  const outcome = text(input.outcome, 40).toUpperCase();
  if (!['FIELDS_PRESENT', 'FIELDS_NOT_FILLED'].includes(outcome)) throw new Error('Choose whether the approved fields are present on the preserved employer form.');
  const actionId = text(input.actionId, 160);
  const action = session?.actions?.find(item => item.id === actionId && item.type === 'EMPLOYER_ATS_FAILURE' && item.status === 'open');
  const execution = session?.workerExecution;
  if (!action || !execution || execution.status !== 'outcome-unknown' || action.metadata?.taskId !== execution.id) throw new Error('An unresolved employer-worker outcome is required.');
  if (session.formCheckpoint?.status !== 'preserved' || session.formCheckpoint.fieldSchemaHash !== execution.fieldSchemaHash) throw new Error('The exact preserved employer-form checkpoint is required for reconciliation.');
  const reviewedAt = validDate(now, 'Employer-form review timestamp');
  const resolvedActions = session.actions.map(item => item.id === action.id ? { ...item, status: 'resolved', resolvedAt: reviewedAt.toISOString() } : item);
  if (outcome === 'FIELDS_PRESENT') {
    const approval = session.approvals?.transmission;
    if (!approval?.consumedAt) throw new Error('The consumed single-use sharing approval is required for reconciliation.');
    return {
      ...session, state: 'Preparing', externalApplicationExecution: true,
      workerExecution: { ...execution, status: 'completed-after-user-review', completedAt: reviewedAt.toISOString(), failureCode: null },
      transmissionAttempt: {
        transmittedAt: null, transmissionTimeStatus: 'UNKNOWN', verifiedAt: reviewedAt.toISOString(), scopeHash: approval.scopeHash, documentVersion: session.documentVersion,
        fieldSchemaHash: execution.fieldSchemaHash, transmittedFieldKeys: execution.stagedFieldKeys,
        verificationSource: 'USER_CONFIRMED_PRESERVED_FORM',
      },
      actions: resolvedActions, updatedAt: reviewedAt.toISOString(),
      timeline: [...session.timeline, event('TRANSMISSION_RECONCILED_FIELDS_PRESENT', 'The job seeker reviewed the preserved employer form and confirmed the exact approved fields are present. Nothing was submitted and no field values were returned to 1stStep.', reviewedAt, { taskId: execution.id, fieldSchemaHash: execution.fieldSchemaHash, stagedFieldCount: execution.stagedFieldKeys.length })].slice(-200),
    };
  }
  const reconciled = {
    ...session, state: 'Waiting for You', stage: 'transmission_approval', externalApplicationExecution: true,
    approvals: { ...session.approvals, transmission: null },
    workerExecution: { ...execution, status: 'reconciled-not-filled', completedAt: reviewedAt.toISOString(), failureCode: null },
    actions: resolvedActions, updatedAt: reviewedAt.toISOString(),
  };
  const renewal = renewedTransmissionApprovalAction(reconciled, reviewedAt);
  return {
    ...reconciled, actions: [renewal, ...resolvedActions].slice(0, 100),
    timeline: [...session.timeline, event('TRANSMISSION_RECONCILED_NOT_FILLED', 'The job seeker reviewed the preserved employer form and confirmed the approved fields are not present. Automatic retry remains blocked; a fresh action-time sharing approval is required.', reviewedAt, { taskId: execution.id, fieldSchemaHash: execution.fieldSchemaHash })].slice(-200),
  };
}

function submissionApprovalScope(session) {
  const approval = session?.approvals?.transmission;
  if (!approval?.consumedAt) throw new Error('The approved transmission must be completed before final review.');
  const checkpoint = session?.formCheckpoint;
  const transmission = session?.transmissionAttempt;
  const fieldSchemaHash = text(checkpoint?.fieldSchemaHash, 64);
  if (checkpoint?.status !== 'preserved' || !SHA256.test(fieldSchemaHash) || checkpoint.attachedDocumentVersion !== session.documentVersion) throw new Error('The exact preserved employer form and document version are required for final review.');
  if (!transmission || transmission.scopeHash !== approval.scopeHash || transmission.documentVersion !== session.documentVersion || transmission.fieldSchemaHash !== fieldSchemaHash) throw new Error('The completed transmission must match the preserved employer form and approved scope.');
  const reviewedFieldKeys = [...new Set((checkpoint.stagedFieldKeys || []).map(value => text(value, 120)).filter(Boolean))].sort();
  const transmittedFieldKeys = [...new Set((transmission.transmittedFieldKeys || []).map(value => text(value, 120)).filter(Boolean))].sort();
  if (JSON.stringify(reviewedFieldKeys) !== JSON.stringify(transmittedFieldKeys)) throw new Error('The completed field scope must match the preserved employer form.');
  if (reviewedFieldKeys.some(key => !(approval.approvedFieldKeys || []).includes(key))) throw new Error('The reviewed employer form exceeds the approved personal-data scope.');
  return { employer: session.role.employer, requisitionId: session.role.requisitionId, documentVersion: session.documentVersion, fieldSchemaHash, reviewedFieldKeys };
}

export function requestApplicationSubmissionApproval(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'finalReview');
  if (Object.keys(input).some(key => key !== 'confirmed')) throw new Error('Final review accepts only a value-free user confirmation.');
  if (input.confirmed !== true) throw new Error('Explicit confirmation after reviewing the preserved employer form is required.');
  if (session?.stage !== 'employer_form' && session?.stage !== 'final_review') throw new Error('Final review is available only after the employer form is prepared.');
  if (session.actions.some(item => item.status === 'open')) throw new Error('All employer-form questions must be resolved before final submission approval.');
  const scope = submissionApprovalScope(session);
  const { fieldSchemaHash, reviewedFieldKeys } = scope;
  const action = actionItem('SUBMISSION_APPROVAL', `Approve final submission of ${session.documentVersion} to ${session.role.employer}. Submission will not count without an authoritative employer receipt.`, now, { scopeHash: hash(JSON.stringify(scope)), documentVersion: session.documentVersion, fieldSchemaHash });
  return {
    ...session, state: 'Waiting for You', stage: 'submission_approval', actions: [action, ...session.actions].slice(0, 100), updatedAt: at(now),
    timeline: [...session.timeline, event('FINAL_REVIEW_READY', 'The exact employer form and package are ready for separate action-time submission approval.', now, { actionId: action.id, scopeHash: action.metadata.scopeHash, documentVersion: session.documentVersion, fieldSchemaHash, reviewedFieldCount: reviewedFieldKeys.length })].slice(-200),
  };
}

export function refreshApplicationSubmissionApproval(session, now = new Date()) {
  if (session?.stage === 'submission_approval' && (session.actions || []).some(item => item.type === 'SUBMISSION_APPROVAL' && item.status === 'open')) return session;
  const approval = session?.approvals?.submission;
  if (session?.stage !== 'submission_execution' || !approval || approval.consumedAt || session.submissionAttempt) throw new Error('A fresh final-submission approval can be requested only before submission execution starts.');
  const checkedAt = validDate(now, 'Final-submission approval check timestamp');
  if (checkedAt <= new Date(approval.expiresAt)) return session;
  if ((session.actions || []).some(item => item.status === 'open')) throw new Error('All employer-form questions must be resolved before renewing final-submission approval.');
  const scope = submissionApprovalScope(session);
  const scopeHash = hash(JSON.stringify(scope));
  if (approval.scopeHash !== scopeHash || approval.documentVersion !== session.documentVersion) throw new Error('The reviewed employer form changed; repeat final review before submission approval.');
  const action = actionItem('SUBMISSION_APPROVAL', `Approve final submission of ${session.documentVersion} to ${session.role.employer}. The prior permission expired safely; nothing was submitted.`, checkedAt, { scopeHash, documentVersion: session.documentVersion, fieldSchemaHash: scope.fieldSchemaHash });
  return {
    ...session, state: 'Waiting for You', stage: 'submission_approval',
    approvals: { ...session.approvals, submission: { ...approval, supersededAt: checkedAt.toISOString() } },
    actions: [action, ...(session.actions || [])].slice(0, 100), updatedAt: checkedAt.toISOString(),
    timeline: [...session.timeline, event('SUBMISSION_REAPPROVAL_REQUIRED', 'The final-submission permission expired before execution. Nothing was submitted; a fresh action-time confirmation is required.', checkedAt, { approvalId: approval.id, scopeHash, documentVersion: session.documentVersion })].slice(-200),
  };
}

export function reserveApplicationSubmissionExecution(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'submissionReservation');
  if (Object.keys(input).some(key => key !== 'taskId')) throw new Error('Submission reservation accepts only a server-generated task identifier.');
  const taskId = text(input.taskId, 160);
  const approval = session?.approvals?.submission;
  const reservedAt = validDate(now, 'Submission reservation timestamp');
  if (!SAFE_ID.test(taskId)) throw new Error('A safe submission task identifier is required.');
  if (session?.stage !== 'submission_execution' || !approval || approval.consumedAt || session.submissionAttempt) throw new Error('An unused final-submission approval is required for reservation.');
  if (reservedAt < new Date(approval.confirmedAt) || reservedAt > new Date(approval.expiresAt)) throw new Error('Final-submission approval expired before reservation.');
  if ((session.actions || []).some(item => item.status === 'open')) throw new Error('All Human Action Required items must be resolved before submission reservation.');
  const scope = submissionApprovalScope(session);
  const scopeHash = hash(JSON.stringify(scope));
  if (approval.scopeHash !== scopeHash || approval.documentVersion !== session.documentVersion) throw new Error('Submission reservation does not match the reviewed employer form.');
  if (session.submissionExecution) {
    if (session.submissionExecution.id === taskId && session.submissionExecution.scopeHash === scopeHash) return session;
    const priorSafelyCancelled = ['cancelled', 'cancelled-before-provider'].includes(session.submissionExecution.status)
      && new Date(approval.confirmedAt) > new Date(session.submissionExecution.completedAt || 0);
    if (!priorSafelyCancelled) throw new Error('This application already has a submission execution record.');
  }
  const submissionExecution = {
    id: taskId, status: 'queued', scopeHash, documentVersion: session.documentVersion, fieldSchemaHash: scope.fieldSchemaHash,
    reservedAt: reservedAt.toISOString(), startedAt: null, completedAt: null, failureCode: null,
  };
  return {
    ...session, state: 'Preparing', submissionExecution, updatedAt: reservedAt.toISOString(),
    timeline: [...session.timeline, event('SUBMISSION_RESERVED', 'The exact approved final action was durably reserved. No employer submission request has started.', reservedAt, { taskId, scopeHash, documentVersion: session.documentVersion, fieldSchemaHash: scope.fieldSchemaHash })].slice(-200),
  };
}

export function cancelReservedApplicationSubmission(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'submissionCancellation');
  if (Object.keys(input).some(key => !['taskId', 'failureCode'].includes(key))) throw new Error('Submission cancellation accepts only a task and content-free reason.');
  const taskId = text(input.taskId, 160);
  const execution = session?.submissionExecution;
  const approval = session?.approvals?.submission;
  if (!execution || execution.id !== taskId || execution.status !== 'queued' || !approval || approval.consumedAt) throw new Error('A queued unused final-submission reservation is required.');
  const failureCode = text(input.failureCode || 'JOB_AGENT_AUTHORIZATION_REVOKED', 80);
  if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(failureCode)) throw new Error('A safe submission cancellation code is required.');
  const cancelledAt = validDate(now, 'Submission cancellation timestamp');
  return {
    ...session, state: 'Paused',
    approvals: { ...session.approvals, submission: { ...approval, expiresAt: cancelledAt.toISOString() } },
    submissionExecution: { ...execution, status: 'cancelled', completedAt: cancelledAt.toISOString(), failureCode },
    updatedAt: cancelledAt.toISOString(),
    timeline: [...session.timeline, event('SUBMISSION_RESERVATION_CANCELLED', 'The queued final action was cancelled before execution because Job Agent authorization changed. No employer submission request started.', cancelledAt, { taskId, failureCode })].slice(-200),
  };
}

export function expireReservedApplicationSubmission(session, input = {}, now = new Date()) {
  const taskId = text(input.taskId, 160);
  const execution = session?.submissionExecution;
  const approval = session?.approvals?.submission;
  const expiredAt = validDate(now, 'Final-submission approval expiry timestamp');
  if (!execution || execution.id !== taskId || execution.status !== 'queued' || !approval || approval.consumedAt) throw new Error('A queued unused final-submission approval is required.');
  if (expiredAt <= new Date(approval.expiresAt)) throw new Error('Final-submission approval has not expired.');
  const scope = submissionApprovalScope(session);
  const scopeHash = hash(JSON.stringify(scope));
  if (approval.scopeHash !== scopeHash || approval.documentVersion !== session.documentVersion) throw new Error('The reviewed employer form changed; repeat final review before submission approval.');
  const action = actionItem('SUBMISSION_APPROVAL', `Approve final submission of ${session.documentVersion} to ${session.role.employer}. The prior permission expired safely; nothing was submitted.`, expiredAt, { scopeHash, documentVersion: session.documentVersion, fieldSchemaHash: scope.fieldSchemaHash });
  return {
    ...session, state: 'Waiting for You', stage: 'submission_approval',
    approvals: { ...session.approvals, submission: { ...approval, supersededAt: expiredAt.toISOString() } },
    submissionExecution: { ...execution, status: 'cancelled', completedAt: expiredAt.toISOString(), failureCode: 'SUBMISSION_APPROVAL_EXPIRED' },
    actions: [action, ...(session.actions || [])].slice(0, 100), updatedAt: expiredAt.toISOString(),
    timeline: [...session.timeline, event('SUBMISSION_APPROVAL_EXPIRED', 'The final-submission permission expired before the provider action started. Nothing was submitted; a fresh action-time confirmation is required.', expiredAt, { taskId, approvalId: approval.id, scopeHash })].slice(-200),
  };
}

export function beginReservedApplicationSubmission(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'submissionStart');
  if (Object.keys(input).some(key => key !== 'taskId')) throw new Error('Submission start accepts only the reserved task identifier.');
  const taskId = text(input.taskId, 160);
  const execution = session?.submissionExecution;
  const approval = session?.approvals?.submission;
  const startedAt = validDate(now, 'Submission start timestamp');
  if (!execution || execution.id !== taskId || execution.status !== 'queued' || session?.stage !== 'submission_execution' || !approval || approval.consumedAt) throw new Error('A queued single-use final-submission reservation is required.');
  if (startedAt < new Date(approval.confirmedAt) || startedAt > new Date(approval.expiresAt)) throw new Error('Final-submission approval expired before execution.');
  return {
    ...session, externalApplicationExecution: session.externalApplicationExecution === true,
    approvals: { ...session.approvals, submission: { ...approval, consumedAt: startedAt.toISOString() } },
    submissionExecution: { ...execution, status: 'executing', startedAt: startedAt.toISOString() }, updatedAt: startedAt.toISOString(),
    timeline: [...session.timeline, event('SUBMISSION_EXECUTION_STARTED', 'The single-use final approval was consumed before the isolated provider received the submit instruction. Any ambiguous outcome requires reconciliation and will never retry automatically.', startedAt, { taskId, scopeHash: execution.scopeHash, documentVersion: execution.documentVersion })].slice(-200),
  };
}

export function cancelArmedApplicationSubmissionBeforeProvider(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'armedSubmissionCancellation');
  if (Object.keys(input).some(key => !['taskId', 'failureCode'].includes(key))) throw new Error('Armed submission cancellation accepts only a task and content-free reason.');
  const taskId = text(input.taskId, 160);
  const execution = session?.submissionExecution;
  const approval = session?.approvals?.submission;
  if (!execution || execution.id !== taskId || execution.status !== 'executing' || !approval?.consumedAt || session.submissionAttempt) throw new Error('An armed pre-provider final-submission reservation is required.');
  const failureCode = text(input.failureCode || 'JOB_AGENT_AUTHORIZATION_REVOKED', 80);
  if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(failureCode)) throw new Error('A safe armed submission cancellation code is required.');
  const cancelledAt = validDate(now, 'Armed submission cancellation timestamp');
  return {
    ...session, state: 'Paused', stage: 'final_review', externalApplicationExecution: false,
    approvals: { ...session.approvals, submission: null },
    submissionExecution: { ...execution, status: 'cancelled-before-provider', completedAt: cancelledAt.toISOString(), failureCode },
    updatedAt: cancelledAt.toISOString(),
    timeline: [...session.timeline, event('SUBMISSION_ARMED_ACTION_CANCELLED', 'The final permission had been consumed, but authorization changed before the provider action started. No employer submission request was sent; a new final review and approval are required.', cancelledAt, { taskId, failureCode })].slice(-200),
  };
}

export function completeReservedApplicationSubmission(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'submissionCompletion');
  if (Object.keys(input).some(key => !['taskId', 'submittedAt', 'responseFingerprint', 'receiptTaskId'].includes(key))) throw new Error('Submission completion accepts only minimized provider evidence.');
  const taskId = text(input.taskId, 160);
  const execution = session?.submissionExecution;
  if (!execution || execution.id !== taskId || execution.status !== 'executing' || !session?.approvals?.submission?.consumedAt || session.submissionAttempt) throw new Error('An executing single-use final-submission reservation is required.');
  const submittedAt = validDate(input.submittedAt || now, 'Submission timestamp');
  if (submittedAt < new Date(execution.startedAt)) throw new Error('Submission timestamp is invalid.');
  const responseFingerprint = text(input.responseFingerprint, 64);
  if (!SHA256.test(responseFingerprint)) throw new Error('A response fingerprint is required for receipt reconciliation.');
  const receiptTaskId = text(input.receiptTaskId, 160);
  if (!SAFE_ID.test(receiptTaskId)) throw new Error('A safe durable receipt-verification task is required.');
  const submissionAttempt = { submittedAt: submittedAt.toISOString(), scopeHash: execution.scopeHash, documentVersion: session.documentVersion, responseFingerprint, authoritativeReceiptVerified: false };
  return {
    ...session, state: 'Preparing', stage: 'receipt_verification', externalApplicationExecution: true, submissionAttempt,
    receiptVerification: { id: receiptTaskId, status: 'queued', attempt: 0, lastCheckedAt: null, completedAt: null, failureCode: null },
    submissionExecution: { ...execution, status: 'completed', completedAt: at(now) }, updatedAt: at(now),
    timeline: [...session.timeline, event('SUBMISSION_ATTEMPT_RECORDED', 'The isolated provider reported a submission request. It is not counted as Submitted until authoritative employer receipt verification succeeds.', now, { taskId, scopeHash: execution.scopeHash, documentVersion: session.documentVersion, responseFingerprint })].slice(-200),
  };
}

export function failReservedApplicationSubmission(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'submissionFailure');
  if (Object.keys(input).some(key => !['taskId', 'failureCode'].includes(key))) throw new Error('Submission failure accepts only a content-free outcome code.');
  const taskId = text(input.taskId, 160);
  const execution = session?.submissionExecution;
  if (!execution || execution.id !== taskId || execution.status !== 'executing') throw new Error('An executing final-submission reservation is required.');
  const failureCode = text(input.failureCode || 'SUBMISSION_OUTCOME_UNKNOWN', 80);
  if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(failureCode)) throw new Error('A safe submission failure code is required.');
  const action = actionItem('SUBMISSION_OUTCOME_UNKNOWN', 'The final employer action started but its result could not be verified. It will never retry automatically; check the preserved employer page and wait for receipt reconciliation.', now, { taskId, failureCode });
  return {
    ...session, state: 'Waiting for You', stage: 'receipt_verification', externalApplicationExecution: true,
    submissionExecution: { ...execution, status: 'outcome-unknown', completedAt: at(now), failureCode },
    actions: [action, ...(session.actions || [])].slice(0, 100), updatedAt: at(now),
    timeline: [...session.timeline, event('SUBMISSION_EXECUTION_OUTCOME_UNKNOWN', 'The single-use final action ended without a verified result. Automatic resubmission is blocked and this application is not counted as Submitted.', now, { taskId, failureCode })].slice(-200),
  };
}

export function recordApplicationSubmissionAttempt(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'submissionAttempt');
  const approval = session?.approvals?.submission;
  if (session?.stage !== 'submission_execution' || !approval || approval.consumedAt) throw new Error('An unused final-submission approval is required.');
  const submittedAt = validDate(input.submittedAt || now, 'Submission timestamp');
  if (submittedAt < new Date(approval.confirmedAt) || submittedAt > new Date(approval.expiresAt)) throw new Error('Final-submission approval expired or was not valid at action time.');
  if (text(input.scopeHash, 64) !== approval.scopeHash || text(input.documentVersion, 180) !== session.documentVersion) throw new Error('Submission scope must match the approved employer and document version.');
  const responseFingerprint = text(input.responseFingerprint, 64);
  if (!SHA256.test(responseFingerprint)) throw new Error('A response fingerprint is required for receipt reconciliation.');
  const submissionAttempt = { submittedAt: submittedAt.toISOString(), scopeHash: approval.scopeHash, documentVersion: session.documentVersion, responseFingerprint, authoritativeReceiptVerified: false };
  return {
    ...session, state: 'Preparing', stage: 'receipt_verification', approvals: { ...session.approvals, submission: { ...approval, consumedAt: submittedAt.toISOString() } }, submissionAttempt, updatedAt: at(now),
    timeline: [...session.timeline, event('SUBMISSION_ATTEMPT_RECORDED', 'The isolated worker reported a submission request. It is not counted as Submitted until authoritative employer receipt verification succeeds.', now, { scopeHash: approval.scopeHash, documentVersion: session.documentVersion, responseFingerprint })].slice(-200),
  };
}

export function recordAuthoritativeApplicationReceipt(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'receipt');
  if (session?.receipt) {
    if (session.receipt.evidenceHash === text(input.evidenceHash, 64)) return session;
    throw new Error('An authoritative receipt is already recorded for this application session.');
  }
  if (session?.stage !== 'receipt_verification' || !session?.approvals?.submission?.consumedAt || !session?.submissionAttempt) throw new Error('A consumed final-submission approval and submission attempt are required before receipt verification.');
  const source = text(input.source, 80);
  const verificationMethod = text(input.verificationMethod, 80);
  if (!RECEIPT_SOURCES.has(source) || !RECEIPT_METHODS.has(verificationMethod)) throw new Error('A supported authoritative employer receipt source and verification method are required.');
  const evidenceHash = text(input.evidenceHash, 64);
  if (!SHA256.test(evidenceHash)) throw new Error('An immutable employer-receipt evidence hash is required.');
  if (text(input.documentVersion, 180) !== session.documentVersion || text(input.requisitionId, 160) !== session.role.requisitionId) throw new Error('Receipt identity must match the submitted requisition and document version.');
  const receivedAt = validDate(input.receivedAt, 'Employer receipt timestamp');
  const submittedAt = new Date(session.submissionAttempt.submittedAt);
  const verifiedAt = validDate(now, 'Receipt verification timestamp');
  if (receivedAt < submittedAt || receivedAt > new Date(verifiedAt.getTime() + 2 * 60_000)) throw new Error('Employer receipt timestamp must follow the recorded submission attempt.');
  const expectedHostname = new URL(session.role.directEmployerUrl).hostname;
  const confirmationUrl = safeEvidenceUrl(input.confirmationUrl, source === 'EMPLOYER_CONFIRMATION_PAGE' ? expectedHostname : '');
  const confirmationReference = maskedReference(input.confirmationId);
  if (!confirmationUrl && !confirmationReference) throw new Error('A masked confirmation reference or verified employer receipt URL is required.');
  const receipt = {
    authority: 'employer-side', source, verificationMethod, receivedAt: receivedAt.toISOString(), verifiedAt: verifiedAt.toISOString(),
    employer: session.role.employer, requisitionId: session.role.requisitionId, documentVersion: session.documentVersion,
    evidenceHash, confirmationReference, confirmationUrl, verifier: 'signed-internal-worker',
  };
  return {
    ...session, state: 'Finished', stage: 'receipt_verification', submissionAttempt: { ...session.submissionAttempt, authoritativeReceiptVerified: true }, receipt,
    actions: (session.actions || []).map(item => item.type === 'RECEIPT_VERIFICATION' && item.status === 'open'
      ? { ...item, status: 'resolved', resolvedAt: verifiedAt.toISOString() }
      : item),
    receiptVerification: session.receiptVerification ? { ...session.receiptVerification, status: 'completed', completedAt: verifiedAt.toISOString(), failureCode: null } : null,
    postSubmission: {
      status: 'SUBMITTED', source: 'AUTHORITATIVE_EMPLOYER_RECEIPT', occurredAt: receivedAt.toISOString(), recordedAt: verifiedAt.toISOString(),
      followUp: { status: 'NOT_SCHEDULED', dueAt: null, completedAt: null },
    },
    updatedAt: at(now),
    timeline: [...session.timeline, event('AUTHORITATIVE_RECEIPT_VERIFIED', 'An authoritative employer receipt was verified. This application may now count as Submitted.', now, { source, verificationMethod, evidenceHash, documentVersion: session.documentVersion })].slice(-200),
  };
}

export function recordReceiptVerificationPending(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'receiptVerificationPending');
  if (Object.keys(input).some(key => !['taskId', 'failureCode', 'attempt'].includes(key))) throw new Error('Receipt-verification status accepts only content-free task metadata.');
  const taskId = text(input.taskId, 160);
  const verification = session?.receiptVerification;
  if (session?.stage !== 'receipt_verification' || session?.receipt || !session?.submissionAttempt || verification?.id !== taskId || !['queued', 'checking'].includes(verification.status)) throw new Error('A pending exact-scope receipt-verification task is required.');
  const failureCode = text(input.failureCode || 'AUTHORITATIVE_RECEIPT_NOT_YET_VERIFIED', 80);
  if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(failureCode)) throw new Error('A safe receipt-verification status code is required.');
  const attempt = Number(input.attempt);
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 100) throw new Error('A bounded receipt-verification attempt is required.');
  return {
    ...session,
    receiptVerification: { ...verification, status: 'queued', attempt, lastCheckedAt: at(now), failureCode },
    updatedAt: at(now),
    timeline: [...session.timeline, event('AUTHORITATIVE_RECEIPT_PENDING', 'The employer receipt is not verified yet. The application remains uncounted and the read-only receipt check may resume later.', now, { taskId, attempt, failureCode })].slice(-200),
  };
}

export function requireManualReceiptVerification(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'manualReceiptVerification');
  if (Object.keys(input).some(key => !['taskId', 'failureCode', 'attempt'].includes(key))) throw new Error('Manual receipt verification accepts only content-free task metadata.');
  const taskId = text(input.taskId, 160);
  const verification = session?.receiptVerification;
  if (session?.receipt || session?.stage !== 'receipt_verification' || !session?.submissionAttempt || verification?.id !== taskId) throw new Error('A matching unresolved receipt-verification task is required.');
  const failureCode = text(input.failureCode || 'AUTHORITATIVE_RECEIPT_REVIEW_REQUIRED', 80);
  const attempt = Number(input.attempt);
  if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(failureCode) || !Number.isSafeInteger(attempt) || attempt < 1 || attempt > 100) throw new Error('Safe bounded receipt-verification metadata is required.');
  const existing = (session.actions || []).find(action => action.status === 'open' && action.type === 'RECEIPT_VERIFICATION');
  const action = existing || actionItem('RECEIPT_VERIFICATION', 'No authoritative employer receipt has been verified yet. Check the preserved employer page or confirmation email; do not submit again.', now, { taskId, failureCode });
  return {
    ...session, state: 'Waiting for You',
    receiptVerification: { ...verification, status: 'needs-human', attempt, lastCheckedAt: at(now), completedAt: at(now), failureCode },
    actions: existing ? session.actions : [action, ...(session.actions || [])].slice(0, 100), updatedAt: at(now),
    timeline: [...session.timeline, event('AUTHORITATIVE_RECEIPT_REVIEW_REQUIRED', 'Automated receipt verification ended without authoritative evidence. The application remains uncounted and submission retry is prohibited.', now, { taskId, attempt, failureCode })].slice(-200),
  };
}

export function recordPostSubmissionOutcome(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'postSubmissionOutcome');
  if (!session?.receipt || session.receipt.authority !== 'employer-side') throw new Error('An authoritative employer receipt is required before recording a post-submission outcome.');
  if (input.confirmed !== true) throw new Error('The job seeker must explicitly confirm this post-submission update.');
  const outcome = text(input.outcome, 40).toUpperCase();
  if (!POST_SUBMISSION_OUTCOMES.has(outcome)) throw new Error('A supported post-submission outcome is required.');
  const recordedAt = validDate(now, 'Outcome record timestamp');
  const existing = session.postSubmission || {
    status: 'SUBMITTED', source: 'AUTHORITATIVE_EMPLOYER_RECEIPT', occurredAt: session.receipt.receivedAt, recordedAt: session.receipt.verifiedAt || session.receipt.receivedAt,
    followUp: { status: 'NOT_SCHEDULED', dueAt: null, completedAt: null },
  };
  let postSubmission;
  let kind;
  let summary;
  let metadata = {};
  if (outcome === 'INTERVIEW' || outcome === 'REJECTED_CLOSED') {
    const occurredAt = validDate(input.occurredAt || recordedAt, 'Outcome timestamp');
    if (occurredAt < new Date(session.receipt.receivedAt) || occurredAt > new Date(recordedAt.getTime() + 2 * 60_000)) throw new Error('The confirmed outcome timestamp must follow the authoritative employer receipt.');
    if (existing.status === outcome && existing.occurredAt === occurredAt.toISOString()) return session;
    postSubmission = {
      ...existing, status: outcome, source: 'USER_CONFIRMED', occurredAt: occurredAt.toISOString(), recordedAt: recordedAt.toISOString(),
      followUp: outcome === 'REJECTED_CLOSED' ? { status: 'NOT_SCHEDULED', dueAt: null, completedAt: null } : existing.followUp,
    };
    kind = outcome === 'INTERVIEW' ? 'INTERVIEW_CONFIRMED' : 'APPLICATION_REJECTED_OR_CLOSED_CONFIRMED';
    summary = outcome === 'INTERVIEW'
      ? 'The job seeker confirmed an interview outcome. This status was not inferred by the agent.'
      : 'The job seeker confirmed the employer rejected or closed the application. This status was not inferred by the agent.';
    metadata = { outcome, source: 'USER_CONFIRMED', occurredAt: occurredAt.toISOString() };
  } else if (outcome === 'FOLLOW_UP_SCHEDULED') {
    if (existing.status === 'REJECTED_CLOSED') throw new Error('A closed application cannot schedule a follow-up reminder.');
    const dueAt = validDate(input.dueAt, 'Follow-up due timestamp');
    if (dueAt <= recordedAt || dueAt > new Date(recordedAt.getTime() + 180 * 24 * 60 * 60_000)) throw new Error('A follow-up reminder must be scheduled within the next 180 days.');
    if (existing.followUp?.status === 'SCHEDULED' && existing.followUp.dueAt === dueAt.toISOString()) return session;
    postSubmission = { ...existing, followUp: { status: 'SCHEDULED', dueAt: dueAt.toISOString(), completedAt: null } };
    kind = 'FOLLOW_UP_REMINDER_SCHEDULED';
    summary = 'The job seeker scheduled an in-app follow-up reminder. No employer message was created or sent.';
    metadata = { dueAt: dueAt.toISOString(), source: 'USER_CONFIRMED' };
  } else {
    if (existing.followUp?.status !== 'SCHEDULED') throw new Error('A scheduled follow-up reminder is required before it can be completed.');
    if (existing.followUp.status === 'COMPLETED') return session;
    postSubmission = { ...existing, followUp: { ...existing.followUp, status: 'COMPLETED', completedAt: recordedAt.toISOString() } };
    kind = 'FOLLOW_UP_CONFIRMED_COMPLETE';
    summary = 'The job seeker marked the follow-up reminder complete. The agent did not contact the employer.';
    metadata = { dueAt: existing.followUp.dueAt, source: 'USER_CONFIRMED' };
  }
  return {
    ...session, postSubmission, updatedAt: recordedAt.toISOString(),
    timeline: [...session.timeline, event(kind, summary, recordedAt, metadata)].slice(-200),
  };
}

export function confirmExternalApplicationStep(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'externalStep');
  if (Object.keys(input).some(key => !['actionId', 'confirmed'].includes(key))) throw new Error('Employer-site completion accepts only a value-free action confirmation; answer values are not allowed.');
  if (input.confirmed !== true) throw new Error('Explicit confirmation that the employer-site step was completed is required.');
  const actionId = text(input.actionId, 160);
  const action = session?.actions?.find(item => item.id === actionId && item.status === 'open');
  if (!action) throw new Error('The open employer-site action could not be found.');
  if (!EMPLOYER_SITE_COMPLETION_ACTIONS.has(action.type)) throw new Error('This action cannot be resolved as an employer-site completion step.');
  const actions = session.actions.map(item => item.id === actionId ? { ...item, status: 'resolved', resolvedAt: at(now) } : item);
  const stillWaiting = actions.some(item => item.status === 'open');
  return {
    ...session, actions, state: stillWaiting ? 'Waiting for You' : 'Preparing', updatedAt: at(now),
    timeline: [...session.timeline, event('EXTERNAL_STEP_CONFIRMED', 'The job seeker confirmed completion on the employer site. No answer, credential, identity document, or challenge value was collected.', now, { actionId, type: action.type })].slice(-200),
  };
}

export function preserveApplicationFormCheckpoint(session, input = {}, now = new Date()) {
  assertNoApplicationSecrets(input, 'checkpoint');
  const stagedFieldKeys = Array.isArray(input.stagedFieldKeys) ? input.stagedFieldKeys.slice(0, 120).map(value => text(value, 120)).filter(Boolean) : [];
  const checkpoint = {
    status: 'preserved', pageUrl: directUrl(input.pageUrl || session.role.directEmployerUrl), stepKey: text(input.stepKey, 120),
    fieldSchemaHash: text(input.fieldSchemaHash, 64), stagedFieldKeys, attachedDocumentVersion: session.documentVersion, preservedAt: at(now),
  };
  if (!/^[a-f0-9]{64}$/i.test(checkpoint.fieldSchemaHash)) throw new Error('A field-schema hash is required to preserve the form checkpoint.');
  return { ...session, formCheckpoint: checkpoint, updatedAt: at(now), timeline: [...session.timeline, event('FORM_CHECKPOINT_PRESERVED', 'Employer form structure and staged field references preserved without field values or credentials.', now, { stepKey: checkpoint.stepKey, fieldSchemaHash: checkpoint.fieldSchemaHash, stagedFieldCount: stagedFieldKeys.length })].slice(-200) };
}

export function applicationSessionPublicSummary(session) {
  return {
    id: session.id, packageRunId: session.packageRunId, role: session.role, documentVersion: session.documentVersion,
    state: session.state, stage: session.stage, externalApplicationExecution: session.externalApplicationExecution === true, worker: session.worker,
    proposedFields: session.proposedFields, formCheckpoint: session.formCheckpoint, approvals: session.approvals, workerExecution: session.workerExecution || null,
    transmissionAttempt: session.transmissionAttempt || null, submissionExecution: session.submissionExecution || null, submissionAttempt: session.submissionAttempt || null,
    receiptVerification: session.receiptVerification || null,
    actions: session.actions, receipt: session.receipt, postSubmission: session.postSubmission || null, closedBeforeSubmission: session.closedBeforeSubmission || null, createdAt: session.createdAt, updatedAt: session.updatedAt, timeline: session.timeline,
  };
}
