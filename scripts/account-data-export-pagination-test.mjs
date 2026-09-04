import assert from 'node:assert/strict';
import { buildAccountDataExport, collectCompleteAccountCollection } from '../lib/account-data-lifecycle.js';
import { readBoundedTenantIndexPage } from '../lib/tenant-index-pagination.js';

class FakeRedis {
  constructor(ids) { this.ids = [...ids]; }
  async zrange(_key, start, end, options = {}) {
    const values = options?.rev ? [...this.ids].reverse() : this.ids;
    return values.slice(Number(start), Number(end) + 1);
  }
  async zcard() { return this.ids.length; }
}

const redis = new FakeRedis(Array.from({ length: 503 }, (_, index) => `id_${String(index).padStart(4, '0')}`));
const firstPage = await readBoundedTenantIndexPage({ redis, indexKey: 'tenant-index', offset: 250, limit: 250, includeTotal: true });
assert.equal(firstPage.scanned, 250);
assert.equal(firstPage.total, 503);
assert.equal(firstPage.ids[0], 'id_0250');
await assert.rejects(() => readBoundedTenantIndexPage({ redis, indexKey: 'tenant-index', offset: 20_001, limit: 1 }), /offset is invalid/);

const complete = await collectCompleteAccountCollection({
  pageSize: 250,
  readPage: async ({ offset, limit }) => {
    const page = await readBoundedTenantIndexPage({ redis, indexKey: 'tenant-index', offset, limit, includeTotal: true });
    return {
      items: page.ids.filter(id => id !== 'id_0250').map(id => ({ id })),
      scanned: page.scanned, offset: page.offset, limit: page.limit, total: page.total,
    };
  },
});
assert.equal(complete.complete, true);
assert.equal(complete.pages, 3);
assert.equal(complete.indexRecordsScanned, 503);
assert.equal(complete.recordsExported, 502);
assert.equal(complete.staleIndexEntries, 1);
assert.equal(complete.items.at(-1).id, 'id_0502', 'a stale record in page two must not truncate page three');

let calls = 0;
await assert.rejects(() => collectCompleteAccountCollection({
  readPage: async ({ offset, limit }) => {
    calls += 1;
    return { items: [{ id: `id_${offset}` }], scanned: 1, offset, limit, total: calls === 1 ? 2 : 3 };
  },
}), error => error?.code === 'ACCOUNT_EXPORT_COLLECTION_INCOMPLETE');

await assert.rejects(() => collectCompleteAccountCollection({
  maximumRecords: 500,
  readPage: async ({ offset, limit }) => ({ items: [], scanned: 0, offset, limit, total: 501 }),
}), error => error?.code === 'ACCOUNT_EXPORT_COLLECTION_INCOMPLETE');

await assert.rejects(() => collectCompleteAccountCollection({
  readPage: async ({ offset, limit }) => ({ items: [{ id: 'same_id' }, { id: 'same_id' }], scanned: 2, offset, limit, total: 2 }),
}), error => error?.code === 'ACCOUNT_EXPORT_COLLECTION_INCOMPLETE');

const exported = buildAccountDataExport({
  subject: 'candidate@example.test',
  collectionCompleteness: { complete: true, maximumRecordsPerCollection: 10_000, collections: { jobAgentRuns: { complete: true, recordsExported: 502 } } },
});
assert.equal(exported.scope.operationalCollectionsComplete, true);
assert.equal(exported.scope.collectionCompleteness.collections.jobAgentRuns.recordsExported, 502);

console.log('Complete paginated account export, stale-index continuation, mutation detection, hard limit, and no-partial-result tests passed.');
await import('./account-data-export-task-test.mjs');
await import('./account-data-rate-limit-policy-test.mjs');
