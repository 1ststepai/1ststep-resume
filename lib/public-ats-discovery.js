import { publicJobsAreDuplicate } from './job-intelligence.js';
import { classifyOpportunityPath } from './opportunity-paths.js';
import { jobTitleMatchesMission } from './job-mission-relevance.js';

const PROVIDERS = new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters']);
const SOURCE_SLUG = /^[a-z0-9][a-z0-9_-]{1,79}$/i;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const GREENHOUSE_HOSTS = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io']);
const SMARTRECRUITERS_HOSTS = new Set(['jobs.smartrecruiters.com', 'www.smartrecruiters.com']);
const MAX_PUBLIC_SOURCES = 100;
const PUBLIC_SOURCE_CONCURRENCY = 8;
const PUBLIC_PROVIDER_REQUEST_CONCURRENCY = 2;
export const PUBLIC_ATS_PROVIDER_CONTRACT_VERSION = 2;

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.floor(parsed))) : fallback;
}

export function publicDiscoveryRuntimeOptions(input = {}) {
  return Object.freeze({
    requestTimeoutMs: boundedInteger(input.requestTimeoutMs, 8_000, 1_000, 15_000),
    detailTimeoutMs: boundedInteger(input.detailTimeoutMs, 6_000, 1_000, 15_000),
    sourceConcurrency: boundedInteger(input.sourceConcurrency, PUBLIC_SOURCE_CONCURRENCY, 1, 20),
    providerRequestConcurrency: boundedInteger(input.providerRequestConcurrency, PUBLIC_PROVIDER_REQUEST_CONCURRENCY, 1, 4),
  });
}

function text(value) {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function postingText(value) {
  return text(value).slice(0, 12_000);
}

function isoDate(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toISOString().slice(0, 10);
}

function employmentType(value, description = '') {
  const raw = `${text(value)} ${text(description).slice(0, 600)}`;
  if (/\bpart[- ]?time\b/i.test(raw)) return 'Part-time';
  if (/\bfull[- ]?time\b/i.test(raw)) return 'Full-time';
  if (/\b(?:contract|contractor|freelance)\b/i.test(raw)) return 'Contract';
  if (/\b(?:temporary|temp)\b/i.test(raw)) return 'Temporary';
  if (/\b(?:internship|intern)\b/i.test(raw)) return 'Internship';
  if (/\bseasonal\b/i.test(raw)) return 'Seasonal';
  return 'Unknown';
}

function annualize(amount, interval) {
  const basis = text(interval).toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (/hour|hourly|\bhr\b/.test(basis)) return amount * 2080;
  if (/\bday|daily/.test(basis)) return amount * 260;
  if (/week|weekly/.test(basis)) return amount * 52;
  if (/month|monthly/.test(basis)) return amount * 12;
  if (/year|annual|annually|yearly/.test(basis) || amount >= 20_000) return amount;
  return null;
}

function salaryFrom(value) {
  const raw = text(value);
  const interval = /(?:per\s+|\/)(hour|hr|day|week|month|year)|\b(hourly|daily|weekly|monthly|annually|yearly)\b/i.exec(raw)?.[0] || '';
  const shorthandThousands = !interval && /\$\s*\d+(?:\.\d+)?\s*k\b/i.test(raw);
  const matches = [...raw.matchAll(/\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k)?/gi)]
    .map(match => {
      const amount = Number(match[1].replaceAll(',', '')) * (match[2] || shorthandThousands ? 1000 : 1);
      return annualize(amount, interval || 'annual');
    })
    .filter(Number.isFinite)
    .filter(amount => amount >= 20_000 && amount <= 1_000_000);
  return {
    min: matches.length ? Math.min(...matches) : null,
    max: matches.length ? Math.max(...matches) : null,
    disclosure: matches.length ? raw.match(/\$[^.;\n]{2,80}/)?.[0] || 'Salary disclosed in posting' : 'Unknown',
  };
}

function normalizedSalaryRange(range = {}) {
  const min = annualize(Number(range.min), range.interval || range.basis || '');
  const max = annualize(Number(range.max), range.interval || range.basis || '');
  return { min: min && min <= 1_000_000 ? Math.round(min) : null, max: max && max <= 1_000_000 ? Math.round(max) : null };
}

function exactHttpsUrl(value) {
  const url = new URL(text(value));
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !HOSTNAME.test(url.hostname)) throw new Error('Published Apply URL is invalid.');
  url.hash = '';
  return url;
}

