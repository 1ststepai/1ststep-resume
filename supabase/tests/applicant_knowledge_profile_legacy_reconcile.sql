-- Reconcile the isolated legacy fixture, then add a later version to exercise
-- deterministic lineage and current-version backfill.
update applicant_facts
set confirmed_at = '2026-09-09T10:05:00Z',
    encrypted_value = '{"algorithm":"A256GCM","keyId":"key-1","iv":"QUJDRA==","tag":"QUJDRA==","ciphertext":"QUJDRA=="}'::jsonb
where id = '30000000-0000-0000-0000-000000000001';

insert into applicant_facts (
  id, tenant_id, fact_key, fact_version, encrypted_value, provenance,
  confidence, confirmed_at, created_at
) values (
  '30000000-0000-0000-0000-000000000002', repeat('e', 40),
  'legacy.preference', 2,
  '{"algorithm":"A256GCM","keyId":"key-1","iv":"QUJDRA==","tag":"QUJDRA==","ciphertext":"QUJDRA=="}'::jsonb,
  '{"source":"synthetic-test"}'::jsonb,
  0.8, '2026-09-09T11:05:00Z', '2026-09-09T11:00:00Z'
);
