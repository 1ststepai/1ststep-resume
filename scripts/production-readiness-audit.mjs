import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readinessRoot = path.join(root, 'docs', 'production-readiness');
const generatedRoot = path.join(root, '.production-readiness');
const allowedStatuses = new Set(['Pass', 'Warning', 'Critical']);
const allowedStates = new Set(['Implemented', 'Configured', 'Tested', 'Verified in staging', 'Verified in production', 'Unknown']);
const requiredFields = [
  'layer', 'status', 'evidence', 'evidenceTimestamp', 'testCommand', 'failureDetails',
  'owner', 'remediation', 'acceptedRisk', 'expirationDate', 'lastVerifiedCommit', 'states',
];

async function exists(relativePath) {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function allContain(paths, expressions) {
  const bodies = await Promise.all(paths.map(text));
  const combined = bodies.join('\n');
  return expressions.every((expression) => expression.test(combined));
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function gitDirty() {
  try {
    return Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim());
  } catch {
    return true;
  }
}

async function deterministicControls() {
  const packageJson = JSON.parse(await text('package.json'));
  const vercel = JSON.parse(await text('vercel.json'));
  const workflow = await exists('.github/workflows/production-readiness.yml')
    ? await text('.github/workflows/production-readiness.yml')
    : '';
  const lock = JSON.parse(await text('package-lock.json'));
  const dependencyVersions = Object.values(packageJson.dependencies || {});
  const directDependenciesPinned = dependencyVersions.length > 0
    && dependencyVersions.every((version) => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(version)));
  const migrationFiles = [
    'migrations/001_job_agent_authoritative_store.sql',
    'migrations/002_job_agent_continuous_improvement.sql',
    'migrations/003_job_agent_resilience.sql',
  ];
  const rlsSource = await allContain(migrationFiles, [
    /enable row level security/i,
    /force row level security/i,
    /revoke all on all tables in schema public from public/i,
  ]);
  const databaseEvidenceFiles = [
    'docs/production-readiness/database/migration-inventory.json',
    'docs/production-readiness/database/database-surface-map.json',
    'docs/production-readiness/database/database-isolation-recovery-evidence.json',
    'docs/production-readiness/database/database-isolation-recovery.md',
    'scripts/database-evidence-inventory.mjs',
    'scripts/database-evidence-inventory-test.mjs',
    'scripts/sql/database-surface-inventory.sql',
    'supabase/tests/job_agent_rls.test.sql',
  ];
  const databaseEvidencePresent = (await Promise.all(databaseEvidenceFiles.map(exists))).every(Boolean)
    && /test:database-evidence/.test(packageJson.scripts?.['release:gate'] || '');
  const apiNoStore = (vercel.headers || []).some((entry) => entry.source === '/api/(.*)'
    && entry.headers?.some((header) => header.key === 'Cache-Control' && /no-store/i.test(header.value)));
  const conciergeCsp = (vercel.headers || []).some((entry) => entry.source === '/concierge'
    && entry.headers?.some((header) => header.key === 'Content-Security-Policy' && /script-src-attr 'none'/.test(header.value)));
  const healthFiles = [
    'api/health/live.js', 'api/health/ready.js', 'api/health/dependencies.js', 'api/health/workers.js',
  ];
  return [
    ['PR-01', 'Required 13-layer documents exist', (await Promise.all([
      'docs/production-readiness/13-layer-scorecard.md',
      'docs/production-readiness/release-gate.md',
      'docs/production-readiness/evidence-register.md',
      'docs/production-readiness/risk-acceptance.md',
      'docs/production-readiness/scorecard.json',
    ].map(exists))).every(Boolean)],
    ['PR-02', 'All 13 scorecard layers are represented', true],
    ['PR-03', 'Release gate and entry/exit commands are registered', Boolean(
      packageJson.scripts?.['release:gate']
      && packageJson.scripts?.['audit:in']
      && packageJson.scripts?.['audit:out']
      && packageJson.scripts?.['audit:ai-use-cases'],
    )],
    ['PR-04', 'CI enforces the deterministic release gate on Node 24', /node-version:\s*['"]24['"]/.test(workflow) && /npm run release:gate/.test(workflow)],
    ['PR-05', 'Direct dependencies are exactly pinned and lockfile v3 is present', directDependenciesPinned && lock.lockfileVersion >= 3],
    ['PR-06', 'API responses have a no-store cache boundary', apiNoStore],
    ['PR-07', 'Concierge CSP blocks inline script attributes', conciergeCsp],
    ['PR-08', 'Tenant source controls and database isolation evidence gate are present', rlsSource && databaseEvidencePresent],
    ['PR-09', 'Liveness, readiness, dependency, and worker health endpoints exist', (await Promise.all(healthFiles.map(exists))).every(Boolean)],
    ['PR-10', 'Durable rate-limit regression test exists', await exists('scripts/durable-rate-limit-test.mjs')],
    ['PR-11', 'Public-output/source-leak regression test exists', await exists('scripts/vercel-output-boundary-test.mjs')],
    ['PR-12', 'Recovery plan and recovery drill are documented and implemented', await exists('docs/JOB_AGENT_RESILIENCE_AND_RECOVERY.md') && await exists('scripts/encrypted-record-recovery-drill.mjs')],
    ['PR-13', 'AI use-case assessment gate and current assessment exist', await exists('scripts/ai-use-case-gate.mjs') && await exists('docs/production-readiness/ai-use-cases/job-agent.json')],
  ].map(([id, requirement, passed]) => ({ id, requirement, passed: Boolean(passed), severity: 'Critical' }));
}

function validateScorecard(scorecard) {
  assert.equal(scorecard.schemaVersion, 1, 'Unsupported scorecard schemaVersion.');
  assert(Array.isArray(scorecard.layers), 'Scorecard layers must be an array.');
  assert.equal(scorecard.layers.length, 13, 'Scorecard must contain exactly 13 layers.');
  const layerNumbers = new Set();
  for (const layer of scorecard.layers) {
    for (const field of requiredFields) assert(Object.hasOwn(layer, field), `Layer ${layer.layer || '?'} is missing ${field}.`);
    assert(Number.isInteger(layer.layer) && layer.layer >= 1 && layer.layer <= 13, 'Layer must be an integer from 1 to 13.');
    assert(!layerNumbers.has(layer.layer), `Duplicate layer ${layer.layer}.`);
    layerNumbers.add(layer.layer);
    assert(allowedStatuses.has(layer.status), `Invalid status for layer ${layer.layer}.`);
    assert(Array.isArray(layer.evidence) && layer.evidence.length > 0, `Layer ${layer.layer} needs evidence or an explicit unknown record.`);
    assert(Array.isArray(layer.states) && layer.states.length > 0, `Layer ${layer.layer} needs readiness states.`);
    for (const state of layer.states) assert(allowedStates.has(state), `Layer ${layer.layer} has invalid readiness state ${state}.`);
    assert(typeof layer.acceptedRisk === 'boolean', `Layer ${layer.layer} acceptedRisk must be boolean.`);
    if (layer.acceptedRisk) {
      assert(layer.expirationDate, `Layer ${layer.layer} accepted risk needs an expiration date.`);
      assert(Date.parse(layer.expirationDate) > Date.now(), `Layer ${layer.layer} accepted risk is expired.`);
    }
    if (layer.status === 'Pass') {
      assert(!layer.states.includes('Unknown'), `Layer ${layer.layer} cannot Pass while its evidence state is Unknown.`);
      assert.equal(layer.failureDetails, '', `Layer ${layer.layer} cannot Pass with failure details.`);
    }
  }
}

function compareScorecards(entry, exit) {
  const rank = { Critical: 0, Warning: 1, Pass: 2 };
  return exit.layers.map((layer) => {
    const before = entry.layers.find((item) => item.layer === layer.layer);
    const delta = rank[layer.status] - rank[before.status];
    return {
      layer: layer.layer,
      name: layer.name,
      entryStatus: before.status,
      exitStatus: layer.status,
      change: delta > 0 ? 'Improved' : delta < 0 ? 'Regressed' : 'Unchanged',
    };
  });
}

async function loadJson(relativePath) {
  return JSON.parse(await text(relativePath));
}

async function snapshot(scorecard) {
  const controls = await deterministicControls();
  controls.find((control) => control.id === 'PR-02').passed = scorecard.layers.length === 13;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commit: gitHead(),
    worktree: gitDirty() ? 'dirty' : 'clean',
    scorecard,
    deterministicControls: controls,
    deterministicCriticalCount: controls.filter((control) => !control.passed && control.severity === 'Critical').length,
    productionCriticalCount: scorecard.layers.filter((layer) => layer.status === 'Critical' && !layer.acceptedRisk).length,
  };
}

async function writeSnapshot(name, value) {
  await mkdir(generatedRoot, { recursive: true });
  const target = path.join(generatedRoot, name);
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
  return target;
}

async function main() {
  const command = process.argv[2] || 'check';
  const scorecard = await loadJson('docs/production-readiness/scorecard.json');
  validateScorecard(scorecard);
  const current = await snapshot(scorecard);

  if (command === 'audit-in') {
    const target = await writeSnapshot('audit-in.json', current);
    console.log(`AUDIT IN recorded: ${path.relative(root, target)} (${current.productionCriticalCount} production Critical, ${current.deterministicCriticalCount} deterministic Critical).`);
    return;
  }

  if (command === 'audit-out') {
    const entry = JSON.parse(await readFile(path.join(generatedRoot, 'audit-in.json'), 'utf8'));
    const comparison = compareScorecards(entry.scorecard, current.scorecard);
    const target = await writeSnapshot('audit-out.json', { ...current, comparison });
    console.log(JSON.stringify({ target: path.relative(root, target), comparison, productionCriticalCount: current.productionCriticalCount }, null, 2));
    if (current.productionCriticalCount > 0) process.exitCode = 2;
    return;
  }

  if (command === 'compare-entry') {
    const entry = await loadJson('docs/production-readiness/entry-scorecard.json');
    validateScorecard(entry);
    console.log(JSON.stringify({ comparison: compareScorecards(entry, scorecard), productionCriticalCount: current.productionCriticalCount }, null, 2));
    return;
  }

  if (!['check', 'production-approval'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const failed = current.deterministicControls.filter((control) => !control.passed);
  if (failed.length) {
    for (const failure of failed) console.error(`${failure.severity} ${failure.id}: ${failure.requirement}`);
    process.exitCode = 1;
    return;
  }
  if (command === 'production-approval' && current.productionCriticalCount > 0) {
    console.error(`Production approval blocked by ${current.productionCriticalCount} unaccepted Critical layer(s).`);
    process.exitCode = 2;
    return;
  }
  console.log(`Production-readiness deterministic gate passed: ${current.deterministicControls.length}/${current.deterministicControls.length} controls. Production Critical layers: ${current.productionCriticalCount}.`);
}

await main();