function pathHas(url, value) {
  let path = url.pathname;
  try { path = decodeURIComponent(path); } catch { /* keep encoded path */ }
  const expected = text(value).toLowerCase();
  return path.toLowerCase().split('/').filter(Boolean).includes(expected)
    || [...url.searchParams.values()].some(item => text(item).toLowerCase() === expected);
}

export function validatePublicSource(input = {}) {
  const provider = text(input.provider).toLowerCase();
  const slug = text(input.slug || input.token || input.site || input.board);
  const employer = text(input.employer);
  if (!PROVIDERS.has(provider)) throw new Error(`Unsupported public ATS provider: ${provider || 'unknown'}`);
  if (!SOURCE_SLUG.test(slug)) throw new Error('Public ATS source slug is invalid.');
  if (!employer || employer.length > 120) throw new Error('Public ATS source employer is required.');
  const instance = provider === 'lever' && text(input.instance).toLowerCase() === 'eu' ? 'eu' : 'global';
  const allowedApplyHosts = Array.isArray(input.allowedApplyHosts)
    ? [...new Set(input.allowedApplyHosts.slice(0, 5).map(host => text(host).toLowerCase()).filter(host => HOSTNAME.test(host)))]
    : [];
  return { provider, slug, employer, instance, allowedApplyHosts };
}

export function publicSourceUrl(input) {
  const source = validatePublicSource(input);
  if (source.provider === 'greenhouse') return `https://boards-api.greenhouse.io/v1/boards/${source.slug}/jobs?content=false`;
  if (source.provider === 'lever') return `https://api${source.instance === 'eu' ? '.eu' : ''}.lever.co/v0/postings/${source.slug}?mode=json`;
  if (source.provider === 'ashby') return `https://api.ashbyhq.com/posting-api/job-board/${source.slug}?includeCompensation=true`;
  return `https://api.smartrecruiters.com/v1/companies/${source.slug}/postings?limit=100&destination=PUBLIC`;
}

export function publicSourceRequestUrls(input, mission = {}) {
  const source = validatePublicSource(input);
  const base = publicSourceUrl(source);
  if (source.provider !== 'smartrecruiters') return [base];
  const phrases = [mission.role, ...(Array.isArray(mission.roleFamilies) ? mission.roleFamilies : [])]
    .map(value => text(value).slice(0, 80)).filter(Boolean);
  const unique = [...new Set(phrases.map(value => value.toLowerCase()))].slice(0, 6);
  if (!unique.length) return [base];
  return unique.map(query => {
    const url = new URL(base);
    url.searchParams.set('q', query);
    return url.href;
  });
}

export function publicLeverJobUrl(input, requisitionId) {
  const source = validatePublicSource(input);
  const id = text(requisitionId);
  if (source.provider !== 'lever' || !/^[A-Za-z0-9-]{3,160}$/.test(id)) throw new Error('Lever requisition identity is invalid.');
  return `https://api${source.instance === 'eu' ? '.eu' : ''}.lever.co/v0/postings/${source.slug}/${id}`;
}

export function publicSmartRecruitersJobUrl(input, requisitionId) {
  const source = validatePublicSource(input);
  const id = text(requisitionId);
  if (source.provider !== 'smartrecruiters' || !/^[A-Za-z0-9-]{3,160}$/.test(id)) throw new Error('SmartRecruiters requisition identity is invalid.');
  return `https://api.smartrecruiters.com/v1/companies/${source.slug}/postings/${id}`;
}

