import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputRoot = path.join(root, '.vercel', 'output');
const staticRoot = path.join(outputRoot, 'static');
const functionsRoot = path.join(outputRoot, 'functions', 'api');

function normalize(value) {
  return value.split(path.sep).join('/');
}

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

const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/)
  .map(line => normalize(line.trim()))
  .filter(Boolean);

const required = new Set(await filesUnder(staticRoot));
const functionEntries = (await readdir(functionsRoot, { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && entry.name.endsWith('.func'));

for (const entry of functionEntries) {
  required.add(`api/${entry.name.slice(0, -5)}.js`);
  for (const file of await filesUnder(path.join(functionsRoot, entry.name))) {
    if (file.startsWith('lib/') || file.startsWith('client/')) required.add(file);
  }
}

for (const releaseInput of ['.vercelignore', 'build-public-web.mjs', 'package-lock.json']) {
  required.add(releaseInput);
}

const generatedPrefixes = ['artifacts/', 'test-results/', 'sandbox/'];
const optionalToolingPrefixes = ['scripts/'];
const toolingOnlyModules = new Set([
  'lib/encrypted-record-maintenance.js',
  'lib/encrypted-record-recovery.js',
  'lib/job-agent-object-storage-drill.js',
  'lib/job-agent-pricing.js',
  'lib/job-agent-readiness-drill-client.js',
  'lib/job-agent-release-preflight.js',
  'lib/job-agent-release-record.js',
  'lib/live-job-agent-asset-parity.js',
  'lib/live-job-agent-boundary.js',
  'lib/subscriber-ui-model.js',
]);

const inventory = untracked.map(file => {
  if (required.has(file)) return { file, classification: 'REQUIRED PRODUCTION SOURCE' };
  if (generatedPrefixes.some(prefix => file.startsWith(prefix)) || /^logo-preview-[ab]\.png$/.test(file)) {
    return { file, classification: 'GENERATED' };
  }
  if (optionalToolingPrefixes.some(prefix => file.startsWith(prefix)) || toolingOnlyModules.has(file) || file === 'playwright.config.mjs') {
    return { file, classification: 'OPTIONAL TOOLING' };
  }
  return { file, classification: 'UNKNOWN' };
});

const counts = Object.fromEntries(
  [...new Set(inventory.map(item => item.classification))]
    .sort()
    .map(classification => [classification, inventory.filter(item => item.classification === classification).length]),
);

console.log(JSON.stringify({
  schemaVersion: 1,
  freshBuildRequired: true,
  totalUntracked: inventory.length,
  counts,
  inventory,
}, null, 2));
