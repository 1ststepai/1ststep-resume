import assert from 'node:assert/strict';
import {
  dedupePublicJobs, discoverPublicJobs, fetchPublicAtsJson, jobMatchesMission, normalizePublicPostings, publicAtsProviderDescriptor, publicDiscoveryRuntimeOptions, publicGreenhouseJobUrl, publicLeverJobUrl, publicSmartRecruitersJobUrl, publicSourceRequestUrls, publicSourceUrl, reverifyPublicJob, validatePublicSource, verifyPublicApplyPath,
} from '../lib/public-ats-discovery.js';
import { JOB_RELEVANCE_POLICY_VERSION, jobTitleMatchesMission, restoredJobCardIsRelevant } from '../lib/job-mission-relevance.js';
import discoveryHandler, { maxDuration as discoveryMaxDuration, USER_DISCOVERY_RUNTIME } from '../api/concierge-discovery.js';
import { maxDuration as previewSmokeMaxDuration, SMOKE_DISCOVERY_RUNTIME } from '../api/concierge-preview-smoke.js';
import { DEFAULT_PUBLIC_ATS_SOURCES } from '../lib/public-ats-catalog.js';

const greenhouse = { provider: 'greenhouse', slug: 'fixtureco', employer: 'Fixture Co' };
const lever = { provider: 'lever', slug: 'leverfixture', employer: 'Lever Fixture' };
const ashby = { provider: 'ashby', slug: 'ashbyfixture', employer: 'Ashby Fixture' };
const smartRecruiters = { provider: 'smartrecruiters', slug: 'SmartFixture', employer: 'Smart Fixture' };

assert.equal(publicSourceUrl(greenhouse), 'https://boards-api.greenhouse.io/v1/boards/fixtureco/jobs?content=false');
assert.equal(publicGreenhouseJobUrl(greenhouse, '42'), 'https://boards-api.greenhouse.io/v1/boards/fixtureco/jobs/42');
assert.throws(() => publicGreenhouseJobUrl(greenhouse, '../42'), /identity is invalid/);
assert.equal(publicSourceUrl(lever), 'https://api.lever.co/v0/postings/leverfixture?mode=json');
assert.equal(publicLeverJobUrl(lever, 'LEV-7'), 'https://api.lever.co/v0/postings/leverfixture/LEV-7');
assert.equal(publicSourceUrl(ashby), 'https://api.ashbyhq.com/posting-api/job-board/ashbyfixture?includeCompensation=true');
assert.equal(publicSourceUrl(smartRecruiters), 'https://api.smartrecruiters.com/v1/companies/SmartFixture/postings?limit=100&destination=PUBLIC');
assert.equal(publicSmartRecruitersJobUrl(smartRecruiters, '744000123456789'), 'https://api.smartrecruiters.com/v1/companies/SmartFixture/postings/744000123456789');
assert.throws(() => publicSmartRecruitersJobUrl(smartRecruiters, '../private'), /identity is invalid/);
assert.equal(publicSourceRequestUrls(smartRecruiters, { role: 'buyer', roleFamilies: ['buyer', 'procurement operations'] }).length, 2);
assert.throws(() => validatePublicSource({ provider: 'custom', slug: 'https://internal.test', employer: 'Bad' }), /Unsupported/);
assert.throws(() => validatePublicSource({ provider: 'lever', slug: '../private', employer: 'Bad' }), /slug is invalid/);
assert.equal(DEFAULT_PUBLIC_ATS_SOURCES.length, 37);
assert.ok(DEFAULT_PUBLIC_ATS_SOURCES.every(source => validatePublicSource(source)));
assert.deepEqual(publicDiscoveryRuntimeOptions(), {
  requestTimeoutMs: 8_000, detailTimeoutMs: 6_000, sourceConcurrency: 8, providerRequestConcurrency: 2,
});
assert.deepEqual(publicDiscoveryRuntimeOptions({ requestTimeoutMs: 1, detailTimeoutMs: 99_000, sourceConcurrency: 99, providerRequestConcurrency: 0 }), {
  requestTimeoutMs: 1_000, detailTimeoutMs: 15_000, sourceConcurrency: 20, providerRequestConcurrency: 1,
});
assert.equal(previewSmokeMaxDuration, 30);
assert.deepEqual(SMOKE_DISCOVERY_RUNTIME, {
  requestTimeoutMs: 2_500, detailTimeoutMs: 2_000, sourceConcurrency: 20, providerRequestConcurrency: 2,
});
assert.equal(discoveryMaxDuration, 45);
assert.deepEqual(USER_DISCOVERY_RUNTIME, {
  requestTimeoutMs: 4_000, detailTimeoutMs: 3_000, sourceConcurrency: 20, providerRequestConcurrency: 2,
});
const providerDescriptor = publicAtsProviderDescriptor(greenhouse);
assert.equal(providerDescriptor.contractVersion, 2);
assert.equal(providerDescriptor.authentication, 'none');
assert.equal(providerDescriptor.redirectPolicy, 'error');
assert.equal(providerDescriptor.llmTokensPerRequest, 0);
await assert.rejects(() => fetchPublicAtsJson({ descriptor: providerDescriptor, url: 'https://127.0.0.1/private', fetchImpl: async () => ({}) }), /TARGET_REJECTED/);
await assert.rejects(() => fetchPublicAtsJson({
  descriptor: providerDescriptor,
  fetchImpl: async (_url, options) => {
    assert.equal(options.redirect, 'error');
    return { ok: false, status: 429, headers: { get: key => key === 'retry-after' ? '45' : null } };
  },
}), error => error.code === 'PUBLIC_ATS_PROVIDER_REQUEST_FAILED' && error.transient === true && error.retryAfterSeconds === 45);

