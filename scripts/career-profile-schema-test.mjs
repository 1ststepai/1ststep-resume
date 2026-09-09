// Static migration text contract only. This test does not execute PostgreSQL and
// proves nothing about DDL validity, RLS behavior, trigger behavior, or backfill results.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20260909011500_applicant_knowledge_profile.sql', import.meta.url), 'utf8');

assert.match(sql, /\nbegin;[\s\S]*alter table applicant_facts disable row level security[\s\S]*alter table applicant_facts force row level security[\s\S]*\ncommit;\s*$/);
assert.match(sql, /Fact identity model:[\s\S]*fact_lineage_id identifies the stable fact across versions/);
assert.match(sql, /add column if not exists fact_lineage_id uuid/);
assert.match(sql, /foreign key \(tenant_id, fact_lineage_id, fact_key\)[\s\S]*references applicant_fact_lineages\(tenant_id, id, fact_key\)/);
assert.match(sql, /foreign key \(tenant_id, fact_id, fact_version\)[\s\S]*references applicant_facts\(tenant_id, id, fact_version\)/);

assert.match(sql, /alter table applicant_facts disable row level security/);
assert.match(sql, /get diagnostics updated_lineage_rows = row_count/);
assert.match(sql, /JA003_LINEAGE_BACKFILL_MISMATCH/);
assert.match(sql, /JA003_FACT_LINEAGE_INCONSISTENT/);
assert.match(sql, /JA003_LINEAGE_REGISTRY_MISMATCH/);
assert.match(sql, /get diagnostics updated_superseded_rows = row_count/);
assert.match(sql, /JA003_CURRENT_BACKFILL_MISMATCH/);
assert.match(sql, /alter table applicant_facts enable row level security/);
assert.match(sql, /alter table applicant_facts force row level security/);
assert.ok(
  sql.indexOf('insert into applicant_fact_lineages') < sql.indexOf('alter table applicant_facts enable row level security'),
  'The lineage registry must be populated while migration-only RLS bypass is explicit.',
);

for (const envelopeColumn of ['encrypted_profile', 'encrypted_value']) {
  const section = sql.slice(sql.indexOf(`${envelopeColumn}) = 'object'`));
  assert.ok(section.includes("?& array['algorithm','keyId','iv','tag','ciphertext']"), `${envelopeColumn} must require every envelope key.`);
  assert.ok(section.includes("->>'algorithm' = 'A256GCM'"), `${envelopeColumn} must require the actual A256GCM envelope.`);
  for (const key of ['keyId', 'iv', 'tag', 'ciphertext']) assert.ok(section.includes(`->>'${key}'`), `${envelopeColumn} must require ${key}.`);
}
assert.match(sql, /change_reason in \([\s\S]*'initial-import'[\s\S]*'system-reconciliation'/);
assert.match(sql, /object_key ~ '\^\[a-z0-9_-/);
assert.match(sql, /object_provider is not null and object_key is not null and object_key ~/);
assert.match(sql, /applicant_profiles_consent_metadata_check[\s\S]*consent_policy_version ~ '\^\[A-Za-z0-9/);
assert.match(sql, /alter column confirmed_at set not null/);
assert.match(sql, /fact_key ~ '\^\[A-Za-z\]/);
assert.doesNotMatch(sql, /add column if not exists reuse_(policy|scope)/);
assert.doesNotMatch(sql, /reuse_allowed/);

assert.match(sql, /applicant_fact_reuse_scopes_identity_idx[\s\S]*where revoked_at is null/);
assert.match(sql, /applicant_facts_superseded_time_check[\s\S]*superseded_at >= created_at/);
assert.match(sql, /create trigger applicant_facts_maintain_current_version_trigger[\s\S]*before insert on applicant_facts/);
assert.match(sql, /for update;[\s\S]*JA003_FACT_VERSION_OUT_OF_SEQUENCE/);
assert.match(sql, /create trigger applicant_facts_protect_immutable_version_trigger[\s\S]*before update on applicant_facts/);
assert.match(sql, /JA003_FACT_VERSION_IS_IMMUTABLE/);
assert.match(sql, /security invoker/);
assert.doesNotMatch(sql, /security definer/i);

assert.match(sql, /conname = 'applicant_facts_tenant_id_version_key'[\s\S]*conrelid = 'applicant_facts'::regclass/);
assert.match(sql, /revoke all on applicant_fact_lineages, applicant_profile_versions, applicant_fact_evidence, applicant_fact_reuse_scopes from public, anon, authenticated/);
assert.match(sql, /grant select, insert, update, delete on applicant_fact_lineages, applicant_profile_versions, applicant_fact_evidence, applicant_fact_reuse_scopes to job_agent_backend/);

for (const table of ['applicant_fact_lineages', 'applicant_profile_versions', 'applicant_fact_evidence', 'applicant_fact_reuse_scopes']) {
  assert.ok(sql.includes(`'${table}'`), `${table} must be included in the RLS table list.`);
}
for (const operation of ['select', 'insert', 'update', 'delete']) {
  assert.ok(sql.includes(`'_backend_${operation}'`), `The ${operation} policy must have an independent idempotency guard.`);
}

console.log('Career Profile static schema contract passed; runtime evidence remains required.');