export function verifyPublicApplyPath(inputSource, job = {}) {
  const source = validatePublicSource(inputSource);
  const id = text(job.requisitionId);
  const jobUrl = exactHttpsUrl(job.jobUrl || job.applyUrl);
  const applyUrl = exactHttpsUrl(job.applyUrl);
  const custom = new Set(source.allowedApplyHosts);
  if (source.provider === 'greenhouse') {
    const hostsAllowed = GREENHOUSE_HOSTS.has(jobUrl.hostname) && GREENHOUSE_HOSTS.has(applyUrl.hostname)
      || custom.has(jobUrl.hostname) && custom.has(applyUrl.hostname);
    if (!hostsAllowed || !pathHas(jobUrl, id) || !pathHas(applyUrl, id)) throw new Error('Greenhouse Apply path does not match the published requisition.');
    if (GREENHOUSE_HOSTS.has(jobUrl.hostname) && (!pathHas(jobUrl, source.slug) || !pathHas(applyUrl, source.slug))) throw new Error('Greenhouse Apply path does not match the employer board.');
  } else if (source.provider === 'lever') {
    const host = source.instance === 'eu' ? 'jobs.eu.lever.co' : 'jobs.lever.co';
    if (jobUrl.hostname !== host || applyUrl.hostname !== host || !pathHas(jobUrl, source.slug) || !pathHas(jobUrl, id) || !pathHas(applyUrl, source.slug) || !pathHas(applyUrl, id)) throw new Error('Lever Apply path does not match the published requisition.');
  } else if (source.provider === 'ashby') {
    if (jobUrl.hostname !== 'jobs.ashbyhq.com' || applyUrl.hostname !== 'jobs.ashbyhq.com' || !pathHas(jobUrl, source.slug) || !pathHas(jobUrl, id) || !pathHas(applyUrl, source.slug) || !pathHas(applyUrl, id)) throw new Error('Ashby Apply path does not match the published requisition.');
  } else {
    if (!SMARTRECRUITERS_HOSTS.has(jobUrl.hostname) || !SMARTRECRUITERS_HOSTS.has(applyUrl.hostname)
      || !pathHas(jobUrl, source.slug) || !pathHas(jobUrl, id) || !pathHas(applyUrl, source.slug) || !pathHas(applyUrl, id)) {
      throw new Error('SmartRecruiters Apply path does not match the published requisition.');
    }
  }
  return { jobUrl: jobUrl.toString(), applyUrl: applyUrl.toString() };
}

export function publicGreenhouseJobUrl(input, requisitionId) {
  const source = validatePublicSource(input);
  const id = text(requisitionId);
  if (source.provider !== 'greenhouse' || !/^\d{1,30}$/.test(id)) throw new Error('Greenhouse requisition identity is invalid.');
  return `https://boards-api.greenhouse.io/v1/boards/${source.slug}/jobs/${id}`;
}

function normalizeGreenhouse(source, payload) {
  return (payload?.jobs || []).map(job => {
    const description = postingText(job.content);
    const salary = salaryFrom(description);
    const location = text(job.location?.name) || 'Unknown';
    return {
      provider: source.provider, sourceSlug: source.slug, employer: source.employer, title: text(job.title), requisitionId: text(job.id),
      jobUrl: text(job.absolute_url), applyUrl: text(job.absolute_url), description, location,
      remote: /remote/i.test(location), workplaceType: /remote/i.test(location) ? 'Remote' : 'Unknown',
      employmentType: employmentType(job.employment_type || job.metadata?.find?.(item => /employment type/i.test(item?.name))?.value, description),
      salaryMin: salary.min, salaryMax: salary.max, salaryDisclosure: salary.disclosure,
      postedDate: isoDate(job.updated_at), countryCode: '', sourceEvidence: 'Published Greenhouse employer board feed',
    };
  });
}

function normalizeLever(source, payload) {
  return (Array.isArray(payload) ? payload : []).map(job => {
    const description = postingText(job.descriptionPlain || job.description);
    const disclosedSalary = salaryFrom(job.salaryDescriptionPlain || description);
    const salary = job.salaryRange ? normalizedSalaryRange(job.salaryRange) : disclosedSalary;
    const location = text(job.categories?.location || job.categories?.allLocations?.join(', ')) || 'Unknown';
    const workplaceType = text(job.workplaceType) || (/remote/i.test(location) ? 'remote' : 'Unknown');
    return {
      provider: source.provider, sourceSlug: source.slug, employer: source.employer, title: text(job.text), requisitionId: text(job.id),
      jobUrl: text(job.hostedUrl), applyUrl: text(job.applyUrl || job.hostedUrl), description, location,
      remote: /remote/i.test(workplaceType) || /remote/i.test(location), workplaceType,
      employmentType: employmentType(job.categories?.commitment, description),
      salaryMin: salary.min || null, salaryMax: salary.max || null,
      salaryDisclosure: text(job.salaryDescriptionPlain) || (salary.min || salary.max ? 'Salary disclosed in posting' : 'Unknown'),
      postedDate: 'Unknown', countryCode: text(job.country).toUpperCase().slice(0, 2), sourceEvidence: 'Published Lever employer board feed',
    };
  });
}

