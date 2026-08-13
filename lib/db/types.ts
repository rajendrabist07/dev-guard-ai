export type Severity = 'critical' | 'warning' | 'info';
export type ReviewStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Installation {
  id: string;
  github_installation_id: string;
  account_login: string;
  created_at: string;
}

export interface Repo {
  id: string;
  installation_id: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface ReviewRun {
  id: string;
  repo_id: string;
  pr_number: number;
  commit_sha: string;
  status: ReviewStatus;
  started_at: string | null;
  completed_at: string | null;
}

export interface Finding {
  id: string;
  review_run_id: string;
  severity: Severity;
  file_path: string;
  line: number;
  message: string;
  suggested_fix: string | null;
  tool_source: string | null;
}

export interface AgentTraceStep {
  step: number;
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  timestamp: string;
}

export interface DisplayReviewRun extends ReviewRun {
  pr_title?: string;
  pr_author?: string;
  tool_calls_count?: number;
  agent_trace?: AgentTraceStep[];
  error_message?: string;
  created_at?: string;
}

export type NewReviewRun = Pick<ReviewRun, 'repo_id' | 'pr_number' | 'commit_sha' | 'status'> &
  Partial<Pick<ReviewRun, 'started_at' | 'completed_at'>> &
  Partial<Pick<DisplayReviewRun, 'pr_title' | 'pr_author'>>;

export type NewFinding = Omit<Finding, 'id'>;
