-- JA-003: additive ApplicantKnowledge/CareerProfile metadata.
-- Fact identity model: applicant_facts.id identifies one immutable version row;
-- fact_lineage_id identifies the stable fact across versions. Evidence is bound to
-- one version row. An active applicant_fact_reuse_scopes row is the sole reuse grant
-- and is bound to the stable lineage, so a new version cannot silently erase consent.
-- Values remain application-encrypted A256GCM envelopes. Metadata is bounded or hashed.
-- Do not apply anywhere until an isolated target passes runtime RLS, DDL, and rollback tests.

begin;

alter table applicant_profiles
  add column if not exists schema_version integer not null default 1 check (schema_version > 0),
  add column if not exists consent_status text not null default 'not-granted'
    check (consent_status in ('not-granted','granted','revoked')),
  add column if not exists consent_policy_version text,
  add column if not exists consent_updated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'applicant_profiles_consent_metadata_check' and conrelid = 'applicant_profiles'::regclass) then
    alter table applicant_profiles add constraint applicant_profiles_consent_metadata_check check (
      (consent_policy_version is null or consent_policy_version ~ '^[A-Za-z0-9._-]{1,64}$')
      and (
        (consent_status = 'not-granted' and consent_policy_version is null)
        or (consent_status in ('granted','revoked') and consent_policy_version is not null and consent_updated_at is not null)
      )
    );
  end if;
end $$;

alter table applicant_facts
  add column if not exists fact_lineage_id uuid,
  add column if not exists verification_state text,
  add column if not exists sensitivity text not null default 'standard'
    check (sensitivity in ('standard','sensitive','highly-sensitive')),
  add column if not exists source_type text not null default 'legacy-import'
    check (source_type in ('user','document','application-answer','legacy-import')),
  add column if not exists expires_at timestamptz,
  add column if not exists superseded_at timestamptz;

create table if not exists applicant_fact_lineages (
  id uuid primary key,
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  fact_key text not null check (fact_key ~ '^[A-Za-z][A-Za-z0-9._-]{0,119}$'),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, fact_key)
);

-- FORCE RLS already exists on applicant_facts. DDL requires table ownership, so
-- disable RLS transactionally for deterministic migration-only reconciliation,
-- assert every intended row changed, then restore ENABLE + FORCE before grants.
alter table applicant_facts disable row level security;

do $$
declare
  expected_lineage_rows bigint;
  updated_lineage_rows bigint;
  expected_superseded_rows bigint;
  updated_superseded_rows bigint;
begin
  if exists (select 1 from applicant_facts where confirmed_at is null) then
    raise exception 'JA003_UNCONFIRMED_LEGACY_FACTS_REQUIRE_RECONCILIATION';
  end if;

  select count(*) into expected_lineage_rows
  from applicant_facts where fact_lineage_id is null;

  with roots as (
    select distinct on (tenant_id, fact_key) tenant_id, fact_key, id as lineage_id
    from applicant_facts
    order by tenant_id, fact_key, fact_version asc, created_at asc, id asc
  )
  update applicant_facts as fact
  set fact_lineage_id = roots.lineage_id,
      verification_state = coalesce(fact.verification_state, 'user-confirmed')
  from roots
  where fact.tenant_id = roots.tenant_id
    and fact.fact_key = roots.fact_key
    and fact.fact_lineage_id is null;
  get diagnostics updated_lineage_rows = row_count;
  if updated_lineage_rows <> expected_lineage_rows then
    raise exception 'JA003_LINEAGE_BACKFILL_MISMATCH expected=% updated=%', expected_lineage_rows, updated_lineage_rows;
  end if;

  update applicant_facts
  set verification_state = 'user-confirmed'
  where verification_state is null;

  if exists (
    select 1 from applicant_facts
    group by tenant_id, fact_key
    having count(distinct fact_lineage_id) <> 1
  ) then
    raise exception 'JA003_FACT_LINEAGE_INCONSISTENT';
  end if;

  select count(*) into expected_superseded_rows
  from (
    select id, row_number() over (
      partition by tenant_id, fact_lineage_id
      order by fact_version desc, created_at desc, id desc
    ) as position
    from applicant_facts
    where revoked_at is null and superseded_at is null
  ) ranked
  where ranked.position > 1;

  with ranked as (
    select id, row_number() over (
      partition by tenant_id, fact_lineage_id
      order by fact_version desc, created_at desc, id desc
    ) as position
    from applicant_facts
    where revoked_at is null and superseded_at is null
  )
  update applicant_facts as fact
  set superseded_at = greatest(fact.created_at, now())
  from ranked
  where fact.id = ranked.id and ranked.position > 1;
  get diagnostics updated_superseded_rows = row_count;
  if updated_superseded_rows <> expected_superseded_rows then
    raise exception 'JA003_CURRENT_BACKFILL_MISMATCH expected=% updated=%', expected_superseded_rows, updated_superseded_rows;
  end if;
