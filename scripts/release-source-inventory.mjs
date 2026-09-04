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

async function functionDirectoriesUnder(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const functions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.name.endsWith('.func')) {
      functions.push({ relative, absolute });
      continue;
    }
    functions.push(...await functionDirectoriesUnder(absolute, relative));
  }
  return functions;
}

const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/)
  .map(line => normalize(line.trim()))
  .filter(Boolean);

const required = new Set(await filesUnder(staticRoot));
const functionEntries = await functionDirectoriesUnder(functionsRoot);

for (const entry of functionEntries) {
  required.add(`api/${entry.relative.slice(0, -5)}.js`);
  for (const file of await filesUnder(entry.absolute)) {
    if (file.startsWith('lib/') || file.startsWith('client/')) required.add(file);
  }
}

for (const releaseInput of [
  '.github/workflows/production-readiness.yml',
  '.vercelignore',
  'build-public-web.mjs',
  'package-lock.json',
  'sandbox/employer-browser-runner.mjs',
  'vercel.json',
]) {
  required.add(releaseInput);
}

const generatedPrefixes = ['artifacts/', 'test-results/'];
const optionalToolingPrefixes = ['scripts/'];
const toolingOnlyModules = new Set([
  'lib/encrypted-record-maintenance.js',
  'lib/encrypted-record-recovery.js',
  'lib/job-agent-object-storage-drill.js',
  'lib/job-agent-database-runtime-evidence.js',
  'lib/job-agent-recovery-evidence.js',
  'lib/job-agent-signed-capacity-evidence.js',
  'lib/job-agent-pricing.js',
  'lib/job-agent-readiness-drill-client.js',
  'lib/job-agent-release-preflight.js',
  'lib/job-agent-release-record.js',
  'lib/live-job-agent-asset-parity.js',
  'lib/live-job-agent-boundary.js',
  'lib/subscriber-ui-model.js',
  'lib/ai-routing-evaluation.js',
]);

const inventory = untracked.map(file => {
  if (required.has(file)) return { file, classification: 'REQUIRED PRODUCTION SOURCE' };
  if (file.startsWith('migrations/') || file.startsWith('supabase/migrations/') || file.startsWith('supabase/tests/')) {
    return { file, classification: 'REQUIRED DATABASE SOURCE' };
  }
  if (file.startsWith('docs/production-readiness/')) {
    return { file, classification: 'RELEASE EVIDENCE' };
  }
  if (file.startsWith('docs/legal-drafts/')) {
    return { file, classification: 'COUNSEL REVIEW DRAFT' };
  }
  if (file.startsWith('docs/design/') || file.startsWith('docs/qa/') || file === 'DESIGN.md' || file === 'docs/product-choice-concept.png') {
    return { file, classification: 'REFERENCE ARTIFACT' };
  }
  if (file.startsWith('docs/')) return { file, classification: 'REVIEWABLE DOCUMENTATION' };
  if (generatedPrefixes.some(prefix => file.startsWith(prefix)) || /^logo-preview-[ab]\.png$/.test(file)) {
    return { file, classification: 'GENERATED' };
  }
  if (optionalToolingPrefixes.some(prefix => file.startsWith(prefix)) || toolingOnlyModules.has(file) || file === 'playwright.config.mjs' || file === 'set-job-agent-budget.ps1') {
    return { file, classification: 'OPTIONAL TOOLING' };
  }
  return { file, classification: 'UNKNOWN' };
});

const counts = Object.fromEntries(
  [...new Set(inventory.map(item => item.classification))]
    .sort()
    .map(classification => [classification, inventory.filter(item => item.classification === classification).length]),
);

const result = {
  schemaVersion: 1,
  freshBuildRequired: true,
  totalUntracked: inventory.length,
  counts,
  inventory,
};

console.log(JSON.stringify(result, null, 2));
if (process.argv.includes('--check') && (counts.UNKNOWN || 0) > 0) process.exitCode = 1;
