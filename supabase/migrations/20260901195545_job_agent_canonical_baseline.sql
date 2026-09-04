-- Canonical Job Agent baseline.
-- Created with `supabase migration new`; reconciled deterministically from the reviewed 001-003 source files.
-- Do not apply to production until an isolated target passes pgTAP, advisors, drift review, and recovery evidence.
-- BEGIN REVIEWED SOURCE: 001_job_agent_authoritative_store.sql
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
-- END REVIEWED SOURCE: 001_job_agent_authoritative_store.sql

-- BEGIN REVIEWED SOURCE: 002_job_agent_continuous_improvement.sql
-- Tenant-isolated authoritative projection for the Redis-backed beta learning layer.
-- Candidate values remain encrypted by the application before persistence.

create table if not exists candidate_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  preference_key text not null check (length(preference_key) between 1 and 120),
  encrypted_normalized_value jsonb not null,
  provenance jsonb not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  verification_status text not null check (verification_status in ('user-confirmed','document-verified','direct-employer-verified','provider-confirmed')),
  user_confirmed boolean not null default false,
  status text not null check (status in ('active','revoked')),
  recorded_at timestamptz not null,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_id, preference_key, recorded_at),
  unique (tenant_id, id)
);

create table if not exists fact_corrections (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  preference_id uuid not null,
  encrypted_previous_value jsonb not null,
  encrypted_corrected_value jsonb not null,
  provenance jsonb not null,
  user_confirmed boolean not null check (user_confirmed = true),
  corrected_at timestamptz not null,
  constraint fact_corrections_preference_tenant_fk foreign key (tenant_id, preference_id) references candidate_preferences(tenant_id, id) on delete cascade
);

create table if not exists job_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (length(provider) between 1 and 60),
  employer_hash char(64) not null check (employer_hash ~ '^[a-f0-9]{64}$'),
  contract_mode text not null check (contract_mode in ('public-api','employer-specific-contract','third-party-lead')),
  activation_status text not null check (activation_status in ('operational','operator-review-required','disabled')),
  created_at timestamptz not null default now(),
  unique (provider, employer_hash)
);

create table if not exists source_performance (
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  source_id uuid not null references job_sources(id) on delete cascade,
  counters jsonb not null default '{}'::jsonb,
  priority_score smallint not null check (priority_score between 0 and 100),
  consecutive_failures smallint not null default 0 check (consecutive_failures >= 0),
  last_successful_scan timestamptz,
  retry_after timestamptz,
  current_error_code text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, source_id)
);

create table if not exists learning_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  signal_type text not null check (length(signal_type) between 1 and 80),
  verification_status text not null check (verification_status in ('user-confirmed','direct-employer-verified','authoritative-receipt','provider-confirmed')),
  subject_type text not null check (length(subject_type) between 1 and 60),
  subject_id_hash char(64) not null check (subject_id_hash ~ '^[a-f0-9]{64}$'),
  safe_metrics jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null,
  unique (tenant_id, id)
);

create table if not exists learning_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  proposal_version text not null,
  proposal_type text not null,
  risk_level text not null check (risk_level in ('low','high')),
  status text not null check (status in ('proposed','evaluated','failed-evaluation','promoted','rejected','rolled-back')),
  evidence jsonb not null,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  rollback_policy_version text not null,
  created_at timestamptz not null,
  promoted_at timestamptz,
  unique (tenant_id, proposal_version),
  unique (tenant_id, id)
);

create table if not exists evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  proposal_id uuid not null,
  dataset_version text not null,
  fixture_results jsonb not null,
  safety_results jsonb not null,
  passed boolean not null,
  evaluated_at timestamptz not null,
  constraint evaluation_runs_proposal_tenant_fk foreign key (tenant_id, proposal_id) references learning_proposals(tenant_id, id) on delete cascade
);

create table if not exists policy_versions (
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  version text not null,
  parent_version text,
  proposal_id uuid,
  policy_body jsonb not null,
  status text not null check (status in ('active','superseded','rolled-back')),
  activated_at timestamptz not null,
  rolled_back_at timestamptz,
  primary key (tenant_id, version),
  constraint policy_versions_proposal_tenant_fk foreign key (tenant_id, proposal_id) references learning_proposals(tenant_id, id) on delete set null
);

