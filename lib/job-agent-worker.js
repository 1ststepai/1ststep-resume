import { discoverPublicJobs } from './public-ats-discovery.js';
import {
  claimJobAgentRun, claimNextJobAgentRun, failJobAgentRun, finishJobAgentRun, heartbeatJobAgentRun,
} from './job-agent-run-store.js';
import { executeClaimedApplicationPackageRun } from './application-package-worker.js';
import { checkBackgroundPackage, backgroundPackageFailure } from './background-package-check.js';
import { refreshTenantJobCardFreshness } from './job-card-freshness-worker.js';
import { requireConfiguredJobAgentConsentForTenant } from './job-agent-consent-store.js';
import { recordJobAgentOperationalEvent } from './job-agent-operational-metrics.js';
import { recordDiscoveryLearningSignals } from './job-agent-continuous-improvement-worker.js';
import { recordSourceCircuitOutcome, sourceCircuitDecision } from './provider-circuit-breaker.js';
import { safeDirectEmployerDiscoveryResult } from './direct-employer-discovery-result.js';
export { jobAgentRuntimeConfiguration } from './job-agent-runtime-configuration.js';

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
  const started = performance.now();
  const clock = () => new Date(now.getTime() + performance.now() - started);
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
  if (run.taskType === 'application_package') {
    if (!await heartbeatJobAgentRun({ redis, runId: run.id, leaseToken, dataEncryptionKey, now: clock(), leaseSeconds: 120, lifecycleState: 'Verifying' })) return null;
    try {
      await checkBackgroundPackage({ claimed, redis, dataEncryptionKey, sources, now: clock() });
    } catch (error) {
      const failure = backgroundPackageFailure(error);
      return failJobAgentRun({ redis, runId: run.id, leaseToken, dataEncryptionKey, errorCode: failure.code, retryable: failure.retryable, now: clock() });
    }
    return executeClaimedApplicationPackageRun({ claimed, redis, dataEncryptionKey, objectStorage, env: process.env, now: clock(), authorizationCheck: verifyConsent });
  }
  if (run.taskType !== 'direct_employer_discovery') {
    return failJobAgentRun({ redis, runId: run.id, leaseToken, dataEncryptionKey, errorCode: 'UNSUPPORTED_TASK', retryable: false, now });
  }
  try {
    if (!await heartbeatJobAgentRun({ redis, runId: run.id, leaseToken, dataEncryptionKey, now, lifecycleState: 'Searching' })) return null;
    if (!sources.length) throw new Error('No direct-employer sources are configured.');
    const decisions = await Promise.all(sources.map(async source => ({ source, decision: await sourceCircuitDecision({ redis, tenantId: claimed.tenantId, source, now }) })));
    const eligibleSources = decisions.filter(item => item.decision.allowed).map(item => item.source);
    const skippedSources = decisions.filter(item => !item.decision.allowed);
    if (!eligibleSources.length) throw new Error('SOURCE_CIRCUITS_OPEN');
    const result = await discover({ mission: run.mission, sources: eligibleSources, limit: run.mission.target || 10 });
    result.sourceSummary = [...(result.sourceSummary || []), ...skippedSources.map(({ source, decision }) => ({ provider: source.provider, employer: source.employer, status: 'error', found: 0, requestCount: 0, completedRequestCount: 0, failedRequestCount: 0, retryAfterSeconds: Math.max(1, Math.ceil((new Date(decision.retryAt).getTime() - Date.now()) / 1000)), circuitOpen: true }))];
    await Promise.all((result.sourceSummary || []).filter(item => !item.circuitOpen).map(item => recordSourceCircuitOutcome({ redis, tenantId: claimed.tenantId, source: item, succeeded: ['ok', 'partial'].includes(item.status), errorClass: item.status === 'error' ? 'source-request-failed' : '', now: clock() }))).catch(() => {});
    if (!await heartbeatJobAgentRun({ redis, runId: run.id, leaseToken, dataEncryptionKey, now: clock(), lifecycleState: 'Verifying' })) return null;
    const completedFeedRequests = (result.sourceSummary || []).reduce((sum, source) => sum + (Number(source.completedRequestCount) || 0), 0);
    const failedFeedRequests = (result.sourceSummary || []).reduce((sum, source) => sum + (Number(source.failedRequestCount) || 0), 0);
    await Promise.all([
      recordJobAgentOperationalEvent('public_ats_request_completed', { redis, amount: completedFeedRequests, now: clock() }),
      recordJobAgentOperationalEvent('public_ats_request_failed', { redis, amount: failedFeedRequests, now: clock() }),
      recordJobAgentOperationalEvent('public_ats_zero_llm_request', { redis, amount: completedFeedRequests + failedFeedRequests, now: clock() }),
    ]).catch(() => {});
    await verifyConsent();
    let freshnessSummary = { status: 'unknown', checked: 0, open: 0, closed: 0, changed: 0, failures: 0, saved: false, conflict: false, contentFree: true, containsCandidateValues: false };
    try {
      freshnessSummary = await refreshJobCards({ redis, tenantId: claimed.tenantId, dataEncryptionKey, sources, runId: run.id, now: clock() });
    } catch {
      freshnessSummary = { ...freshnessSummary, status: 'failed', failures: 1 };
    }
    const safeResult = { ...safeDirectEmployerDiscoveryResult(result, clock()), freshnessSummary };
    const finished = await finishJobAgentRun({ redis, runId: run.id, leaseToken, dataEncryptionKey, result: safeResult, now: clock() });
    if (!finished) return null;
    try { await recordLearning({ redis, tenantId: claimed.tenantId, dataEncryptionKey, runId: run.id, result: safeResult, now: clock() }); }
    catch { /* Learning is isolated: verified discovery completion remains authoritative. */ }
    return finished;
  } catch (error) {
    const code = errorCode(error);
    console.error(JSON.stringify({
      type: 'job-agent-discovery-failure', code,
      name: /^[A-Za-z]{1,40}$/.test(error?.name || '') ? error.name : 'Error',
      reason: String(error?.message || '').split(', command was:')[0].replace(/'[^']*'|"[^"]*"/g, '[omitted]').replace(/\S*(?:@|https?:\/\/|1ststep:)\S*|\b[A-Za-z0-9_-]{25,}\b/g, '[omitted]').slice(0, 220),
      sites: [...String(error?.stack || '').matchAll(/([A-Za-z0-9_.-]+\.(?:m?js)):(\d+):\d+/g)].slice(0, 5).map(match => `${match[1]}:${match[2]}`),
    }));
    return failJobAgentRun({
      redis, runId: run.id, leaseToken, dataEncryptionKey, errorCode: code,
      retryable: !/No direct-employer sources/.test(String(error?.message || '')) && !/^JOB_AGENT_(?:CONSENT|POLICY)/.test(code), now: clock(),
    });
  }
}

export async function processSpecificJobAgentRun({ runId, ...config }) {
  const claimed = await claimJobAgentRun({ redis: config.redis, runId, dataEncryptionKey: config.dataEncryptionKey });
  return claimed ? executeClaimedJobAgentRun({ claimed, ...config }) : null;
}

export async function processNextJobAgentRun(config) {
  const claimed = await claimNextJobAgentRun({ redis: config.redis, dataEncryptionKey: config.dataEncryptionKey, servedTenants: config.servedTenants });
  return claimed ? executeClaimedJobAgentRun({ claimed, ...config }) : null;
}
