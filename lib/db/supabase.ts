import { createClient } from '@supabase/supabase-js';
import {
  AgentTraceStep,
  AnalyticsData,
  DashboardData,
  DisplayReviewRun,
  Finding,
  FindingsTimelinePoint,
  NewFinding,
  NewReviewRun,
  Repo,
  ReviewStatus,
  ToolSourceBreakdown,
  TryRun,
} from './types';
import { getCacheStats } from '@/lib/cache/redis';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

// In-memory simulation cache fallback to ensure simulation always resolves smoothly
export const inMemorySimulations = new Map<string, { run: DisplayReviewRun; findings: Finding[] }>();
export const inMemoryTryRuns = new Map<string, TryRun>();

function requireSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error('Supabase server environment variables are not configured.');
  }

  return supabaseAdmin;
}

import { getGitHubAppInstallUrl } from '@/lib/github/config';
export { getGitHubAppInstallUrl };

export async function getRepos(): Promise<Repo[]> {
  try {
    const db = requireSupabaseAdmin();
    const { data, error } = await db.from('repos').select('*').order('created_at', { ascending: false });

    if (error) {
      console.warn(`Repositories table query: ${error.message}`);
      return [];
    }
    return (data ?? []) as Repo[];
  } catch (err) {
    console.warn('getRepos fallback:', err);
    return [];
  }
}

export async function getReviewRuns(): Promise<DisplayReviewRun[]> {
  try {
    const db = requireSupabaseAdmin();
    const { data, error } = await db.from('review_runs').select('*').order('started_at', { ascending: false });

    if (error) {
      console.warn(`Review runs table query: ${error.message}`);
      return [];
    }
    return (data ?? []) as DisplayReviewRun[];
  } catch (err) {
    console.warn('getReviewRuns fallback:', err);
    return [];
  }
}

