import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationRoot = path.join(root, 'migrations');
const evidencePath = path.join(root, 'docs', 'production-readiness', 'database', 'migration-inventory.json');
const surfacePath = path.join(root, 'docs', 'production-readiness', 'database', 'database-surface-map.json');
const sensitivePattern = /(tenant|identit|profile|fact|preference|job|application|document|human_action|audit|learning|workflow|policy)/i;

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function commandAvailable(name) {
  try {
    execFileSync('where.exe', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function supabaseCliVersion() {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-Command', 'npx --no-install supabase --version'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'Not installed';
  }
}

function parseTables(sql, source) {
  const tables = [];
  const expression = /create table if not exists\s+([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\);/gi;
  for (const match of sql.matchAll(expression)) {
    const name = match[1];
    const body = match[2];
    const columns = [];
    const foreignKeys = [];
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim().replace(/,$/, '');
      const column = line.match(/^([a-z_][a-z0-9_]*)\s+(.+)$/i);
      if (column && !/^(primary|unique|check|constraint|foreign)\b/i.test(line)) {
        columns.push(column[1]);
        const reference = line.match(/references\s+([a-z_][a-z0-9_]*)\s*\(([a-z_][a-z0-9_]*)\)/i);
        if (reference) foreignKeys.push({ column: column[1], referencesTable: reference[1], referencesColumn: reference[2], tenantScoped: column[1] === 'tenant_id' });
      }
      const compositeReference = line.match(/^(?:constraint\s+[a-z_][a-z0-9_]*\s+)?foreign key\s*\(([^)]+)\)\s+references\s+([a-z_][a-z0-9_]*)\s*\(([^)]+)\)/i);
      if (compositeReference) {
        const columns = compositeReference[1].split(',').map(value => value.trim());
        const referenceColumns = compositeReference[3].split(',').map(value => value.trim());
        foreignKeys.push({ columns, referencesTable: compositeReference[2], referencesColumns: referenceColumns, tenantScoped: columns.includes('tenant_id') && referenceColumns.includes('tenant_id') });
      }
    }
    tables.push({
      schema: 'public',
      name,
      source,
      columns,
      sensitive: sensitivePattern.test(name) || columns.some((columnName) => sensitivePattern.test(columnName)),
      tenantColumn: columns.includes('tenant_id'),
      foreignKeys,
    });
  }
  return tables;
}

function rlsTables(sql) {
  const names = new Set();
  for (const arrayMatch of sql.matchAll(/foreach\s+target_table\s+in\s+array\s+array\[([^\]]+)\]/gi)) {
    for (const name of arrayMatch[1].matchAll(/'([a-z_][a-z0-9_]*)'/gi)) names.add(name[1]);
  }
  for (const direct of sql.matchAll(/alter table\s+([a-z_][a-z0-9_]*)\s+(?:enable|force) row level security/gi)) names.add(direct[1]);
  return names;
}

