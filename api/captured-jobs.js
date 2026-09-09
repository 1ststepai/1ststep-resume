import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed, jobAgentAccessAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { readCapturedJob, saveCapturedJob } from '../lib/captured-job-store.js';
import { createCapturedDiscoveryRun, verifyCapturedPublicJob } from '../lib/captured-job-verification.js';
import { jobAgentRuntimeConfiguration } from '../lib/job-agent-runtime-configuration.js';
import { recordConfiguredJobAgentOperationalEvent } from '../lib/job-agent-operational-metrics.js';
import { JOB_AGENT_POLICY_LEVELS, requireJobAgentPolicyLevel } from '../lib/job-agent-policy-levels.js';

export const maxDuration = 20;

function clientJob(job) {
  if (!job) return null;
  return {
    captureId: job.captureId,
    jobId: job.jobId,
    jobTitle: job.title,
    company: job.company,
    jobDescription: job.description,
    applyUrl: job.applyUrl,
    site: job.site,
    location: job.location,
    salaryText: job.salaryText,
    captureMethod: job.captureMethod,
    verification: job.verification,
    sourceProvider: job.sourceProvider,
    requisitionId: job.requisitionId,
    discoveryRunId: job.discoveryRunId,
    applyPathActive: job.applyPathActive,
    verifiedAt: job.verifiedAt,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
  };
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  const config = jobAgentRuntimeConfiguration();
  if (!config) return res.status(503).json({ error: 'Secure captured-job storage is not configured.', code: 'CAPTURE_STORAGE_NOT_CONFIGURED' });
  const consent = await requireJobAgentPolicyLevel(JOB_AGENT_POLICY_LEVELS.DATA_CONSENT, { config, subject: auth.subject });
  if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code, policyLevel: consent.level });
  const limit = await enforceDurableRateLimit(req, {
    scope: req.method === 'POST' ? 'captured-job-write' : 'captured-job-read', subject: auth.subject,
    ipRule: { limit: 30, window: '1 m' }, accountRule: { limit: req.method === 'POST' ? 200 : 1_000, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Captured-job access is temporarily rate limited.');

  try {
    const captureId = String(req.query?.id || req.body?.captureId || '');
    if (req.method === 'GET') {
      const job = await readCapturedJob({ ...config, subject: auth.subject, captureId });
      if (!job) return res.status(404).json({ error: 'Captured job not found.', code: 'CAPTURE_NOT_FOUND' });
      await recordConfiguredJobAgentOperationalEvent('extension_resume_handoff_loaded');
      return res.status(200).json({ job: clientJob(job) });
    }
    if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    if (JSON.stringify(req.body || {}).length > 70_000) return res.status(413).json({ error: 'Captured job is too large.' });

    const captured = { ...(req.body?.job || {}), captureId };
    const verification = await verifyCapturedPublicJob({ job: captured, sources: config.sources });
    let discoveryRun = null;
    if (verification.status === 'verified' && jobAgentAccessAllowed(auth)) {
      discoveryRun = await createCapturedDiscoveryRun({ config, subject: auth.subject, captureId, verifiedJob: verification.job });
    }
    const promotedToJobAgent = verification.status === 'verified' && discoveryRun?.status === 'Finished';
    const sourceJob = verification.job || captured;
    const saved = await saveCapturedJob({
      ...config,
      subject: auth.subject,
      job: {
        ...captured,
        jobId: verification.job?.requisitionId || captured.jobId,
        title: sourceJob.title || captured.jobTitle,
        company: sourceJob.employer || captured.company,
        description: sourceJob.description || captured.jobDescription,
        applyUrl: sourceJob.applyUrl || captured.applyUrl,
        location: sourceJob.location || captured.location,
        salaryText: sourceJob.salaryDisclosure || captured.salaryText,
        verification: verification.status,
        sourceProvider: verification.job?.provider || '',
        requisitionId: verification.job?.requisitionId || '',
        discoveryRunId: promotedToJobAgent ? discoveryRun.id : '',
        applyPathActive: promotedToJobAgent,
        verifiedAt: verification.job?.applyPathVerifiedAt || '',
      },
    });
    await recordConfiguredJobAgentOperationalEvent('extension_capture_saved');
    await recordConfiguredJobAgentOperationalEvent(verification.status === 'verified' ? 'extension_capture_verified' : 'extension_capture_unverified');
    return res.status(saved.replayed ? 200 : 201).json({ job: clientJob(saved.job), replayed: saved.replayed });
  } catch (error) {
    await recordConfiguredJobAgentOperationalEvent('extension_capture_failure');
    const message = String(error?.message || '');
    if (/required|valid|public HTTPS|different job|too large|storage limit/i.test(message)) return res.status(400).json({ error: message });
    console.error(JSON.stringify({ type: 'captured-job-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'The captured job could not be saved.' });
  }
}