const greenhouseJobs = normalizePublicPostings(greenhouse, { jobs: [{
  id: 42, title: 'Strategic Procurement Manager', absolute_url: 'https://boards.greenhouse.io/fixtureco/jobs/42',
  location: { name: 'Remote - United States' }, updated_at: '2026-08-27T12:00:00Z',
  content: '<p>Lead supplier sourcing. Salary $110,000 - $135,000.</p>',
}] });
assert.equal(greenhouseJobs[0].remote, true);
assert.equal(greenhouseJobs[0].salaryMin, 110000);
assert.equal(greenhouseJobs[0].salaryMax, 135000);
const reverifiedGreenhouse = await reverifyPublicJob({
  job: greenhouseJobs[0], sources: [greenhouse], now: new Date('2026-08-30T12:00:00.000Z'),
  fetchImpl: async (url, options) => {
    assert.equal(url, publicGreenhouseJobUrl(greenhouse, '42'));
    assert.equal(options.redirect, 'error');
    return { ok: true, status: 200, json: async () => ({ id: 42, title: 'Strategic Procurement Manager', absolute_url: greenhouseJobs[0].applyUrl, location: { name: 'Remote - United States' }, updated_at: '2026-08-27T12:00:00Z', content: '<p>Lead supplier sourcing. Salary $110,000 - $135,000.</p>' }) };
  },
});
assert.equal(reverifiedGreenhouse.status, 'open');
assert.equal(reverifiedGreenhouse.job.applyPathVerified, true);
assert.equal(reverifiedGreenhouse.job.applyPathVerifiedAt, '2026-08-30T12:00:00.000Z');
assert.equal(reverifiedGreenhouse.containsCandidateValues, false);
const closedGreenhouse = await reverifyPublicJob({ job: greenhouseJobs[0], sources: [greenhouse], fetchImpl: async () => ({ ok: false, status: 404 }) });
assert.equal(closedGreenhouse.status, 'closed');
await assert.rejects(() => reverifyPublicJob({ job: greenhouseJobs[0], sources: [greenhouse], fetchImpl: async () => ({ ok: false, status: 503 }) }), /PUBLIC_ATS_REVERIFICATION_TRANSIENT/);
await assert.rejects(() => reverifyPublicJob({ job: { ...greenhouseJobs[0], applyUrl: 'https://evil.example.test/jobs/42' }, sources: [greenhouse] }), /SOURCE_NOT_FOUND/);

const leverJobs = normalizePublicPostings(lever, [{
  id: 'LEV-7', text: 'Senior Buyer', hostedUrl: 'https://jobs.lever.co/leverfixture/LEV-7',
  applyUrl: 'https://jobs.lever.co/leverfixture/LEV-7/apply', descriptionPlain: 'Own procurement and sourcing.',
  categories: { location: 'Remote, US' }, workplaceType: 'remote', salaryRange: { min: 95000, max: 120000 },
}]);
assert.equal(leverJobs[0].salaryMax, 120000);
assert.equal(leverJobs[0].employmentType, 'Unknown');
assert.equal(leverJobs[0].sourceEvidence, 'Published Lever employer board feed');

