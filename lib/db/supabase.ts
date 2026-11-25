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
  PaginatedResult,
  PaginationParams,
  Repo,
  ReviewStatus,
  ToolSourceBreakdown,
  TryRun,
} from './types';
import { getCacheStats, getCachedValue, setCachedValue } from '@/lib/cache/redis';
import { calculateModelCost } from '@/lib/config/models';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

// Test override client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let customAdminClient: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setSupabaseAdminForTesting(client: any) {
  customAdminClient = client;
}

// In-memory simulation cache fallback to ensure simulation always resolves smoothly
export const inMemorySimulations = new Map<string, { run: DisplayReviewRun; findings: Finding[] }>();
export const inMemoryTryRuns = new Map<string, TryRun>();

export function getSupabaseAdmin() {
  return customAdminClient || supabaseAdmin;
}

/**
 * Pings Supabase PostgreSQL to determine live connection health.
 */
export async function pingDatabase(): Promise<{ ok: boolean; configured: boolean; latencyMs?: number; error?: string }> {
  const db = getSupabaseAdmin();
  if (!db) {
    return { ok: false, configured: false };
  }
  const start = Date.now();
  try {
    const { error } = await db.from('installations').select('id').limit(1);
    if (error) {
      return { ok: false, configured: true, latencyMs: Date.now() - start, error: error.message };
    }
    return { ok: true, configured: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Database ping error',
    };
  }
}

