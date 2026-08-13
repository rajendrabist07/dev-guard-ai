import { createClient } from '@supabase/supabase-js';
import {
  AgentTraceStep,
  DashboardData,
  DisplayReviewRun,
  Finding,
  NewFinding,
  NewReviewRun,
  Repo,
  ReviewStatus,
} from './types';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

function requireSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error('Supabase server environment variables are not configured.');
  }

  return supabaseAdmin;
}

export function getGitHubAppInstallUrl(): string | null {
  const explicitUrl = process.env.GITHUB_APP_INSTALL_URL;
  if (explicitUrl) return explicitUrl;

  const slug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || process.env.GITHUB_APP_SLUG;
  return slug ? `https://github.com/apps/${slug}/installations/new` : null;
}

export async function getRepos(): Promise<Repo[]> {
  const db = requireSupabaseAdmin();
  const { data, error } = await db.from('repos').select('*').order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load repositories: ${error.message}`);
  return (data ?? []) as Repo[];
}

export async function getReviewRuns(): Promise<DisplayReviewRun[]> {
  const db = requireSupabaseAdmin();
  const { data, error } = await db.from('review_runs').select('*').order('started_at', { ascending: false });

  if (error) throw new Error(`Failed to load review runs: ${error.message}`);
  return (data ?? []) as DisplayReviewRun[];
}

export async function getFindings(): Promise<Finding[]> {
  const db = requireSupabaseAdmin();
  const { data, error } = await db.from('findings').select('*').order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load findings: ${error.message}`);
  return (data ?? []) as Finding[];
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!supabaseAdmin) {
    return {
      repos: [],
      reviewRuns: [],
      findingsCountByRunId: {},
      stats: {
        connectedRepos: 0,
        reviewRuns: 0,
        toolsExecuted: 0,
        securityFindings: 0,
      },
      installUrl: getGitHubAppInstallUrl(),
      config: {
        hasSupabase: false,
        hasGitHubAppInstallUrl: Boolean(getGitHubAppInstallUrl()),
      },
    };
  }

  const [repos, reviewRuns, findings] = await Promise.all([getRepos(), getReviewRuns(), getFindings()]);
  const realReviewRuns = reviewRuns.filter((run) => !run.is_simulation);
  const realRunIds = new Set(realReviewRuns.map((run) => run.id));
  const realFindings = findings.filter((finding) => realRunIds.has(finding.review_run_id));
  const findingsCountByRunId = findings.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.review_run_id] = (acc[finding.review_run_id] ?? 0) + 1;
    return acc;
  }, {});

  return {
    repos,
    reviewRuns,
    findingsCountByRunId,
    stats: {
      connectedRepos: repos.filter((repo) => repo.is_active).length,
      reviewRuns: realReviewRuns.length,
      toolsExecuted: realReviewRuns.reduce((sum, run) => sum + run.tool_calls_count, 0),
      securityFindings: realFindings.length,
    },
    installUrl: getGitHubAppInstallUrl(),
    config: {
      hasSupabase: true,
      hasGitHubAppInstallUrl: Boolean(getGitHubAppInstallUrl()),
    },
  };
}

export async function getReviewRunById(id: string): Promise<{ run: DisplayReviewRun | null; findings: Finding[] }> {
  const db = requireSupabaseAdmin();
  const { data: run, error: runError } = await db.from('review_runs').select('*').eq('id', id).maybeSingle();

  if (runError) throw new Error(`Failed to load review run: ${runError.message}`);
  if (!run) return { run: null, findings: [] };

  const { data: findings, error: findingsError } = await db
    .from('findings')
    .select('*')
    .eq('review_run_id', id)
    .order('created_at', { ascending: false });

  if (findingsError) throw new Error(`Failed to load findings: ${findingsError.message}`);
  return { run: run as DisplayReviewRun, findings: (findings ?? []) as Finding[] };
}

export async function ensureRepoForInstallation(input: {
  githubInstallationId: string;
  accountLogin: string;
  fullName: string;
}): Promise<Repo> {
  const db = requireSupabaseAdmin();
  const { data: existingInstallation, error: installationLookupError } = await db
    .from('installations')
    .select('*')
    .eq('github_installation_id', input.githubInstallationId)
    .maybeSingle();

  if (installationLookupError) throw new Error(`Failed to look up GitHub installation: ${installationLookupError.message}`);

  const installation =
    existingInstallation ??
    (
      await db
        .from('installations')
        .insert({
          github_installation_id: input.githubInstallationId,
          account_login: input.accountLogin,
        })
        .select()
        .single()
    ).data;

  if (!installation) throw new Error('Could not create GitHub installation row.');

  const { data: existingRepo, error: repoLookupError } = await db
    .from('repos')
    .select('*')
    .eq('installation_id', installation.id)
    .eq('full_name', input.fullName)
    .maybeSingle();

  if (repoLookupError) throw new Error(`Failed to look up repository: ${repoLookupError.message}`);
  if (existingRepo) return existingRepo as Repo;

  const { data: createdRepo, error: createRepoError } = await db
    .from('repos')
    .insert({
      installation_id: installation.id,
      full_name: input.fullName,
      is_active: true,
    })
    .select()
    .single();

  if (createRepoError) throw new Error(`Failed to create repository row: ${createRepoError.message}`);
  if (!createdRepo) throw new Error('Could not create repository row.');
  return createdRepo as Repo;
}

export async function createReviewRun(data: NewReviewRun): Promise<DisplayReviewRun> {
  const db = requireSupabaseAdmin();
  const insertData = {
    repo_id: data.repo_id,
    pr_number: data.pr_number,
    pr_title: data.pr_title ?? null,
    pr_author: data.pr_author ?? null,
    commit_sha: data.commit_sha,
    status: data.status,
    tool_calls_count: data.tool_calls_count ?? 0,
    agent_trace: data.agent_trace ?? [],
    error_message: data.error_message ?? null,
    is_simulation: data.is_simulation ?? false,
    started_at: data.started_at ?? new Date().toISOString(),
    completed_at: data.completed_at ?? null,
  };

  const { data: created, error } = await db.from('review_runs').insert(insertData).select().single();
  if (error) throw new Error(`Failed to create review run: ${error.message}`);
  return created as DisplayReviewRun;
}

export async function updateReviewRun(
  id: string,
  data: Partial<{
    status: ReviewStatus;
    tool_calls_count: number;
    agent_trace: AgentTraceStep[];
    error_message: string | null;
    completed_at: string | null;
  }>
): Promise<void> {
  const db = requireSupabaseAdmin();
  const { error } = await db.from('review_runs').update(data).eq('id', id);
  if (error) throw new Error(`Failed to update review run: ${error.message}`);
}

export async function saveFindings(findings: NewFinding[]): Promise<Finding[]> {
  if (findings.length === 0) return [];

  const db = requireSupabaseAdmin();
  const insertData = findings.map((finding) => ({
    review_run_id: finding.review_run_id,
    severity: finding.severity,
    file_path: finding.file_path,
    line: finding.line,
    message: finding.message,
    suggested_fix: finding.suggested_fix,
    tool_source: finding.tool_source,
  }));

  const { data, error } = await db.from('findings').insert(insertData).select();
  if (error) throw new Error(`Failed to save findings: ${error.message}`);
  return (data ?? []) as Finding[];
}