const ashbyJobs = normalizePublicPostings(ashby, { apiVersion: '1', jobs: [{
  id: 'ASH-9', title: 'Procurement Operations Lead', jobUrl: 'https://jobs.ashbyhq.com/ashbyfixture/ASH-9',
  applyUrl: 'https://jobs.ashbyhq.com/ashbyfixture/ASH-9/application', location: 'United States', isRemote: true,
  workplaceType: 'Remote', descriptionPlain: 'Procurement operations and vendor management.', publishedAt: '2026-08-25',
  compensation: { compensationTierSummary: '$100k - $140k' },
}] });
assert.equal(ashbyJobs[0].remote, true);
assert.equal(ashbyJobs[0].salaryMax, 140000);
assert.equal(normalizePublicPostings(ashby, { apiVersion: '1', jobs: [{ ...ashbyJobs[0], isListed: false }] }).length, 0);
const smartRecruitersJobs = normalizePublicPostings(smartRecruiters, { content: [{
  id: '744000123456789', name: 'Procurement Program Manager', releasedDate: '2026-08-29T12:00:00Z',
  location: { city: 'New York', region: 'NY', country: 'US', remote: true }, typeOfEmployment: { label: 'Full-time' },
}] });
assert.equal(smartRecruitersJobs[0].remote, true);
assert.equal(smartRecruitersJobs[0].countryCode, 'US');
assert.equal(smartRecruitersJobs[0].applyUrl, 'https://jobs.smartrecruiters.com/SmartFixture/744000123456789');
assert.equal(smartRecruitersJobs[0].sourceEvidence, 'Published SmartRecruiters employer Posting API');
assert.throws(() => verifyPublicApplyPath(greenhouse, { ...greenhouseJobs[0], applyUrl: 'https://attacker.example/jobs/42' }), /does not match/);
assert.throws(() => verifyPublicApplyPath(lever, { ...leverJobs[0], applyUrl: 'https://jobs.lever.co/other/LEV-7/apply' }), /does not match/);
assert.throws(() => verifyPublicApplyPath(ashby, { ...ashbyJobs[0], applyUrl: 'https://jobs.ashbyhq.com/ashbyfixture/OTHER/application' }), /does not match/);
assert.throws(() => verifyPublicApplyPath(smartRecruiters, { ...smartRecruitersJobs[0], applyUrl: 'https://jobs.smartrecruiters.com/Other/744000123456789' }), /does not match/);
const customGreenhouse = { ...greenhouse, allowedApplyHosts: ['careers.fixture.example'] };
assert.equal(verifyPublicApplyPath(customGreenhouse, {
  ...greenhouseJobs[0], jobUrl: 'https://careers.fixture.example/opening?gh_jid=42', applyUrl: 'https://careers.fixture.example/opening?gh_jid=42',
}).applyUrl, 'https://careers.fixture.example/opening?gh_jid=42');
assert.throws(() => verifyPublicApplyPath(greenhouse, { ...greenhouseJobs[0], jobUrl: 'https://careers.fixture.example/opening?gh_jid=42', applyUrl: 'https://careers.fixture.example/opening?gh_jid=42' }), /does not match/);

const hourlyLever = normalizePublicPostings(lever, [{
  id: 'LEV-HOURLY', text: 'Contract Buyer', hostedUrl: 'https://jobs.lever.co/leverfixture/LEV-HOURLY',
  applyUrl: 'https://jobs.lever.co/leverfixture/LEV-HOURLY/apply', descriptionPlain: 'Contract sourcing support.',
  categories: { location: 'Remote, US' }, workplaceType: 'remote', salaryRange: { min: 40, max: 50, interval: 'hour' },
}])[0];
assert.equal(hourlyLever.salaryMin, 83200);
assert.equal(hourlyLever.salaryMax, 104000);

