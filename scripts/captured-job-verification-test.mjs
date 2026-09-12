import assert from 'node:assert/strict';
import { identifyCapturedPublicJob, verifyCapturedPublicJob } from '../lib/captured-job-verification.js';

const source = { provider: 'lever', slug: 'exampleco', employer: 'Example Co' };
const captured = { applyUrl: 'https://jobs.lever.co/exampleco/abc-123', jobTitle: 'Invented browser title' };
assert.deepEqual(identifyCapturedPublicJob(captured, [source])?.job, {
  provider: 'lever', employer: 'Example Co', requisitionId: 'abc-123',
  jobUrl: 'https://jobs.lever.co/exampleco/abc-123', applyUrl: 'https://jobs.lever.co/exampleco/abc-123',
});
assert.equal(identifyCapturedPublicJob({ applyUrl: 'https://jobs.example.com/123' }, [source]), null);
assert.equal(identifyCapturedPublicJob(captured, []), null, 'unknown boards must not be promoted');

const open = await verifyCapturedPublicJob({
  job: captured, sources: [source], now: new Date('2026-09-09T12:00:00.000Z'),
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({
    id: 'abc-123', text: 'Operations Manager', hostedUrl: captured.applyUrl, applyUrl: captured.applyUrl,
    descriptionPlain: 'Current published employer description. '.repeat(12), categories: { location: 'Remote', commitment: 'Full-time' },
  }) }),
});
assert.equal(open.status, 'verified');
assert.equal(open.job.title, 'Operations Manager', 'server-published identity must replace browser text');
assert.equal(open.job.applyPathVerified, true);
const closed = await verifyCapturedPublicJob({ job: captured, sources: [source], fetchImpl: async () => ({ ok: false, status: 404 }) });
assert.equal(closed.status, 'closed');
const unknown = await verifyCapturedPublicJob({ job: { applyUrl: 'https://careers.example.com/job/1' }, sources: [source] });
assert.equal(unknown.status, 'unverified');
console.log('Captured public-job identification, authoritative refresh, closed-role, and fail-closed tests passed.');
