import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1')), '..');
export const ISOLATED_TARGET_CONFIRMATION = 'CONFIRM_ISOLATED_NONPRODUCTION_TARGET';
const PROJECT_REF = /^[a-z0-9]{20}$/;

function commandResult(command, args = []) {
  const candidates = process.platform === 'win32' ? [`${command}.cmd`, `${command}.exe`, command] : [command];
  for (const executable of candidates) {
    const result = spawnSync(executable, args, { encoding: 'utf8', shell: false, windowsHide: true });
    if (result.status === 0) {
      return { available: true, version: String(result.stdout || '').trim().split(/\r?\n/)[0] || null };
    }
  }
  return { available: false, version: null };
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function isolatedDataReadinessPreflight(env = process.env, dependencies = {}) {
  const inventoryPath = dependencies.inventoryPath || path.join(root, 'docs', 'production-readiness', 'database', 'migration-inventory.json');
  const read = dependencies.readFile || readFile;
  const inventory = JSON.parse(await read(inventoryPath, 'utf8'));
  const canonical = inventory?.canonicalMigration;
  assert(canonical?.file && canonical?.sha256, 'Canonical migration evidence is unavailable.');
  const canonicalSql = await read(path.join(root, canonical.file), 'utf8');
  const canonicalDigestMatches = digest(canonicalSql) === canonical.sha256;

  const probe = dependencies.commandResult || commandResult;
  const supabase = probe('supabase', ['--version']);
  const docker = probe('docker', ['--version']);
  const targetKind = String(env.JOB_AGENT_ISOLATED_TARGET_KIND || '').trim().toLowerCase();
  const confirmationMatches = env.JOB_AGENT_ISOLATED_TARGET_CONFIRMATION === ISOLATED_TARGET_CONFIRMATION;
  const isolatedRef = String(env.JOB_AGENT_ISOLATED_SUPABASE_PROJECT_REF || '').trim();
  const productionRef = String(env.JOB_AGENT_PRODUCTION_SUPABASE_PROJECT_REF || '').trim();
  const validManagedRefs = PROJECT_REF.test(isolatedRef) && PROJECT_REF.test(productionRef);
  const distinctManagedRefs = validManagedRefs && isolatedRef !== productionRef;
  const localRuntimeReady = targetKind === 'local-supabase' && docker.available;
  const managedTargetReady = targetKind === 'isolated-supabase-project' && validManagedRefs && distinctManagedRefs;

  const blockers = [];
  if (!canonicalDigestMatches) blockers.push('CANONICAL_MIGRATION_DIGEST_MISMATCH');
  if (!supabase.available) blockers.push('SUPABASE_CLI_UNAVAILABLE');
  if (!['local-supabase', 'isolated-supabase-project'].includes(targetKind)) blockers.push('ISOLATED_TARGET_KIND_UNCONFIRMED');
  if (targetKind === 'local-supabase' && !docker.available) blockers.push('LOCAL_SUPABASE_RUNTIME_UNAVAILABLE');
  if (targetKind === 'isolated-supabase-project' && !validManagedRefs) blockers.push('PROJECT_REFERENCE_SHAPE_INVALID');
  if (targetKind === 'isolated-supabase-project' && validManagedRefs && !distinctManagedRefs) blockers.push('ISOLATED_TARGET_EQUALS_PRODUCTION');
  if (!confirmationMatches) blockers.push('NONPRODUCTION_ATTESTATION_MISSING');

  const operatorAttestationReady = confirmationMatches && (localRuntimeReady || managedTargetReady);
  const readyForAuthorizedReadOnlyAudit = canonicalDigestMatches && supabase.available && operatorAttestationReady;
  return {
    schemaVersion: 1,
    report: 'job-agent-isolated-data-readiness-preflight',
    contentFree: true,
    containsSecretValues: false,
    performsExternalCalls: false,
    writesExternalState: false,
    targetKind: ['local-supabase', 'isolated-supabase-project'].includes(targetKind) ? targetKind : null,
    canonicalMigration: { file: canonical.file, sha256: canonical.sha256, digestMatches: canonicalDigestMatches },
    tooling: {
      supabaseCliAvailable: supabase.available,
      supabaseCliVersion: supabase.version,
      localContainerRuntimeAvailable: docker.available,
    },
    operatorAttestationReady,
    readyForAuthorizedReadOnlyAudit,
    isolatedTargetProven: false,
    liveRlsVerified: false,
    backupRestoreVerified: false,
    blockers: [...new Set(blockers)],
    nextStep: readyForAuthorizedReadOnlyAudit
      ? 'Obtain explicit authorization for the read-only target identity, migration-history, catalog, grant, and advisor audit. This preflight does not authorize linking, applying migrations, restoring backups, or billable operations.'
      : 'Resolve the listed preflight blockers. Do not link a project, apply migrations, run a restore, or enable a billable feature.',
  };
}

async function main() {
  const report = await isolatedDataReadinessPreflight();
  console.log(JSON.stringify(report, null, 2));
  if (!report.readyForAuthorizedReadOnlyAudit) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(JSON.stringify({
      schemaVersion: 1,
      report: 'job-agent-isolated-data-readiness-preflight',
      contentFree: true,
      containsSecretValues: false,
      performsExternalCalls: false,
      writesExternalState: false,
      readyForAuthorizedReadOnlyAudit: false,
      error: String(error?.message || 'Preflight failed.').replace(/[^A-Za-z0-9_.=-]/g, '_').slice(0, 180),
    }));
    process.exitCode = 1;
  });
}