const mission = { role: 'procurement', workMode: 'Remote', salaryMin: 100000, excludedRoleFamilies: ['category management'] };
assert.equal(jobMatchesMission(greenhouseJobs[0], mission), true);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], title: 'Category Management Director' }, mission), false);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], remote: false }, mission), false);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], employmentType: 'Contract' }, { ...mission, employmentTypes: ['Full-time'] }), false);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], employmentType: 'Unknown' }, { ...mission, employmentTypes: ['Full-time'] }), true);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], title: 'Legal Operations Analyst', description: 'Supports procurement contracts.' }, mission), false);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], title: 'Strategic Finance Manager', description: 'Vendor management.' }, { ...mission, role: 'Procurement Manager' }), false);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], title: 'Senior Buyer', description: '' }, mission), true);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], title: 'Customer Success Manager', description: '' }, { ...mission, role: 'Customer Success Manager' }), true);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], title: 'Executive Assistant', description: '' }, { ...mission, role: 'Account Executive' }), false);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], title: 'Data Analyst', description: '' }, { ...mission, role: 'Software Engineer', roleFamilies: ['software engineer', 'data analyst', 'data scientist'] }), true);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], title: 'Engineering Manager', description: '' }, { ...mission, role: 'Manager' }), true);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], title: 'Customer Success Manager', description: '' }, { ...mission, role: '', roleFamilies: ['customer success manager', 'procurement manager'] }), true);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], remote: false, workplaceType: 'Hybrid', location: 'Austin, TX' }, { ...mission, workModes: ['Hybrid'], location: 'Newark, NJ' }), false);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], remote: true, workplaceType: 'Hybrid', location: 'Austin, TX' }, { ...mission, workModes: ['Remote', 'Hybrid'], location: 'Newark, NJ' }), false);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], remote: true, workplaceType: 'Remote', location: 'United Kingdom' }, { ...mission, workModes: ['Remote'], location: 'Newark, NJ' }), false);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], remote: true, workplaceType: 'Remote', location: 'Remote Canada' }, { ...mission, workModes: ['Remote'], location: 'United States' }), false);
assert.equal(jobMatchesMission({ ...greenhouseJobs[0], remote: true, workplaceType: 'Remote', location: 'Remote', countryCode: 'CA' }, { ...mission, workModes: ['Remote'], location: 'United States' }), false);
assert.equal(JOB_RELEVANCE_POLICY_VERSION, 'title-family-v1');
assert.equal(jobTitleMatchesMission({ title: 'Legal Operations Analyst II' }, mission), false);
assert.equal(jobTitleMatchesMission({ title: 'Senior Manager, Legal Technology, Operations & AI Enablement' }, mission), false);
assert.equal(jobTitleMatchesMission({ title: 'Security Risk Management Lead' }, mission), false);
assert.equal(jobTitleMatchesMission({ title: 'Oracle ERP Program Manager' }, mission), false);
assert.equal(jobTitleMatchesMission({ title: 'Senior Capture Manager' }, mission), false);
assert.equal(jobTitleMatchesMission({ title: 'Strategic Sourcing Manager' }, mission), true);
assert.equal(restoredJobCardIsRelevant({ title: 'Legal Operations Analyst II', status: 'Found' }, mission), false);
assert.equal(restoredJobCardIsRelevant({ title: 'Security Risk Management Lead', status: 'Found' }, mission), false);
assert.equal(restoredJobCardIsRelevant({ title: 'Strategic Sourcing Manager', status: 'Found' }, mission), true);
assert.equal(restoredJobCardIsRelevant({ title: 'Legal Operations Analyst II', status: 'Package Ready' }, mission), true, 'in-progress application history must remain visible');
assert.equal(dedupePublicJobs([...greenhouseJobs, ...greenhouseJobs]).length, 1);

