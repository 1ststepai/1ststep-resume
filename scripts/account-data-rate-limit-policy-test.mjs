import assert from 'node:assert/strict';
import { accountDataRateLimitPolicy } from '../api/account-data.js';

const create = accountDataRateLimitPolicy({ method: 'POST', query: {} });
const status = accountDataRateLimitPolicy({ method: 'GET', query: { taskId: 'account_export_fixture' } });
const download = accountDataRateLimitPolicy({ method: 'GET', query: { taskId: 'account_export_fixture', download: '1' } });
const legacy = accountDataRateLimitPolicy({ method: 'GET', query: {} });
const deletion = accountDataRateLimitPolicy({ method: 'DELETE', query: {} });

assert.equal(create.scope, 'account-data:export-create');
assert.equal(status.scope, 'account-data:export-status');
assert.equal(download.scope, 'account-data:export-download');
assert.equal(legacy.scope, 'account-data:legacy-export');
assert.equal(deletion.scope, 'account-data:delete');
assert.ok(status.accountRule.limit >= 90, 'One UI polling window must not exhaust its own account limit.');
assert.ok(status.ipRule.limit >= 90, 'One UI polling window must not exhaust its own IP limit.');
assert.ok(create.accountRule.limit < status.accountRule.limit, 'Creating exports must remain more constrained than checking status.');
assert.ok(download.accountRule.limit < status.accountRule.limit, 'Downloading exports must remain more constrained than checking status.');
assert.notEqual(create.scope, deletion.scope);

console.log('Operation-specific account export creation, polling, download, legacy, and deletion rate-limit policy tests passed.');
