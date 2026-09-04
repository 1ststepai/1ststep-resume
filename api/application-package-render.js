import { randomUUID } from 'node:crypto';
import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed, jobAgentAccessAllowed } from '../lib/api-security.js';
import { inspectApplicationPackageArtifacts, documentRenderSandboxConfiguration } from '../lib/application-package-render-sandbox.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { jobAgentTenantId, readJobAgentRun, updateFinishedApplicationPackageResult } from '../lib/job-agent-run-store.js';
import { jobAgentRuntimeConfiguration, jobAgentArtifactStorageReady } from '../lib/job-agent-runtime-configuration.js';
import { publicArtifactMetadata } from '../lib/application-package-artifact-metadata.js';
import { recordConfiguredJobAgentOperationalEvent } from '../lib/job-agent-operational-metrics.js';
import { jobAgentConsentGate } from '../lib/job-agent-consent-store.js';
import { hydrateApplicationPackageArtifacts } from '../lib/job-agent-object-storage.js';

export const maxDuration = 180;

function clientRun(run) {
  if (!run?.result?.artifacts) return run;
  return { ...run, result: { ...run.result, artifacts: publicArtifactMetadata(run.result.artifacts) } };
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  if (!jobAgentAccessAllowed(auth)) return res.status(403).json({ error: 'Job Agent access is required.', code: 'JOB_AGENT_ACCESS_REQUIRED' });
  if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
  const renderConfig = documentRenderSandboxConfiguration();
  if (!renderConfig.enabled) return res.status(409).json({ error: 'Secure document rendering is not activated for this beta.', code: 'DOCUMENT_RENDER_NOT_CONFIGURED' });
  const config = jobAgentRuntimeConfiguration();
  if (!config) return res.status(503).json({ error: 'Durable package storage is not configured.', code: 'PACKAGE_RUNTIME_NOT_CONFIGURED' });
  if (!jobAgentArtifactStorageReady(config)) return res.status(503).json({ error: 'Private document storage is not configured.', code: 'PACKAGE_OBJECT_STORAGE_NOT_CONFIGURED' });
  const consent = await jobAgentConsentGate(config, auth.subject);
  if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code });
  const limit = await enforceDurableRateLimit(req, {
    scope: 'application-package-render', subject: auth.subject,
    ipRule: { limit: 4, window: '5 m' }, accountRule: { limit: Number(process.env.DOCUMENT_RENDER_ACCOUNT_DAILY_UNITS) || 10, window: '1 d' },
    globalRule: { limit: Number(process.env.DOCUMENT_RENDER_GLOBAL_DAILY_UNITS) || 100, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Secure document rendering is temporarily rate limited. Your private files remain saved.');
  try {
    const runId = String(req.body?.runId || '');
    const run = await readJobAgentRun({ ...config, subject: auth.subject, runId });
    if (run?.taskType !== 'application_package' || run.status !== 'Finished' || !run.result?.artifacts?.length) return res.status(404).json({ error: 'A finished private package with document artifacts is required.' });
    if (run.result.qa?.issues?.length) return res.status(409).json({ error: 'Resolve the package truth and ATS issues before rendering.', code: 'PACKAGE_REVIEW_REQUIRED' });
    if (run.result.qa?.visualPageInspection === true && run.result.renderEvidence?.complete === true) return res.status(200).json({ run: clientRun(run), replayed: true, submissionsEnabled: false });
    const hydratedArtifacts = await hydrateApplicationPackageArtifacts({ artifacts: run.result.artifacts, tenantId: jobAgentTenantId(auth.subject, config.partitionSecret), runId, dataEncryptionKey: config.dataEncryptionKey, configuration: config.objectStorage });
    const evidence = await inspectApplicationPackageArtifacts({ artifacts: hydratedArtifacts, redis: config.redis });
    if (evidence.status !== 'verified' || evidence.complete !== true) return res.status(422).json({ error: 'The rendered documents need review before they can be marked ready.', code: 'DOCUMENT_RENDER_QA_FAILED', evidence: { issues: evidence.issues || [] } });
    const renderEvidence = { ...evidence, id: `render_${randomUUID()}`, documentVersion: run.result.documentVersion };
    const updatedResult = {
      ...run.result, renderEvidence,
      qa: { ...run.result.qa, visualPageInspection: true, pagesInspected: true, visualRenderStatus: 'verified-isolated-render', renderEvidenceId: renderEvidence.id },
      qaStatus: 'ats-artifacts-and-render-verified',
    };
    const updated = await updateFinishedApplicationPackageResult({ ...config, subject: auth.subject, runId, result: updatedResult });
    if (!updated) return res.status(409).json({ error: 'The package changed while rendering. Refresh and retry.', code: 'PACKAGE_VERSION_CONFLICT' });
    return res.status(200).json({ run: clientRun(updated), submissionsEnabled: false });
  } catch (error) {
    await recordConfiguredJobAgentOperationalEvent('artifact_qa_failure');
    const code = String(error?.message || '');
    if (/(?:MONETARY_SPEND|MONETARY_BUDGET|GLOBAL_MONETARY_BUDGET|CATEGORY_MONETARY_BUDGET)_/.test(code)) return res.status(code.includes('EXHAUSTED') ? 429 : 503).json({ error: 'Secure document rendering is paused by its approved spending limit.', code });
    console.error(JSON.stringify({ type: 'application-package-render-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'Secure document rendering failed. Your private package remains saved.', code: 'DOCUMENT_RENDER_FAILED' });
  }
}
