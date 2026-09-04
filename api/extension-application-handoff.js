import { createHash } from 'node:crypto';
import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed, jobAgentAccessAllowed } from '../lib/api-security.js';
import { beginReservedApplicationTransmission, closeApplicationSessionBeforeSubmission, completeReservedApplicationTransmission, failReservedApplicationTransmission, reserveApplicationTransmission } from '../lib/application-session-domain.js';
import { readDurableApplicationSession, updateDurableApplicationSession } from '../lib/application-session-store.js';
import { readApplicantVault } from '../lib/applicant-vault-store.js';
import { applyEmployerInspectionPlan } from '../lib/employer-browser-orchestrator.js';
import { createExtensionHandoffToken, extensionApplicationHandoffConfiguration, materializeGreenhouseExtensionFields, planGreenhouseExtensionHandoff, verifyExtensionHandoffToken } from '../lib/extension-application-handoff.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { jobAgentConsentGate } from '../lib/job-agent-consent-store.js';
import { jobAgentRuntimeConfiguration } from '../lib/job-agent-runtime-configuration.js';
import { jobAgentTenantId, readJobAgentRun } from '../lib/job-agent-run-store.js';
import { readApplicationPackageArtifact } from '../lib/job-agent-object-storage.js';
import { notifyNewApplicationNeedsYouAction } from '../lib/application-needs-you-notifier.js';
import { reverifyPublicJob } from '../lib/public-ats-discovery.js';
import { recordConfiguredJobAgentOperationalEvent } from '../lib/job-agent-operational-metrics.js';
import { evaluateCandidateFit } from '../client/job-intelligence.js';

export const maxDuration = 30;

const PREPARE_KEYS = new Set(['action', 'sessionId', 'version', 'pageUrl', 'fields']);
const COMPLETE_KEYS = new Set(['action', 'handoffToken', 'filledFieldKeys', 'failedFieldKeys']);
const DOCUMENT_KEYS = new Set(['action', 'handoffToken']);

function exactKeys(body, allowed) {
  return body && typeof body === 'object' && !Array.isArray(body) && !Object.keys(body).some(key => !allowed.has(key));
}

function safeKeys(input) {
  return [...new Set((Array.isArray(input) ? input : []).slice(0, 80).map(value => String(value || '').trim()).filter(value => /^[A-Za-z][A-Za-z0-9:_-]{0,119}$/.test(value)))].sort();
}

function activeVaultValue(vault, fieldKey) {
  const fact = (vault?.facts || []).find(item => item.status === 'active' && item.fieldKey === fieldKey);
  const version = fact?.versions?.find(item => Number(item.version) === Number(fact.currentVersion)) || fact?.versions?.at(-1);
  return ['user-confirmed', 'document-verified'].includes(version?.verificationState) ? String(version?.value || '').trim() : '';
}

function valueList(value) {
  return String(value || '').split(/[\n,;]+/).map(item => item.trim()).filter(Boolean).slice(0, 80);
}

export function buildExtensionMatchAssessment({ job, vault, session } = {}) {
  const profile = {
    skills: valueList(activeVaultValue(vault, 'skills')),
    workHistory: [...valueList(activeVaultValue(vault, 'employment')), ...valueList(activeVaultValue(vault, 'achievements'))],
    education: valueList(activeVaultValue(vault, 'education')),
    prioritizedRoleFamilies: valueList(activeVaultValue(vault, 'rolePreferences')),
  };
  const fit = evaluateCandidateFit(job || {}, profile, { role: session?.role?.title || '' });
  return {
    schemaVersion: 1,
    confidenceScore: Math.round(Number(fit.score) || 0),
    classification: String(fit.classification || 'Needs review'),
    tailoringJustification: String(fit.rationale || 'Insufficient verified alignment to justify autofill.').slice(0, 300),
    matchedEvidence: (fit.matchedEvidence || []).map(value => String(value).slice(0, 80)).slice(0, 4),
    credibleInterviewPath: fit.credibleInterviewPath === true,
    minimumAutofillScore: 70,
    source: 'deterministic-verified-evidence-v1',
  };
}

