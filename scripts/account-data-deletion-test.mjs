import assert from 'node:assert/strict';
import { deleteTenantJobAgentOperationalData } from '../lib/account-data-deletion.js';

const config = { redis: {}, partitionSecret: 'account-delete-partition'.padEnd(48, 'x'), objectStorage: { ready: true } };
const subject = 'candidate@example.test';

function fixture({ failAt = '' } = {}) {
  const calls = [];
  const operation = (name, result) => async input => {
    calls.push({ name, input });
    if (name === failAt) throw new Error(`fixture-${name}-failed`);
    return result;
  };
  return {
    calls,
    operations: {
      deleteAccountExports: operation('accountExports', { deleted: 1, deletedObjects: 1 }),
      deleteArtifacts: operation('artifacts', { deleted: 3 }),
      deleteFollowUps: operation('followUps', { deleted: 2 }),
      deleteRuns: operation('runs', { deleted: 4 }),
      deleteSessions: operation('sessions', { deleted: 5 }),
      deleteBrowserTasks: operation('browserTasks', { deleted: 6 }),
      deleteSubmissionTasks: operation('submissionTasks', { deleted: 7 }),
      deleteReceiptTasks: operation('receiptTasks', { deleted: 8 }),
      deleteVault: operation('vault', { deleted: true }),
      deleteLearning: operation('learning', { deleted: true }),
      deleteCampaign: operation('campaign', { deleted: true }),
      deleteConsent: operation('consent', { deleted: true }),
      deleteSchedule: operation('schedule', { deleted: true }),
      deleteNotifications: operation('notifications', { deleted: true, auxiliaryRecordsDeleted: 3 }),
      deleteResidualKeys: operation('residualKeys', { deleted: 6 }),
    },
  };
}

let current = fixture();
const result = await deleteTenantJobAgentOperationalData({ config, subject, operations: current.operations });
assert.equal(result.artifacts.deleted, 3);
assert.equal(result.accountExports.deleted, 1);
assert.equal(result.followUps.deleted, 2);
assert.equal(result.sessions.deleted, 5);
assert.equal(result.vault.deleted, true);
assert.equal(result.learning.deleted, true);
assert.equal(result.campaign.deleted, true);
assert.equal(result.consent.deleted, true);
assert.equal(result.schedule.deleted, true);
assert.deepEqual(result.notifications, { deleted: true, auxiliaryRecordsDeleted: 3 });
assert.equal(result.residualKeys.deleted, 6);
assert.equal(current.calls[0].name, 'accountExports');
assert.equal(current.calls[1].name, 'artifacts');
assert.equal(current.calls[2].name, 'followUps');
assert.equal(current.calls.at(-1).name, 'residualKeys');
assert.match(result.tenantId, /^[a-f0-9]{40}$/);
assert.ok(current.calls.every(call => !JSON.stringify(call.input).includes('password')));

current = fixture({ failAt: 'artifacts' });
await assert.rejects(() => deleteTenantJobAgentOperationalData({ config, subject, operations: current.operations }), /fixture-artifacts-failed/);
assert.deepEqual(current.calls.map(call => call.name), ['accountExports', 'artifacts']);

current = fixture({ failAt: 'followUps' });
await assert.rejects(() => deleteTenantJobAgentOperationalData({ config, subject, operations: current.operations }), /fixture-followUps-failed/);
assert.deepEqual(current.calls.map(call => call.name), ['accountExports', 'artifacts', 'followUps']);

current = fixture({ failAt: 'sessions' });
await assert.rejects(() => deleteTenantJobAgentOperationalData({ config, subject, operations: current.operations }), /fixture-sessions-failed/);
assert.equal(current.calls.some(call => call.name === 'residualKeys'), false);

console.log('Ordered tenant deletion, provider-first failure containment, orphan cleanup, and final residual sweep tests passed.');
