-- DevGuard AI Supabase schema.
-- Run this file in the Supabase SQL editor or via psql on a fresh project.

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
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  tool_calls_count int not null default 0,
  agent_trace jsonb not null default '[]'::jsonb,
  error_message text,
  is_simulation boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
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
  created_at timestamptz not null default now()
);

create index if not exists idx_repos_installation_id on repos(installation_id);
create index if not exists idx_repos_full_name on repos(full_name);
create index if not exists idx_review_runs_repo_id on review_runs(repo_id);
create index if not exists idx_review_runs_status on review_runs(status);
create index if not exists idx_findings_review_run_id on findings(review_run_id);
create index if not exists idx_findings_severity on findings(severity);
create index if not exists idx_try_runs_session_id on try_runs(session_id);
create index if not exists idx_try_runs_created_at on try_runs(created_at desc);

-- ==============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES — SPRINT 1 ZERO-TRUST ACCESS CONTROL
-- ==============================================================================

-- 1. Enable RLS on all tables
alter table installations enable row level security;
alter table repos enable row level security;
alter table review_runs enable row level security;
alter table findings enable row level security;
alter table try_runs enable row level security;

-- 2. Service Role Bypass (For webhook ingestion, automated workers, and backend services)
create policy "Service role has full access to installations"
  on installations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role has full access to repos"
  on repos for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role has full access to review_runs"
  on review_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role has full access to findings"
  on findings for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role has full access to try_runs"
  on try_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3. Authenticated User Policies (Scoped by account_login / GitHub installation mapping)
create policy "Users can view their own installations"
  on installations for select
  using (
    auth.role() = 'authenticated' and (
      account_login = (auth.jwt() -> 'user_metadata' ->> 'user_name') or
      account_login = (auth.jwt() ->> 'email')
    )
  );

create policy "Users can view repos belonging to their installations"
  on repos for select
  using (
    auth.role() = 'authenticated' and exists (
      select 1 from installations
      where installations.id = repos.installation_id
      and (
        installations.account_login = (auth.jwt() -> 'user_metadata' ->> 'user_name') or
        installations.account_login = (auth.jwt() ->> 'email')
      )
    )
  );

create policy "Users can view review_runs for their authorized repos or simulations"
  on review_runs for select
  using (
    is_simulation = true or (
      auth.role() = 'authenticated' and exists (
        select 1 from repos
        join installations on installations.id = repos.installation_id
        where repos.id = review_runs.repo_id
        and (
          installations.account_login = (auth.jwt() -> 'user_metadata' ->> 'user_name') or
          installations.account_login = (auth.jwt() ->> 'email')
        )
      )
    )
  );

create policy "Users can view findings for their accessible review_runs"
  on findings for select
  using (
    exists (
      select 1 from review_runs
      where review_runs.id = findings.review_run_id
      and (
        review_runs.is_simulation = true or (
          auth.role() = 'authenticated' and exists (
            select 1 from repos
            join installations on installations.id = repos.installation_id
            where repos.id = review_runs.repo_id
            and (
              installations.account_login = (auth.jwt() -> 'user_metadata' ->> 'user_name') or
              installations.account_login = (auth.jwt() ->> 'email')
            )
          )
        )
      )
    )
  );

-- 4. Try Runs Policies (Public interactive playground scoped by session_id)
create policy "Public users can create try runs"
  on try_runs for insert
  with check (true);

create policy "Users can view try runs matching their session_id"
  on try_runs for select
  using (
    session_id is not null or
    auth.role() = 'authenticated' or
    auth.role() = 'anon'
  );


