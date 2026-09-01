import assert from 'node:assert/strict';
import { refreshTenantJobCardFreshness } from '../lib/job-card-freshness-worker.js';

const source = { provider: 'greenhouse', slug: 'fixtureco', employer: 'Fixture Co' };
const card = (id, requisitionId, title, status = 'Verified') => ({
  id, employer: 'Fixture Co', title, status, requisitionId, sourceProvider: 'greenhouse',
  sourceUrl: `https://boards.greenhouse.io/fixtureco/jobs/${requisitionId}`,
  directEmployerUrl: `https://boards.greenhouse.io/fixtureco/jobs/${requisitionId}`,
  applyPathActive: true, salaryMin: null, salaryMax: null, employmentType: 'Unknown', updatedAt: '2026-08-29T12:00:00.000Z',
});
const state = {
  version: 1, campaigns: [], runs: [], items: [], humanActions: [], evidence: [], transitions: [],
  subscriberView: { version: 1, runState: 'Finished', jobCards: [
    card('card-open', '101', 'Procurement Manager'),
    card('card-closed', '102', 'Senior Buyer'),
    card('card-changed', '103', 'Sourcing Lead'),
    card('card-failure', '104', 'Category Manager'),
    card('card-submitted', '105', 'Submitted Manager', 'Receipt Verified'),
  ], needsYou: [] },
};
let savedState;
const result = await refreshTenantJobCardFreshness({
  tenantId: 'a'.repeat(40), dataEncryptionKey: {}, sources: [source], runId: 'run_freshness_fixture_001',
  now: new Date('2026-08-30T13:00:00.000Z'),
  readCampaign: async () => ({ state, version: 7, updatedAt: '2026-08-29T12:00:00.000Z' }),
  saveCampaign: async input => { savedState = input.state; assert.equal(input.expectedVersion, 7); assert.equal(input.idempotencyKey, 'freshness_run_freshness_fixture_001_7'); return { ok: true, version: 8 }; },
  fetchImpl: async url => {
    const id = url.match(/\/jobs\/(\d+)$/)?.[1];
    if (id === '102') return { ok: false, status: 404 };
    if (id === '104') return { ok: false, status: 503 };
    const titles = { '101': 'Procurement Manager', '103': 'Strategic Sourcing Director' };
    return { ok: true, status: 200, json: async () => ({ id: Number(id), title: titles[id], absolute_url: `https://boards.greenhouse.io/fixtureco/jobs/${id}`, location: { name: 'Remote - United States' }, content: '<p>Lead sourcing and supplier operations.</p>' }) };
  },
});
assert.deepEqual(result, { status: 'partial', checked: 4, open: 1, closed: 1, changed: 1, failures: 1, saved: true, conflict: false, contentFree: true, containsCandidateValues: false });
assert.equal(savedState.subscriberView.jobCards.find(item => item.id === 'card-open').status, 'Verified');
assert.equal(savedState.subscriberView.jobCards.find(item => item.id === 'card-closed').status, 'Rejected/Closed');
assert.equal(savedState.subscriberView.jobCards.find(item => item.id === 'card-changed').status, 'Rejected/Closed');
assert.equal(savedState.subscriberView.jobCards.find(item => item.id === 'card-failure').status, 'Verified');
assert.equal(savedState.subscriberView.jobCards.find(item => item.id === 'card-submitted').status, 'Receipt Verified');

const conflict = await refreshTenantJobCardFreshness({
  tenantId: 'a'.repeat(40), dataEncryptionKey: {}, sources: [source], runId: 'run_freshness_fixture_002', maxCards: 1,
  readCampaign: async () => ({ state, version: 9 }),
  saveCampaign: async () => ({ ok: false, conflict: true, version: 10 }),
  fetchImpl: async () => ({ ok: false, status: 404 }),
});
assert.equal(conflict.status, 'conflict');
assert.equal(conflict.saved, false);
assert.equal(conflict.conflict, true);

console.log('Bounded tenant job-card freshness, closure, change, failure isolation, and conflict tests passed.');