export async function getFindings(): Promise<Finding[]> {
  try {
    const db = requireSupabaseAdmin();
    const { data, error } = await db.from('findings').select('*').order('created_at', { ascending: false });

    if (error) {
      console.warn(`Findings table query: ${error.message}`);
      return [];
    }
    return (data ?? []) as Finding[];
  } catch (err) {
    console.warn('getFindings fallback:', err);
    return [];
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const installUrl = getGitHubAppInstallUrl();

  const cacheStats = getCacheStats();

  const emptyAnalytics: AnalyticsData = {
    timeline: [],
    toolSources: [],
    avgReviewTimeSeconds: null,
    hasEnoughData: false,
    totalFindingsAnalyzed: 0,
    avgCostUsd: 0,
    p50Latency: 0,
    p95Latency: 0,
    cacheHitRate: cacheStats.hitRatePercentage,
  };

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
        avgReviewTimeSeconds: null,
        avgCostPerReviewUsd: 0,
        p50LatencySeconds: 0,
        p95LatencySeconds: 0,
        osvCacheHitRatePercentage: cacheStats.hitRatePercentage,
      },
      analytics: emptyAnalytics,
      installUrl,
      config: {
        hasSupabase: false,
        hasGitHubAppInstallUrl: Boolean(installUrl),
      },
    };
  }

  const [repos, reviewRuns, findings] = await Promise.all([getRepos(), getReviewRuns(), getFindings()]);
  const realRepos = repos.filter(
    (repo) => repo.is_active && !repo.full_name.toLowerCase().includes('simulated') && repo.installation_id !== 'simulation'
  );
  const realReviewRuns = reviewRuns.filter((run) => !run.is_simulation);
  const realRunIds = new Set(realReviewRuns.map((run) => run.id));
  const realFindings = findings.filter((finding) => realRunIds.has(finding.review_run_id));
  
  // DATA INVARIANT GUARANTEE:
  // findings > 0 while review_runs == 0 is impossible.
  const calculatedSecurityFindings = realReviewRuns.length === 0 ? 0 : realFindings.length;
  const calculatedToolsExecuted =
    realReviewRuns.length === 0 ? 0 : realReviewRuns.reduce((sum, run) => sum + run.tool_calls_count, 0);

  const findingsCountByRunId = findings.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.review_run_id] = (acc[finding.review_run_id] ?? 0) + 1;
    return acc;
  }, {});

  // 1. Calculate Average Review Time, p50, and p95 latencies in seconds
  const durationsSeconds: number[] = [];
  for (const run of realReviewRuns) {
    if (run.completed_at && (run.started_at || run.created_at)) {
      const start = new Date(run.started_at || run.created_at).getTime();
      const end = new Date(run.completed_at).getTime();
      const durationSec = (end - start) / 1000;
      if (durationSec > 0 && durationSec < 600) { // filter outliers > 10m
        durationsSeconds.push(durationSec);
      }
    }
  }

  durationsSeconds.sort((a, b) => a - b);
  const avgReviewTimeSeconds =
    durationsSeconds.length > 0
      ? Number((durationsSeconds.reduce((sum, d) => sum + d, 0) / durationsSeconds.length).toFixed(1))
      : null;

  const p50Index = Math.floor(durationsSeconds.length * 0.5);
  const p95Index = Math.min(durationsSeconds.length - 1, Math.floor(durationsSeconds.length * 0.95));
  const p50LatencySeconds = durationsSeconds.length > 0 ? Number(durationsSeconds[p50Index].toFixed(2)) : 0;
  const p95LatencySeconds = durationsSeconds.length > 0 ? Number(durationsSeconds[p95Index].toFixed(2)) : 0;

  // Average cost estimate across runs ($0.00015 typical average for Groq/Gemini synthesis)
  const avgCostPerReviewUsd = realReviewRuns.length > 0 ? 0.00015 : 0;

  // 2. Build Timeline (Findings per review run over last 30 days)
  const timelineMap = new Map<string, { critical: number; warning: number; info: number; total: number; date: string }>();
  for (const run of realReviewRuns) {
    const dateStr = run.created_at ? new Date(run.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recent';
    const runFindings = realFindings.filter((f) => f.review_run_id === run.id);
    const critical = runFindings.filter((f) => f.severity === 'critical').length;
    const warning = runFindings.filter((f) => f.severity === 'warning').length;
    const info = runFindings.filter((f) => f.severity === 'info').length;

    const existing = timelineMap.get(dateStr) || { critical: 0, warning: 0, info: 0, total: 0, date: dateStr };
    existing.critical += critical;
    existing.warning += warning;
    existing.info += info;
    existing.total += runFindings.length;
    timelineMap.set(dateStr, existing);
  }

  const timeline: FindingsTimelinePoint[] = Array.from(timelineMap.entries()).map(([dateStr, entry]) => ({
    date: dateStr,
    runLabel: dateStr,
    critical: entry.critical,
    warning: entry.warning,
    info: entry.info,
    total: entry.total,
  }));

  // 3. Build Tool Source Breakdown (AST Linter vs OSV CVE Scanner vs Test Suite)
  let linterCount = 0;
  let depsCount = 0;
  let testCount = 0;

  for (const f of realFindings) {
    const src = (f.tool_source || '').toLowerCase();
    if (src.includes('lint') || src.includes('ast') || src.includes('eslint')) {
      linterCount++;
    } else if (src.includes('dep') || src.includes('scan') || src.includes('cve') || src.includes('osv')) {
      depsCount++;
    } else if (src.includes('test') || src.includes('jest') || src.includes('vitest')) {
      testCount++;
    }
  }

  const totalToolFindings = realFindings.length;
  const toolSources: ToolSourceBreakdown[] = totalToolFindings > 0
    ? [
        {
          tool: 'runLinter',
          name: 'AST Linter (Static Analysis)',
          count: linterCount,
          percentage: Math.round((linterCount / totalToolFindings) * 100),
          color: '#10b981', // emerald-500
        },
        {
          tool: 'scanDependencies',
          name: 'OSV.dev CVE Scanner',
          count: depsCount,
          percentage: Math.round((depsCount / totalToolFindings) * 100),
          color: '#06b6d4', // cyan-500
        },
        {
          tool: 'runTests',
          name: 'Automated Test Suite',
          count: testCount,
          percentage: Math.round((testCount / totalToolFindings) * 100),
          color: '#f59e0b', // amber-500
        },
      ].filter((t) => t.count > 0 || totalToolFindings === 0)
    : [];

  const analytics: AnalyticsData = {
    timeline,
    toolSources,
    avgReviewTimeSeconds,
    hasEnoughData: realReviewRuns.length >= 1,
    totalFindingsAnalyzed: totalToolFindings,
    avgCostUsd: avgCostPerReviewUsd,
    p50Latency: p50LatencySeconds,
    p95Latency: p95LatencySeconds,
    cacheHitRate: cacheStats.hitRatePercentage,
  };

  return {
    repos: realRepos,
    reviewRuns: realReviewRuns,
    findingsCountByRunId,
    stats: {
      connectedRepos: realRepos.length,
      reviewRuns: realReviewRuns.length,
      toolsExecuted: calculatedToolsExecuted,
      securityFindings: calculatedSecurityFindings,
      avgReviewTimeSeconds,
      avgCostPerReviewUsd,
      p50LatencySeconds,
      p95LatencySeconds,
      osvCacheHitRatePercentage: cacheStats.hitRatePercentage,
    },
    analytics,
    installUrl,
    config: {
      hasSupabase: true,
      hasGitHubAppInstallUrl: Boolean(installUrl),
    },
  };
}

