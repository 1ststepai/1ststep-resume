import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { runStagingCapacityProbe, validateStagingTarget } from './staging-capacity-probe.mjs';

assert.throws(() => validateStagingTarget('https://app.1ststep.ai'), /Production targets are forbidden/);
assert.throws(() => validateStagingTarget('https://preview.example.test'), /Vercel Preview/);
assert.throws(() => validateStagingTarget('https://user:secret@example.vercel.app'), /origin only/);

let active = 0;
let maximumActive = 0;
const server = createServer((_request, response) => {
  active += 1;
  maximumActive = Math.max(maximumActive, active);
  setTimeout(() => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ignored":"body"}');
    active -= 1;
  }, 10);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const { port } = server.address();
try {
  const result = await runStagingCapacityProbe({
    baseUrl: `http://127.0.0.1:${port}`, allowLocal: true,
    requests: 8, concurrency: 3, maximumP95Ms: 1_000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.requests, 8);
  assert.equal(result.concurrency, 3);
  assert.deepEqual(result.statusHistogram, { 200: 8 });
  assert.equal(result.responseBodiesRead, false);
  assert.equal(result.containsCandidateValues, false);
  assert.ok(maximumActive <= 3 && maximumActive >= 2);

  const failed = await runStagingCapacityProbe({
    baseUrl: `http://127.0.0.1:${port}`, allowLocal: true,
    requests: 2, concurrency: 1, expectedStatus: 204,
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.unexpectedResponses, 2);
  await assert.rejects(() => runStagingCapacityProbe({ baseUrl: `http://127.0.0.1:${port}`, allowLocal: true, path: '/api/private' }), /allowlist/);
  await assert.rejects(() => runStagingCapacityProbe({ baseUrl: `http://127.0.0.1:${port}`, allowLocal: true, requests: 26 }), /1-25/);
  await assert.rejects(() => runStagingCapacityProbe({ baseUrl: `http://127.0.0.1:${port}`, allowLocal: true, concurrency: 6 }), /1-5/);
} finally {
  server.close();
  await once(server, 'close');
}

console.log('Bounded content-free staging capacity probe safety, concurrency, status, and latency tests passed.');
