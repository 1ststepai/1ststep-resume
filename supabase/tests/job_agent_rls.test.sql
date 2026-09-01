-- Run only against an isolated local or staging database after the repository
-- migrations have been reconciled into Supabase CLI-generated migrations.
-- This test verifies explicit backend-only grants/policies and tenant-scoped
-- parent foreign keys from the canonical baseline.
-- Never expose or use a service_role credential in a browser to run this suite.

begin;

create extension if not exists pgtap;
select plan(19);

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname in (
    'app_tenants','app_identities','applicant_profiles','applicant_facts','discovered_jobs','applications','document_versions','human_actions','audit_events',
    'candidate_preferences','fact_corrections','job_sources','source_performance','learning_signals','learning_proposals','evaluation_runs','policy_versions',
    'workflow_operations','workflow_events','provider_circuit_states'
  ) and c.relrowsecurity),
  20,
  'all Job Agent tables have RLS enabled'
);

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname in (
    'app_tenants','app_identities','applicant_profiles','applicant_facts','discovered_jobs','applications','document_versions','human_actions','audit_events',
    'candidate_preferences','fact_corrections','job_sources','source_performance','learning_signals','learning_proposals','evaluation_runs','policy_versions',
    'workflow_operations','workflow_events','provider_circuit_states'
  ) and c.relforcerowsecurity),
  20,
  'all Job Agent tables force RLS'
);

select ok(
  not exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name in (
      'app_tenants','app_identities','applicant_profiles','applicant_facts','discovered_jobs','applications','document_versions','human_actions','audit_events',
      'candidate_preferences','fact_corrections','job_sources','source_performance','learning_signals','learning_proposals','evaluation_runs','policy_versions',
      'workflow_operations','workflow_events','provider_circuit_states'
    ) and has_table_privilege('anon', format('%I.%I', t.table_schema, t.table_name), 'select,insert,update,delete')
  ),
  'anon has no Job Agent table privileges'
);

select ok(
  not exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name in (
      'app_tenants','app_identities','applicant_profiles','applicant_facts','discovered_jobs','applications','document_versions','human_actions','audit_events',
      'candidate_preferences','fact_corrections','job_sources','source_performance','learning_signals','learning_proposals','evaluation_runs','policy_versions',
      'workflow_operations','workflow_events','provider_circuit_states'
    ) and has_table_privilege('authenticated', format('%I.%I', t.table_schema, t.table_name), 'select,insert,update,delete')
  ),
  'authenticated has no Job Agent table privileges unless a later reviewed migration explicitly exposes a table'
);

select ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and 'public' = any(roles)),
  'no Job Agent policy applies implicitly to PUBLIC'
);

select ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and cmd = 'ALL'),
  'policies are operation-specific rather than FOR ALL'
);

select ok(
  not exists (
    select 1
    from pg_policies update_policy
    where update_policy.schemaname = 'public'
      and update_policy.cmd = 'UPDATE'
      and (update_policy.qual is null or update_policy.with_check is null or not exists (
        select 1 from pg_policies select_policy
        where select_policy.schemaname = update_policy.schemaname
          and select_policy.tablename = update_policy.tablename
          and select_policy.cmd = 'SELECT'
      ))
  ),
  'every UPDATE policy has USING, WITH CHECK, and a corresponding SELECT policy'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.discovered_jobs$$,
  '42501',
  null,
  'anonymous callers cannot read tenant job records'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select count(*) from public.discovered_jobs$$,
  '42501',
  null,
  'direct authenticated callers cannot read server-owned tenant job records'
);
reset role;

insert into app_tenants (tenant_id) values (repeat('a', 40)), (repeat('b', 40));
insert into discovered_jobs (id, tenant_id, fingerprint, employer, title, direct_apply_url, status)
values
  ('11111111-1111-1111-1111-111111111111', repeat('a', 40), repeat('1', 64), 'Fixture A', 'Role A', 'https://example.test/a', 'Verified'),
  ('22222222-2222-2222-2222-222222222222', repeat('b', 40), repeat('2', 64), 'Fixture B', 'Role B', 'https://example.test/b', 'Verified');

set local role job_agent_backend;
select set_config('app.tenant_id', repeat('a', 40), true);

select results_eq(
  $$select count(*)::bigint from discovered_jobs$$,
  array[1::bigint],
  'User A sees only User A rows'
);

select results_eq(
  $$select count(*)::bigint from discovered_jobs where id = '22222222-2222-2222-2222-222222222222'$$,
  array[0::bigint],
  'User A cannot discover a hidden User B row'
);

select results_eq(
  $$select id from discovered_jobs order by employer, id limit 10 offset 0$$,
  array['11111111-1111-1111-1111-111111111111'::uuid],
  'filtering, ordering, and pagination do not reveal User B rows'
);

select throws_ok(
  $$insert into applications (tenant_id, job_id, state) values (repeat('a', 40), '22222222-2222-2222-2222-222222222222', 'Verified')$$,
  '23503',
  null,
  'cross-tenant parent reference is rejected by a tenant-scoped foreign key'
);

select lives_ok(
  $$insert into applications (id, tenant_id, job_id, state) values ('33333333-3333-3333-3333-333333333333', repeat('a', 40), '11111111-1111-1111-1111-111111111111', 'Verified')$$,
  'same-tenant parent references remain usable'
);

select results_eq(
  $$select count(*)::bigint from applications a join discovered_jobs j on j.id = a.job_id$$,
  array[1::bigint],
  'joins expose only same-tenant application and job rows'
);

select throws_ok(
  $$update discovered_jobs set tenant_id = repeat('b', 40) where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'ownership cannot be transferred to another tenant'
);

select results_eq(
  $$delete from discovered_jobs where id = '22222222-2222-2222-2222-222222222222' returning id$$,
  $$values (null::uuid) limit 0$$,
  'User A cannot delete User B rows'
);

select set_config('app.tenant_id', repeat('b', 40), true);
select results_eq(
  $$select count(*)::bigint from discovered_jobs where id = '11111111-1111-1111-1111-111111111111'$$,
  array[0::bigint],
  'User B cannot discover User A rows'
);

select set_config('app.tenant_id', '', true);
select results_eq(
  $$select count(*)::bigint from discovered_jobs$$,
  array[0::bigint],
  'an expired or invalid tenant context sees no tenant rows'
);

select * from finish();
rollback;
