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
