-- Run only after the JA-003 migration on an isolated database.
-- Verifies the Career Profile security and versioning contracts used by the
-- future server-only store. All fixture changes roll back with this suite.

begin;

grant job_agent_backend to current_user;
grant usage on schema extensions to job_agent_backend;

create extension if not exists pgtap;
select plan(28);

select is(
  (select count(*)::integer
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname in (
       'applicant_fact_lineages', 'applicant_profile_versions',
       'applicant_fact_evidence', 'applicant_fact_reuse_scopes'
     )
     and c.relrowsecurity
     and c.relforcerowsecurity),
  4,
  'all JA-003 tables enable and force RLS'
);

select ok(
  not exists (
    select 1
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name in (
        'applicant_fact_lineages', 'applicant_profile_versions',
        'applicant_fact_evidence', 'applicant_fact_reuse_scopes'
      )
      and has_table_privilege('anon', format('%I.%I', t.table_schema, t.table_name), 'select,insert,update,delete')
  ),
  'anon has no JA-003 table privileges'
);

select ok(
  not exists (
    select 1
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name in (
        'applicant_fact_lineages', 'applicant_profile_versions',
        'applicant_fact_evidence', 'applicant_fact_reuse_scopes'
      )
      and has_table_privilege('authenticated', format('%I.%I', t.table_schema, t.table_name), 'select,insert,update,delete')
  ),
  'authenticated has no JA-003 table privileges'
);

select is(
  (select count(*)::integer
   from pg_policies
   where schemaname = 'public'
     and tablename in (
       'applicant_fact_lineages', 'applicant_profile_versions',
       'applicant_fact_evidence', 'applicant_fact_reuse_scopes'
     )
     and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
     and roles = array['job_agent_backend']::name[]),
  16,
  'each JA-003 table has four operation-specific backend policies'
);

insert into app_tenants (tenant_id)
values (repeat('c', 40)), (repeat('d', 40));

insert into applicant_fact_lineages (id, tenant_id, fact_key)
values
  ('10000000-0000-0000-0000-000000000001', repeat('c', 40), 'work.authorization'),
  ('20000000-0000-0000-0000-000000000002', repeat('d', 40), 'work.authorization');

set local role job_agent_backend;
set local search_path = public, extensions;
select set_config('app.tenant_id', repeat('c', 40), true);

select results_eq(
  $$select id from applicant_fact_lineages order by id$$,
  array['10000000-0000-0000-0000-000000000001'::uuid],
  'tenant C sees only its lineage'
);

select throws_ok(
  $$insert into applicant_fact_lineages (id, tenant_id, fact_key) values ('30000000-0000-0000-0000-000000000003', repeat('d', 40), 'hidden.fact')$$,
  '42501',
  null,
  'tenant C cannot create a tenant D lineage'
);

select lives_ok(
  $$insert into applicant_facts (
      id, tenant_id, fact_key, fact_version, encrypted_value, provenance,
      confidence, confirmed_at, fact_lineage_id, verification_state, source_type
    ) values (
      '11000000-0000-0000-0000-000000000001', repeat('c', 40),
      'work.authorization', 1,
      '{"algorithm":"A256GCM","keyId":"key-1","iv":"QUJDRA==","tag":"QUJDRA==","ciphertext":"QUJDRA=="}'::jsonb,
      '{}'::jsonb, 0.9, '2026-09-09T12:00:00Z',
      '10000000-0000-0000-0000-000000000001', 'user-confirmed', 'user'
    )$$,
  'a valid encrypted fact version is accepted'
);

select throws_ok(
  $$insert into applicant_facts (
      id, tenant_id, fact_key, fact_version, encrypted_value, provenance,
      confidence, confirmed_at, fact_lineage_id, verification_state, source_type
    ) values (
      '11000000-0000-0000-0000-000000000099', repeat('c', 40),
      'work.authorization', 99,
      '{"algorithm":"A256GCM","keyId":"key-1","iv":"QUJDRA==","tag":"QUJDRA=="}'::jsonb,
      '{}'::jsonb, 0.9, '2026-09-09T12:00:00Z',
      '10000000-0000-0000-0000-000000000001', 'user-confirmed', 'user'
    )$$,
  '23514',
  null,
  'a fact without a complete A256GCM envelope is rejected'
);