function staticFindings(combined, tables, migrations) {
  const tableNames = new Set(tables.map((table) => table.name));
  const crossTenantReferences = [];
  for (const table of tables.filter((item) => item.tenantColumn)) {
    for (const fk of table.foreignKeys.filter((item) => !item.tenantScoped)) {
      const parent = tables.find((candidate) => candidate.name === fk.referencesTable);
      if (parent?.tenantColumn) crossTenantReferences.push(`${table.name}.${fk.column || fk.columns?.join('+')}->${parent.name}.${fk.referencesColumn || fk.referencesColumns?.join('+')}`);
    }
  }
  return {
    missingExplicitAnonRevoke: !/revoke\s+all(?:\s+privileges)?(?:\s+on\s+(?:table\s+)?.+?)?\s+from\s+anon\b/is.test(combined),
    missingExplicitAuthenticatedRevoke: !/revoke\s+all(?:\s+privileges)?(?:\s+on\s+(?:table\s+)?.+?)?\s+from\s+authenticated\b/is.test(combined),
    allCommandPoliciesWithoutToClause: /create policy[\s\S]+?using\s*\(/i.test(combined) && !/create policy[\s\S]+?\bto\s+(?:anon|authenticated|service_role|[a-z_][a-z0-9_]*)/i.test(combined),
    operationSpecificPoliciesAbsent: !/create policy[\s\S]+?for\s+(?:select|insert|update|delete)/i.test(combined),
    userMetadataAuthorizationReference: /(?:raw_)?user_metadata/i.test(combined),
    securityDefinerFunctions: [...combined.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([^\s(]+)[\s\S]*?security\s+definer/gi)].map((match) => match[1]),
    views: [...combined.matchAll(/create\s+(?:or\s+replace\s+)?view\s+([^\s(]+)/gi)].map((match) => match[1]),
    materializedViews: [...combined.matchAll(/create\s+materialized\s+view\s+([^\s(]+)/gi)].map((match) => match[1]),
    triggers: [...combined.matchAll(/create\s+trigger\s+([^\s]+)/gi)].map((match) => match[1]),
    sequences: [...combined.matchAll(/create\s+sequence\s+([^\s]+)/gi)].map((match) => match[1]),
    storageObjects: [...tableNames].filter((name) => name.startsWith('storage.')),
    crossTenantReferenceRisks: crossTenantReferences.sort(),
    nonSupabaseTimestampMigrationNames: migrations.filter((migration) => !/^\d{14}_[a-z0-9_]+\.sql$/i.test(migration.file)).map((migration) => migration.file),
  };
}

async function buildInventory() {
  const names = (await readdir(migrationRoot)).filter((name) => name.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
  const migrations = [];
  const tables = [];
  const allSql = [];
  const prefixes = new Map();
  const rls = new Set();
  for (const file of names) {
    const sql = await readFile(path.join(migrationRoot, file), 'utf8');
    allSql.push(sql);
    const prefix = file.match(/^(\d+)_/)?.[1] || null;
    if (prefix) prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
    migrations.push({
      order: migrations.length + 1,
      file,
      sha256: digest(sql),
      bytes: Buffer.byteLength(sql),
      prefix,
      supabaseTimestampFormat: /^\d{14}_[a-z0-9_]+\.sql$/i.test(file),
      destructiveStatements: [...sql.matchAll(/\b(drop\s+(?:table|schema|column|function|view)|truncate|delete\s+from|alter\s+table[\s\S]{0,120}?\bdrop\b)\b/gi)].map((match) => match[0].replace(/\s+/g, ' ').toLowerCase()),
      privilegeStatements: [...sql.matchAll(/\b(?:grant|revoke)\b[^;]*;/gi)].map((match) => match[0].replace(/\s+/g, ' ').trim()),
      ownershipStatements: [...sql.matchAll(/\bowner\s+to\s+[^;]+;/gi)].map((match) => match[0].replace(/\s+/g, ' ').trim()),
    });
    tables.push(...parseTables(sql, file));
    for (const table of rlsTables(sql)) rls.add(table);
  }
  const combined = allSql.join('\n');
  const findings = staticFindings(combined, tables, migrations);
  const duplicatePrefixes = [...prefixes.entries()].filter(([, count]) => count > 1).map(([prefix]) => prefix);
  const surface = {
    schemaVersion: 1,
    source: 'repository-static-analysis-only',
    schemas: ['public'],
    accessDefaults: {
      anonGrants: 'Explicitly revoked in source; target grants remain unknown until inspection',
      authenticatedGrants: 'Explicitly revoked in source; target grants remain unknown until inspection',
      serviceRoleGrants: 'Unknown; service_role would bypass RLS and is not an intended browser credential',
      dataApiExposure: 'Unknown until target Data API configuration is inspected',
    },
    tables: tables.map((table) => ({
      schema: table.schema,
      name: table.name,
      source: table.source,
      sensitive: table.sensitive,
      tenantColumn: table.tenantColumn,
      foreignKeys: table.foreignKeys,
      rlsEnabledInSource: rls.has(table.name),
      forceRlsInSource: rls.has(table.name),
      policyModel: table.name === 'job_sources' ? 'backend-only operation-specific policies; global source registry' : 'backend-only operation-specific policies using app.tenant_id',
    })),
    views: findings.views,
    materializedViews: findings.materializedViews,
    functions: findings.securityDefinerFunctions.map((name) => ({ name, securityDefiner: true, publicExecute: 'Unknown until target inspection' })),
    triggers: findings.triggers,
    sequences: findings.sequences,
    storageBuckets: [],
    storagePolicies: [],
    findings,
  };
  const canonicalNames = (await readdir(path.join(root, 'supabase', 'migrations'))).filter(name => /^\d{14}_job_agent_canonical_baseline\.sql$/.test(name));
  const canonicalSql = canonicalNames.length === 1 ? await readFile(path.join(root, 'supabase', 'migrations', canonicalNames[0]), 'utf8') : '';
  const cliVersion = supabaseCliVersion();
  const inventory = {
    schemaVersion: 1,
    source: 'repository-static-analysis-only',
    environment: {
      target: 'unavailable',
      classification: 'Human Action Required; no staging/local target identified',
      maskedProjectRef: null,
      productionExcluded: false,
      supabaseCliAvailable: cliVersion !== 'Not installed',
      dockerAvailable: commandAvailable('docker'),
      psqlAvailable: commandAvailable('psql'),
      postgresVersion: 'Unknown',
      supabaseCliVersion: cliVersion,
    },
    canonicalMigration: canonicalNames.length === 1 ? { file: `supabase/migrations/${canonicalNames[0]}`, sha256: digest(canonicalSql), bytes: Buffer.byteLength(canonicalSql), reconciledSourceFiles: names } : null,
    repositoryMigrations: migrations,
    localMigrationHistory: 'Unavailable: no CLI/local stack/configuration',
    stagingMigrationHistory: 'Unavailable: no proven non-production target',
    duplicatePrefixes,
    missingMigrations: 'Unknown until local and staging histories are available',
    conflictingMigrations: duplicatePrefixes.length ? duplicatePrefixes : [],
    modifiedHistoricalMigrations: 'Unknown without an authoritative applied-history digest',
    schemaDrift: 'Unknown until a proven non-production target can be inspected',
    executionPlan: [
      'Obtain a disposable local Supabase stack or isolated staging project and prove it is not production.',
      'Install the Supabase CLI through the approved operator process; capture supabase --version and relevant --help output.',
      'Create canonical timestamped migrations only with supabase migration new; do not rename or apply the current 001-003 files directly.',
      'Reconcile current SQL into CLI-generated migrations, preserving digests and recording any transformation.',
      'Inspect local and staging migration lists before applying anything.',
      'Apply only to the isolated target, inspect grants/RLS/surface, then run supabase test db and advisors.',
      'Do not proceed to restore or paid PITR without separate explicit authorization.',
    ],
  };
  return { inventory, surface };
}

const { inventory, surface } = await buildInventory();
const command = process.argv[2] || 'check';
if (command === 'print') {
  console.log(JSON.stringify({ inventory, surface }, null, 2));
} else if (command === 'write') {
  await writeFile(evidencePath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  await writeFile(surfacePath, `${JSON.stringify(surface, null, 2)}\n`, 'utf8');
  console.log(`Database evidence refreshed: ${inventory.repositoryMigrations.length} reviewed sources, ${surface.tables.length} tables, ${surface.findings.crossTenantReferenceRisks.length} cross-tenant reference risks.`);
} else if (command === 'check') {
  const expectedInventory = JSON.parse(await readFile(evidencePath, 'utf8'));
  const expectedSurface = JSON.parse(await readFile(surfacePath, 'utf8'));
  assert.deepEqual(expectedInventory, inventory, 'Migration inventory is stale; regenerate and review it.');
  assert.deepEqual(expectedSurface, surface, 'Database surface map is stale; regenerate and review it.');
  assert.equal(inventory.duplicatePrefixes.length, 0, 'Duplicate migration prefixes detected.');
  assert.equal(inventory.repositoryMigrations.some((migration) => migration.destructiveStatements.length > 0), false, 'Destructive migration statement detected.');
  assert.equal(surface.findings.userMetadataAuthorizationReference, false, 'User-editable metadata appears in database authorization source.');
  console.log(`Database evidence inventory verified: ${inventory.repositoryMigrations.length} migrations, ${surface.tables.length} tables, ${surface.findings.crossTenantReferenceRisks.length} cross-tenant reference risks found.`);
} else {
  throw new Error(`Unknown command: ${command}`);
}
