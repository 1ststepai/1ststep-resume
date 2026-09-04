import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyLiveJobAgentAssetParity } from '../lib/live-job-agent-asset-parity.js';

const directory = await mkdtemp(path.join(os.tmpdir(), 'job-agent-asset-parity-'));
const files = {
  'concierge.html': '<!doctype html><title>Candidate concierge</title>',
  'concierge.js': 'export const candidate = true;\n',
  'persistent-concierge.css': ':root { color-scheme: dark; }\n',
};

try {
  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(path.join(directory, name), content)));
  const byRoute = {
    '/concierge': files['concierge.html'],
    '/concierge.html': files['concierge.html'],
    '/concierge.js': files['concierge.js'],
    '/persistent-concierge.css': files['persistent-concierge.css'],
  };
  const matchingFetch = async url => {
    const route = new URL(url).pathname;
    return new Response(byRoute[route], { status: 200 });
  };

  let result = await verifyLiveJobAgentAssetParity({
    baseUrl: 'https://candidate.example.test', candidateDir: directory, fetchImpl: matchingFetch,
  });
  assert.equal(result.ok, true);
  assert.equal(result.contentFree, true);
  assert.equal(result.containsCandidateValues, false);
  assert.equal(result.performsWrites, false);
  assert.equal(result.routes['/concierge'].sha256, result.candidates['concierge.html'].sha256);
  assert.equal(JSON.stringify(result).includes('Candidate concierge'), false, 'Asset bodies must not be retained');

  const staleFetch = async url => {
    const route = new URL(url).pathname;
    return new Response(route === '/concierge.js' ? 'export const candidate = false;\n' : byRoute[route], { status: 200 });
  };
  result = await verifyLiveJobAgentAssetParity({
    baseUrl: 'https://candidate.example.test', candidateDir: directory, fetchImpl: staleFetch,
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('/concierge.js:ASSET_HASH_MISMATCH'));
  assert.equal(result.issues.some(issue => issue.includes('/concierge.html')), false);

  const unavailableFetch = async url => {
    if (new URL(url).pathname === '/persistent-concierge.css') throw new Error('offline');
    return matchingFetch(url);
  };
  result = await verifyLiveJobAgentAssetParity({
    baseUrl: 'https://candidate.example.test', candidateDir: directory, fetchImpl: unavailableFetch,
  });
  assert.ok(result.issues.includes('/persistent-concierge.css:UNREACHABLE'));
  await assert.rejects(
    () => verifyLiveJobAgentAssetParity({ baseUrl: 'http://candidate.example.test', candidateDir: directory, fetchImpl: matchingFetch }),
    /HTTPS origin/,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('Live Job Agent asset parity tests passed.');
