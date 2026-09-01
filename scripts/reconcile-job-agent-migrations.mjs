import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'migrations');
const canonicalRoot = path.join(root, 'supabase', 'migrations');
const sourceFiles = [
  '001_job_agent_authoritative_store.sql',
  '002_job_agent_continuous_improvement.sql',
  '003_job_agent_resilience.sql',
];

async function canonicalPath() {
  const matches = (await readdir(canonicalRoot)).filter(name => /^\d{14}_job_agent_canonical_baseline\.sql$/.test(name));
  assert.equal(matches.length, 1, 'Expected exactly one CLI-generated canonical Job Agent baseline migration.');
  return path.join(canonicalRoot, matches[0]);
}

async function expectedSql() {
  const sources = await Promise.all(sourceFiles.map(async file => ({ file, sql: await readFile(path.join(sourceRoot, file), 'utf8') })));
  const header = [
    '-- Canonical Job Agent baseline.',
    '-- Created with `supabase migration new`; reconciled deterministically from the reviewed 001-003 source files.',
    '-- Do not apply to production until an isolated target passes pgTAP, advisors, drift review, and recovery evidence.',
    '',
  ].join('\n');
  return `${header}${sources.map(({ file, sql }) => `-- BEGIN REVIEWED SOURCE: ${file}\n${sql.trim()}\n-- END REVIEWED SOURCE: ${file}`).join('\n\n')}\n`;
}

const target = await canonicalPath();
const expected = await expectedSql();
const command = process.argv[2] || 'check';
if (command === 'write') {
  await writeFile(target, expected, 'utf8');
  console.log(`Reconciled ${sourceFiles.length} reviewed source migrations into ${path.relative(root, target)}.`);
} else if (command === 'check') {
  assert.equal(await readFile(target, 'utf8'), expected, 'Canonical Supabase baseline is stale; run the reviewed reconciliation command.');
  console.log(`Canonical Supabase baseline matches ${sourceFiles.length} reviewed source migrations.`);
} else {
  throw new Error(`Unknown command: ${command}`);
}
