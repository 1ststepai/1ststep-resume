import { discoverPublicJobs } from './public-ats-discovery.js';
import {
  claimJobAgentRun, claimNextJobAgentRun, failJobAgentRun, finishJobAgentRun, heartbeatJobAgentRun,
} from './job-agent-run-store.js';
import { executeClaimedApplicationPackageRun } from './application-package-worker.js';
import { refreshTenantJobCardFreshness } from './job-card-freshness-worker.js';
import { requireConfiguredJobAgentConsentForTenant } from './job-agent-consent-store.js';
import { redactProhibitedSecretText } from './prohibited-secret.js';
import { recordJobAgentOperationalEvent } from './job-agent-operational-metrics.js';
import { recordDiscoveryLearningSignals } from './job-agent-continuous-improvement-worker.js';
import { analyzeUntrustedJobContent } from './untrusted-job-content.js';
import { recordSourceCircuitOutcome, sourceCircuitDecision } from './provider-circuit-breaker.js';
export { jobAgentRuntimeConfiguration } from './job-agent-runtime-configuration.js';

function safeJob(job = {}) {
  const description = String(job.description || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[contact omitted]')
    .replace(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g, '[phone omitted]')
    .slice(0, 12_000);
  const content = analyzeUntrustedJobContent(redactProhibitedSecretText(description), { maxChars: 12_000 });
  return {
    provider: String(job.provider || '').slice(0, 40), employer: String(job.employer || '').slice(0, 120),
    title: String(job.title || '').slice(0, 180), requisitionId: String(job.requisitionId || '').slice(0, 160),
    jobUrl: String(job.jobUrl || '').slice(0, 900), applyUrl: String(job.applyUrl || '').slice(0, 900),
    location: String(job.location || '').slice(0, 180), remote: job.remote === true,
    workplaceType: String(job.workplaceType || '').slice(0, 60), employmentType: String(job.employmentType || '').slice(0, 60),
    salaryMin: Number(job.salaryMin) || null, salaryMax: Number(job.salaryMax) || null,
    salaryDisclosure: String(job.salaryDisclosure || '').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[contact omitted]').slice(0, 300),
    postedDate: String(job.postedDate || 'Unknown').slice(0, 40), sourceEvidence: String(job.sourceEvidence || '').slice(0, 240),
    countryCode: String(job.countryCode || '').slice(0, 3), applyPathVerified: job.applyPathVerified === true,
    applyPathVerification: String(job.applyPathVerification || '').slice(0, 120), applyPathVerifiedAt: String(job.applyPathVerifiedAt || '').slice(0, 40),
    description: content.normalizedText, jobContentSha256: content.sha256,
    jobContentTrust: content.trust, jobContentInstructionSignals: content.instructionSignals,
  };
}

function safeSummary(result = {}) {
  return {
    jobs: (result.jobs || []).filter(job => job?.applyPathVerified === true).slice(0, 15).map(safeJob),
    sourceSummary: (result.sourceSummary || []).slice(0, 40).map(source => ({
      provider: String(source.provider || '').slice(0, 40), employer: String(source.employer || '').slice(0, 120),
      status: ['ok', 'partial'].includes(source.status) ? source.status : 'error', found: Math.max(0, Number(source.found) || 0),
      published: Math.max(0, Number(source.published) || 0), unlistedExcluded: Math.max(0, Number(source.unlistedExcluded) || 0), invalidApplyPaths: Math.max(0, Number(source.invalidApplyPaths) || 0),
      requestCount: Math.max(0, Number(source.requestCount) || 0), llmTokens: 0,
      completedRequestCount: Math.max(0, Number(source.completedRequestCount) || 0), failedRequestCount: Math.max(0, Number(source.failedRequestCount) || 0),
      durationMs: Number.isFinite(Number(source.durationMs)) ? Math.max(0, Number(source.durationMs)) : null,
      retryAfterSeconds: Number.isFinite(Number(source.retryAfterSeconds)) ? Math.max(1, Number(source.retryAfterSeconds)) : null,
    })),
    filterSummary: {
      scanned: Math.max(0, Number(result.filterSummary?.scanned) || 0),
      duplicatesRemoved: Math.max(0, Number(result.filterSummary?.duplicatesRemoved) || 0),
      rejectedByMission: Math.max(0, Number(result.filterSummary?.rejectedByMission) || 0),
      limitedOut: Math.max(0, Number(result.filterSummary?.limitedOut) || 0),
      verificationFailed: Math.max(0, Number(result.filterSummary?.verificationFailed) || 0),
      rejectedAfterVerification: Math.max(0, Number(result.filterSummary?.rejectedAfterVerification) || 0),
      matched: Math.max(0, Number(result.filterSummary?.matched) || 0), returned: Math.max(0, Number(result.filterSummary?.returned) || 0),
    },
    supplyByPath: Object.fromEntries(Object.entries(result.supplyByPath || {}).slice(0, 20).map(([key, value]) => [String(key).slice(0, 80), Math.max(0, Number(value) || 0)])),
    errorCount: (result.errors || []).length,
    completedAt: new Date().toISOString(),
    authority: 'published-direct-employer-ats-feed',
    externalApplicationExecution: false,
  };
}

function errorCode(error) {
  const raw = String(error?.message || '');
  if (/^JOB_AGENT_(?:CONSENT|POLICY)/.test(raw)) return raw.slice(0, 80);
  const message = raw.toLowerCase();
  if (/timeout|abort/.test(message)) return 'SOURCE_TIMEOUT';
  if (/429|rate/.test(message)) return 'SOURCE_RATE_LIMIT';
  if (/configuration|configured|source/.test(message)) return 'SOURCE_CONFIGURATION';
  return 'DISCOVERY_TRANSIENT_FAILURE';
}

export async function executeClaimedJobAgentRun({ claimed, redis, dataEncryptionKey, objectStorage, sources, discover = discoverPublicJobs, refreshJobCards = refreshTenantJobCardFreshness, recordLearning = recordDiscoveryLearningSignals, now = new Date() }) {
  const { run, leaseToken } = claimed || {};
  if (!run || !leaseToken) return null;
  const verifyConsent = async () => {
    const current = await requireConfiguredJobAgentConsentForTenant({ redis, dataEncryptionKey }, claimed.tenantId, process.env);
    if (!current.ok) throw new Error(current.code);
    return current;
  };
  const consent = await requireConfiguredJobAgentConsentForTenant({ redis, dataEncryptionKey }, claimed.tenantId, process.env);
  if (!consent.ok) {
    return failJobAgentRun({ redis, runId: run.id, leaseToken, dataEncryptionKey, errorCode: consent.code, retryable: false, now });
  }
  if (run.taskType === 'application_package') return executeClaimedApplicationPackageRun({ claimed, redis, dataEncryptionKey, objectStorage, env: process.env, now, authorizationCheck: verifyConsent });
  if (run.taskType !== 'direct_employer_discovery') {
    return failJobAgentRun({ redis, runId: run.id, leaseToken, dataEncryptionKey, errorCode: 'UNSUPPORTED_TASK', retryable: false, now });
  }
  try {
    await heartbeatJobAgentRun({ redis, runId: run.id, leaseToken, dataEncryptionKey, now, lifecycleState: 'Searching' });
    if (!sources.length) throw new Error('No direct-employer sources are configured.');
    const decisions = await Promise.all(sources.map(async source => ({ source, decision: await sourceCircuitDecision({ redis, tenantId: claimed.tenantId, source, now }) })));
    const eligibleSources = decisions.filter(item => item.decision.allowed).map(item => item.source);
    const skippedSources = decisions.filter(item => !item.decision.allowed);
    if (!eligibleSources.length) throw new Error('SOURCE_CIRCUITS_OPEN');
    const result = await discover({ mission: run.mission, sources: eligibleSources, limit: run.mission.target || 10 });
    result.sourceSummary = [...(result.sourceSummary || []), ...skippedSources.map(({ source, decision }) => ({ provider: source.provider, employer: source.employer, status: 'error', found: 0, requestCount: 0, completedRequestCount: 0, failedRequestCount: 0, retryAfterSeconds: Math.max(1, Math.ceil((new Date(decision.retryAt).getTime() - Date.now()) / 1000)), circuitOpen: true }))];
    await Promise.all((result.sourceSummary || []).filter(item => !item.circuitOpen).map(item => recordSourceCircuitOutcome({ redis, tenantId: claimed.tenantId, source: item, succeeded: ['ok', 'partial'].includes(item.status), errorClass: item.status === 'error' ? 'source-request-failed' : '', now: new Date() }))).catch(() => {});
    await heartbeatJobAgentRun({ redis, runId: run.id, leaseToken, dataEncryptionKey, now: new Date(), lifecycleState: 'Verifying' });
    const completedFeedRequests = (result.sourceSummary || []).reduce((sum, source) => sum + (Number(source.completedRequestCount) || 0), 0);
    const failedFeedRequests = (result.sourceSummary || []).reduce((sum, source) => sum + (Number(source.failedRequestCount) || 0), 0);
    await Promise.all([
      recordJobAgentOperationalEvent('public_ats_request_completed', { redis, amount: completedFeedRequests, now: new Date() }),
      recordJobAgentOperationalEvent('public_ats_request_failed', { redis, amount: failedFeedRequests, now: new Date() }),
      recordJobAgentOperationalEvent('public_ats_zero_llm_request', { redis, amount: completedFeedRequests + failedFeedRequests, now: new Date() }),
    ]).catch(() => {});
    await verifyConsent();
    let freshnessSummary = { status: 'unknown', checked: 0, open: 0, closed: 0, changed: 0, failures: 0, saved: false, conflict: false, contentFree: true, containsCandidateValues: false };
    try {
      freshnessSummary = await refreshJobCards({ redis, tenantId: claimed.tenantId, dataEncryptionKey, sources, runId: run.id, now: new Date() });
    } catch {
      freshnessSummary = { ...freshnessSummary, status: 'failed', failures: 1 };
    }
    const safeResult = { ...safeSummary(result), freshnessSummary };
    const finished = await finishJobAgentRun({ redis, runId: run.id, leaseToken, dataEncryptionKey, result: safeResult, now: new Date() });
    try { await recordLearning({ redis, tenantId: claimed.tenantId, dataEncryptionKey, runId: run.id, result: safeResult, now: new Date() }); }
    catch { /* Learning is isolated: verified discovery completion remains authoritative. */ }
    return finished;
  } catch (error) {
    const code = errorCode(error);
    return failJobAgentRun({
      redis, runId: run.id, leaseToken, dataEncryptionKey, errorCode: code,
      retryable: !/No direct-employer sources/.test(String(error?.message || '')) && !/^JOB_AGENT_(?:CONSENT|POLICY)/.test(code), now: new Date(),
    });
  }
}

export async function processSpecificJobAgentRun({ runId, ...config }) {
  const claimed = await claimJobAgentRun({ redis: config.redis, runId, dataEncryptionKey: config.dataEncryptionKey });
  return claimed ? executeClaimedJobAgentRun({ claimed, ...config }) : null;
}

export async function processNextJobAgentRun(config) {
  const claimed = await claimNextJobAgentRun({ redis: config.redis, dataEncryptionKey: config.dataEncryptionKey });
  return claimed ? executeClaimedJobAgentRun({ claimed, ...config }) : null;
}
