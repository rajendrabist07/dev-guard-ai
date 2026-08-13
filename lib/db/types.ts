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
  pr_title: string | null;
  pr_author: string | null;
  tool_calls_count: number;
  agent_trace: AgentTraceStep[];
  error_message: string | null;
  is_simulation: boolean;
  created_at: string;
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

export type DisplayReviewRun = ReviewRun;

export type NewReviewRun = Pick<ReviewRun, 'repo_id' | 'pr_number' | 'commit_sha' | 'status'> &
  Partial<
    Pick<
      ReviewRun,
      | 'started_at'
      | 'completed_at'
      | 'pr_title'
      | 'pr_author'
      | 'tool_calls_count'
      | 'agent_trace'
      | 'error_message'
      | 'is_simulation'
    >
  >;

export type NewFinding = Omit<Finding, 'id'>;

export interface DashboardStats {
  connectedRepos: number;
  reviewRuns: number;
  toolsExecuted: number;
  securityFindings: number;
}

export interface DashboardData {
  repos: Repo[];
  reviewRuns: DisplayReviewRun[];
  findingsCountByRunId: Record<string, number>;
  stats: DashboardStats;
  installUrl: string | null;
  config: {
    hasSupabase: boolean;
    hasGitHubAppInstallUrl: boolean;
  };
}
