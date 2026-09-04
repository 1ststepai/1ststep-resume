import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const buildCommand = process.platform === 'win32'
  ? { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'npx vercel build --prod --yes'] }
  : { command: 'npx', args: ['vercel', 'build', '--prod', '--yes'] };
const build = spawnSync(buildCommand.command, buildCommand.args, {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
  maxBuffer: 20 * 1024 * 1024,
});

if (build.status !== 0) {
  process.stderr.write(build.stdout || '');
  process.stderr.write(build.stderr || '');
  throw new Error(`Vercel production build failed with exit code ${build.status}: ${build.error?.message || 'unknown build error'}`);
}

const outputRoot = path.join(root, '.vercel', 'output');
const staticRoot = path.join(outputRoot, 'static');
const functionsRoot = path.join(outputRoot, 'functions', 'api');

async function filesUnder(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await filesUnder(path.join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files;
}

const staticFiles = new Set(await filesUnder(staticRoot));
const expectedStatic = [
  'index.html',
  'app.html',
  'concierge.html',
  'pricing.html',
  'terms.html',
  'privacy.html',
  'style.css',
  'home.css',
  'persistent-concierge.css',
  'product-choice.css',
  'app.js',
  'home.js',
  'concierge.js',
  'resume-builder.js',
  'client/concierge-router.js',
  'client/concierge-domain.js',
  'client/job-intelligence.js',
  'client/job-mission-relevance.js',
  'client/interview-practice.js',
  'client/opportunity-paths.js',
  'client/subscriber-ui-model.js',
  'client/persistent-campaign.js',
  'client/prohibited-secret.js',
  '1ststep-logo.png',
  '1ststep-ai-icon.png',
  'robots.txt',
];

for (const file of expectedStatic) {
  assert(staticFiles.has(file), `Expected public asset missing from Vercel output: ${file}`);
}

const forbiddenExact = [
  'lib/job-agent-spend-ledger.js',
  'lib/job-agent-policy-levels.js',
  'DESIGN.md',
  '.gitattributes',
];
for (const file of forbiddenExact) {
  assert(!staticFiles.has(file), `Internal source leaked into Vercel static output: ${file}`);
}

const forbiddenPrefixes = [
  'lib/',
  'api/',
  'scripts/',
  'docs/',
  'dist/',
  '1ststep-extension/',
  'test-results/',
  'artifacts/',
];
for (const file of staticFiles) {
  assert(!forbiddenPrefixes.some(prefix => file.startsWith(prefix)), `Forbidden static output: ${file}`);
  assert(!file.endsWith('.zip'), `Packaged archive leaked into static output: ${file}`);
}

for (const policyPage of ['terms.html', 'privacy.html']) {
  const [source, output] = await Promise.all([
    readFile(path.join(root, policyPage)),
    readFile(path.join(staticRoot, policyPage)),
  ]);
  assert(source.equals(output), `${policyPage} changed while preparing public output`);
}

async function functionDirsUnder(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relative = `${prefix}${entry.name}`;
    if (entry.name.endsWith('.func')) found.push(relative);
    else found.push(...await functionDirsUnder(path.join(directory, entry.name), `${relative}/`));
  }
  return found;
}
const functionNames = new Set(await functionDirsUnder(functionsRoot));
for (const requiredFunction of [
  'health.func',
  'app-config.func',
  'concierge-state.func',
  'job-agent-runs.func',
  'user-session.func',
  'health/live.func',
  'health/ready.func',
  'health/dependencies.func',
  'health/workers.func',
]) {
  assert(functionNames.has(requiredFunction), `Expected serverless API function missing: api/${requiredFunction}`);
}
assert.equal(functionNames.size, 41, `Unexpected API function count: ${functionNames.size}`);

const outputConfig = JSON.parse(await readFile(path.join(outputRoot, 'config.json'), 'utf8'));
const routeText = JSON.stringify(outputConfig.routes || []);
for (const route of ['/app', '/concierge', '/pricing', '/terms', '/privacy']) {
  assert(routeText.includes(route), `Expected route missing from Vercel output config: ${route}`);
}
assert(routeText.includes('/api'), 'Expected API function routing missing from Vercel output config');
assert(routeText.includes('middleware'), 'Expected forbidden-path middleware missing from Vercel output config');
const middlewareRoute = (outputConfig.routes || []).find(route => route.middlewarePath === 'middleware');
assert(middlewareRoute, 'Expected Vercel routing middleware entry is missing');
assert.notEqual(middlewareRoute.src, '^/.*$', 'Forbidden-path middleware must not intercept every route');
for (const routeToken of ['lib', 'scripts', 'docs', 'dist', '1ststep-extension', 'test-results', 'DESIGN', 'gitattributes']) {
  assert(middlewareRoute.src.includes(routeToken), `Compiled middleware matcher is missing ${routeToken}`);
}

const pageRoutes = new Map([
  ['/', 'index.html'],
  ['/app', 'concierge.html'],
  ['/app/resume', 'app.html'],
  ['/concierge', 'concierge.html'],
  ['/pricing', 'pricing.html'],
  ['/terms', 'terms.html'],
  ['/privacy', 'privacy.html'],
]);
const outputServer = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
  const relative = pageRoutes.get(pathname) || pathname.replace(/^\/+/, '');
  if (!staticFiles.has(relative)) {
    response.writeHead(404);
    return response.end('Not found');
  }
  response.writeHead(200);
  return response.end(await readFile(path.join(staticRoot, relative)));
});
await new Promise((resolve, reject) => {
  outputServer.once('error', reject);
  outputServer.listen(0, '127.0.0.1', resolve);
});
try {
  const address = outputServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  for (const route of [...pageRoutes.keys(), '/robots.txt', '/style.css', '/concierge.js', '/client/concierge-domain.js', '/1ststep-logo.png']) {
    assert.equal((await fetch(`${origin}${route}`)).status, 200, `Expected public route failed: ${route}`);
  }
  for (const route of [
    '/lib/job-agent-spend-ledger.js',
    '/lib/job-agent-policy-levels.js',
    '/DESIGN.md',
    '/.gitattributes',
    '/scripts/',
    '/docs/',
    '/dist/',
    '/dist/1ststep-job-agent-greenhouse-v1.3.0.zip',
    '/1ststep-extension/',
    '/test-results/',
  ]) {
    assert.equal((await fetch(`${origin}${route}`)).status, 404, `Internal path was unexpectedly public: ${route}`);
  }
} finally {
  await new Promise(resolve => outputServer.close(resolve));
}

console.log(`Vercel output boundary verified: ${staticFiles.size} intentional static files, ${functionNames.size} API functions, no internal-source or extension-package leaks.`);
