import assert from 'node:assert/strict';
import { bindPackageToFreshVerifiedDiscovery, bindPackageToVerifiedDiscovery } from '../lib/discovery-package-binding.js';
import { normalizePublicPostings } from '../lib/public-ats-discovery.js';

const now = new Date('2026-08-30T12:00:00.000Z');
const job = { employer: 'Verified Employer', title: 'Procurement Manager', requisitionId: 'REQ-42', applyUrl: 'https://jobs.example.test/roles/REQ-42', description: 'A'.repeat(500), applyPathVerified: true, applyPathVerifiedAt: '2026-08-30T11:00:00.000Z' };
const run = { id: 'run_discovery_verified_1', taskType: 'direct_employer_discovery', status: 'Finished', result: { authority: 'published-direct-employer-ats-feed', jobs: [job] } };
const requested = { roleId: 'role_1', discoveryRunId: run.id, employer: job.employer, title: job.title, requisitionId: job.requisitionId, directEmployerUrl: job.applyUrl, jobDescription: 'browser-tampered job text', applyPathActive: false, resumeText: 'R'.repeat(500), includeCoverLetter: true };
const bound = bindPackageToVerifiedDiscovery(run, requested, { now });
assert.equal(bound.discoveryRunId, run.id);
assert.equal(bound.applyPathActive, true);
assert.equal(bound.applyPathVerifiedAt, job.applyPathVerifiedAt);
assert.equal(bound.jobDescription, job.description);
assert.notEqual(bound.jobDescription, requested.jobDescription);
assert.equal(bound.resumeText, requested.resumeText);
assert.throws(() => bindPackageToVerifiedDiscovery({ ...run, status: 'Searching' }, requested), /finished tenant-owned/);
assert.throws(() => bindPackageToVerifiedDiscovery(run, { ...requested, requisitionId: 'REQ-TAMPERED' }), /exactly matches/);
assert.throws(() => bindPackageToVerifiedDiscovery(run, { ...requested, directEmployerUrl: 'https://evil.example.test/REQ-42' }), /exactly matches/);
assert.throws(() => bindPackageToVerifiedDiscovery({ ...run, result: { ...run.result, authority: 'client-claim' } }, requested), /finished tenant-owned/);
assert.throws(() => bindPackageToVerifiedDiscovery({ ...run, result: { ...run.result, jobs: [{ ...job, applyPathVerified: false }] } }, requested, { now }), /must be reverified/);
assert.throws(() => bindPackageToVerifiedDiscovery({ ...run, result: { ...run.result, jobs: [{ ...job, applyPathVerifiedAt: '2026-08-28T11:00:00.000Z' }] } }, requested, { now }), /within 24 hours/);

const greenhouseSource = { provider: 'greenhouse', slug: 'fixtureco', employer: 'Fixture Co' };
const rawGreenhouse = { id: 42, title: 'Strategic Procurement Manager', absolute_url: 'https://boards.greenhouse.io/fixtureco/jobs/42', location: { name: 'Remote - United States' }, updated_at: '2026-08-27T12:00:00Z', content: '<p>Lead supplier sourcing. Salary $110,000 - $135,000.</p>' };
const currentGreenhouse = normalizePublicPostings(greenhouseSource, { jobs: [rawGreenhouse] })[0];
const staleGreenhouse = { ...currentGreenhouse, applyPathVerified: true, applyPathVerifiedAt: '2026-08-30T11:00:00.000Z' };
const staleRun = { id: 'run_discovery_stale_1', taskType: 'direct_employer_discovery', status: 'Finished', result: { authority: 'published-direct-employer-ats-feed', jobs: [staleGreenhouse] } };
const staleRequested = { ...requested, discoveryRunId: staleRun.id, employer: staleGreenhouse.employer, title: staleGreenhouse.title, requisitionId: staleGreenhouse.requisitionId, directEmployerUrl: staleGreenhouse.applyUrl };
const reverified = await bindPackageToFreshVerifiedDiscovery(staleRun, staleRequested, {
  sources: [greenhouseSource], now,
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => rawGreenhouse }),
});
assert.equal(reverified.applyPathVerifiedAt, now.toISOString());
assert.equal(reverified.directEmployerUrl, staleGreenhouse.applyUrl);
await assert.rejects(() => bindPackageToFreshVerifiedDiscovery(staleRun, staleRequested, {
  sources: [greenhouseSource], now,
  fetchImpl: async () => ({ ok: false, status: 404 }),
}), /requisition is closed/);
await assert.rejects(() => bindPackageToFreshVerifiedDiscovery(staleRun, staleRequested, {
  sources: [greenhouseSource], now,
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ...rawGreenhouse, title: 'Strategic Sourcing Director' }) }),
}), /requisition changed/);

console.log('Tenant discovery-to-package identity binding and exact-requisition freshness tests passed.');
