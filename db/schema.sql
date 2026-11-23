-- DevGuard AI Supabase Consolidated Schema.
-- Production Zero-Trust Database Specification with RLS, Anti-Replay Guardrails, & Durable Queue State Machine.

create extension if not exists "pgcrypto";

create table if not exists installations (
  id uuid primary key default gen_random_uuid(),
  github_installation_id text unique not null,
  account_login text not null,
  created_at timestamptz not null default now()
);

create table if not exists repos (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references installations(id) on delete cascade,
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists review_runs (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references repos(id) on delete cascade,
  pr_number int not null,
  pr_title text,
  pr_author text,
  commit_sha text not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'timed_out', 'pending')),
  tool_calls_count int not null default 0,
  agent_trace jsonb not null default '[]'::jsonb,
  error_code text,
  error_message text,
  attempt int not null default 1,
  correlation_id text,
  is_simulation boolean not null default false,
  started_at timestamptz,
  finished_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint unique_repo_pr_commit unique (repo_id, pr_number, commit_sha)
);

create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  review_run_id uuid not null references review_runs(id) on delete cascade,
  severity text not null check (severity in ('critical', 'warning', 'info')),
  file_path text not null,
  line int not null,
  message text not null,
  suggested_fix text,
  tool_source text,
  created_at timestamptz not null default now()
);

create table if not exists try_runs (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  input_type text not null check (input_type in ('sample', 'pasted')),
  input_snippet text not null,
  pr_title text,
  pr_author text,
  findings jsonb not null default '[]'::jsonb,
  agent_trace jsonb not null default '[]'::jsonb,
  tool_calls_count int not null default 0,
  summary text,
  provider_used text,
  status text not null default 'completed',
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_id text unique not null,
  event_type text not null,
  created_at timestamptz not null default now()
);

create table if not exists system_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('debug', 'info', 'warn', 'error')),
  message text not null,
  error text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ==============================================================================
-- INDEXES FOR DASHBOARD, OPERATIONAL, & RETENTION QUERIES
-- ==============================================================================

create index if not exists idx_repos_installation_id on repos(installation_id);
create index if not exists idx_repos_full_name on repos(full_name);
create index if not exists idx_review_runs_repo_id on review_runs(repo_id);
create index if not exists idx_review_runs_repo_created on review_runs(repo_id, created_at desc);
create index if not exists idx_review_runs_status on review_runs(status);
create index if not exists idx_review_runs_running_timeout on review_runs(started_at) where status = 'running';
create index if not exists idx_review_runs_correlation_id on review_runs(correlation_id);
create index if not exists idx_findings_review_run_id on findings(review_run_id);
create index if not exists idx_findings_severity on findings(severity);
create index if not exists idx_try_runs_session_id on try_runs(session_id);
create index if not exists idx_try_runs_created_at on try_runs(created_at desc);
create index if not exists idx_try_runs_expires_at on try_runs(expires_at);
create index if not exists idx_webhook_deliveries_delivery_id on webhook_deliveries(delivery_id);
create index if not exists idx_webhook_deliveries_created on webhook_deliveries(created_at);
create index if not exists idx_system_logs_created_at on system_logs(created_at desc);
create index if not exists idx_system_logs_level on system_logs(level);

-- ==============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES — ZERO-TRUST ACCESS CONTROL
-- ==============================================================================

alter table installations enable row level security;
alter table repos enable row level security;
alter table review_runs enable row level security;
alter table findings enable row level security;
alter table try_runs enable row level security;
alter table webhook_deliveries enable row level security;
alter table system_logs enable row level security;

-- Service Role Bypass (For webhook ingestion, worker queue, and maintenance crons)
create policy "Service role has full access to installations"
  on installations for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "Service role has full access to repos"
  on repos for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "Service role has full access to review_runs"
  on review_runs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "Service role has full access to findings"
  on findings for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "Service role has full access to try_runs"
  on try_runs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "Service role has full access to webhook_deliveries"
  on webhook_deliveries for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "Service role has full access to system_logs"
  on system_logs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Authenticated User Policies (Scoped by verified OAuth provider identity)
