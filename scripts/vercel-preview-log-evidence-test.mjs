import assert from 'node:assert/strict';
import {
  collectPreviewLogEvidence,
  parseLogJsonLines,
  summarizePreviewLogs,
  validatePreviewDeployment,
} from './vercel-preview-log-evidence.mjs';

const deploymentId = 'dpl_12345678901234567890';
const expectedProject = '1ststep-resume';
const deployment = {
  id: deploymentId,
  name: expectedProject,
  target: 'preview',
  readyState: 'READY',
  url: 'first-step-preview.vercel.app',
};
assert.equal(validatePreviewDeployment(deployment, { deploymentId, expectedProject }), true);

const records = [
  { deploymentId, environment: 'preview', requestMethod: 'GET', requestPath: '/api/health/live', responseStatusCode: 200, message: '', logs: [] },
  { deploymentId, environment: 'preview', requestMethod: 'GET', requestPath: '/api/health/ready', responseStatusCode: 503, message: '', logs: [] },
  { deploymentId, environment: 'preview', requestMethod: 'GET', requestPath: '/api/app-config', responseStatusCode: 200, message: '', logs: [] },
  { deploymentId, environment: 'preview', requestMethod: 'GET', requestPath: '/api/concierge-preview-smoke', responseStatusCode: 200, message: '', logs: [] },
  { deploymentId, environment: 'preview', requestMethod: 'POST', requestPath: '/api/private', responseStatusCode: 401, message: 'discard me', logs: [] },
  { deploymentId: 'dpl_00000000000000000000', environment: 'preview', requestMethod: 'GET', requestPath: '/api/health/live', responseStatusCode: 200, message: 'other deployment', logs: [] },
];
const summary = summarizePreviewLogs(records, { deploymentId });
assert.equal(summary.ok, true);
assert.equal(summary.qualifyingRecords, 4);
assert.equal(summary.discardedNonAllowlistedRecords, 1);
assert.deepEqual(summary.routes['/api/health/live'].statusHistogram, { 200: 1 });
assert.deepEqual(summary.routes['/api/health/ready'].statusHistogram, { 503: 1 });
assert.equal(summary.rawMessagesEmitted, false);
assert.equal(summary.rawLogsRetained, false);
assert.equal(summary.unexpectedStatusRecords, 0);
assert.deepEqual(summary.missingRoutes, []);

assert.equal(summarizePreviewLogs([
  { deploymentId, environment: 'preview', requestMethod: 'GET', requestPath: '/api/health/live', responseStatusCode: 200, message: 'unexpected', logs: [] },
], { deploymentId }).ok, false);

const unsettled = summarizePreviewLogs(records.map((record) => (
  record.requestPath === '/api/health/live' ? { ...record, responseStatusCode: 0 } : record
)), { deploymentId });
assert.equal(unsettled.ok, false);
assert.equal(unsettled.unexpectedStatusRecords, 1);
assert.deepEqual(unsettled.routes['/api/health/live'].statusHistogram, { unknown: 1 });

const missing = summarizePreviewLogs(records.filter((record) => record.requestPath !== '/api/app-config'), { deploymentId });
assert.equal(missing.ok, false);
assert.deepEqual(missing.missingRoutes, ['/api/app-config']);

assert.deepEqual(parseLogJsonLines('progress\n{"requestPath":"/api/health/live"}\n'), [{ requestPath: '/api/health/live' }]);
assert.throws(() => parseLogJsonLines('{bad json}'), /malformed JSON/i);
assert.throws(() => validatePreviewDeployment({ ...deployment, target: 'production' }, { deploymentId, expectedProject }), /restricted to Vercel Preview/i);
assert.throws(() => validatePreviewDeployment({ ...deployment, readyState: 'ERROR' }, { deploymentId, expectedProject }), /not READY/i);

let calls = 0;
const collected = collectPreviewLogEvidence(
  { deploymentId, expectedProject, since: '10m', limit: 10 },
  (args) => {
    calls += 1;
    if (args.includes('inspect')) return JSON.stringify(deployment);
    return records.map((record) => JSON.stringify(record)).join('\n');
  },
);
assert.equal(calls, 2);
assert.equal(collected.ok, true);

console.log('Preview log evidence verified exact Preview identity and content-free allowlisted route/status aggregation.');
