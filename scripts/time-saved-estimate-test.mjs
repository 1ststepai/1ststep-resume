import assert from 'node:assert/strict';
import { estimateJobAgentTimeSaved, formatTimeSaved, TIME_SAVED_BASELINES, TIME_SAVED_MODEL_VERSION } from '../client/subscriber-ui-model.js';

const now = new Date('2026-09-08T20:00:00.000Z');
const role = {
  id: 'role-time-1', packageRunId: 'package-time-1', employer: 'Synthetic Employer', title: 'Sourcing Lead',
  requisitionId: 'REQ-TIME-1', directEmployerUrl: 'https://careers.example.com/REQ-TIME-1',
  sourceType: 'direct-employer', discoveryRunId: 'run-time-1', applyPathActive: true, status: 'Package Ready',
  createdAt: '2026-09-08T18:50:00.000Z', updatedAt: '2026-09-08T19:10:00.000Z',
  packageDraft: { generatedAt: '2026-09-08T19:05:00.000Z' },
  receipt: { confirmationId: 'EMP-TIME-1', receivedAt: '2026-09-08T19:25:00.000Z' },
};
const duplicateProjection = { ...role, id: 'role-time-duplicate' };
const session = {
  id: 'session-time-1', packageRunId: 'package-time-1', updatedAt: '2026-09-08T19:25:00.000Z',
  workerExecution: { status: 'completed', stagedFieldKeys: ['email', 'firstName', 'lastName'], completedAt: '2026-09-08T19:20:00.000Z' },
  receipt: { confirmationId: 'EMP-TIME-1', receivedAt: '2026-09-08T19:25:00.000Z' },
};
const run = {
  id: 'run-time-1', status: 'Finished', taskType: 'direct_employer_discovery',
  result: { completedAt: '2026-09-08T19:30:00.000Z', sourceSummary: [{ provider: 'greenhouse', status: 'ok' }] },
};

const estimate = estimateJobAgentTimeSaved({
  roles: [role, duplicateProjection], applicationSessions: [session], run, now,
  sessionStartedAt: new Date('2026-09-08T19:00:00.000Z'),
});
assert.equal(estimate.totalMinutes, 40);
assert.equal(estimate.modelVersion, TIME_SAVED_MODEL_VERSION);
assert.equal(estimate.lastSevenDaysMinutes, 40);
assert.equal(estimate.sessionMinutes, 38);
assert.equal(estimate.completedEventCount, 6);
assert.deepEqual(estimate.breakdown.map(item => [item.label, item.minutes]), [
  ['Application packages prepared', 20],
  ['Direct-employer search completed', 10],
  ['Employer listings verified', 3],
  ['Routine form fields completed', 3],
  ['Employer confirmations tracked', 2],
  ['Jobs captured and organized', 2],
]);

const noCredit = estimateJobAgentTimeSaved({
  roles: [{ id: 'failed', status: 'Found', directEmployerUrl: '', packageRunStatus: 'Failed' }],
  applicationSessions: [{ id: 'unknown', workerExecution: { status: 'outcome-unknown', stagedFieldKeys: ['email'] } }],
  run: { status: 'Failed', taskType: 'direct_employer_discovery', result: { sourceSummary: [{ provider: 'lever' }] } },
  now,
});
assert.equal(noCredit.totalMinutes, 0);
assert.equal(noCredit.completedEventCount, 0);
assert.equal(formatTimeSaved(0), '0 min');
assert.equal(formatTimeSaved(60), '1 hr');
assert.equal(formatTimeSaved(125), '2 hrs 5 min');
assert.equal(TIME_SAVED_BASELINES.preparedPackage, 20);

console.log('time-saved estimate tests passed');