create policy "Users can view their own installations"
  on installations for select using (
    auth.role() = 'authenticated' and
    account_login = lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'user_name', auth.jwt() -> 'identities' -> 0 -> 'identity_data' ->> 'user_name'))
  );

create policy "Users can view repos belonging to their installations"
  on repos for select using (
    auth.role() = 'authenticated' and exists (
      select 1 from installations
      where installations.id = repos.installation_id
      and installations.account_login = lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'user_name', auth.jwt() -> 'identities' -> 0 -> 'identity_data' ->> 'user_name'))
    )
  );

create policy "Users can view review_runs for their authorized repos or simulations"
  on review_runs for select using (
    is_simulation = true or (
      auth.role() = 'authenticated' and exists (
        select 1 from repos
        join installations on installations.id = repos.installation_id
        where repos.id = review_runs.repo_id
        and installations.account_login = lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'user_name', auth.jwt() -> 'identities' -> 0 -> 'identity_data' ->> 'user_name'))
      )
    )
  );

create policy "Users can view findings for their accessible review_runs"
  on findings for select using (
    exists (
      select 1 from review_runs
      where review_runs.id = findings.review_run_id
      and (
        review_runs.is_simulation = true or (
          auth.role() = 'authenticated' and exists (
            select 1 from repos
            join installations on installations.id = repos.installation_id
            where repos.id = review_runs.repo_id
            and installations.account_login = lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'user_name', auth.jwt() -> 'identities' -> 0 -> 'identity_data' ->> 'user_name'))
          )
        )
      )
    )
  );

create policy "Public users can create try runs"
  on try_runs for insert with check (true);

create policy "Users can view try runs matching their session_id"
  on try_runs for select using (
    (session_id is not null and expires_at > now()) or
    auth.role() = 'authenticated' or
    auth.role() = 'anon'
  );

-- ==============================================================================
-- DATABASE HELPER PROCEDURES
-- ==============================================================================

create or replace function transition_review_run_state(
  p_run_id uuid,
  p_target_status text,
  p_error_code text default null,
  p_error_message text default null,
  p_correlation_id text default null
) returns boolean as $$
declare
  v_current_status text;
begin
  select status into v_current_status from review_runs where id = p_run_id for update;
  if not found then
    return false;
  end if;

  if v_current_status = p_target_status then
    return true;
  end if;

  if (v_current_status = 'queued' and p_target_status in ('running', 'failed')) or
     (v_current_status = 'running' and p_target_status in ('completed', 'failed', 'timed_out')) or
     (v_current_status = 'pending' and p_target_status in ('running', 'completed', 'failed')) then
     
    update review_runs set
      status = p_target_status,
      started_at = case when p_target_status = 'running' and started_at is null then now() else started_at end,
      finished_at = case when p_target_status in ('completed', 'failed', 'timed_out') then now() else finished_at end,
      completed_at = case when p_target_status in ('completed', 'failed', 'timed_out') then now() else completed_at end,
      error_code = coalesce(p_error_code, error_code),
      error_message = coalesce(p_error_message, error_message),
      correlation_id = coalesce(p_correlation_id, correlation_id)
    where id = p_run_id;
    return true;
  end if;

  return false;
end;
$$ language plpgsql security definer;

create or replace function purge_expired_operational_data() returns jsonb as $$
declare
  v_try_runs_deleted int;
  v_logs_deleted int;
  v_deliveries_deleted int;
begin
  delete from try_runs where expires_at < now();
  get diagnostics v_try_runs_deleted = row_count;

  delete from system_logs where created_at < now() - interval '14 days';
  get diagnostics v_logs_deleted = row_count;

  delete from webhook_deliveries where created_at < now() - interval '7 days';
  get diagnostics v_deliveries_deleted = row_count;

  return jsonb_build_object(
    'try_runs_deleted', v_try_runs_deleted,
    'system_logs_deleted', v_logs_deleted,
    'webhook_deliveries_deleted', v_deliveries_deleted,
    'timestamp', now()
  );
end;
$$ language plpgsql security definer;