function normalizeAshby(source, payload) {
  if (String(payload?.apiVersion || '') !== '1') return [];
  return (payload?.jobs || []).filter(job => job.isListed !== false).map(job => {
    const description = postingText(job.descriptionPlain || job.descriptionHtml);
    const compensation = text(job.compensation?.compensationTierSummary || job.compensation);
    const salary = salaryFrom(compensation || description);
    const location = text(job.location || job.locationName) || 'Unknown';
    const workplaceType = text(job.workplaceType) || (job.isRemote ? 'Remote' : 'Unknown');
    return {
      provider: source.provider, sourceSlug: source.slug, employer: source.employer, title: text(job.title), requisitionId: text(job.id),
      jobUrl: text(job.jobUrl), applyUrl: text(job.applyUrl || job.jobUrl), description, location,
      remote: job.isRemote === true || /remote/i.test(workplaceType) || /remote/i.test(location), workplaceType,
      employmentType: employmentType(job.employmentType, description),
      salaryMin: salary.min, salaryMax: salary.max, salaryDisclosure: compensation || salary.disclosure,
      postedDate: isoDate(job.publishedAt), countryCode: text(job.address?.postalAddress?.addressCountry).toUpperCase().slice(0, 3), sourceEvidence: 'Published Ashby employer board feed',
    };
  });
}

function smartRecruitersDescription(job = {}) {
  const sections = job.jobAd?.sections || {};
  return postingText(Object.values(sections).map(section => section?.text).filter(Boolean).join('\n'));
}

function normalizeSmartRecruiters(source, payload) {
  const postings = Array.isArray(payload?.content) ? payload.content : payload && typeof payload === 'object' ? [payload] : [];
  return postings.filter(job => job.active !== false).map(job => {
    const description = smartRecruitersDescription(job);
    const salary = salaryFrom(description);
    const city = text(job.location?.city);
    const region = text(job.location?.region);
    const country = text(job.location?.country).toUpperCase();
    const place = [city, region, country].filter(Boolean).join(', ') || 'Unknown';
    const location = job.location?.remote === true ? `Remote - ${place}` : place;
    const id = text(job.id || job.uuid);
    const canonicalUrl = `https://jobs.smartrecruiters.com/${source.slug}/${id}`;
    return {
      provider: source.provider, sourceSlug: source.slug, employer: source.employer, title: text(job.name), requisitionId: id,
      jobUrl: canonicalUrl, applyUrl: canonicalUrl, description, location,
      remote: job.location?.remote === true, workplaceType: job.location?.remote === true ? 'Remote' : 'Unknown',
      employmentType: employmentType(job.typeOfEmployment?.label, description),
      salaryMin: salary.min, salaryMax: salary.max, salaryDisclosure: salary.disclosure,
      postedDate: isoDate(job.releasedDate), countryCode: country.slice(0, 3), sourceEvidence: 'Published SmartRecruiters employer Posting API',
    };
  });
}

export function normalizePublicPostings(inputSource, payload) {
  const source = validatePublicSource(inputSource);
  const jobs = source.provider === 'greenhouse' ? normalizeGreenhouse(source, payload)
    : source.provider === 'lever' ? normalizeLever(source, payload)
      : source.provider === 'ashby' ? normalizeAshby(source, payload)
        : normalizeSmartRecruiters(source, payload);
  return jobs.flatMap(job => {
    if (!job.title || !job.requisitionId) return [];
    try {
      const urls = verifyPublicApplyPath(source, job);
      return [{ ...job, ...urls, applyPathVerified: false, applyPathVerification: 'pending-current-requisition-check' }];
    } catch { return []; }
  });
}

function roleTerms(role) {
  return text(role).toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2 && !['and', 'the', 'job', 'jobs', 'role', 'roles', 'remote'].includes(term));
}

