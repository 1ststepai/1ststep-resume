import { createHash } from 'node:crypto';
import { reverifyPublicJob } from './public-ats-discovery.js';
import { redactProhibitedSecretText } from './prohibited-secret.js';
import { analyzeUntrustedJobContent } from './untrusted-job-content.js';

function text(value) { return String(value || '').trim(); }

function exactHttps(value) {
  const url = new URL(text(value));
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The verified discovery Apply URL is invalid.');
  url.hash = '';
  // SmartRecruiters company slugs are case insensitive; preserve the requisition
  // and keep other providers' potentially case-sensitive paths exact.
  if (url.hostname === 'jobs.smartrecruiters.com' && /^\/[^/]+\/\d+\/?$/.test(url.pathname)) {
    const segments = url.pathname.split('/');
    segments[1] = segments[1].toLowerCase();
    url.pathname = segments.join('/');
  }
  return url.href;
}

function firstDisclosure(description, patterns = []) {
  const source = text(description).replace(/\s+/g, ' ');
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[0]) return match[0].trim().slice(0, 180);
  }
  return '';
}

export function verifiedRoleEvidence(job = {}) {
  const description = text(job.description);
  const salaryDisclosure = text(job.salaryDisclosure).slice(0, 300);
  const payText = `${salaryDisclosure} ${firstDisclosure(description, [
    /\b(?:ote|on[ -]target earnings?|total compensation|base salary|base pay|annual salary)\b/i,
  ])}`.toLowerCase();
  const compensationBasis = /\b(ote|on[ -]target earnings?)\b/.test(payText) ? 'ote'
    : /\btotal compensation\b/.test(payText) ? 'total compensation'
      : /\b(base salary|base pay|annual salary)\b/.test(payText) ? 'base' : 'unknown';
  const leadershipText = description
    .replace(/\bno\s+direct reports?\b/gi, '')
    .replace(/\b(?:does|do|will)\s+not\s+(?:manage|lead|supervise)\s+(?:a\s+)?(?:team|staff|direct reports?)\b/gi, '');
  return {
    location: text(job.location).slice(0, 180), remote: job.remote === true,
    workplaceType: text(job.workplaceType).slice(0, 80), employmentType: text(job.employmentType).slice(0, 80),
    salaryMin: Number(job.salaryMin) > 0 ? Math.round(Number(job.salaryMin)) : null,
    salaryMax: Number(job.salaryMax) > 0 ? Math.round(Number(job.salaryMax)) : null,
    salaryCurrency: text(job.salaryCurrency || 'USD').slice(0, 3).toUpperCase(),
    salaryDisclosure, compensationBasis,
    travelDisclosure: firstDisclosure(description, [
      /\b(?:up to|approximately|about)\s+\d{1,3}%\s+travel\b/i,
      /\b\d{1,3}%\s+travel\b/i,
      /\b(?:occasional|frequent|regular)\s+travel(?:\s+(?:is\s+)?required)?\b/i,
      /\btravel\s+(?:is\s+)?required\b/i,
    ]),
    peopleLeadershipRequired: /\b(?:manage|lead|supervise)\s+(?:a\s+)?(?:team|staff|direct reports?)\b|\bpeople manager\b|\bdirect reports?\b/i.test(leadershipText),
    categoryManagementRequired: /\bcategory management\b|\bcategory strateg(?:y|ies)\b|\bown(?:ing|s)?\s+(?:the\s+)?categor(?:y|ies)\b/i.test(description),
    verifiedAt: text(job.applyPathVerifiedAt || job.verifiedAt).slice(0, 40),
  };
}

