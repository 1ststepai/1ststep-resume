import { createHash } from 'node:crypto';
import { reverifyPublicJob } from './public-ats-discovery.js';

function text(value) { return String(value || '').trim(); }

function exactHttps(value) {
  const url = new URL(text(value));
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The verified discovery Apply URL is invalid.');
  url.hash = '';
  return url.href;
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
    jobDescription: text(match.description), resumeText: text(requested.resumeText),
    includeCoverLetter: requested.includeCoverLetter !== false,
  };
}

function stableJobFingerprint(job) {
  const fields = ['provider', 'employer', 'title', 'requisitionId', 'applyUrl', 'jobUrl', 'description', 'location', 'remote', 'workplaceType', 'employmentType', 'salaryMin', 'salaryMax', 'salaryCurrency'];
  return createHash('sha256').update(JSON.stringify(fields.map(field => job?.[field] ?? null))).digest('hex');
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
  if (stableJobFingerprint(match) !== stableJobFingerprint(refreshed.job)) throw new Error('The direct-employer requisition changed. Search again so fit and documents can be reviewed against the current posting.');
  const refreshedRun = {
    ...discoveryRun,
    result: { ...discoveryRun.result, jobs: discoveryRun.result.jobs.map(job => job === match ? refreshed.job : job) },
  };
  return bindPackageToVerifiedDiscovery(refreshedRun, requested, { now, maxVerificationAgeMs });
}