end $$;

insert into applicant_fact_lineages (id, tenant_id, fact_key, created_at)
select fact_lineage_id, tenant_id, fact_key, min(created_at)
from applicant_facts
group by fact_lineage_id, tenant_id, fact_key
on conflict (tenant_id, fact_key) do nothing;

do $$
begin
  if exists (
    select 1
    from applicant_facts as fact
    left join applicant_fact_lineages as lineage
      on lineage.tenant_id = fact.tenant_id
      and lineage.id = fact.fact_lineage_id
      and lineage.fact_key = fact.fact_key
    where lineage.id is null
  ) then
    raise exception 'JA003_LINEAGE_REGISTRY_MISMATCH';
  end if;
end $$;

alter table applicant_facts
  alter column fact_lineage_id set not null,
  alter column verification_state set not null,
  alter column confirmed_at set not null,
  add constraint applicant_facts_verification_state_check
    check (verification_state in ('user-confirmed','document-verified')),
  add constraint applicant_facts_expiry_check
    check (expires_at is null or expires_at > confirmed_at),
  add constraint applicant_facts_superseded_time_check
    check (superseded_at is null or superseded_at >= created_at);

alter table applicant_facts enable row level security;
alter table applicant_facts force row level security;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'applicant_facts_tenant_id_version_key'
      and conrelid = 'applicant_facts'::regclass
  ) then
    alter table applicant_facts
      add constraint applicant_facts_tenant_id_version_key unique (tenant_id, id, fact_version);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'applicant_facts_lineage_tenant_fk'
      and conrelid = 'applicant_facts'::regclass
  ) then
    alter table applicant_facts
      add constraint applicant_facts_lineage_tenant_fk
      foreign key (tenant_id, fact_lineage_id)
      references applicant_fact_lineages(tenant_id, id) on delete restrict;
  end if;
end $$;

create unique index if not exists applicant_facts_tenant_current_lineage_idx
  on applicant_facts (tenant_id, fact_lineage_id)
  where revoked_at is null and superseded_at is null;
create index if not exists applicant_facts_tenant_expiry_idx
  on applicant_facts (tenant_id, expires_at)
  where revoked_at is null and superseded_at is null and expires_at is not null;

create or replace function applicant_facts_maintain_current_version()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.revoked_at is null and new.superseded_at is null then
    update public.applicant_facts
    set superseded_at = greatest(created_at, new.created_at)
    where tenant_id = new.tenant_id
      and fact_lineage_id = new.fact_lineage_id
      and id <> new.id
      and revoked_at is null
      and superseded_at is null;
  end if;
  return new;
end $$;

drop trigger if exists applicant_facts_maintain_current_version_trigger on applicant_facts;
create trigger applicant_facts_maintain_current_version_trigger
before insert on applicant_facts
for each row execute function applicant_facts_maintain_current_version();

create table if not exists applicant_profile_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  profile_version integer not null check (profile_version > 0),
  schema_version integer not null check (schema_version > 0),
  encrypted_profile jsonb not null,
  change_reason text not null check (change_reason in (
    'initial-import','user-confirmed-update','document-refresh',
    'consent-change','revocation','system-reconciliation'
  )),
  created_at timestamptz not null default now(),
  unique (tenant_id, profile_version),
  unique (tenant_id, id),
  constraint applicant_profile_versions_envelope_check check (
    jsonb_typeof(encrypted_profile) = 'object'
    and encrypted_profile ?& array['algorithm','keyId','iv','tag','ciphertext']
    and encrypted_profile->>'algorithm' = 'A256GCM'
    and encrypted_profile->>'keyId' ~ '^[A-Za-z0-9._-]{1,64}$'
    and encrypted_profile->>'iv' ~ '^[A-Za-z0-9+/]+={0,2}$'
    and encrypted_profile->>'tag' ~ '^[A-Za-z0-9+/]+={0,2}$'
    and encrypted_profile->>'ciphertext' ~ '^[A-Za-z0-9+/]+={0,2}$'
  )
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
  constraint applicant_fact_evidence_object_pair_check check (
    (object_provider is null and object_key is null)
    or (object_provider is not null and object_key is not null and object_key ~ '^[a-z0-9_-]{16,128}(/[a-z0-9_-]{16,128}){1,4}$')
  )
);