function isUsMissionLocation(location) {
  const listed = text(location);
  return /\b(?:united states|u\.?s\.?a?\.?|usa)\b/i.test(listed)
    || /(?:,\s*|\b)(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i.test(listed);
}

function isClearlyForeignRemote(location) {
  const listed = text(location);
  if (!listed || /\b(?:worldwide|global|united states|u\.?s\.?|usa)\b/i.test(listed)) return false;
  return /\b(?:united kingdom|canada|europe|emea|apac|australia|new zealand|india|singapore|germany|france|spain|italy|netherlands|ireland|poland|romania|turkey|türkiye|mexico|brazil|argentina|colombia|chile|japan|china|taiwan|philippines|indonesia|malaysia|thailand|vietnam|africa|middle east)\b/i.test(listed);
}

function missionStateIsExplicitlyExcluded(job, mission = {}) {
  const missionLocation = text(mission.location);
  const listing = text(`${job.location || ''} ${job.description || ''}`);
  const states = [
    ['NJ', 'New Jersey'], ['NY', 'New York'], ['CA', 'California'], ['CO', 'Colorado'], ['WA', 'Washington'],
    ['MA', 'Massachusetts'], ['CT', 'Connecticut'], ['MD', 'Maryland'], ['VA', 'Virginia'], ['DC', 'District of Columbia'],
  ];
  return states.some(([code, name]) => {
    if (!new RegExp(`(?:\\b${code}\\b|\\b${name}\\b)`, 'i').test(missionLocation)) return false;
    const target = `(?:${code}|${name.replace(/ /g, '\\s+')})`;
    return new RegExp(`(?:not\\s+(?:available|eligible|open)|exclude(?:s|d)?|except|excluding|not\\s+hiring)[^.!;]{0,80}\\b${target}\\b|\\b${target}\\b[^.!;]{0,40}(?:excluded|not\\s+eligible)`, 'i').test(listing);
  });
}

export function jobMatchesMission(job, mission = {}) {
  if (!jobTitleMatchesMission(job, mission)) return false;
  const wantedModes = Array.isArray(mission.workModes) && mission.workModes.length ? mission.workModes : [mission.workMode].filter(Boolean);
  const listedMode = /hybrid/i.test(`${job.workplaceType} ${job.location}`) ? 'Hybrid' : job.remote === true ? 'Remote' : 'On-site';
  if (wantedModes.length && !wantedModes.includes('Any') && !wantedModes.includes(listedMode)) return false;
  if (listedMode === 'Remote' && isUsMissionLocation(mission.location) && isClearlyForeignRemote(job.location)) return false;
  if (listedMode === 'Remote' && isUsMissionLocation(mission.location) && job.countryCode && !['US', 'USA'].includes(String(job.countryCode).toUpperCase())) return false;
  if (listedMode === 'Remote' && missionStateIsExplicitlyExcluded(job, mission)) return false;
  if (mission.location && ['Hybrid', 'On-site'].includes(listedMode)) {
    const locationTerms = roleTerms(mission.location).filter(term => term.length > 2);
    const listedLocation = text(job.location).toLowerCase();
    if (locationTerms.length && !locationTerms.some(term => listedLocation.includes(term))) return false;
  }
  const employmentTypes = Array.isArray(mission.employmentTypes) ? mission.employmentTypes : [];
  if (employmentTypes.length && job.employmentType !== 'Unknown' && !employmentTypes.includes(job.employmentType)) return false;
  if (mission.salaryMin && job.salaryMax && job.salaryMax < mission.salaryMin) return false;
  const excluded = Array.isArray(mission.exclusions) ? mission.exclusions.map(value => text(value).toLowerCase()).filter(Boolean) : [];
  const haystack = text(`${job.employer || ''} ${job.title || ''} ${job.description || ''}`).toLowerCase();
  if (excluded.some(value => value.length >= 3 && haystack.includes(value))) return false;
  return true;
}

export function dedupePublicJobs(jobs = []) {
  const unique = [];
  for (const job of jobs) {
    if (!unique.some(existing => publicJobsAreDuplicate(existing, job))) unique.push(job);
  }
  return unique;
}

function rawPostingCount(source, payload) {
  if (source.provider === 'lever') return Array.isArray(payload) ? payload.length : 0;
  if (source.provider === 'smartrecruiters') return Array.isArray(payload?.content) ? payload.content.length : payload && typeof payload === 'object' ? 1 : 0;
  return Array.isArray(payload?.jobs) ? payload.jobs.length : 0;
}
function rawUnlistedCount(source, payload) { return source.provider === 'ashby' && Array.isArray(payload?.jobs) ? payload.jobs.filter(job => job?.isListed === false).length : 0; }

function retryAfterSeconds(value, now = Date.now()) {
  const raw = text(value);
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(1, Math.min(3_600, Math.ceil(seconds)));
  const at = new Date(raw).getTime();
  if (!Number.isFinite(at)) return null;
  return Math.max(1, Math.min(3_600, Math.ceil((at - now) / 1_000)));
}

export function publicAtsProviderDescriptor(input = {}) {
  const source = validatePublicSource(input);
  const endpoint = new URL(publicSourceUrl(source));
  return Object.freeze({
    contractVersion: PUBLIC_ATS_PROVIDER_CONTRACT_VERSION,
    id: source.provider,
    source,
    endpoint: endpoint.href,
    hostname: endpoint.hostname,
    authentication: 'none',
    redirectPolicy: 'error',
    llmTokensPerRequest: 0,
    containsCandidateValues: false,
  });
}

export async function fetchPublicAtsJson({ descriptor, url, fetchImpl = fetch, timeoutMs = 8_000, now = Date.now() } = {}) {
  const provider = descriptor?.contractVersion === PUBLIC_ATS_PROVIDER_CONTRACT_VERSION
    ? descriptor : publicAtsProviderDescriptor(descriptor?.source || descriptor);
  const target = new URL(String(url || provider.endpoint));
  if (target.protocol !== 'https:' || target.username || target.password || (target.port && target.port !== '443') || target.hostname !== provider.hostname) {
    throw new Error('PUBLIC_ATS_PROVIDER_TARGET_REJECTED');
  }
  const startedAt = Date.now();
  const response = await fetchImpl(target.href, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(Math.max(1_000, Math.min(15_000, Number(timeoutMs) || 8_000))),
    redirect: 'error',
  });
  const retryAfter = retryAfterSeconds(response.headers?.get?.('retry-after'), Number(now));
  if (!response.ok) {
    const error = new Error(`PUBLIC_ATS_HTTP_${response.status}`);
    error.code = 'PUBLIC_ATS_PROVIDER_REQUEST_FAILED';
    error.status = response.status;
    error.retryAfterSeconds = retryAfter;
    error.transient = response.status === 408 || response.status === 429 || response.status >= 500;
    throw error;
  }
  return {
    payload: await response.json(),
    request: { status: response.status, durationMs: Math.max(0, Date.now() - startedAt), retryAfterSeconds: retryAfter, llmTokens: 0 },
  };
}
function supplyByOpportunityPath(jobs) {
  const supply = {};
  for (const job of jobs) {
    const path = classifyOpportunityPath(job);
    if (path) supply[path.id] = (supply[path.id] || 0) + 1;
  }
  return supply;
}
function balancedCandidates(jobs, limit) {
  const buckets = new Map();
  for (const job of jobs) {
    const key = classifyOpportunityPath(job)?.id || 'unclassified';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(job);
  }
  const selected = [];
  while (selected.length < limit && [...buckets.values()].some(bucket => bucket.length)) {
    for (const bucket of buckets.values()) {
      if (bucket.length && selected.length < limit) selected.push(bucket.shift());
    }
  }
  return selected;
}

