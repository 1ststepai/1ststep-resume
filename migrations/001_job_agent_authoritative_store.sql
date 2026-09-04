create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'job_agent_backend') then
    create role job_agent_backend nologin noinherit nobypassrls;
  end if;
end $$;

create table if not exists app_tenants (
  tenant_id char(40) primary key check (tenant_id ~ '^[a-f0-9]{40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  provider text not null check (provider in ('clerk')),
  provider_subject text not null check (provider_subject ~ '^user_[A-Za-z0-9]+$'),
  email_hash char(64) not null check (email_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (provider, provider_subject),
  unique (tenant_id, provider)
);

create table if not exists applicant_profiles (
  tenant_id char(40) primary key references app_tenants(tenant_id) on delete cascade,
  version integer not null default 1 check (version > 0),
  encrypted_profile jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists applicant_facts (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  fact_key text not null check (length(fact_key) between 1 and 120),
  fact_version integer not null check (fact_version > 0),
  encrypted_value jsonb not null,
  provenance jsonb not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  confirmed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, fact_key, fact_version)
);

create table if not exists discovered_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  fingerprint char(64) not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  employer text not null,
  title text not null,
  requisition_id text,
  direct_apply_url text not null check (direct_apply_url ~ '^https://'),
  status text not null check (status in ('New','Verified','Package Ready','Needs You','Submitted','Interview','Rejected/Closed','Follow-up Due')),
  fit_score smallint check (fit_score between 0 and 100),
  verification_evidence jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_verified_at timestamptz,
  unique (tenant_id, fingerprint),
  unique (tenant_id, id)
);

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  job_id uuid not null,
  state text not null check (state in ('Found','Verified','Package Ready','Applying','Needs You','Submitted','Receipt Verified','Interview','Rejected/Closed','Follow-up Due')),
  version integer not null default 1 check (version > 0),
  receipt_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, job_id),
  unique (tenant_id, id),
  constraint applications_job_tenant_fk foreign key (tenant_id, job_id) references discovered_jobs(tenant_id, id) on delete restrict
);

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  application_id uuid,
  document_type text not null check (document_type in ('resume','cover-letter','receipt')),
  object_provider text not null check (object_provider in ('cloudflare-r2-private','vercel-blob-private')),
  object_key text not null,
  sha256 char(64) not null check (sha256 ~ '^[a-f0-9]{64}$'),
  ats_verified boolean not null default false,
  page_count smallint check (page_count between 1 and 20),
  created_at timestamptz not null default now(),
  unique (tenant_id, object_provider, object_key),
  constraint document_versions_application_tenant_fk foreign key (tenant_id, application_id) references applications(tenant_id, id) on delete cascade
);

create table if not exists human_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  application_id uuid,
  action_type text not null check (action_type in ('captcha','otp','identity-verification','ambiguous-fact','certification','outside-employment','transmission-confirmation','submission-confirmation')),
  status text not null check (status in ('open','resolved','expired','revoked')),
  safe_summary text not null check (length(safe_summary) between 1 and 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint human_actions_application_tenant_fk foreign key (tenant_id, application_id) references applications(tenant_id, id) on delete cascade
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  actor_type text not null check (actor_type in ('user','agent','worker','admin')),
  actor_id_hash char(64) not null check (actor_id_hash ~ '^[a-f0-9]{64}$'),
  event_type text not null check (length(event_type) between 1 and 120),
  object_type text not null check (length(object_type) between 1 and 80),
  object_id text not null check (length(object_id) between 1 and 160),
  safe_metadata jsonb not null default '{}'::jsonb,
  previous_hash char(64),
  event_hash char(64) not null check (event_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null default now(),
  unique (tenant_id, event_hash)
);

create index if not exists app_identities_tenant_idx on app_identities (tenant_id);
create index if not exists applicant_facts_tenant_active_idx on applicant_facts (tenant_id, fact_key) where revoked_at is null;
create index if not exists discovered_jobs_tenant_status_idx on discovered_jobs (tenant_id, status, last_verified_at desc);
create index if not exists applications_tenant_state_idx on applications (tenant_id, state, updated_at desc);
create index if not exists applications_job_idx on applications (job_id);
create index if not exists document_versions_tenant_application_idx on document_versions (tenant_id, application_id, created_at desc);
create index if not exists document_versions_application_idx on document_versions (application_id);
create index if not exists human_actions_tenant_open_idx on human_actions (tenant_id, created_at desc) where status = 'open';
create index if not exists human_actions_application_idx on human_actions (application_id);
create index if not exists audit_events_tenant_time_idx on audit_events (tenant_id, occurred_at desc);

do $$
declare target_table text;
begin
  foreach target_table in array array['app_tenants','app_identities','applicant_profiles','applicant_facts','discovered_jobs','applications','document_versions','human_actions','audit_events']
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

revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon;
revoke all on all sequences in schema public from authenticated;
grant usage on schema public to job_agent_backend;
grant select, insert, update, delete on app_tenants, app_identities, applicant_profiles, applicant_facts, discovered_jobs, applications, document_versions, human_actions, audit_events to job_agent_backend;
grant usage, select on all sequences in schema public to job_agent_backend;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on sequences from authenticated;
