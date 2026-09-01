-- Read-only catalog inventory for an explicitly proven non-production target.
-- This file returns schema metadata only. It does not inspect application rows.

select
  n.nspname as schema_name,
  c.relname as object_name,
  c.relkind as object_kind,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage')
  and c.relkind in ('r', 'p', 'v', 'm', 'S')
order by n.nspname, c.relkind, c.relname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by grantee, table_schema, table_name, privilege_type;

select
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer,
  pg_catalog.pg_get_userbyid(p.proowner) as owner
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'storage')
order by n.nspname, p.proname;

select
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema as foreign_schema,
  ccu.table_name as foreign_table,
  ccu.column_name as foreign_column,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
 and kcu.constraint_schema = tc.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.constraint_schema = tc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema in ('public', 'storage')
order by tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position;