export function verifiedResumeArtifact(run, session) {
  const qa = run?.result?.qa;
  const render = run?.result?.renderEvidence;
  if (run?.taskType !== 'application_package' || run.status !== 'Finished'
    || run.result?.documentVersion !== session.documentVersion
    || qa?.visualPageInspection !== true || qa?.pagesInspected !== true || (qa?.issues || []).length
    || render?.complete !== true || render?.documentVersion !== session.documentVersion) {
    throw new Error('GREENHOUSE_APPROVED_RESUME_NOT_READY');
  }
  const matches = (run.result.artifacts || []).filter(item => item?.key === 'resume_pdf');
  const artifact = matches.length === 1 ? matches[0] : null;
  if (!artifact || artifact.contentType !== 'application/pdf' || !/^[a-f0-9]{64}$/i.test(String(artifact.sha256 || ''))
    || !Number.isSafeInteger(Number(artifact.bytes)) || Number(artifact.bytes) < 1 || Number(artifact.bytes) > 800_000
    || !/^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,178}\.pdf$/i.test(String(artifact.filename || ''))) {
    throw new Error('GREENHOUSE_APPROVED_RESUME_ARTIFACT_INVALID');
  }
  return artifact;
}

async function restoreVerifiedResume({ config, subject, session }) {
  const run = await readJobAgentRun({ ...config, subject, runId: session.packageRunId });
  return { run, artifact: verifiedResumeArtifact(run, session) };
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
  if (JSON.stringify(req.body || {}).length > 35_000) return res.status(413).json({ error: 'Extension handoff request is too large.' });

  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  if (!jobAgentAccessAllowed(auth)) return res.status(403).json({ error: 'Job Agent access is required.', code: 'JOB_AGENT_ACCESS_REQUIRED' });
  const config = jobAgentRuntimeConfiguration();
  const handoff = extensionApplicationHandoffConfiguration(process.env);
  if (!config || !handoff.ready) return res.status(503).json({ error: 'The controlled Greenhouse handoff is not configured.', code: 'EXTENSION_HANDOFF_NOT_CONFIGURED' });
  const consent = await jobAgentConsentGate(config, auth.subject);
  if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code });
  const limit = await enforceDurableRateLimit(req, {
    scope: 'extension-application-handoff', subject: auth.subject,
    ipRule: { limit: 8, window: '5 m' }, accountRule: { limit: 60, window: '1 d' }, globalRule: { limit: 2_000, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'The extension handoff is temporarily rate limited. Your employer form remains untouched.');

  try {
    const action = String(req.body?.action || '');
    if (action === 'prepare') {
      if (!exactKeys(req.body, PREPARE_KEYS)) return res.status(400).json({ error: 'Prepare accepts only a value-free Greenhouse field schema.', code: 'EXTENSION_SCHEMA_ONLY_REQUIRED' });
      const sessionId = String(req.body.sessionId || '');
      const current = await readDurableApplicationSession({ ...config, subject: auth.subject, sessionId });
      if (!current) return res.status(404).json({ error: 'Application session not found.' });
      if (Number(req.body.version) !== Number(current.version)) return res.status(409).json({ error: 'Application session changed. Refresh and retry.', code: 'APPLICATION_SESSION_CHANGED' });
      const { version, audit: _audit, ...session } = current;
      let employerReverification;
      try {
        employerReverification = await reverifyPublicJob({
          job: {
            provider: 'greenhouse', employer: session.role.employer, title: session.role.title,
            requisitionId: session.role.requisitionId, applyUrl: session.role.directEmployerUrl, jobUrl: session.role.directEmployerUrl,
          },
          sources: config.sources,
        });
      } catch (error) {
        const code = String(error?.message || '');
        if (/PUBLIC_ATS_REVERIFICATION_(?:TRANSIENT|REJECTED|SOURCE_NOT_FOUND)/.test(code)) { await recordConfiguredJobAgentOperationalEvent('direct_employer_reverification_failure'); return res.status(503).json({ error: 'The employer requisition could not be reverified. Nothing was transmitted; try again later.', code: 'DIRECT_EMPLOYER_REVERIFICATION_UNAVAILABLE' }); }
        throw error;
      }
      let closureCode = employerReverification.status === 'closed' ? 'DIRECT_EMPLOYER_REQUISITION_CLOSED' : null;
      if (employerReverification.status === 'open') {
        const refreshedUrl = new URL(employerReverification.job.applyUrl); refreshedUrl.hash = '';
        const savedUrl = new URL(session.role.directEmployerUrl); savedUrl.hash = '';
        if (employerReverification.job.title !== session.role.title || refreshedUrl.href !== savedUrl.href) closureCode = 'DIRECT_EMPLOYER_REQUISITION_CHANGED';
      }
      if (closureCode) {
        await recordConfiguredJobAgentOperationalEvent(closureCode === 'DIRECT_EMPLOYER_REQUISITION_CLOSED' ? 'direct_employer_reverification_closed' : 'direct_employer_reverification_changed');
        const closed = closeApplicationSessionBeforeSubmission(session, { reasonCode: closureCode });
        const saved = await updateDurableApplicationSession({ ...config, subject: auth.subject, sessionId, expectedVersion: version, session: closed });
        return res.status(409).json({
          error: closureCode === 'DIRECT_EMPLOYER_REQUISITION_CLOSED' ? 'The employer requisition is closed.' : 'The employer changed this requisition; the saved application was retired.',
          code: closureCode, session: saved, personalDataTransmitted: false, submitted: false, receiptVerified: false,
        });
      }
      await recordConfiguredJobAgentOperationalEvent('direct_employer_reverification_open');
      const plan = planGreenhouseExtensionHandoff({ session, pageUrl: req.body.pageUrl, fields: req.body.fields });
      let updated = applyEmployerInspectionPlan(session, plan);
      if (plan.status === 'waiting-for-user') {
        const saved = await updateDurableApplicationSession({ ...config, subject: auth.subject, sessionId, expectedVersion: version, session: updated });
        await notifyNewApplicationNeedsYouAction({ config, subject: auth.subject, session: saved, previousSession: current });
        return res.status(200).json({ status: 'waiting-for-user', session: saved, needsYou: plan.actions, candidateValuesReturned: false, submissionAuthorized: false });
      }

      const vault = await readApplicantVault({ ...config, subject: auth.subject });
      if (!vault?.vault) return res.status(409).json({ error: 'A confirmed applicant vault is required.', code: 'APPLICANT_VAULT_REQUIRED' });
      const matchAssessment = buildExtensionMatchAssessment({ job: employerReverification.job, vault: vault.vault, session });
      if (!matchAssessment.credibleInterviewPath || matchAssessment.confidenceScore < matchAssessment.minimumAutofillScore) {
        return res.status(200).json({
          status: 'match-review-required', matchAssessment,
          candidateValuesReturned: false, valuesPersistedByExtension: false, submissionAuthorized: false,
        });
      }
      const transientFields = materializeGreenhouseExtensionFields(plan, vault.vault);
      const resume = plan.documentUpload ? await restoreVerifiedResume({ config, subject: auth.subject, session }) : null;
      const mutationNow = new Date();
      const taskId = `extension_${createHash('sha256').update(`${session.id}.${plan.fieldSchemaHash}.${session.approvals?.transmission?.id || ''}`).digest('hex').slice(0, 32)}`;
      updated = reserveApplicationTransmission(updated, { taskId, fieldSchemaHash: plan.fieldSchemaHash, stagedFieldKeys: plan.stagedFields.map(item => item.fieldKey) }, mutationNow);
      updated = beginReservedApplicationTransmission(updated, { taskId }, mutationNow);
      const recordVersion = Number(version) + 1;
      const handoffToken = createExtensionHandoffToken({
        sessionId, recordVersion, approvalId: updated.approvals.transmission.id, taskId,
        fieldSchemaHash: plan.fieldSchemaHash, stagedFields: plan.stagedFields, pageUrl: plan.target.pageUrl,
        secret: handoff.secret, now: mutationNow,
      });
      const saved = await updateDurableApplicationSession({ ...config, subject: auth.subject, sessionId, expectedVersion: version, session: updated, now: mutationNow });
      if (Number(saved?.version) !== recordVersion) throw new Error('EXTENSION_HANDOFF_VERSION_MISMATCH');
      return res.status(200).json({
        status: 'ready-to-fill', provider: 'greenhouse', adapterVersion: plan.adapterVersion,
        sessionId, version: recordVersion, fieldSchemaHash: plan.fieldSchemaHash, handoffToken,
        matchAssessment,
        fields: transientFields, leftUnanswered: plan.leftUnanswered,
        document: resume ? {
          available: true, fieldRef: plan.documentUpload.fieldRef, fieldKey: 'resumeDocument',
          documentVersion: session.documentVersion, filename: resume.artifact.filename,
          contentType: resume.artifact.contentType, bytes: resume.artifact.bytes, sha256: resume.artifact.sha256,
        } : null,
        candidateValuesReturned: true, valuesPersistedByExtension: false, submissionAuthorized: false,
      });
    }

    if (action === 'document') {
      if (!exactKeys(req.body, DOCUMENT_KEYS)) return res.status(400).json({ error: 'Document handoff accepts only the signed one-time handoff.', code: 'EXTENSION_DOCUMENT_INPUT_FORBIDDEN' });
      const claims = verifyExtensionHandoffToken(req.body.handoffToken, { secret: handoff.secret });
      if (!claims.stagedFields.some(item => item.fieldKey === 'resumeDocument')) return res.status(404).json({ error: 'This application step has no approved résumé upload.', code: 'EXTENSION_DOCUMENT_NOT_APPROVED' });
      const current = await readDurableApplicationSession({ ...config, subject: auth.subject, sessionId: claims.sessionId });
      if (!current) return res.status(404).json({ error: 'Application session not found.' });
      const { version, audit: _audit, ...session } = current;
      if (Number(version) !== Number(claims.recordVersion) || session.workerExecution?.id !== claims.taskId
        || session.workerExecution?.status !== 'executing' || session.approvals?.transmission?.id !== claims.approvalId
        || session.workerExecution?.fieldSchemaHash !== claims.fieldSchemaHash) {
        return res.status(409).json({ error: 'The approved résumé handoff is expired or was already replaced.', code: 'EXTENSION_HANDOFF_STATE_MISMATCH' });
      }
      const { artifact } = await restoreVerifiedResume({ config, subject: auth.subject, session });
      const bytes = await readApplicationPackageArtifact({
        artifact, tenantId: jobAgentTenantId(auth.subject, config.partitionSecret), runId: session.packageRunId,
        dataEncryptionKey: config.dataEncryptionKey, configuration: config.objectStorage,
      });
      return res.status(200).json({
        status: 'document-ready', document: {
          fieldRef: claims.stagedFields.find(item => item.fieldKey === 'resumeDocument').fieldRef,
          fieldKey: 'resumeDocument', documentVersion: session.documentVersion, filename: artifact.filename,
          contentType: artifact.contentType, bytes: artifact.bytes, sha256: artifact.sha256,
          contentBase64: bytes.toString('base64'),
        }, valuesPersistedByExtension: false, submissionAuthorized: false,
      });
    }

    if (action === 'complete') {
      if (!exactKeys(req.body, COMPLETE_KEYS)) return res.status(400).json({ error: 'Complete accepts only the signed handoff and value-free field outcomes.', code: 'EXTENSION_VALUE_INPUT_FORBIDDEN' });
      const claims = verifyExtensionHandoffToken(req.body.handoffToken, { secret: handoff.secret });
      const current = await readDurableApplicationSession({ ...config, subject: auth.subject, sessionId: claims.sessionId });
      if (!current) return res.status(404).json({ error: 'Application session not found.' });
      if (Number(current.version) !== Number(claims.recordVersion)) return res.status(409).json({ error: 'This one-time handoff has already been completed or replaced.', code: 'EXTENSION_HANDOFF_REPLAY_BLOCKED' });
      const { version, audit: _audit, ...session } = current;
      if (session.workerExecution?.id !== claims.taskId || session.workerExecution?.status !== 'executing' || session.approvals?.transmission?.id !== claims.approvalId || session.workerExecution?.fieldSchemaHash !== claims.fieldSchemaHash) {
        return res.status(409).json({ error: 'The signed handoff no longer matches the preserved employer step.', code: 'EXTENSION_HANDOFF_STATE_MISMATCH' });
      }
      const expected = [...new Set(claims.stagedFields.map(item => item.fieldKey))].sort();
      const filled = safeKeys(req.body.filledFieldKeys);
      const failed = safeKeys(req.body.failedFieldKeys);
      const exactSuccess = JSON.stringify(filled) === JSON.stringify(expected) && failed.length === 0;
      const updated = exactSuccess
        ? completeReservedApplicationTransmission(session, { taskId: claims.taskId, transmittedFieldKeys: filled })
        : failReservedApplicationTransmission(session, { taskId: claims.taskId, failureCode: 'EXTENSION_PARTIAL_FILL' });
      const saved = await updateDurableApplicationSession({ ...config, subject: auth.subject, sessionId: claims.sessionId, expectedVersion: version, session: updated });
      if (!exactSuccess) await notifyNewApplicationNeedsYouAction({ config, subject: auth.subject, session: saved, previousSession: current });
      return res.status(exactSuccess ? 200 : 409).json({
        status: exactSuccess ? 'checkpoint-preserved' : 'waiting-for-user', session: saved,
        filledFieldKeys: filled, failedFieldKeys: failed, personalDataTransmitted: filled.length > 0,
        submitted: false, receiptVerified: false,
      });
    }
    return res.status(400).json({ error: 'Use action prepare, document, or complete.' });
  } catch (error) {
    const message = String(error?.message || '');
    if (/GREENHOUSE|EXTENSION|VAULT|APPROVAL|EMPLOYER|TRANSMISSION|REQUIRED|INVALID|MISMATCH|REUSABLE/.test(message)) return res.status(400).json({ error: message, code: message.split(':')[0] });
    console.error(JSON.stringify({ type: 'extension-handoff-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'The controlled extension handoff could not be completed.' });
  }
}
