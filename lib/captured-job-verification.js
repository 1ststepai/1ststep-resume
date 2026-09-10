import { claimJobAgentRun, createJobAgentRun, finishJobAgentRun, readJobAgentRun } from './job-agent-run-store.js';
import { reverifyPublicJob } from './public-ats-discovery.js';
import { safeDirectEmployerDiscoveryResult } from './direct-employer-discovery-result.js';

function parts(value) {
  try { return new URL(String(value || '')).pathname.split('/').filter(Boolean).map(decodeURIComponent); }
  catch { return []; }
}

export function identifyCapturedPublicJob(job = {}, sources = []) {
  let url;
  try { url = new URL(String(job.applyUrl || '')); } catch { return null; }
  const path = parts(url.href);
  let provider = '';
  let slug = '';
  let requisitionId = String(job.jobId || '').trim();
  if (['boards.greenhouse.io', 'job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io'].includes(url.hostname)) {
    provider = 'greenhouse';
    slug = path[0] || '';
    const jobsIndex = path.findIndex(value => value.toLowerCase() === 'jobs');
    requisitionId = requisitionId || (jobsIndex >= 0 ? path[jobsIndex + 1] : '');
  } else if (['jobs.lever.co', 'jobs.eu.lever.co'].includes(url.hostname)) {
    provider = 'lever'; slug = path[0] || ''; requisitionId = requisitionId || path[1] || '';
  } else if (url.hostname === 'jobs.ashbyhq.com') {
    provider = 'ashby'; slug = path[0] || ''; requisitionId = requisitionId || path[1] || '';
  } else if (['jobs.smartrecruiters.com', 'www.smartrecruiters.com'].includes(url.hostname)) {
    provider = 'smartrecruiters'; slug = path[0] || ''; requisitionId = requisitionId || path[1] || '';
  }
  if (!provider || !slug || !requisitionId) return null;
  const source = sources.find(item => String(item.provider).toLowerCase() === provider && String(item.slug).toLowerCase() === slug.toLowerCase());
  if (!source) return null;
  return {
    source,
    job: { provider, employer: source.employer, requisitionId, jobUrl: url.href, applyUrl: url.href },
  };
}

export async function verifyCapturedPublicJob({ job, sources = [], fetchImpl = fetch, now = new Date() }) {
  const identity = identifyCapturedPublicJob(job, sources);
  if (!identity) return { status: 'unverified', reason: 'unsupported-or-unknown-source' };
  try {
    const result = await reverifyPublicJob({ job: identity.job, sources, fetchImpl, now });
    if (result.status !== 'open' || !result.job) return { status: result.status === 'closed' ? 'closed' : 'unavailable' };
    return { status: 'verified', job: result.job, source: identity.source };
  } catch (error) {
    if (/TRANSIENT/.test(String(error?.message || ''))) return { status: 'unavailable' };
    return { status: 'unverified', reason: 'identity-or-source-mismatch' };
  }
}

export async function createCapturedDiscoveryRun({ config, subject, captureId, verifiedJob, now = new Date() }) {
  const created = await createJobAgentRun({
    ...config,
    subject,
    mission: { role: verifiedJob.title, target: 1 },
    taskType: 'direct_employer_discovery',
    idempotencyKey: `capture_${captureId}`.slice(0, 128),
    now,
  });
  if (created.run.status === 'Finished') return created.run;
  const claimed = await claimJobAgentRun({ redis: config.redis, runId: created.run.id, dataEncryptionKey: config.dataEncryptionKey, now });
  if (!claimed) return readJobAgentRun({ ...config, subject, runId: created.run.id });
  const result = safeDirectEmployerDiscoveryResult({
    jobs: [verifiedJob],
    sourceSummary: [{ provider: verifiedJob.provider, employer: verifiedJob.employer, status: 'ok', found: 1, published: 1, requestCount: 1, completedRequestCount: 1, failedRequestCount: 0, llmTokens: 0 }],
    filterSummary: { scanned: 1, matched: 1, returned: 1 },
    errors: [],
  }, now);
  return finishJobAgentRun({ redis: config.redis, runId: created.run.id, leaseToken: claimed.leaseToken, dataEncryptionKey: config.dataEncryptionKey, result, now });
}
