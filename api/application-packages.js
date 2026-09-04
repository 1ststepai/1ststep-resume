import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed, jobAgentAccessAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { createJobAgentRun, deleteJobAgentRun, readJobAgentRun, setJobAgentRunStatus } from '../lib/job-agent-run-store.js';
import { jobAgentRuntimeConfiguration, processSpecificJobAgentRun } from '../lib/job-agent-worker.js';
import { publicArtifactMetadata } from '../lib/application-package-artifact-metadata.js';
import { recordConfiguredJobAgentOperationalEvent } from '../lib/job-agent-operational-metrics.js';
import { bindPackageToFreshVerifiedDiscovery } from '../lib/discovery-package-binding.js';
import { jobAgentConsentGate } from '../lib/job-agent-consent-store.js';
import { JOB_AGENT_POLICY_LEVELS, requireJobAgentPolicyLevel } from '../lib/job-agent-policy-levels.js';
import { deleteApplicationPackageArtifacts } from '../lib/job-agent-object-storage.js';
import { jobAgentThroughputDecision, publicJobAgentThroughput } from '../lib/job-agent-throughput-policy.js';

export const maxDuration = 60;

function clientRun(run) {
  if (!run?.result?.artifacts) return run;
  return { ...run, result: { ...run.result, artifacts: publicArtifactMetadata(run.result.artifacts) } };
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
  if (!config) return res.status(503).json({ error: 'Durable package generation is not configured.', code: 'PACKAGE_RUNTIME_NOT_CONFIGURED' });
  // No storage guard here on purpose. Without private object storage the worker produces a
  // text-only package (tailored resume and cover letter text, no DOCX/PDF) rather than
  // failing the run. The endpoints that actually read or render artifacts keep their own
  // upfront guards, so no document can be served from a less protected path.

  const isRevision = req.method === 'POST' && req.body?.action === 'revise';
  const cost = req.method === 'POST' ? 3 : 1;
  const planDecision = jobAgentThroughputDecision({ auth, env: process.env, requestedDailyGoal: 50 });
  const limit = await enforceDurableRateLimit(req, {
    scope: req.method === 'POST' ? (isRevision ? 'application-package-revisions' : 'application-package-create-daily') : 'application-packages-read', subject: auth.subject,
    ipRule: { limit: 20, window: '1 m', rate: cost },
    accountRule: { limit: req.method === 'POST' ? (isRevision ? 30 : planDecision.plan.dailyApplicationLimit * cost) : 500, window: '1 d', rate: cost },
    globalRule: { limit: req.method === 'POST' ? (Number(process.env.PACKAGE_GLOBAL_DAILY_UNITS) || 300) : 10_000, window: '1 d', rate: cost },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Application-package generation is temporarily rate limited. Your existing documents remain saved.');
  if (req.method === 'POST' && !isRevision) {
    const monthlyLimit = await enforceDurableRateLimit(req, {
      scope: 'application-package-create-monthly', subject: auth.subject,
      ipRule: { limit: 20, window: '1 m', rate: cost },
      accountRule: { limit: planDecision.plan.monthlyApplicationLimit * cost, window: '30 d', rate: cost },
    });
    if (!monthlyLimit.ok) return sendRateLimitResult(res, monthlyLimit, 'Your current plan has reached its application-preparation allowance. Saved work remains available.');
  }

  const runId = String(req.query?.id || req.body?.runId || '');
  try {
    if (req.method === 'GET') {
      const run = await readJobAgentRun({ ...config, subject: auth.subject, runId });
      return run?.taskType === 'application_package' ? res.status(200).json({ run: clientRun(run) }) : res.status(404).json({ error: 'Package run not found.' });
    }
    if (req.method === 'DELETE') {
      const run = await readJobAgentRun({ ...config, subject: auth.subject, runId });
      if (run?.taskType !== 'application_package') return res.status(404).json({ error: 'Package run not found.' });
      await deleteApplicationPackageArtifacts({ artifacts: run.result?.artifacts, redis: config.redis, configuration: config.objectStorage });
      await deleteJobAgentRun({ ...config, subject: auth.subject, runId });
      return res.status(200).json({ ok: true, deleted: true });
    }
    if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    if (JSON.stringify(req.body || {}).length > 110_000) return res.status(413).json({ error: 'Application-package request is too large.' });
    if (req.method === 'PATCH') {
      const current = await readJobAgentRun({ ...config, subject: auth.subject, runId });
      if (current?.taskType !== 'application_package') return res.status(404).json({ error: 'Package run not found.' });
      const action = String(req.body?.action || '');
      if (action === 'resume' || action === 'retry') {
        // Restarting a run makes the agent work unattended on the user's behalf.
        // Keeps the full authorization gate.
        const consent = await requireJobAgentPolicyLevel(JOB_AGENT_POLICY_LEVELS.AUTHORIZATION, { config, subject: auth.subject });
        if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code, policyLevel: consent.level });
      }
      const status = action === 'pause' ? 'Paused' : action === 'resume' || action === 'retry' ? 'Searching' : '';
      if (!status) return res.status(400).json({ error: 'Use action pause, resume, or retry.' });
      const run = await setJobAgentRunStatus({ ...config, subject: auth.subject, runId, status });
      const processed = status === 'Searching' ? await processSpecificJobAgentRun({ ...config, runId }) : null;
      return res.status(200).json({ run: clientRun(processed || run), throughput: publicJobAgentThroughput(planDecision), submissionsEnabled: false });
    }

    // Generating and storing a tailored resume or cover letter. Output stays in the
    // user's workspace; nothing is transmitted to an employer here.
    const consent = await requireJobAgentPolicyLevel(JOB_AGENT_POLICY_LEVELS.DATA_CONSENT, { config, subject: auth.subject });
    if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code, policyLevel: consent.level });
    let packageMission = req.body?.package;
    if (req.body?.action === 'revise') {
      const baseRunId = String(req.body?.baseRunId || '');
      const base = await readJobAgentRun({ ...config, subject: auth.subject, runId: baseRunId });
      if (base?.taskType !== 'application_package' || base.status !== 'Finished' || !base.result?.documentVersion || !base.result?.resumeText || !Array.isArray(base.result?.sourceMap)) {
        return res.status(409).json({ error: 'The exact finished base package could not be restored for revision.', code: 'BASE_PACKAGE_NOT_READY' });
      }
      packageMission = {
        ...base.mission,
        revision: {
          baseRunId: base.id,
          baseDocumentVersion: base.result.documentVersion,
          resumeText: req.body?.resumeText,
          coverLetterText: req.body?.coverLetterText,
          sourceMap: base.result.sourceMap,
        },
      };
    } else {
      const discoveryRunId = String(packageMission?.discoveryRunId || '');
      const discoveryRun = await readJobAgentRun({ ...config, subject: auth.subject, runId: discoveryRunId });
      packageMission = await bindPackageToFreshVerifiedDiscovery(discoveryRun, packageMission, { sources: config.sources });
      await recordConfiguredJobAgentOperationalEvent('direct_employer_reverification_open');
    }
    const created = await createJobAgentRun({
      ...config, subject: auth.subject, mission: packageMission, taskType: 'application_package',
      idempotencyKey: String(req.headers?.['idempotency-key'] || ''),
    });
    const processed = req.body?.runNow === false ? null : await processSpecificJobAgentRun({ ...config, runId: created.run.id });
    const run = processed || await readJobAgentRun({ ...config, subject: auth.subject, runId: created.run.id });
    return res.status(run?.status === 'Finished' ? 200 : 202).json({ run: clientRun(run), replayed: created.replayed, throughput: publicJobAgentThroughput(planDecision), submissionsEnabled: false });
  } catch (error) {
    const message = String(error?.message || '');
    if (/requisition is closed/i.test(message)) { await recordConfiguredJobAgentOperationalEvent('direct_employer_reverification_closed'); return res.status(409).json({ error: message, code: 'DIRECT_EMPLOYER_REQUISITION_CLOSED' }); }
    if (/requisition changed/i.test(message) || /PUBLIC_ATS_REVERIFICATION_IDENTITY_CHANGED/.test(message)) { await recordConfiguredJobAgentOperationalEvent('direct_employer_reverification_changed'); return res.status(409).json({ error: 'The direct-employer requisition changed. Search again before preparing documents.', code: 'DIRECT_EMPLOYER_REQUISITION_CHANGED' }); }
    if (/could not be reverified/i.test(message) || /PUBLIC_ATS_REVERIFICATION_(?:TRANSIENT|REJECTED|SOURCE_NOT_FOUND)/.test(message)) { await recordConfiguredJobAgentOperationalEvent('direct_employer_reverification_failure'); return res.status(503).json({ error: 'The direct-employer requisition could not be reverified. Try again later.', code: 'DIRECT_EMPLOYER_REVERIFICATION_UNAVAILABLE' }); }
    if (/required|not allowed|unsupported|cannot be changed|exceeds|safe Idempotency/i.test(message)) return res.status(400).json({ error: message });
    await recordConfiguredJobAgentOperationalEvent('package_failure');
    console.error(JSON.stringify({ type: 'application-package-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'The application package could not be updated.' });
  }
}
