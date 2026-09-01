import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ASSETS = Object.freeze([
  { file: 'concierge.html', routes: ['/concierge', '/concierge.html'] },
  { file: 'concierge.js', routes: ['/concierge.js'] },
  { file: 'persistent-concierge.css', routes: ['/persistent-concierge.css'] },
]);

function safeBaseUrl(value) {
  const url = new URL(String(value || 'https://app.1ststep.ai'));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Live asset URL must be an HTTPS origin without credentials, path, query, or fragment.');
  }
  return url.origin;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function getAsset(fetchImpl, origin, route) {
  const response = await fetchImpl(`${origin}${route}`, {
    method: 'GET',
    redirect: 'error',
    cache: 'no-store',
    headers: { Accept: '*/*', Origin: origin, 'Cache-Control': 'no-cache' },
  });
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, bytes: body.length, sha256: sha256(body) };
}

export async function verifyLiveJobAgentAssetParity({
  baseUrl = 'https://app.1ststep.ai',
  candidateDir = process.cwd(),
  fetchImpl = fetch,
  readFileImpl = readFile,
} = {}) {
  const origin = safeBaseUrl(baseUrl);
  const root = path.resolve(candidateDir);
  const routes = {};
  const candidates = {};
  const issues = [];

  for (const asset of ASSETS) {
    let candidate;
    try {
      candidate = Buffer.from(await readFileImpl(path.join(root, asset.file)));
      candidates[asset.file] = { bytes: candidate.length, sha256: sha256(candidate) };
    } catch {
      candidates[asset.file] = { bytes: 0, sha256: null };
      issues.push(`CANDIDATE_${asset.file.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_UNREADABLE`);
      continue;
    }

    for (const route of asset.routes) {
      try {
        const live = await getAsset(fetchImpl, origin, route);
        routes[route] = live;
        if (live.status !== 200) issues.push(`${route}:STATUS_${live.status}`);
        else if (live.sha256 !== candidates[asset.file].sha256) issues.push(`${route}:ASSET_HASH_MISMATCH`);
      } catch {
        routes[route] = { status: null, bytes: 0, sha256: null };
        issues.push(`${route}:UNREACHABLE`);
      }
    }
  }

  return {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    origin,
    ok: issues.length === 0,
    contentFree: true,
    containsCandidateValues: false,
    performsWrites: false,
    performsExternalApplicationActions: false,
    candidates,
    routes,
    issues,
  };
}
