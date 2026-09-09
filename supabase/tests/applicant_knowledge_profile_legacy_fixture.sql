-- Synthetic pre-JA-003 rows for isolated migration/backfill verification only.
insert into app_tenants (tenant_id) values (repeat('e', 40));

insert into applicant_facts (
  id, tenant_id, fact_key, fact_version, encrypted_value, provenance,
  confidence, confirmed_at, created_at
) values (
  '30000000-0000-0000-0000-000000000001', repeat('e', 40),
  'legacy.preference', 1,
  '{"algorithm":"legacy","payload":"synthetic-v1"}'::jsonb,
  '{"source":"synthetic-test"}'::jsonb,
  0.7, null, '2026-09-09T10:00:00Z'
);
