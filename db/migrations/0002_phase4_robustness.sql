-- Migration: 0002_phase4_robustness.sql
-- Backend Robustness, State Machine Evolution, Performance Indexes & Retention

-- 1. Review Run State Machine & Metrics Evolution
alter table review_runs add column if not exists finished_at timestamptz;
alter table review_runs add column if not exists attempt int not null default 1;
alter table review_runs add column if not exists error_code text;
alter table review_runs add column if not exists correlation_id text;

-- Update status check constraint to support durable queue lifecycle
alter table review_runs drop constraint if exists review_runs_status_check;
alter table review_runs add constraint review_runs_status_check 
  check (status in ('queued', 'running', 'completed', 'failed', 'timed_out', 'pending'));

-- 2. Performance Indexes for Dashboard & Operational Queries
create index if not exists idx_review_runs_repo_created on review_runs(repo_id, created_at desc);
create index if not exists idx_review_runs_status on review_runs(status);
create index if not exists idx_review_runs_running_timeout on review_runs(started_at) where status = 'running';
create index if not exists idx_review_runs_correlation_id on review_runs(correlation_id);
create index if not exists idx_webhook_deliveries_created on webhook_deliveries(created_at);
create index if not exists idx_system_logs_created on system_logs(created_at);

-- 3. State Machine Transition Verification Function
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

  -- Validate state machine transitions
  -- queued -> running
  -- running -> completed | failed | timed_out
  -- queued -> failed (e.g. fatal setup error / dropped by queue)
  if v_current_status = p_target_status then
    return true; -- Idempotent no-op
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

  return false; -- Invalid transition
end;
$$ language plpgsql security definer;

-- 4. Data Retention Cleanup Procedure (For Try Runs, System Logs, & Webhook Deliveries)
create or replace function purge_expired_operational_data() returns jsonb as $$
declare
  v_try_runs_deleted int;
  v_logs_deleted int;
  v_deliveries_deleted int;
begin
  -- Try runs: Delete expired sessions older than 30 days
  delete from try_runs where expires_at < now();
  get diagnostics v_try_runs_deleted = row_count;

  -- System logs: Retain for 14 days
  delete from system_logs where created_at < now() - interval '14 days';
  get diagnostics v_logs_deleted = row_count;

  -- Webhook deliveries: Retain for 7 days (sufficient for replay deduplication)
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
