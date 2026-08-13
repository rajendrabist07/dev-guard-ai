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
  commit_sha text not null,
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  review_run_id uuid not null references review_runs(id) on delete cascade,
  severity text not null check (severity in ('critical', 'warning', 'info')),
  file_path text not null,
  line int not null,
  message text not null,
  suggested_fix text,
  tool_source text
);

create index if not exists idx_repos_installation_id on repos(installation_id);
create index if not exists idx_repos_full_name on repos(full_name);
create index if not exists idx_review_runs_repo_id on review_runs(repo_id);
create index if not exists idx_review_runs_status on review_runs(status);
create index if not exists idx_findings_review_run_id on findings(review_run_id);
create index if not exists idx_findings_severity on findings(severity);
