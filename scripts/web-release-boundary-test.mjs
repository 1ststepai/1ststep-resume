import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import middleware, { config as middlewareConfig } from '../middleware.js';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const vercelJson = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
const vercelIgnore = await readFile(new URL('.vercelignore', root), 'utf8');
const rules = vercelIgnore
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#'));

const robotsIgnoreIndex = rules.indexOf('*.txt');
const robotsAllowIndex = rules.indexOf('!robots.txt');
assert(robotsIgnoreIndex >= 0, 'Broad text-file exclusion must remain explicit');
assert(robotsAllowIndex > robotsIgnoreIndex, 'robots.txt must be explicitly restored after the broad text-file exclusion');

function excludedByDirectoryRule(path) {
  return rules
    .filter(rule => rule.endsWith('/'))
    .some(rule => path === rule.slice(0, -1) || path.startsWith(rule));
}

for (const path of [
  '1ststep-extension/content.js',
  '1ststep-extension/manifest.json',
  'dist/1ststep-job-agent-greenhouse-v1.2.0.zip',
  'artifacts/controlled-extension/RELEASE-INTEGRITY.json',
]) {
  assert.equal(excludedByDirectoryRule(path), true, `${path} must be excluded from the Vercel web release`);
}

const scripts = packageJson.scripts || {};
assert.equal(vercelJson.outputDirectory, '.public-web');
assert.equal(scripts.build, 'npm run build:web');
assert.equal(scripts['build:web'], 'node build-public-web.mjs');
assert.match(String(scripts['test:web-release'] || ''), /test:concierge/);
assert.match(String(scripts['test:web-release'] || ''), /smoke/);
assert.match(String(scripts['test:web-release'] || ''), /test:deployment-output/);
assert.match(String(scripts['pretest:concierge'] || ''), /web-release-boundary-test/);
assert.doesNotMatch(String(scripts['pretest:concierge'] || ''), /controlled-extension-release-test/);
assert.doesNotMatch(String(scripts['test:concierge'] || ''), /extension-security-test/);

const forbiddenMatchers = new Set(middlewareConfig.matcher);
for (const matcher of [
  '/lib/:path*', '/scripts/:path*', '/docs/:path*', '/dist/:path*',
  '/1ststep-extension/:path*', '/test-results/:path*', '/DESIGN.md', '/.gitattributes',
]) {
  assert(forbiddenMatchers.has(matcher), `Forbidden-path middleware matcher missing: ${matcher}`);
}
for (const pathname of [
  '/lib/job-agent-spend-ledger.js',
  '/lib/job-agent-policy-levels.js',
  '/DESIGN.md',
  '/.gitattributes',
  '/scripts/',
  '/docs/',
  '/dist/',
  '/1ststep-extension/',
  '/test-results/',
  '/dist/1ststep-job-agent-greenhouse-v1.2.0.zip',
]) {
  const response = middleware(new Request(`https://preview.example.test${pathname}`));
  assert.equal(response.status, 404, `Forbidden path must return a non-200 response: ${pathname}`);
  assert.equal(await response.text(), 'Not found', `Forbidden path must use the generic response: ${pathname}`);
}
assert(!middlewareConfig.matcher.some(matcher => matcher.startsWith('/api')), 'API routes must not be intercepted');
assert(!middlewareConfig.matcher.some(matcher => matcher.startsWith('/client')), 'Client-safe modules must not be intercepted');

assert.match(String(scripts['test:extension-release'] || ''), /extension-security-test/);
assert.match(String(scripts['test:extension-release'] || ''), /controlled-extension-release-test/);
assert.equal(scripts['prebuild:extension:controlled'], 'npm run test:extension-release');
assert.equal(scripts['build:extension:controlled'], 'node scripts/build-controlled-extension.mjs');

const builder = await readFile(new URL('scripts/build-controlled-extension.mjs', root), 'utf8');
assert.match(builder, /archiveDigest !== CONTROLLED_GREENHOUSE_EXTENSION_SHA256/);
assert.match(builder, /throw new Error\(`Controlled extension release artifact changed/);
assert.doesNotMatch(builder, /SKIP|BYPASS|ALLOW_UNREVIEWED/i);

const publicBuilder = await readFile(new URL('build-public-web.mjs', root), 'utf8');
assert.match(publicBuilder, /const publicAssets = \[/);
assert.doesNotMatch(publicBuilder, /['"]lib\//);
assert.doesNotMatch(publicBuilder, /readdir|cp\(.+recursive|copy.+recursive/i);

console.log('Web release emits an explicit public asset set and excludes internal/extension artifacts; extension release remains separately pinned and fail-closed.');
