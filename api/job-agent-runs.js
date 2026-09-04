import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed, jobAgentAccessAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import {
  createJobAgentRun, deleteJobAgentRun, listJobAgentRuns, readJobAgentRun, setJobAgentRunStatus,
} from '../lib/job-agent-run-store.js';
import { jobAgentRuntimeConfiguration, processSpecificJobAgentRun } from '../lib/job-agent-worker.js';
import { recordConfiguredJobAgentOperationalEvent } from '../lib/job-agent-operational-metrics.js';
import { jobAgentConsentGate } from '../lib/job-agent-consent-store.js';
import { jobAgentThroughputDecision, publicJobAgentThroughput } from '../lib/job-agent-throughput-policy.js';

export const maxDuration = 45;

export async function readRequestedJobAgentRun({ query = {}, config, subject }) {
  const runId = String(query.id || '');
  const latest = String(query.latest || '');
  if (runId && latest) throw new Error('Choose an exact run or the latest discovery run, not both.');
  if (latest) {
    if (latest !== 'discovery') throw new Error('Only the latest discovery run can be restored.');
    const runs = await listJobAgentRuns({ ...config, subject, limit: 25 });
    return runs.find(run => run.taskType === 'direct_employer_discovery') || null;
  }
  if (!runId) throw new Error('A run ID or latest discovery restore is required.');
  return readJobAgentRun({ ...config, subject, runId });
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
  if (!config) return res.status(503).json({ error: 'Durable Job Agent execution is not configured.', code: 'JOB_AGENT_NOT_CONFIGURED' });

  const limit = await enforceDurableRateLimit(req, {
    scope: 'job-agent-runs', subject: auth.subject,
    ipRule: { limit: 20, window: '1 m' }, accountRule: { limit: 200, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Job Agent requests are temporarily rate limited.');

  const runId = String(req.query?.id || req.body?.runId || '');
  try {
    if (req.method === 'GET') {
      const run = await readRequestedJobAgentRun({ query: req.query, config, subject: auth.subject });
      if (String(req.query?.latest || '') === 'discovery') return res.status(200).json({ run });
      return run ? res.status(200).json({ run }) : res.status(404).json({ error: 'Run not found.' });
    }
    if (req.method === 'DELETE') {
      const deleted = await deleteJobAgentRun({ ...config, subject: auth.subject, runId });
      return deleted ? res.status(200).json({ ok: true, deleted: true }) : res.status(404).json({ error: 'Run not found.' });
    }
    if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    if (JSON.stringify(req.body || {}).length > 12_000) return res.status(413).json({ error: 'Job Agent request is too large.' });

    if (req.method === 'PATCH') {
      const action = String(req.body?.action || '');
      if (action === 'resume') {
        const consent = await jobAgentConsentGate(config, auth.subject);
        if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code });
      }
      const status = action === 'pause' ? 'Paused' : action === 'resume' ? 'Searching' : '';
      if (!status) return res.status(400).json({ error: 'Use action pause or resume.' });
      const run = await setJobAgentRunStatus({ ...config, subject: auth.subject, runId, status });
      return run ? res.status(200).json({ run }) : res.status(404).json({ error: 'Run not found.' });
    }

    const consent = await jobAgentConsentGate(config, auth.subject);
    if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code });
    const idem = String(req.headers?.['idempotency-key'] || '');
    const throughputDecision = jobAgentThroughputDecision({ auth, env: process.env, requestedDailyGoal: req.body?.mission?.target });
    const mission = { ...(req.body?.mission || {}), target: throughputDecision.effectiveDailyApplicationTarget };
    const created = await createJobAgentRun({ ...config, subject: auth.subject, mission, idempotencyKey: idem });
    const processed = req.body?.runNow === false ? null : await processSpecificJobAgentRun({ ...config, runId: created.run.id });
    const run = processed || await readJobAgentRun({ ...config, subject: auth.subject, runId: created.run.id });
    return res.status(processed?.status === 'Finished' ? 200 : 202).json({ run, replayed: created.replayed, throughput: publicJobAgentThroughput(throughputDecision), submissionsEnabled: false });
  } catch (error) {
    const message = String(error?.message || '');
    if (/required|not allowed|unsupported|cannot be changed|exceeds|safe Idempotency|choose an exact run|latest discovery run/i.test(message)) return res.status(400).json({ error: message });
    await recordConfiguredJobAgentOperationalEvent('durable_run_failure');
    console.error(JSON.stringify({ type: 'job-agent-run-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'The Job Agent run could not be updated.' });
  }
}
