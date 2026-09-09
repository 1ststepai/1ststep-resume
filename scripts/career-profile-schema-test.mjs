import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20260909011500_applicant_knowledge_profile.sql', import.meta.url), 'utf8');
const required = [
  'applicant_profile_versions',
  'applicant_fact_evidence',
  'applicant_fact_reuse_scopes',
  'verification_state',
  'sensitivity',
  'reuse_policy',
  'expires_at',
  'superseded_at',
  'evidence_sha256',
  'force row level security',
  "current_setting(''app.tenant_id'', true)",
  'applicant_facts_tenant_current_key_idx',
  'applicant_fact_reuse_scopes_confirmation_check',
];
for (const fragment of required) assert.ok(sql.includes(fragment), `Missing Career Profile schema contract: ${fragment}`);

assert.match(sql, /where revoked_at is null and superseded_at is null/);
assert.match(sql, /foreign key \(tenant_id, fact_id, fact_version\)/);
assert.match(sql, /revoke all on applicant_profile_versions, applicant_fact_evidence, applicant_fact_reuse_scopes from public, anon, authenticated/);
assert.doesNotMatch(sql, /security definer/i);
assert.doesNotMatch(sql, /grant .* to (anon|authenticated)/i);
assert.doesNotMatch(sql, /\b(email|name|phone|address|resume_text|answer_text)\b/i);

for (const table of ['applicant_profile_versions', 'applicant_fact_evidence', 'applicant_fact_reuse_scopes']) {
  assert.match(sql, new RegExp(`alter table %I enable row level security`));
  assert.ok(sql.includes(`'${table}'`));
}

console.log('Career Profile additive schema contract passed.');