create index if not exists candidate_preferences_tenant_active_idx on candidate_preferences (tenant_id, preference_key) where revoked_at is null;
create index if not exists source_performance_tenant_priority_idx on source_performance (tenant_id, priority_score desc, updated_at desc);
create index if not exists learning_signals_tenant_time_idx on learning_signals (tenant_id, recorded_at desc);
create index if not exists learning_proposals_tenant_status_idx on learning_proposals (tenant_id, status, created_at desc);
create index if not exists evaluation_runs_tenant_time_idx on evaluation_runs (tenant_id, evaluated_at desc);
create index if not exists policy_versions_tenant_status_idx on policy_versions (tenant_id, status, activated_at desc);

do $$
declare target_table text;
begin
  foreach target_table in array array['candidate_preferences','fact_corrections','source_performance','learning_signals','learning_proposals','evaluation_runs','policy_versions']
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

alter table job_sources enable row level security;
alter table job_sources force row level security;
create policy job_sources_backend_select on job_sources for select to job_agent_backend using (true);
create policy job_sources_backend_insert on job_sources for insert to job_agent_backend with check (true);
create policy job_sources_backend_update on job_sources for update to job_agent_backend using (true) with check (true);
create policy job_sources_backend_delete on job_sources for delete to job_agent_backend using (true);
revoke all on candidate_preferences, fact_corrections, job_sources, source_performance, learning_signals, learning_proposals, evaluation_runs, policy_versions from public;
revoke all on candidate_preferences, fact_corrections, job_sources, source_performance, learning_signals, learning_proposals, evaluation_runs, policy_versions from anon;
revoke all on candidate_preferences, fact_corrections, job_sources, source_performance, learning_signals, learning_proposals, evaluation_runs, policy_versions from authenticated;
grant select, insert, update, delete on candidate_preferences, fact_corrections, job_sources, source_performance, learning_signals, learning_proposals, evaluation_runs, policy_versions to job_agent_backend;
-- END REVIEWED SOURCE: 002_job_agent_continuous_improvement.sql

-- BEGIN REVIEWED SOURCE: 003_job_agent_resilience.sql
-- Relational projection for durable workflow operations and privacy-safe resilience events.
-- The current beta runtime remains Redis-backed; apply this only after operator review.

create table if not exists workflow_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  run_id text not null,
  operation_id text not null,
  parent_run_id text,
  application_package_run_id text,
  task_type text not null,
  lifecycle_state text not null check (lifecycle_state in ('Queued','Searching','Verifying','Preparing','Waiting for You','Paused','Retrying','Completed','Partially Completed','Failed Safely')),
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null check (max_attempts between 1 and 20),
  last_error_class text,
  next_retry_at timestamptz,
  last_heartbeat_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (tenant_id, run_id),
  unique (tenant_id, operation_id)
);

create table if not exists workflow_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  operation_id text not null,
  event_type text not null,
  provider text,
  safe_error_class text,
  attempt integer not null default 0,
  occurred_at timestamptz not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  unique (tenant_id, operation_id, event_type, attempt, occurred_at),
  constraint workflow_events_operation_tenant_fk foreign key (tenant_id, operation_id) references workflow_operations(tenant_id, operation_id) on delete cascade
);

create table if not exists provider_circuit_states (
  tenant_id char(40) not null references app_tenants(tenant_id) on delete cascade,
  source_identity_hash char(64) not null,
  status text not null check (status in ('closed','open','half-open')),
  failure_count integer not null default 0 check (failure_count >= 0),
  opened_until timestamptz,
  last_error_class text,
  updated_at timestamptz not null,
  primary key (tenant_id, source_identity_hash)
);

create index if not exists workflow_operations_tenant_state_idx on workflow_operations (tenant_id, lifecycle_state, updated_at desc);
create index if not exists workflow_events_tenant_time_idx on workflow_events (tenant_id, occurred_at desc);

do $$
declare target_table text;
begin
  foreach target_table in array array['workflow_operations','workflow_events','provider_circuit_states'] loop
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

revoke all on workflow_operations, workflow_events, provider_circuit_states from public;
revoke all on workflow_operations, workflow_events, provider_circuit_states from anon;
revoke all on workflow_operations, workflow_events, provider_circuit_states from authenticated;
grant select, insert, update, delete on workflow_operations, workflow_events, provider_circuit_states to job_agent_backend;
-- END REVIEWED SOURCE: 003_job_agent_resilience.sql
