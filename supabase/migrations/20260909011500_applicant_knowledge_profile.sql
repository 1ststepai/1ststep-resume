-- JA-003: additive ApplicantKnowledge/CareerProfile metadata.
-- Values remain encrypted by the application; this migration stores only encrypted
-- envelopes, bounded metadata, hashes, and private object references.
-- Do not apply to production without isolated-database evidence and explicit approval.

alter table applicant_profiles
  add column if not exists schema_version integer not null default 1 check (schema_version > 0),
  add column if not exists consent_status text not null default 'not-granted'
    check (consent_status in ('not-granted','granted','revoked')),
  add column if not exists consent_policy_version text,
  add column if not exists consent_updated_at timestamptz;

alter table applicant_facts
  add column if not exists verification_state text not null default 'unverified'
    check (verification_state in ('unverified','user-confirmed','document-verified','expired','revoked')),
  add column if not exists sensitivity text not null default 'standard'
    check (sensitivity in ('standard','sensitive','highly-sensitive')),
  add column if not exists reuse_policy text not null default 'review-required'
    check (reuse_policy in ('never','review-required','allowed-within-scope')),
  add column if not exists reuse_scope jsonb not null default '{}'::jsonb,
  add column if not exists source_type text not null default 'legacy-import'
    check (source_type in ('user','document','application-answer','legacy-import','system-proposal')),
  add column if not exists evidence_sha256 char(64)
    check (evidence_sha256 is null or evidence_sha256 ~ '^[a-f0-9]{64}$'),
  add column if not exists expires_at timestamptz,
  add column if not exists superseded_at timestamptz;

-- Preserve every existing fact ID/version while making the highest non-revoked
-- version authoritative. Older rows remain available for audit and rollback.
with ranked as (
  select id, row_number() over (partition by tenant_id, fact_key order by fact_version desc, created_at desc, id desc) as position
  from applicant_facts
  where revoked_at is null
)
update applicant_facts as fact
set superseded_at = coalesce(fact.superseded_at, now())
from ranked
where fact.id = ranked.id and ranked.position > 1;

create unique index if not exists applicant_facts_tenant_current_key_idx
  on applicant_facts (tenant_id, fact_key)
  where revoked_at is null and superseded_at is null;
create index if not exists applicant_facts_tenant_expiry_idx
  on applicant_facts (tenant_id, expires_at)
  where revoked_at is null and superseded_at is null and expires_at is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'applicant_facts_tenant_id_version_key') then
    alter table applicant_facts add constraint applicant_facts_tenant_id_version_key unique (tenant_id, id, fact_version);
  end if;
end $$;

create table if not exists applicant_profile_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  profile_version integer not null check (profile_version > 0),
  schema_version integer not null check (schema_version > 0),
  encrypted_profile jsonb not null,
  change_reason text not null check (length(change_reason) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (tenant_id, profile_version),
  unique (tenant_id, id)
);

create table if not exists applicant_fact_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  fact_id uuid not null,
  fact_version integer not null check (fact_version > 0),
  evidence_type text not null check (evidence_type in ('user-confirmation','document','application-answer','import-record')),
  object_provider text check (object_provider is null or object_provider in ('cloudflare-r2-private','vercel-blob-private')),
  object_key text,
  evidence_sha256 char(64) not null check (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, fact_id, fact_version, evidence_sha256),
  constraint applicant_fact_evidence_fact_tenant_fk
    foreign key (tenant_id, fact_id, fact_version)
    references applicant_facts(tenant_id, id, fact_version) on delete cascade,
  constraint applicant_fact_evidence_object_pair_check
    check ((object_provider is null and object_key is null) or (object_provider is not null and length(object_key) between 1 and 1024))
);

create table if not exists applicant_fact_reuse_scopes (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  fact_id uuid not null,
  fact_version integer not null check (fact_version > 0),
  scope_type text not null check (scope_type in ('global','employer','application','question-concept')),
  scope_key_hash char(64) check (scope_key_hash is null or scope_key_hash ~ '^[a-f0-9]{64}$'),
  reuse_allowed boolean not null default false,
  confirmed_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint applicant_fact_reuse_scopes_fact_tenant_fk
    foreign key (tenant_id, fact_id, fact_version)
    references applicant_facts(tenant_id, id, fact_version) on delete cascade,
  constraint applicant_fact_reuse_scopes_global_key_check
    check ((scope_type = 'global' and scope_key_hash is null) or (scope_type <> 'global' and scope_key_hash is not null)),
  constraint applicant_fact_reuse_scopes_confirmation_check
    check (reuse_allowed = false or confirmed_at is not null)
);

create index if not exists applicant_profile_versions_tenant_time_idx
  on applicant_profile_versions (tenant_id, profile_version desc);
create index if not exists applicant_fact_evidence_tenant_fact_idx
  on applicant_fact_evidence (tenant_id, fact_id, fact_version);
create index if not exists applicant_fact_reuse_scopes_tenant_active_idx
  on applicant_fact_reuse_scopes (tenant_id, fact_id, fact_version)
  where revoked_at is null;
create unique index if not exists applicant_fact_reuse_scopes_identity_idx
  on applicant_fact_reuse_scopes (tenant_id, fact_id, fact_version, scope_type, coalesce(scope_key_hash, ''));

do $$
declare target_table text;
begin
  foreach target_table in array array['applicant_profile_versions','applicant_fact_evidence','applicant_fact_reuse_scopes']
  loop
    execute format('alter table %I enable row level security', target_table);
    execute format('alter table %I force row level security', target_table);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = target_table || '_backend_select') then
      execute format('create policy %I on %I for select to job_agent_backend using (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))', target_table || '_backend_select', target_table);
      execute format('create policy %I on %I for insert to job_agent_backend with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))', target_table || '_backend_insert', target_table);
      execute format('create policy %I on %I for update to job_agent_backend using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))', target_table || '_backend_update', target_table);
      execute format('create policy %I on %I for delete to job_agent_backend using (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))', target_table || '_backend_delete', target_table);
    end if;
  end loop;
end $$;

revoke all on applicant_profile_versions, applicant_fact_evidence, applicant_fact_reuse_scopes from public, anon, authenticated;
grant select, insert, update, delete on applicant_profile_versions, applicant_fact_evidence, applicant_fact_reuse_scopes to job_agent_backend;