select throws_ok(
  $$insert into applicant_facts (
      id, tenant_id, fact_key, fact_version, encrypted_value, provenance,
      confidence, confirmed_at, fact_lineage_id, verification_state, source_type
    ) values (
      '22000000-0000-0000-0000-000000000002', repeat('c', 40),
      'work.authorization', 2,
      '{"algorithm":"A256GCM","keyId":"key-1","iv":"QUJDRA==","tag":"QUJDRA==","ciphertext":"QUJDRA=="}'::jsonb,
      '{}'::jsonb, 0.9, '2026-09-09T12:00:00Z',
      '20000000-0000-0000-0000-000000000002', 'user-confirmed', 'user'
    )$$,
  '23503',
  null,
  'a cross-tenant lineage reference is rejected'
);

select lives_ok(
  $$insert into applicant_facts (
      id, tenant_id, fact_key, fact_version, encrypted_value, provenance,
      confidence, confirmed_at, fact_lineage_id, verification_state, source_type,
      created_at
    ) values (
      '11000000-0000-0000-0000-000000000002', repeat('c', 40),
      'work.authorization', 2,
      '{"algorithm":"A256GCM","keyId":"key-1","iv":"QUJDRA==","tag":"QUJDRA==","ciphertext":"QUJDRA=="}'::jsonb,
      '{}'::jsonb, 0.95, '2026-09-09T13:00:00Z',
      '10000000-0000-0000-0000-000000000001', 'document-verified', 'document',
      '2026-09-09T13:00:00Z'
    )$$,
  'a second fact version is accepted'
);

select results_eq(
  $$select count(*)::bigint from applicant_facts where fact_lineage_id = '10000000-0000-0000-0000-000000000001' and revoked_at is null and superseded_at is null$$,
  array[1::bigint],
  'exactly one fact version remains current'
);

select ok(
  (select superseded_at is not null from applicant_facts where id = '11000000-0000-0000-0000-000000000001'),
  'the previous fact version is superseded automatically'
);

select results_eq(
  $$select id from applicant_facts where fact_lineage_id = '10000000-0000-0000-0000-000000000001' and superseded_at is null$$,
  array['11000000-0000-0000-0000-000000000002'::uuid],
  'the newest fact version is current'
);

select lives_ok(
  $$insert into applicant_fact_evidence (
      tenant_id, fact_id, fact_version, evidence_type, evidence_sha256, verified_at
    ) values (
      repeat('c', 40), '11000000-0000-0000-0000-000000000002', 2,
      'document', repeat('a', 64), '2026-09-09T13:00:00Z'
    )$$,
  'evidence can bind to an exact fact version'
);

select throws_ok(
  $$insert into applicant_fact_evidence (
      tenant_id, fact_id, fact_version, evidence_type, evidence_sha256
    ) values (
      repeat('c', 40), '11000000-0000-0000-0000-000000000002', 1,
      'document', repeat('b', 64)
    )$$,
  '23503',
  null,
  'evidence cannot bind to the wrong fact version'
);

select throws_ok(
  $$insert into applicant_fact_evidence (
      tenant_id, fact_id, fact_version, evidence_type, object_provider, object_key, evidence_sha256
    ) values (
      repeat('c', 40), '11000000-0000-0000-0000-000000000002', 2,
      'document', 'cloudflare-r2-private', 'guessable/file', repeat('c', 64)
    )$$,
  '23514',
  null,
  'guessable evidence object keys are rejected'
);