async function settleWithConcurrency(items, worker, concurrency = PUBLIC_SOURCE_CONCURRENCY) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = { status: 'fulfilled', value: await worker(items[index], index) }; }
      catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  }));
  return results;
}

export async function discoverPublicJobs({ mission = {}, sources = [], fetchImpl = fetch, limit = 50, now = new Date(), runtime = {} } = {}) {
  const runtimeOptions = publicDiscoveryRuntimeOptions(runtime);
  const safeSources = sources.slice(0, MAX_PUBLIC_SOURCES).map(validatePublicSource);
  const outcomes = await settleWithConcurrency(safeSources, async source => {
    const descriptor = publicAtsProviderDescriptor(source);
    const urls = publicSourceRequestUrls(source, mission);
    const attempts = await settleWithConcurrency(urls, url => fetchPublicAtsJson({
      descriptor, url, fetchImpl, timeoutMs: runtimeOptions.requestTimeoutMs,
    }), runtimeOptions.providerRequestConcurrency);
    const completed = attempts.filter(attempt => attempt.status === 'fulfilled').map(attempt => attempt.value);
    if (!completed.length) throw attempts[0]?.reason || new Error('PUBLIC_ATS_PROVIDER_REQUEST_FAILED');
    const payload = source.provider === 'smartrecruiters'
      ? { content: completed.flatMap(item => item.payload?.content || []).filter((job, index, all) => all.findIndex(candidate => text(candidate?.id || candidate?.uuid) === text(job?.id || job?.uuid)) === index) }
      : completed[0].payload;
    const requests = completed.map(item => item.request);
    const requestErrors = attempts.filter(attempt => attempt.status === 'rejected').map(attempt => attempt.reason);
    const jobs = normalizePublicPostings(source, payload);
    return { source, jobs, published: rawPostingCount(source, payload), unlisted: rawUnlistedCount(source, payload), requests, requestErrors };
  }, runtimeOptions.sourceConcurrency);
  const jobs = [];
  const sourceSummary = [];
  const errors = [];
  outcomes.forEach((outcome, index) => {
    const source = safeSources[index];
    if (outcome.status === 'fulfilled') {
      jobs.push(...outcome.value.jobs);
      const failedRequests = outcome.value.requestErrors.length;
      const retryAfter = outcome.value.requestErrors.map(error => error?.retryAfterSeconds).filter(Number.isFinite)[0] || null;
      sourceSummary.push({ provider: source.provider, employer: source.employer, status: failedRequests ? 'partial' : 'ok', found: outcome.value.jobs.length, published: outcome.value.published, unlistedExcluded: outcome.value.unlisted, invalidApplyPaths: Math.max(0, outcome.value.published - outcome.value.unlisted - outcome.value.jobs.length), requestCount: outcome.value.requests.length + failedRequests, completedRequestCount: outcome.value.requests.length, failedRequestCount: failedRequests, llmTokens: 0, durationMs: outcome.value.requests.reduce((sum, request) => sum + request.durationMs, 0), retryAfterSeconds: retryAfter });
      outcome.value.requestErrors.forEach(error => errors.push({ provider: source.provider, employer: source.employer, error: text(error?.code || error?.message).slice(0, 160), transient: error?.transient === true, retryAfterSeconds: error?.retryAfterSeconds || null }));
    } else {
      errors.push({ provider: source.provider, employer: source.employer, error: text(outcome.reason?.code || outcome.reason?.message).slice(0, 160), transient: outcome.reason?.transient === true, retryAfterSeconds: outcome.reason?.retryAfterSeconds || null });
      sourceSummary.push({ provider: source.provider, employer: source.employer, status: 'error', found: 0, published: 0, unlistedExcluded: 0, invalidApplyPaths: 0, requestCount: 1, completedRequestCount: 0, failedRequestCount: 1, llmTokens: 0, durationMs: null, retryAfterSeconds: outcome.reason?.retryAfterSeconds || null });
    }
  });
  const unique = dedupePublicJobs(jobs);
  const candidateLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const missionMatches = unique.filter(job => jobMatchesMission(job, mission));
  const multiPathScan = Array.isArray(mission.roleFamilies) && mission.roleFamilies.length > 1;
  const candidates = multiPathScan ? balancedCandidates(missionMatches, candidateLimit) : missionMatches.slice(0, candidateLimit);
  const supplyByPath = supplyByOpportunityPath(missionMatches);
  const enriched = await Promise.allSettled(candidates.map(async job => {
    const source = safeSources.find(item => item.provider === job.provider && item.slug === job.sourceSlug);
    if (job.provider === 'ashby') return { ...job, applyPathVerified: true, applyPathVerification: 'current-published-ashby-board-membership', applyPathVerifiedAt: new Date(now).toISOString() };
    const detailUrl = job.provider === 'greenhouse' ? publicGreenhouseJobUrl(source, job.requisitionId)
      : job.provider === 'lever' ? publicLeverJobUrl(source, job.requisitionId)
        : publicSmartRecruitersJobUrl(source, job.requisitionId);
    const descriptor = publicAtsProviderDescriptor(source);
    const summary = sourceSummary.find(item => item.provider === source.provider && item.employer === source.employer);
    if (summary) summary.requestCount += 1;
    let payload;
    try {
      const detail = await fetchPublicAtsJson({ descriptor, url: detailUrl, fetchImpl, timeoutMs: runtimeOptions.detailTimeoutMs });
      payload = detail.payload;
      if (summary) {
        summary.completedRequestCount += 1;
        summary.durationMs = Math.max(0, Number(summary.durationMs) || 0) + detail.request.durationMs;
      }
    } catch (error) {
      if (summary) {
        summary.failedRequestCount += 1;
        summary.retryAfterSeconds = error?.retryAfterSeconds || summary.retryAfterSeconds;
      }
      throw error;
    }
    const detailPayload = job.provider === 'greenhouse' ? { jobs: [payload] } : job.provider === 'lever' ? [payload] : payload;
    const [detail] = normalizePublicPostings(source, detailPayload);
    if (!detail || detail.requisitionId !== job.requisitionId || detail.applyUrl !== job.applyUrl || detail.jobUrl !== job.jobUrl) throw new Error(`${job.provider} ${job.employer} requisition identity changed`);
    return { ...detail, applyPathVerified: true, applyPathVerification: `current-${job.provider}-requisition-fetch`, applyPathVerifiedAt: new Date(now).toISOString() };
  }));
  const detailed = [];
  enriched.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') detailed.push(outcome.value);
    else errors.push({ provider: candidates[index].provider, employer: candidates[index].employer, error: text(outcome.reason?.message).slice(0, 160) });
  });
  const matched = detailed.filter(job => jobMatchesMission(job, mission));
  const returned = matched.map(({ sourceSlug: _sourceSlug, ...job }) => job);
  return {
    jobs: returned,
    filterSummary: {
      scanned: jobs.length, duplicatesRemoved: jobs.length - unique.length,
      rejectedByMission: unique.length - missionMatches.length, limitedOut: Math.max(0, missionMatches.length - candidates.length),
      verificationFailed: Math.max(0, candidates.length - detailed.length), rejectedAfterVerification: Math.max(0, detailed.length - matched.length),
      matched: matched.length, returned: returned.length,
    },
    sourceSummary, errors, supplyByPath,
  };
}

