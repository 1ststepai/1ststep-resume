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