select lives_ok(
  $$insert into applicant_fact_reuse_scopes (
      tenant_id, fact_lineage_id, scope_type, consent_policy_version, confirmed_at
    ) values (
      repeat('c', 40), '10000000-0000-0000-0000-000000000001',
      'global', 'policy-1', '2026-09-09T13:00:00Z'
    )$$,
  'an explicit global reuse grant is accepted'
);

select throws_ok(
  $$insert into applicant_fact_reuse_scopes (
      tenant_id, fact_lineage_id, scope_type, consent_policy_version, confirmed_at
    ) values (
      repeat('c', 40), '10000000-0000-0000-0000-000000000001',
      'global', 'policy-1', '2026-09-09T13:01:00Z'
    )$$,
  '23505',
  null,
  'duplicate active reuse authority is rejected'
);

select lives_ok(
  $$update applicant_fact_reuse_scopes
    set revoked_at = '2026-09-09T14:00:00Z'
    where fact_lineage_id = '10000000-0000-0000-0000-000000000001' and revoked_at is null$$,
  'an active reuse grant can be revoked'
);

select lives_ok(
  $$insert into applicant_fact_reuse_scopes (
      tenant_id, fact_lineage_id, scope_type, consent_policy_version, confirmed_at
    ) values (
      repeat('c', 40), '10000000-0000-0000-0000-000000000001',
      'global', 'policy-2', '2026-09-09T14:01:00Z'
    )$$,
  'a revoked reuse grant can be explicitly re-granted'
);

select throws_ok(
  $$insert into applicant_profiles (
      tenant_id, version, encrypted_profile, consent_status, consent_policy_version
    ) values (
      repeat('c', 40), 1,
      '{"algorithm":"A256GCM","keyId":"key-1","iv":"QUJDRA==","tag":"QUJDRA==","ciphertext":"QUJDRA=="}'::jsonb,
      'granted', null
    )$$,
  '23514',
  null,
  'granted profile consent requires policy metadata'
);

select lives_ok(
  $$insert into applicant_profiles (
      tenant_id, version, encrypted_profile, schema_version,
      consent_status, consent_policy_version, consent_updated_at
    ) values (
      repeat('c', 40), 1,
      '{"algorithm":"A256GCM","keyId":"key-1","iv":"QUJDRA==","tag":"QUJDRA==","ciphertext":"QUJDRA=="}'::jsonb,
      1, 'granted', 'policy-1', '2026-09-09T13:00:00Z'
    )$$,
  'a valid encrypted current profile is accepted'
);

select lives_ok(
  $$insert into applicant_profile_versions (
      tenant_id, profile_version, schema_version, encrypted_profile, change_reason
    ) values (
      repeat('c', 40), 1, 1,
      '{"algorithm":"A256GCM","keyId":"key-1","iv":"QUJDRA==","tag":"QUJDRA==","ciphertext":"QUJDRA=="}'::jsonb,
      'user-confirmed-update'
    )$$,
  'a valid encrypted profile history version is accepted'
);

select set_config('app.tenant_id', repeat('d', 40), true);
select results_eq(
  $$select count(*)::bigint from applicant_facts where id in ('11000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002')$$,
  array[0::bigint],
  'tenant D cannot see tenant C fact versions'
);

select results_eq(
  $$select count(*)::bigint from applicant_fact_evidence$$,
  array[0::bigint],
  'tenant D cannot see tenant C evidence'
);

select results_eq(
  $$select count(*)::bigint from applicant_fact_reuse_scopes$$,
  array[0::bigint],
  'tenant D cannot see tenant C reuse grants'
);

select results_eq(
  $$select count(*)::bigint from applicant_profile_versions$$,
  array[0::bigint],
  'tenant D cannot see tenant C profile history'
);

select set_config('app.tenant_id', '', true);
select results_eq(
  $$select count(*)::bigint from applicant_fact_lineages$$,
  array[0::bigint],
  'an invalid tenant context sees no Career Profile rows'
);

select * from finish();
rollback;