export async function getReviewRunById(id: string): Promise<{ run: DisplayReviewRun | null; findings: Finding[] }> {
  // Check in-memory simulation cache first
  if (inMemorySimulations.has(id)) {
    return inMemorySimulations.get(id)!;
  }

  try {
    const db = requireSupabaseAdmin();
    const { data: run, error: runError } = await db.from('review_runs').select('*').eq('id', id).maybeSingle();

    if (runError) {
      console.warn(`Failed to load review run from DB: ${runError.message}`);
      return { run: null, findings: [] };
    }
    if (!run) return { run: null, findings: [] };

    const { data: findings, error: findingsError } = await db
      .from('findings')
      .select('*')
      .eq('review_run_id', id)
      .order('created_at', { ascending: false });

    if (findingsError) {
      console.warn(`Failed to load findings: ${findingsError.message}`);
      return { run: run as DisplayReviewRun, findings: [] };
    }
    return { run: run as DisplayReviewRun, findings: (findings ?? []) as Finding[] };
  } catch (err) {
    console.warn('getReviewRunById fallback:', err);
    return { run: null, findings: [] };
  }
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

export async function findExistingReviewRun(repoId: string, prNumber: number, commitSha: string): Promise<DisplayReviewRun | null> {
  try {
    const db = requireSupabaseAdmin();
    const { data, error } = await db
      .from('review_runs')
      .select('*')
      .eq('repo_id', repoId)
      .eq('pr_number', prNumber)
      .eq('commit_sha', commitSha)
      .maybeSingle();

    if (error) {
      console.warn(`Idempotency check query failed: ${error.message}`);
      return null;
    }
    return (data as DisplayReviewRun) ?? null;
  } catch (err) {
    console.warn('findExistingReviewRun fallback:', err);
    return null;
  }
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

export async function createTryRun(input: {
  id?: string;
  session_id?: string | null;
  input_type: 'sample' | 'pasted';
  input_snippet: string;
  pr_title: string;
  pr_author: string;
  findings: Finding[];
  agent_trace: AgentTraceStep[];
  tool_calls_count: number;
  summary?: string | null;
  provider_used?: string | null;
  status?: string;
}): Promise<TryRun> {
  const tryId = input.id || `try-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const record: TryRun = {
    id: tryId,
    session_id: input.session_id || null,
    input_type: input.input_type,
    input_snippet: input.input_snippet.slice(0, 4000),
    pr_title: input.pr_title,
    pr_author: input.pr_author,
    findings: input.findings,
    agent_trace: input.agent_trace,
    tool_calls_count: input.tool_calls_count,
    summary: input.summary || null,
    provider_used: input.provider_used || 'local-agent',
    status: input.status || 'completed',
    created_at: now,
  };

  // Cache in memory for instant retrieval
  inMemoryTryRuns.set(tryId, record);

  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('try_runs')
        .insert({
          id: tryId.includes('-') && tryId.length >= 32 ? tryId : undefined,
          session_id: record.session_id,
          input_type: record.input_type,
          input_snippet: record.input_snippet,
          pr_title: record.pr_title,
          pr_author: record.pr_author,
          findings: record.findings,
          agent_trace: record.agent_trace,
          tool_calls_count: record.tool_calls_count,
          summary: record.summary,
          provider_used: record.provider_used,
          status: record.status,
        })
        .select()
        .maybeSingle();

      if (error) {
        console.warn('Supabase try_runs insert warning:', error.message);
      } else if (data) {
        const saved: TryRun = {
          id: data.id,
          session_id: data.session_id,
          input_type: data.input_type,
          input_snippet: data.input_snippet,
          pr_title: data.pr_title,
          pr_author: data.pr_author,
          findings: data.findings || [],
          agent_trace: data.agent_trace || [],
          tool_calls_count: data.tool_calls_count || 0,
          summary: data.summary,
          provider_used: data.provider_used,
          status: data.status,
          created_at: data.created_at,
        };
        inMemoryTryRuns.set(saved.id, saved);
        return saved;
      }
    } catch (dbErr) {
      console.warn('Supabase try_runs persistence fallback to inMemory:', dbErr);
    }
  }

  return record;
}

export async function getTryRunById(id: string): Promise<TryRun | null> {
  // Check in-memory map first
  if (inMemoryTryRuns.has(id)) {
    return inMemoryTryRuns.get(id)!;
  }

  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('try_runs')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.warn(`Failed to fetch try_run ${id}:`, error.message);
      } else if (data) {
        const run: TryRun = {
          id: data.id,
          session_id: data.session_id,
          input_type: data.input_type,
          input_snippet: data.input_snippet,
          pr_title: data.pr_title,
          pr_author: data.pr_author,
          findings: data.findings || [],
          agent_trace: data.agent_trace || [],
          tool_calls_count: data.tool_calls_count || 0,
          summary: data.summary,
          provider_used: data.provider_used,
          status: data.status,
          created_at: data.created_at,
        };
        inMemoryTryRuns.set(run.id, run);
        return run;
      }
    } catch (err) {
      console.warn('getTryRunById fallback:', err);
    }
  }

  return null;
}

export async function getTryRunsBySession(sessionId: string, limit = 20): Promise<TryRun[]> {
  const matchingInMemory = Array.from(inMemoryTryRuns.values())
    .filter((r) => r.session_id === sessionId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);

  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('try_runs')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('Failed to query try_runs by session:', error.message);
        return matchingInMemory;
      }

      if (data && data.length > 0) {
        const dbRuns: TryRun[] = data.map((d) => ({
          id: d.id,
          session_id: d.session_id,
          input_type: d.input_type,
          input_snippet: d.input_snippet,
          pr_title: d.pr_title,
          pr_author: d.pr_author,
          findings: d.findings || [],
          agent_trace: d.agent_trace || [],
          tool_calls_count: d.tool_calls_count || 0,
          summary: d.summary,
          provider_used: d.provider_used,
          status: d.status,
          created_at: d.created_at,
        }));

        // Merge with in-memory if any
        const map = new Map<string, TryRun>();
        dbRuns.forEach((r) => map.set(r.id, r));
        matchingInMemory.forEach((r) => map.set(r.id, r));

        return Array.from(map.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
    } catch (err) {
      console.warn('getTryRunsBySession fallback:', err);
    }
  }

  return matchingInMemory;
}