const payloads = new Map([
  [publicSourceUrl(greenhouse), { jobs: greenhouseJobs.map(job => ({ id: job.requisitionId, title: job.title, absolute_url: job.applyUrl, location: { name: job.location }, updated_at: job.postedDate, content: job.description })) }],
  [publicSourceUrl(lever), [{ id: 'LEV-7', text: 'Senior Buyer', hostedUrl: leverJobs[0].jobUrl, applyUrl: leverJobs[0].applyUrl, descriptionPlain: leverJobs[0].description, categories: { location: 'Remote, US' }, workplaceType: 'remote', salaryRange: { min: 95000, max: 120000 } }]],
  [publicSourceUrl(ashby), { apiVersion: '1', jobs: [
    { id: 'ASH-9', title: 'Procurement Operations Lead', jobUrl: ashbyJobs[0].jobUrl, applyUrl: ashbyJobs[0].applyUrl, location: 'United States', isRemote: true, workplaceType: 'Remote', descriptionPlain: ashbyJobs[0].description, compensation: { compensationTierSummary: '$100k - $140k' } },
    { id: 'ASH-HIDDEN', title: 'Hidden Buyer', jobUrl: 'https://jobs.ashbyhq.com/ashbyfixture/ASH-HIDDEN', applyUrl: 'https://jobs.ashbyhq.com/ashbyfixture/ASH-HIDDEN/application', location: 'United States', isRemote: true, workplaceType: 'Remote', descriptionPlain: 'Procurement.', isListed: false },
  ] }],
  [publicGreenhouseJobUrl(greenhouse, '42'), { id: 42, title: 'Strategic Procurement Manager', absolute_url: greenhouseJobs[0].applyUrl, location: { name: greenhouseJobs[0].location }, updated_at: greenhouseJobs[0].postedDate, content: greenhouseJobs[0].description }],
  [publicLeverJobUrl(lever, 'LEV-7'), { id: 'LEV-7', text: 'Senior Buyer', hostedUrl: leverJobs[0].jobUrl, applyUrl: leverJobs[0].applyUrl, descriptionPlain: leverJobs[0].description, categories: { location: 'Remote, US' }, workplaceType: 'remote', salaryRange: { min: 95000, max: 120000 } }],
  [publicSmartRecruitersJobUrl(smartRecruiters, '744000123456789'), { id: '744000123456789', name: 'Procurement Program Manager', active: true, releasedDate: '2026-08-29T12:00:00Z', location: { city: 'New York', region: 'NY', country: 'US', remote: true }, typeOfEmployment: { label: 'Full-time' }, jobAd: { sections: { jobDescription: { text: 'Lead procurement transformation. Salary $110,000 - $140,000.' } } } }],
]);
const smartRecruitersListPayload = { content: [{ id: '744000123456789', name: 'Procurement Program Manager', releasedDate: '2026-08-29T12:00:00Z', location: { city: 'New York', region: 'NY', country: 'US', remote: true }, typeOfEmployment: { label: 'Full-time' } }] };
for (const url of publicSourceRequestUrls(smartRecruiters, { role: 'buyer', roleFamilies: ['buyer', 'procurement operations', 'procurement program manager'] })) payloads.set(url, smartRecruitersListPayload);
const result = await discoverPublicJobs({
  mission: { role: 'buyer', roleFamilies: ['buyer', 'procurement operations', 'procurement program manager'], workMode: 'Remote', salaryMin: 100000 }, sources: [greenhouse, lever, ashby, smartRecruiters],
  fetchImpl: async url => ({ ok: true, json: async () => payloads.get(url) }),
});
assert.equal(result.jobs.length, 4);
assert.deepEqual(new Set(result.jobs.map(job => job.provider)), new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters']));
assert.equal(result.sourceSummary.length, 4);
assert.equal(result.sourceSummary.find(source => source.provider === 'ashby').unlistedExcluded, 1);
assert.equal(result.sourceSummary.find(source => source.provider === 'ashby').invalidApplyPaths, 0);
assert.equal(result.sourceSummary.reduce((sum, source) => sum + source.requestCount, 0), 9);
assert.equal(result.sourceSummary.reduce((sum, source) => sum + source.completedRequestCount, 0), 9);
assert.ok(result.sourceSummary.every(source => source.failedRequestCount === 0 && source.llmTokens === 0));
assert.ok(result.jobs.every(job => job.applyPathVerified === true));
assert.deepEqual(result.filterSummary, { scanned: 4, duplicatesRemoved: 0, rejectedByMission: 0, limitedOut: 0, verificationFailed: 0, rejectedAfterVerification: 0, matched: 4, returned: 4 });
assert.deepEqual(result.errors, []);

console.log('Public ATS discovery tests passed.');

const previousSources = process.env.CONCIERGE_PUBLIC_ATS_SOURCES;
process.env.CONCIERGE_PUBLIC_ATS_SOURCES = '[]';
let responseStatus = 0;
let responseBody;
const response = {
  setHeader() {},
  status(code) { responseStatus = code; return this; },
  json(body) { responseBody = body; return this; },
  end() { return this; },
};
await discoveryHandler({ method: 'POST', headers: { origin: 'http://127.0.0.1:4175', 'content-type': 'application/json' }, body: { mission: {} }, socket: {} }, response);
assert.equal(responseStatus, 200);
assert.equal(responseBody.status, 'sources-not-configured');
assert.equal(responseBody.submissionsEnabled, false);
if (previousSources === undefined) delete process.env.CONCIERGE_PUBLIC_ATS_SOURCES;
else process.env.CONCIERGE_PUBLIC_ATS_SOURCES = previousSources;
