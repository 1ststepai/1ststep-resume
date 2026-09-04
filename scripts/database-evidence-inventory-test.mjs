import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function filesUnder(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await filesUnder(target));
    else results.push(target);
  }
  return results;
}

const inventory = JSON.parse(await readFile(new URL('../docs/production-readiness/database/migration-inventory.json', import.meta.url), 'utf8'));
const surface = JSON.parse(await readFile(new URL('../docs/production-readiness/database/database-surface-map.json', import.meta.url), 'utf8'));
const testSql = await readFile(new URL('../supabase/tests/job_agent_rls.test.sql', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(inventory.environment.target, 'unavailable');
assert.equal(inventory.environment.productionExcluded, false, 'No target means non-production identity is not yet proven.');
assert.equal(inventory.repositoryMigrations.length, 3);
assert.equal(inventory.duplicatePrefixes.length, 0);
assert.equal(inventory.repositoryMigrations.some((migration) => migration.destructiveStatements.length), false);
assert.equal(surface.tables.length, 20);
assert.equal(surface.tables.every((table) => table.rlsEnabledInSource && table.forceRlsInSource), true);
assert.equal(surface.findings.missingExplicitAnonRevoke, false);
assert.equal(surface.findings.missingExplicitAuthenticatedRevoke, false);
assert.equal(surface.findings.allCommandPoliciesWithoutToClause, false);
assert.equal(surface.findings.operationSpecificPoliciesAbsent, false);
assert.equal(surface.findings.userMetadataAuthorizationReference, false);
assert.equal(surface.findings.crossTenantReferenceRisks.length, 0);
assert.match(inventory.canonicalMigration.file, /^supabase\/migrations\/\d{14}_job_agent_canonical_baseline\.sql$/);
assert.equal(inventory.canonicalMigration.reconciledSourceFiles.length, 3);
assert.notEqual(inventory.environment.supabaseCliVersion, 'Not installed');
assert.match(testSql, /has_table_privilege\('anon'/);
assert.match(testSql, /has_table_privilege\('authenticated'/);
assert.match(testSql, /cmd = 'ALL'/);
assert.match(testSql, /cross-tenant parent reference/i);
assert.match(testSql, /set_config\('app\.tenant_id'/);
assert.match(testSql, /service_role/i);
assert.match(testSql, /set local role anon/i);
assert.match(testSql, /set local role authenticated/i);
assert.match(testSql, /ordering, and pagination/i);
assert.match(testSql, /joins expose only same-tenant/i);
assert.match(testSql, /expired or invalid tenant context/i);
assert.match(packageJson.scripts['release:gate'], /test:database-evidence/);

const publicOutput = path.join(root, '.public-web');
let browserBundle = '';
try {
  const publicFiles = await filesUnder(publicOutput);
  const scriptFiles = publicFiles.filter((file) => /\.(?:js|mjs|html)$/i.test(file));
  browserBundle = (await Promise.all(scriptFiles.map((file) => readFile(file, 'utf8')))).join('\n');
} catch {
  const fallbackFiles = ['index.html', 'app.html', 'concierge.html', 'client/concierge-app.js'];
  browserBundle = (await Promise.all(fallbackFiles.map((file) => readFile(path.join(root, file), 'utf8')))).join('\n');
}
assert.doesNotMatch(browserBundle, /service[_-]?role/i, 'A service-role marker must not appear in the public browser bundle.');

console.log('Database isolation evidence regression tests passed.');