-- Active rows in this table are the sole authority for fact reuse permission.
-- The encrypted legacy vault's autoReuse/scope fields must become import inputs,
-- not a second authorization source, when the store/API is built.
create table if not exists applicant_fact_reuse_scopes (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  fact_lineage_id uuid not null,
  scope_type text not null check (scope_type in ('global','employer','application','question-concept')),
  scope_key_hash char(64) check (scope_key_hash is null or scope_key_hash ~ '^[a-f0-9]{64}$'),
  consent_policy_version text not null check (consent_policy_version ~ '^[A-Za-z0-9._-]{1,64}$'),
  confirmed_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint applicant_fact_reuse_scopes_lineage_tenant_fk
    foreign key (tenant_id, fact_lineage_id)
    references applicant_fact_lineages(tenant_id, id) on delete cascade,
  constraint applicant_fact_reuse_scopes_global_key_check check (
    (scope_type = 'global' and scope_key_hash is null)
    or (scope_type <> 'global' and scope_key_hash is not null)
  ),
  constraint applicant_fact_reuse_scopes_time_check check (
    (expires_at is null or expires_at > confirmed_at)
    and (revoked_at is null or revoked_at >= confirmed_at)
  )
);

create index if not exists applicant_profile_versions_tenant_time_idx
  on applicant_profile_versions (tenant_id, profile_version desc);
create index if not exists applicant_fact_evidence_tenant_fact_idx
  on applicant_fact_evidence (tenant_id, fact_id, fact_version);
create index if not exists applicant_fact_reuse_scopes_tenant_active_idx
  on applicant_fact_reuse_scopes (tenant_id, fact_lineage_id)
  where revoked_at is null;
create unique index if not exists applicant_fact_reuse_scopes_identity_idx
  on applicant_fact_reuse_scopes (tenant_id, fact_lineage_id, scope_type, coalesce(scope_key_hash, ''))
  where revoked_at is null;

do $$
declare target_table text;
begin
  foreach target_table in array array[
    'applicant_fact_lineages','applicant_profile_versions',
    'applicant_fact_evidence','applicant_fact_reuse_scopes'
  ] loop
    execute format('alter table %I enable row level security', target_table);
    execute format('alter table %I force row level security', target_table);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = target_table || '_backend_select') then
      execute format('create policy %I on %I for select to job_agent_backend using (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))', target_table || '_backend_select', target_table);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = target_table || '_backend_insert') then
      execute format('create policy %I on %I for insert to job_agent_backend with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))', target_table || '_backend_insert', target_table);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = target_table || '_backend_update') then
      execute format('create policy %I on %I for update to job_agent_backend using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))', target_table || '_backend_update', target_table);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = target_table || '_backend_delete') then
      execute format('create policy %I on %I for delete to job_agent_backend using (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))', target_table || '_backend_delete', target_table);
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'applicant_profiles_envelope_check' and conrelid = 'applicant_profiles'::regclass) then
    alter table applicant_profiles add constraint applicant_profiles_envelope_check check (
      jsonb_typeof(encrypted_profile) = 'object'
      and encrypted_profile ?& array['algorithm','keyId','iv','tag','ciphertext']
      and encrypted_profile->>'algorithm' = 'A256GCM'
      and encrypted_profile->>'keyId' ~ '^[A-Za-z0-9._-]{1,64}$'
      and encrypted_profile->>'iv' ~ '^[A-Za-z0-9+/]+={0,2}$'
      and encrypted_profile->>'tag' ~ '^[A-Za-z0-9+/]+={0,2}$'
      and encrypted_profile->>'ciphertext' ~ '^[A-Za-z0-9+/]+={0,2}$'
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'applicant_facts_envelope_check' and conrelid = 'applicant_facts'::regclass) then
    alter table applicant_facts add constraint applicant_facts_envelope_check check (
      jsonb_typeof(encrypted_value) = 'object'
      and encrypted_value ?& array['algorithm','keyId','iv','tag','ciphertext']
      and encrypted_value->>'algorithm' = 'A256GCM'
      and encrypted_value->>'keyId' ~ '^[A-Za-z0-9._-]{1,64}$'
      and encrypted_value->>'iv' ~ '^[A-Za-z0-9+/]+={0,2}$'
      and encrypted_value->>'tag' ~ '^[A-Za-z0-9+/]+={0,2}$'
      and encrypted_value->>'ciphertext' ~ '^[A-Za-z0-9+/]+={0,2}$'
    );
  end if;
end $$;

revoke all on applicant_fact_lineages, applicant_profile_versions, applicant_fact_evidence, applicant_fact_reuse_scopes from public, anon, authenticated;
grant select, insert, update, delete on applicant_fact_lineages, applicant_profile_versions, applicant_fact_evidence, applicant_fact_reuse_scopes to job_agent_backend;

commit;