export async function reverifyPublicJob({ job = {}, sources = [], fetchImpl = fetch, now = new Date() } = {}) {
  const current = new Date(now);
  if (!Number.isFinite(current.getTime())) throw new Error('PUBLIC_ATS_REVERIFICATION_TIME_INVALID');
  const provider = text(job.provider).toLowerCase();
  const employer = text(job.employer);
  const requisitionId = text(job.requisitionId);
  if (!provider || !employer || !requisitionId || !job.applyUrl || !job.jobUrl) throw new Error('PUBLIC_ATS_REVERIFICATION_JOB_INVALID');
  const matchingSources = sources.slice(0, MAX_PUBLIC_SOURCES).map(validatePublicSource).filter(source => {
    if (source.provider !== provider || source.employer !== employer) return false;
    try { verifyPublicApplyPath(source, job); return true; } catch { return false; }
  });
  if (matchingSources.length !== 1) throw new Error('PUBLIC_ATS_REVERIFICATION_SOURCE_NOT_FOUND');
  const source = matchingSources[0];
  const url = source.provider === 'greenhouse' ? publicGreenhouseJobUrl(source, requisitionId)
    : source.provider === 'lever' ? publicLeverJobUrl(source, requisitionId)
      : source.provider === 'smartrecruiters' ? publicSmartRecruitersJobUrl(source, requisitionId)
        : publicSourceUrl(source);
  const descriptor = publicAtsProviderDescriptor(source);
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000), redirect: descriptor.redirectPolicy });
  if (response.status === 404 || response.status === 410) {
    return { status: 'closed', provider, employer, requisitionId, checkedAt: current.toISOString(), containsCandidateValues: false };
  }
  if (!response.ok) throw new Error(response.status === 408 || response.status === 429 || response.status >= 500 ? 'PUBLIC_ATS_REVERIFICATION_TRANSIENT' : 'PUBLIC_ATS_REVERIFICATION_REJECTED');
  const payload = await response.json();
  const normalized = normalizePublicPostings(source, source.provider === 'greenhouse' ? { jobs: [payload] } : source.provider === 'lever' ? [payload] : payload);
  const detail = normalized.find(item => item.requisitionId === requisitionId);
  if (!detail) return { status: 'closed', provider, employer, requisitionId, checkedAt: current.toISOString(), containsCandidateValues: false };
  if (detail.provider !== provider || detail.employer !== employer || detail.requisitionId !== requisitionId) throw new Error('PUBLIC_ATS_REVERIFICATION_IDENTITY_CHANGED');
  return {
    status: 'open',
    job: { ...detail, applyPathVerified: true, applyPathVerification: `current-${provider}-requisition-reverification`, applyPathVerifiedAt: current.toISOString() },
    checkedAt: current.toISOString(),
    containsCandidateValues: false,
  };
}
