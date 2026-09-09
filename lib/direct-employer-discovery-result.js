import { redactProhibitedSecretText } from './prohibited-secret.js';
import { analyzeUntrustedJobContent } from './untrusted-job-content.js';

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
    salaryCurrency: String(job.salaryCurrency || '').slice(0, 3),
    salaryDisclosure: String(job.salaryDisclosure || '').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[contact omitted]').slice(0, 300),
    postedDate: String(job.postedDate || 'Unknown').slice(0, 40), sourceEvidence: String(job.sourceEvidence || '').slice(0, 240),
    countryCode: String(job.countryCode || '').slice(0, 3), applyPathVerified: job.applyPathVerified === true,
    applyPathVerification: String(job.applyPathVerification || '').slice(0, 120), applyPathVerifiedAt: String(job.applyPathVerifiedAt || '').slice(0, 40),
    description: content.normalizedText, jobContentSha256: content.sha256,
    jobContentTrust: content.trust, jobContentInstructionSignals: content.instructionSignals,
  };
}

export function safeDirectEmployerDiscoveryResult(result = {}, now = new Date()) {
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
    completedAt: now.toISOString(),
    authority: 'published-direct-employer-ats-feed',
    externalApplicationExecution: false,
  };
}