export function bindPackageToVerifiedDiscovery(discoveryRun, requested = {}, { now = new Date(), maxVerificationAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  if (discoveryRun?.taskType !== 'direct_employer_discovery' || discoveryRun?.status !== 'Finished'
    || discoveryRun?.result?.authority !== 'published-direct-employer-ats-feed' || !Array.isArray(discoveryRun?.result?.jobs)) {
    throw new Error('A finished tenant-owned direct-employer discovery run is required before package generation.');
  }
  const requisitionId = text(requested.requisitionId);
  const employer = text(requested.employer);
  const title = text(requested.title);
  const requestedUrl = exactHttps(requested.directEmployerUrl);
  const match = discoveryRun.result.jobs.find(job => text(job.requisitionId) === requisitionId
    && text(job.employer) === employer && text(job.title) === title && exactHttps(job.applyUrl) === requestedUrl);
  if (!match) throw new Error('The selected role no longer exactly matches the verified discovery result. Search again before packaging.');
  const verifiedAt = new Date(match.applyPathVerifiedAt || '');
  const current = new Date(now);
  if (match.applyPathVerified !== true || !Number.isFinite(verifiedAt.getTime()) || !Number.isFinite(current.getTime())
    || verifiedAt.getTime() > current.getTime() + 5 * 60_000 || current.getTime() - verifiedAt.getTime() > maxVerificationAgeMs) {
    throw new Error('The exact direct-employer Apply path must be reverified within 24 hours before packaging.');
  }
  return {
    roleId: text(requested.roleId), discoveryRunId: discoveryRun.id,
    employer: text(match.employer), title: text(match.title), requisitionId: text(match.requisitionId),
    directEmployerUrl: exactHttps(match.applyUrl), applyPathActive: true, applyPathVerifiedAt: verifiedAt.toISOString(),
    roleEvidence: verifiedRoleEvidence(match),
    jobDescription: text(match.description), resumeText: text(requested.resumeText),
    includeCoverLetter: requested.includeCoverLetter !== false,
  };
}

function stableJobFingerprint(job, { includeCurrency = true } = {}) {
  // Compare the same privacy-filtered description persisted by discovery, not
  // redacted stored text against the unredacted public posting.
  const description = String(job?.description || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[contact omitted]')
    .replace(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g, '[phone omitted]').slice(0, 12_000);
  const normalized = { ...job, salaryCurrency: String(job?.salaryCurrency || ''), description: analyzeUntrustedJobContent(redactProhibitedSecretText(description), { maxChars: 12_000 }).normalizedText };
  const fields = ['provider', 'employer', 'title', 'requisitionId', 'applyUrl', 'jobUrl', 'description', 'location', 'remote', 'workplaceType', 'employmentType', 'salaryMin', 'salaryMax', ...(includeCurrency ? ['salaryCurrency'] : [])];
  return createHash('sha256').update(JSON.stringify(fields.map(field => normalized[field] ?? null))).digest('hex');
}

export async function bindPackageToFreshVerifiedDiscovery(discoveryRun, requested = {}, { sources = [], fetchImpl = fetch, now = new Date(), maxVerificationAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  bindPackageToVerifiedDiscovery(discoveryRun, requested, { now, maxVerificationAgeMs: Number.MAX_SAFE_INTEGER });
  const requestedUrl = exactHttps(requested.directEmployerUrl);
  const match = discoveryRun?.result?.jobs?.find(job => text(job.employer) === text(requested.employer)
    && text(job.title) === text(requested.title)
    && text(job.requisitionId) === text(requested.requisitionId)
    && exactHttps(job.applyUrl) === requestedUrl);
  if (!match) throw new Error('The selected role no longer exactly matches the verified discovery result. Search again before packaging.');
  const refreshed = await reverifyPublicJob({ job: match, sources, fetchImpl, now });
  if (refreshed.status === 'closed') throw new Error('The exact direct-employer requisition is closed. It cannot be packaged.');
  if (refreshed.status !== 'open' || !refreshed.job) throw new Error('The exact direct-employer requisition could not be reverified. Try again later.');
  const fingerprintOptions = { includeCurrency: Object.hasOwn(match, 'salaryCurrency') };
  if (stableJobFingerprint(match, fingerprintOptions) !== stableJobFingerprint(refreshed.job, fingerprintOptions)) throw new Error('The direct-employer requisition changed. Search again so fit and documents can be reviewed against the current posting.');
  const refreshedRun = {
    ...discoveryRun,
    result: { ...discoveryRun.result, jobs: discoveryRun.result.jobs.map(job => job === match ? refreshed.job : job) },
  };
  return bindPackageToVerifiedDiscovery(refreshedRun, requested, { now, maxVerificationAgeMs });
}
