import assert from 'node:assert/strict';
import { checkBackgroundPackage, backgroundPackageFailure } from '../lib/background-package-check.js';
const claimed = { tenantId: 'a'.repeat(40), run: { mission: { discoveryRunId: 'run_source', roleId: 'role_1' } } };
const discovery = { id: 'run_source' };
let bound = 0;
await checkBackgroundPackage({ claimed, sources: [], readRun: async input => {
  assert.equal(input.tenantId, claimed.tenantId);
  assert.equal(input.runId, 'run_source');
  return discovery;
}, bind: async (source, mission) => {
  assert.equal(source, discovery); assert.equal(mission, claimed.run.mission); bound++;
} });
assert.equal(bound, 1);
await assert.rejects(checkBackgroundPackage({ claimed, readRun: async () => null, bind: async () => assert.fail('Missing history must block generation') }), /PACKAGE_DISCOVERY_UNAVAILABLE/);
await checkBackgroundPackage({ claimed: { ...claimed, run: { mission: { revision: {} } } }, readRun: async () => assert.fail('Private edits must not need employer requests') });
for (const [message, code, retryable] of [
  ['The exact direct-employer requisition is closed.', 'DIRECT_EMPLOYER_REQUISITION_CLOSED', false],
  ['The direct-employer requisition changed.', 'DIRECT_EMPLOYER_REQUISITION_CHANGED', false],
  ['PACKAGE_DISCOVERY_UNAVAILABLE', 'PACKAGE_DISCOVERY_UNAVAILABLE', false],
  ['Network timeout', 'DIRECT_EMPLOYER_REVERIFICATION_UNAVAILABLE', true],
]) assert.deepEqual(backgroundPackageFailure(new Error(message)), { code, retryable });
console.log('Background draft checks preserve tenant ownership, reject missing history, and stop closed/changed jobs.');