export function createUserClient(token?: string) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  if (!token) {
    return supabase;
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function requireSupabaseAdmin() {
  const db = getSupabaseAdmin();
  if (!db) {
    throw new Error('Supabase server environment variables are not configured.');
  }

  return db;
}

import { getGitHubAppInstallUrl } from '@/lib/github/config';
export { getGitHubAppInstallUrl };

export async function getRepos(accessibleRepoIds?: string[]): Promise<Repo[]> {
  try {
    const db = requireSupabaseAdmin();
    let query = db.from('repos').select('*').order('created_at', { ascending: false });
    if (accessibleRepoIds && accessibleRepoIds.length > 0) {
      query = query.in('id', accessibleRepoIds);
    } else if (accessibleRepoIds && accessibleRepoIds.length === 0) {
      return [];
    }

    const { data, error } = await query;
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

export async function getReviewRuns(
  accessibleRepoIds?: string[],
  limit = 100
): Promise<DisplayReviewRun[]> {
  try {
    const db = requireSupabaseAdmin();
    let query = db
      .from('review_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (accessibleRepoIds && accessibleRepoIds.length > 0) {
      query = query.in('repo_id', accessibleRepoIds);
    } else if (accessibleRepoIds && accessibleRepoIds.length === 0) {
      return [];
    }

    const { data, error } = await query;
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

export async function getPaginatedReviewRuns(
  accessibleRepoIds?: string[],
  pagination: PaginationParams = {}
): Promise<PaginatedResult<DisplayReviewRun>> {
  const limit = Math.min(Math.max(pagination.limit ?? 20, 1), 100);
  try {
    const db = requireSupabaseAdmin();
    let query = db
      .from('review_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (accessibleRepoIds && accessibleRepoIds.length > 0) {
      query = query.in('repo_id', accessibleRepoIds);
    } else if (accessibleRepoIds && accessibleRepoIds.length === 0) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    if (pagination.cursor) {
      query = query.lt('created_at', pagination.cursor);
    }

    const { data, error } = await query;
    if (error) {
      console.warn(`Paginated review runs query: ${error.message}`);
      return { items: [], nextCursor: null, hasMore: false };
    }

    const rows = (data ?? []) as DisplayReviewRun[];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? (items[items.length - 1].created_at ?? items[items.length - 1].id) : null;

    return { items, nextCursor, hasMore };
  } catch (err) {
    console.warn('getPaginatedReviewRuns fallback:', err);
    return { items: [], nextCursor: null, hasMore: false };
  }
}

export async function getFindings(
  accessibleRunIds?: string[],
  limit = 200
): Promise<Finding[]> {
  try {
    const db = requireSupabaseAdmin();
    let query = db
      .from('findings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (accessibleRunIds && accessibleRunIds.length > 0) {
      query = query.in('review_run_id', accessibleRunIds);
    } else if (accessibleRunIds && accessibleRunIds.length === 0) {
      return [];
    }

    const { data, error } = await query;
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

export async function getPaginatedFindings(
  accessibleRunIds?: string[],
  pagination: PaginationParams = {}
): Promise<PaginatedResult<Finding>> {
  const limit = Math.min(Math.max(pagination.limit ?? 50, 1), 200);
  try {
    const db = requireSupabaseAdmin();
    let query = db
      .from('findings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (accessibleRunIds && accessibleRunIds.length > 0) {
      query = query.in('review_run_id', accessibleRunIds);
    } else if (accessibleRunIds && accessibleRunIds.length === 0) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    if (pagination.cursor) {
      query = query.lt('created_at', pagination.cursor);
    }

    const { data, error } = await query;
    if (error) {
      console.warn(`Paginated findings query: ${error.message}`);
      return { items: [], nextCursor: null, hasMore: false };
    }

    const rows = (data ?? []) as Finding[];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? (items[items.length - 1].created_at ?? items[items.length - 1].id) : null;

    return { items, nextCursor, hasMore };
  } catch (err) {
    console.warn('getPaginatedFindings fallback:', err);
    return { items: [], nextCursor: null, hasMore: false };
  }
}

export async function getDashboardData(accessibleRepoIds?: string[]): Promise<DashboardData> {
  const installUrl = getGitHubAppInstallUrl();

  const cacheStats = getCacheStats();

  const emptyAnalytics: AnalyticsData = {
    timeline: [],
    toolSources: [],
    avgReviewTimeSeconds: null,
    hasEnoughData: false,
    totalFindingsAnalyzed: 0,
    avgCostUsd: null,
    p50Latency: null,
    p95Latency: null,
    cacheHitRate: cacheStats.hitRatePercentage,
  };

  const db = getSupabaseAdmin();
  if (!db) {
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
        avgCostPerReviewUsd: null,
        baselineCostWithoutRoutingUsd: null,
        adaptiveRoutingCostSavingsPercentage: null,
        p50LatencySeconds: null,
        p95LatencySeconds: null,
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

  const [repos, reviewRuns] = await Promise.all([getRepos(accessibleRepoIds), getReviewRuns(accessibleRepoIds)]);
  const realRepos = repos.filter(
    (repo) => repo.is_active && !repo.full_name.toLowerCase().includes('simulated') && repo.installation_id !== 'simulation'
  );
  const realReviewRuns = reviewRuns.filter((run) => !run.is_simulation);
  const realRunIds = new Set(realReviewRuns.map((run) => run.id));
  const findings = await getFindings(Array.from(realRunIds));
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
  const p50LatencySeconds = durationsSeconds.length > 0 ? Number(durationsSeconds[p50Index].toFixed(2)) : null;
  const p95LatencySeconds = durationsSeconds.length > 0 ? Number(durationsSeconds[p95Index].toFixed(2)) : null;

  // Real cost calculation across recorded runs based on model used & token telemetry
  let avgCostPerReviewUsd: number | null = null;
  let baselineCostWithoutRoutingUsd: number | null = null;
  let adaptiveRoutingCostSavingsPercentage: number | null = null;

  if (realReviewRuns.length > 0) {
    const costs: number[] = [];
    const baselines: number[] = [];

    for (const run of realReviewRuns) {
      const synthesisStep = Array.isArray(run.agent_trace)
        ? run.agent_trace.find((s) => s.tool === 'synthesizeReview')
        : undefined;

      const runCost = typeof synthesisStep?.output?.estimatedCostUsd === 'number'
        ? synthesisStep.output.estimatedCostUsd
        : run.provider_used?.toLowerCase().includes('deterministic')
        ? 0
        : calculateModelCost(run.provider_used || 'Groq Llama 3.3 70B', 1500, 400);

      const baseline = calculateModelCost('llama-3.3-70b-versatile', 1500, 400);

      costs.push(runCost);
      baselines.push(baseline);
    }

    const totalActual = costs.reduce((sum, c) => sum + c, 0);
    const totalBaseline = baselines.reduce((sum, b) => sum + b, 0);

    avgCostPerReviewUsd = Number((totalActual / costs.length).toFixed(6));
    baselineCostWithoutRoutingUsd = Number((totalBaseline / baselines.length).toFixed(6));

    if (totalBaseline > 0) {
      const savings = ((totalBaseline - totalActual) / totalBaseline) * 100;
      adaptiveRoutingCostSavingsPercentage = Number(Math.max(0, savings).toFixed(1));
    } else {
      adaptiveRoutingCostSavingsPercentage = 0;
    }
  }

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

  // 4. Build Confidence Distribution Breakdown
  let highConfCount = 0;
  let medConfCount = 0;
  let lowConfCount = 0;

  for (const f of realFindings) {
    if (f.confidence === 'high' || f.tool_source === 'scanDependencies' || f.tool_source === 'runTests') {
      highConfCount++;
    } else if (f.confidence === 'low' || f.severity === 'info') {
      lowConfCount++;
    } else {
      medConfCount++;
    }
  }

  const confidenceDistribution = {
    highCount: highConfCount,
    mediumCount: medConfCount,
    lowCount: lowConfCount,
    highPercentage: totalToolFindings > 0 ? Math.round((highConfCount / totalToolFindings) * 100) : 0,
    mediumPercentage: totalToolFindings > 0 ? Math.round((medConfCount / totalToolFindings) * 100) : 0,
    lowPercentage: totalToolFindings > 0 ? Math.round((lowConfCount / totalToolFindings) * 100) : 0,
  };

  const analytics: AnalyticsData = {
    timeline,
    toolSources,
    confidenceDistribution,
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
      baselineCostWithoutRoutingUsd,
      adaptiveRoutingCostSavingsPercentage,
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

export async function saveSimulationRun(
  run: DisplayReviewRun,
  findings: Finding[]
): Promise<void> {
  // 1. Always update local cache
  inMemorySimulations.set(run.id, { run, findings });

  // 2. Persist to Redis (24h TTL) for zero-loss multi-instance serverless retrieval
  try {
    await setCachedValue(`sim_run:${run.id}`, { run, findings }, 86400);
  } catch (err) {
    console.warn('Redis simulation persistence fallback:', err);
  }
}

export async function getReviewRunById(id: string): Promise<{ run: DisplayReviewRun | null; findings: Finding[] }> {
  // Tier 1: Check in-memory simulation cache first
  if (inMemorySimulations.has(id)) {
    return inMemorySimulations.get(id)!;
  }

  // Tier 2: Check persistent Redis cache (for cross-instance serverless simulation sharing)
  try {
    const cachedSimulation = await getCachedValue<{ run: DisplayReviewRun; findings: Finding[] }>(`sim_run:${id}`);
    if (cachedSimulation) {
      inMemorySimulations.set(id, cachedSimulation);
      return cachedSimulation;
    }
  } catch (err) {
    console.warn('Redis simulation lookup failed:', err);
  }

  // Tier 3: Query persistent Supabase PostgreSQL
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

export async function findRepoByFullName(fullName: string): Promise<Repo | null> {
  try {
    const db = requireSupabaseAdmin();
    const { data, error } = await db
      .from('repos')
      .select('*')
      .eq('full_name', fullName)
      .maybeSingle();

    if (error || !data) return null;
    return data as Repo;
  } catch {
    return null;
  }
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

const inMemoryDeliveries = new Set<string>();

export async function recordWebhookDelivery(deliveryId: string, eventType: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (db) {
    try {
      const { error } = await db.from('webhook_deliveries').insert({
        delivery_id: deliveryId,
        event_type: eventType,
      });
      if (error) {
        if (error.code === '23505' || error.message.includes('unique') || error.message.includes('duplicate')) {
          return false;
        }
      } else {
        return true;
      }
    } catch {
      // Fall through to memory fallback
    }
  }
  if (inMemoryDeliveries.has(deliveryId)) {
    return false;
  }
  inMemoryDeliveries.add(deliveryId);
  if (inMemoryDeliveries.size > 1000) {
    const [first] = inMemoryDeliveries;
    inMemoryDeliveries.delete(first);
  }
  return true;
}

export async function createReviewRunOnConflictDoNothing(
  data: NewReviewRun
): Promise<{ created: boolean; reviewRun: DisplayReviewRun }> {
  const db = getSupabaseAdmin();
  const insertData = {
    repo_id: data.repo_id,
    pr_number: data.pr_number,
    pr_title: data.pr_title ?? null,
    pr_author: data.pr_author ?? null,
    commit_sha: data.commit_sha,
    status: data.status,
    tool_calls_count: data.tool_calls_count ?? 0,
    agent_trace: data.agent_trace ?? [],
    error_code: data.error_code ?? null,
    error_message: data.error_message ?? null,
    attempt: data.attempt ?? 1,
    correlation_id: data.correlation_id ?? null,
    is_simulation: data.is_simulation ?? false,
    started_at: data.started_at ?? (data.status === 'running' ? new Date().toISOString() : null),
    finished_at: data.finished_at ?? null,
    completed_at: data.completed_at ?? null,
  };

  if (db) {
    try {
      const { data: created, error } = await db
        .from('review_runs')
        .insert(insertData)
        .select()
        .maybeSingle();

      if (!error && created) {
        return { created: true, reviewRun: created as DisplayReviewRun };
      }

      // If duplicate conflict, retrieve the existing run
      const existing = await findExistingReviewRun(data.repo_id, data.pr_number, data.commit_sha);
      if (existing) {
        return { created: false, reviewRun: existing };
      }
    } catch {
      // Fall through to in-memory fallback
    }
  }

  const existing = await findExistingReviewRun(data.repo_id, data.pr_number, data.commit_sha);
  if (existing) {
    return { created: false, reviewRun: existing };
  }

  const memoryRun: DisplayReviewRun = {
    id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    repo_id: data.repo_id,
    pr_number: data.pr_number,
    pr_title: data.pr_title ?? null,
    pr_author: data.pr_author ?? null,
    commit_sha: data.commit_sha,
    status: data.status,
    tool_calls_count: data.tool_calls_count ?? 0,
    agent_trace: data.agent_trace ?? [],
    error_code: data.error_code ?? null,
    error_message: data.error_message ?? null,
    attempt: data.attempt ?? 1,
    correlation_id: data.correlation_id ?? null,
    is_simulation: data.is_simulation ?? false,
    started_at: data.started_at ?? (data.status === 'running' ? new Date().toISOString() : null),
    finished_at: data.finished_at ?? null,
    completed_at: data.completed_at ?? null,
    created_at: new Date().toISOString(),
  };
  return { created: true, reviewRun: memoryRun };
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
    error_code: data.error_code ?? null,
    error_message: data.error_message ?? null,
    attempt: data.attempt ?? 1,
    correlation_id: data.correlation_id ?? null,
    is_simulation: data.is_simulation ?? false,
    started_at: data.started_at ?? (data.status === 'running' ? new Date().toISOString() : null),
    finished_at: data.finished_at ?? null,
    completed_at: data.completed_at ?? null,
  };

  const { data: created, error } = await db.from('review_runs').insert(insertData).select().single();
  if (error) throw new Error(`Failed to create review run: ${error.message}`);
  return created as DisplayReviewRun;
}

const VALID_STATE_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  queued: ['running', 'failed'],
  running: ['completed', 'failed', 'timed_out'],
  pending: ['running', 'completed', 'failed'],
  completed: [],
  failed: [],
  timed_out: [],
};

export async function transitionReviewRunState(
  id: string,
  targetStatus: ReviewStatus,
  details?: {
    errorCode?: string | null;
    errorMessage?: string | null;
    correlationId?: string | null;
    attempt?: number;
    startedAt?: string | null;
    finishedAt?: string | null;
    toolCallsCount?: number;
    agentTrace?: AgentTraceStep[];
  }
): Promise<{ success: boolean; run: DisplayReviewRun | null; reason?: string }> {
  const db = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  // 1. Fetch current run
  let currentRun: DisplayReviewRun | null = null;
  if (db) {
    try {
      const { data, error } = await db.from('review_runs').select('*').eq('id', id).maybeSingle();
      if (!error && data) {
        currentRun = data as DisplayReviewRun;
      }
    } catch {
      // Fall through to in-memory check
    }
  }

  if (!currentRun && inMemorySimulations.has(id)) {
    currentRun = inMemorySimulations.get(id)!.run;
  }

  if (!currentRun) {
    return { success: false, run: null, reason: `Review run ${id} not found.` };
  }

  // Idempotent no-op if status matches
  if (currentRun.status === targetStatus) {
    return { success: true, run: currentRun };
  }

  // Validate state machine transition
  const allowed = VALID_STATE_TRANSITIONS[currentRun.status] || [];
  if (!allowed.includes(targetStatus)) {
    return {
      success: false,
      run: currentRun,
      reason: `Invalid state transition: Cannot transition from '${currentRun.status}' to '${targetStatus}'.`,
    };
  }

  const updates: Record<string, unknown> = {
    status: targetStatus,
  };

  if (targetStatus === 'running') {
    updates.started_at = details?.startedAt ?? currentRun.started_at ?? nowIso;
    if (details?.attempt !== undefined) updates.attempt = details.attempt;
  } else if (targetStatus === 'completed' || targetStatus === 'failed' || targetStatus === 'timed_out') {
    updates.finished_at = details?.finishedAt ?? nowIso;
    updates.completed_at = details?.finishedAt ?? nowIso;
  }

  if (details?.errorCode !== undefined) updates.error_code = details.errorCode;
  if (details?.errorMessage !== undefined) updates.error_message = details.errorMessage;
  if (details?.correlationId !== undefined) updates.correlation_id = details.correlationId;
  if (details?.toolCallsCount !== undefined) updates.tool_calls_count = details.toolCallsCount;
  if (details?.agentTrace !== undefined) updates.agent_trace = details.agentTrace;

  if (db) {
    try {
      const { data: updated, error } = await db
        .from('review_runs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (!error && updated) {
        return { success: true, run: updated as DisplayReviewRun };
      }
    } catch {
      // Fall through to in-memory fallback
    }
  }

  // In-memory fallback update
  const updatedRun: DisplayReviewRun = {
    ...currentRun,
    ...updates,
  } as DisplayReviewRun;

  if (inMemorySimulations.has(id)) {
    const sim = inMemorySimulations.get(id)!;
    inMemorySimulations.set(id, { run: updatedRun, findings: sim.findings });
  }

  return { success: true, run: updatedRun };
}

export async function updateReviewRun(
  id: string,
  data: Partial<{
    status: ReviewStatus;
    tool_calls_count: number;
    agent_trace: AgentTraceStep[];
    error_code: string | null;
    error_message: string | null;
    completed_at: string | null;
    finished_at: string | null;
    started_at: string | null;
    attempt: number;
    correlation_id: string | null;
  }>
): Promise<void> {
  const db = requireSupabaseAdmin();
  const { error } = await db.from('review_runs').update(data).eq('id', id);
  if (error) throw new Error(`Failed to update review run: ${error.message}`);
}

export async function findStuckRunningReviewRuns(timeoutSeconds = 300): Promise<DisplayReviewRun[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const threshold = new Date(Date.now() - timeoutSeconds * 1000).toISOString();
  const { data, error } = await db
    .from('review_runs')
    .select('*')
    .eq('status', 'running')
    .lt('started_at', threshold);

  if (error) {
    console.warn('findStuckRunningReviewRuns query error:', error.message);
    return [];
  }
  return (data ?? []) as DisplayReviewRun[];
}

export async function runDataRetentionCleanup(): Promise<{
  tryRunsDeleted: number;
  logsDeleted: number;
  deliveriesDeleted: number;
  timestamp: string;
}> {
  const db = getSupabaseAdmin();
  const timestamp = new Date().toISOString();
  if (!db) {
    return { tryRunsDeleted: 0, logsDeleted: 0, deliveriesDeleted: 0, timestamp };
  }

  let tryRunsDeleted = 0;
  let logsDeleted = 0;
  let deliveriesDeleted = 0;

  try {
    const { count: tryCount } = await db
      .from('try_runs')
      .delete({ count: 'exact' })
      .lt('expires_at', timestamp);
    tryRunsDeleted = tryCount ?? 0;

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { count: logCount } = await db
      .from('system_logs')
      .delete({ count: 'exact' })
      .lt('created_at', fourteenDaysAgo);
    logsDeleted = logCount ?? 0;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: deliveryCount } = await db
      .from('webhook_deliveries')
      .delete({ count: 'exact' })
      .lt('created_at', sevenDaysAgo);
    deliveriesDeleted = deliveryCount ?? 0;
  } catch (err) {
    console.warn('Data retention cleanup warning:', err);
  }

  return { tryRunsDeleted, logsDeleted, deliveriesDeleted, timestamp };
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

  // 1. Cache in memory for instant retrieval
  inMemoryTryRuns.set(tryId, record);

  // 2. Persist to Redis (24h TTL) for multi-instance serverless retrieval
  try {
    await setCachedValue(`try_run:${tryId}`, record, 86400);
  } catch (err) {
    console.warn('Redis try_runs persistence fallback:', err);
  }

  const db = getSupabaseAdmin();
  if (db) {
    try {
      const { data, error } = await db
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
        await setCachedValue(`try_run:${saved.id}`, saved, 86400);
        return saved;
      }
    } catch (dbErr) {
      console.warn('Supabase try_runs persistence fallback to inMemory:', dbErr);
    }
  }

  return record;
}

export async function getTryRunById(id: string): Promise<TryRun | null> {
  // Tier 1: Check in-memory map first
  if (inMemoryTryRuns.has(id)) {
    return inMemoryTryRuns.get(id)!;
  }

  // Tier 2: Check persistent Redis cache (for cross-instance serverless execution)
  try {
    const cached = await getCachedValue<TryRun>(`try_run:${id}`);
    if (cached) {
      inMemoryTryRuns.set(id, cached);
      return cached;
    }
  } catch (err) {
    console.warn('Redis try_run lookup failed:', err);
  }

  // Tier 3: Query Supabase PostgreSQL database
  const db = getSupabaseAdmin();
  if (db) {
    try {
      const { data, error } = await db
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

  const db = getSupabaseAdmin();
  if (db) {
    try {
      const { data, error } = await db
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
        const dbRuns: TryRun[] = (data as unknown as TryRun[]).map((d) => ({
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

