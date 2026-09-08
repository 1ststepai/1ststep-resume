import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { discoverPublicJobs, publicSourceUrl } from '../lib/public-ats-discovery.js';

// Synthetic dependencies only: this is a concurrency/failure regression, not
// evidence of Vercel, Redis, AI-provider, or 2,000-user production capacity.
const source = { provider: 'greenhouse', slug: 'fixtureco', employer: 'Fixture Co' };
const postings = Array.from({ length: 100 }, (_, index) => ({
  id: index + 1, title: `Procurement Manager ${index + 1}`,
  absolute_url: `https://boards.greenhouse.io/fixtureco/jobs/${index + 1}`,
  location: { name: 'Remote - United States' }, content: 'Manage vendor procurement.',
}));
let active = 0;
let peak = 0;
const complete = await discoverPublicJobs({
  sources: [source], limit: 100, runtime: { detailConcurrency: 4 },
  fetchImpl: async (url, { signal }) => {
    if (url === publicSourceUrl(source)) return { ok: true, json: async () => ({ jobs: postings }) };
    active += 1; peak = Math.max(peak, active);
    try {
      await delay(2, undefined, { signal });
      return { ok: true, json: async () => postings.find(job => url.endsWith(`/${job.id}`)) };
    } finally { active -= 1; }
  },
});
assert.equal(peak, 4);
assert.equal(active, 0);
assert.equal(complete.jobs.length, 100);
assert.equal(complete.partial, false);
assert.ok(complete.jobs.every(job => job.applyPathVerified));

let detailCalls = 0;
const started = Date.now();
const partial = await discoverPublicJobs({
  sources: [source], limit: 100,
  runtime: { detailConcurrency: 2, totalTimeoutMs: 1_000, detailTimeoutMs: 15_000 },
  fetchImpl: async (url, { signal }) => {
    if (url === publicSourceUrl(source)) return { ok: true, json: async () => ({ jobs: postings }) };
    detailCalls += 1;
    if (url.endsWith('/1')) return { ok: true, json: async () => postings[0] };
    await delay(10_000, undefined, { signal });
    throw new Error('A stalled dependency must be aborted');
  },
});
assert.ok(Date.now() - started < 3_000, 'The shared deadline must stop stalled requests');
assert.equal(detailCalls, 3, 'No new network requests after the deadline');
assert.equal(partial.deadlineReached, true);
assert.equal(partial.partial, true);
assert.equal(partial.jobs.length, 1, 'Retain only successfully verified results');
assert.equal(partial.filterSummary.verificationFailed, 99);
console.log('Discovery capacity regression passed: 100 verifications bounded to 4; stalled work cancelled; verified partial result retained. No external requests.');
