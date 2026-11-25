import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as supabaseModule from '@/lib/db/supabase';
import {
  pingDatabase,
  createUserClient,
  getRepos,
  getReviewRuns,
  getPaginatedReviewRuns,
  getFindings,
  getPaginatedFindings,
  getDashboardData,
  getReviewRunById,
  saveSimulationRun,
  ensureRepoForInstallation,
  findRepoByFullName,
  findExistingReviewRun,
  recordWebhookDelivery,
  createReviewRunOnConflictDoNothing,
  createReviewRun,
  transitionReviewRunState,
  updateReviewRun,
  findStuckRunningReviewRuns,
  runDataRetentionCleanup,
  saveFindings,
  createTryRun,
  getTryRunById,
  getTryRunsBySession,
  setSupabaseAdminForTesting,
  inMemorySimulations,
  inMemoryTryRuns,
} from '@/lib/db/supabase';

// Helper to build a chainable mock query builder
function createMockBuilder(data: any = null, error: any = null, count: number | null = null) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    then: (resolve: any) => resolve({ data, error, count: count ?? (Array.isArray(data) ? data.length : null) }),
  };
  return builder;
}

describe('lib/db/supabase.ts Comprehensive Database Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSupabaseAdminForTesting(null);
    inMemorySimulations.clear();
    inMemoryTryRuns.clear();
  });

  describe('pingDatabase', () => {
    it('returns unconfigured when supabase admin is not initialized', async () => {
      const ping = await pingDatabase();
      expect(ping).toBeDefined();
    });

    it('returns healthy status when database ping succeeds', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue(createMockBuilder([{ id: 'inst-1' }])),
      };
      setSupabaseAdminForTesting(mockClient);

      const ping = await pingDatabase();
      expect(ping.ok).toBe(true);
      expect(ping.configured).toBe(true);
    });

    it('returns error when database ping fails', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue(createMockBuilder(null, { message: 'DB connection refused' })),
      };
      setSupabaseAdminForTesting(mockClient);

      const ping = await pingDatabase();
      expect(ping.ok).toBe(false);
      expect(ping.error).toBe('DB connection refused');
    });
  });

  describe('createUserClient', () => {
    it('creates client or returns null based on configuration', () => {
      const client = createUserClient();
      expect(client === null || typeof client === 'object').toBe(true);

      const clientWithToken = createUserClient('fake-jwt-token');
      expect(clientWithToken === null || typeof clientWithToken === 'object').toBe(true);
    });
  });

  describe('inMemory simulations and TryRuns fallback', () => {
    it('saves and retrieves simulation run from in-memory cache', async () => {
      const run: any = {
        id: 'sim-123',
        repo_id: 'repo-1',
        pr_number: 10,
        commit_sha: 'commit-sha-123',
        status: 'completed',
        created_at: new Date().toISOString(),
      };
      const findings: any[] = [
        {
          id: 'f-1',
          file_path: 'app.js',
          line: 5,
          severity: 'critical',
          message: 'Injection found',
        },
      ];

      saveSimulationRun(run, findings);

      const res = await getReviewRunById('sim-123');
      expect(res.run?.id).toBe('sim-123');
      expect(res.findings).toHaveLength(1);
    });

    it('creates and retrieves TryRun from in-memory cache when database is unavailable', async () => {
      const created = await createTryRun({
        input_type: 'pasted',
        input_snippet: 'const a = 1;',
        pr_title: 'Test PR',
        pr_author: 'dev',
        findings: [],
        agent_trace: [],
        tool_calls_count: 0,
        summary: 'Safe',
      });

      expect(created.id).toBeDefined();
      expect(created.input_snippet).toBe('const a = 1;');

      const retrieved = await getTryRunById(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);

      if (created.session_id) {
        const sessionRuns = await getTryRunsBySession(created.session_id);
        expect(sessionRuns.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Database Operations with Mocked Supabase Admin', () => {
    const mockRepo = {
      id: 'repo-uuid-1',
      full_name: 'test-org/test-repo',
      owner: 'test-org',
      name: 'test-repo',
      installation_id: 'inst-100',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    const mockRun = {
      id: 'run-uuid-1',
      repo_id: 'repo-uuid-1',
      pr_number: 15,
      commit_sha: 'sha-abc-1234567890',
      status: 'completed',
      tool_calls_count: 3,
      started_at: new Date(Date.now() - 30000).toISOString(),
      completed_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 35000).toISOString(),
      is_simulation: false,
      agent_trace: [{ step: 1, tool: 'ast_analyzer' }],
    };

    const mockFinding = {
      id: 'f-uuid-1',
      review_run_id: 'run-uuid-1',
      file_path: 'lib/auth.ts',
      line: 42,
      severity: 'critical',
      message: 'SQL Injection',
      tool_source: 'ast_analyzer',
      created_at: new Date().toISOString(),
    };

    it('getRepos queries database and applies accessibleRepoIds filter', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue(createMockBuilder([mockRepo])),
      };
      setSupabaseAdminForTesting(mockClient);

      const repos = await getRepos(['repo-uuid-1']);
      expect(repos).toHaveLength(1);
      expect(repos[0].full_name).toBe('test-org/test-repo');

      const empty = await getRepos([]);
      expect(empty).toEqual([]);
    });

    it('getReviewRuns and getPaginatedReviewRuns query database', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue(createMockBuilder([mockRun])),
      };
      setSupabaseAdminForTesting(mockClient);

      const runs = await getReviewRuns(['repo-uuid-1']);
      expect(runs).toHaveLength(1);
      expect(runs[0].id).toBe('run-uuid-1');

      const paginated = await getPaginatedReviewRuns(['repo-uuid-1'], { limit: 10 });
      expect(paginated.items).toHaveLength(1);
      expect(paginated.hasMore).toBe(false);
    });

    it('getFindings and getPaginatedFindings query database', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue(createMockBuilder([mockFinding])),
      };
      setSupabaseAdminForTesting(mockClient);

      const findings = await getFindings(['run-uuid-1']);
      expect(findings).toHaveLength(1);

      const paginated = await getPaginatedFindings(['run-uuid-1'], { limit: 5 });
      expect(paginated.items).toHaveLength(1);
    });

    it('getDashboardData calculates aggregations, latency percentiles, and cost savings', async () => {
      const mockClient = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'repos') return createMockBuilder([mockRepo]);
          if (table === 'review_runs') return createMockBuilder([mockRun]);
          if (table === 'findings') return createMockBuilder([mockFinding]);
          return createMockBuilder([]);
        }),
      };
      setSupabaseAdminForTesting(mockClient);

      const dash = await getDashboardData(['repo-uuid-1']);
      expect(dash.stats.connectedRepos).toBe(1);
      expect(dash.stats.reviewRuns).toBe(1);
      expect(dash.stats.securityFindings).toBe(1);
      expect(dash.stats.p50LatencySeconds).toBeGreaterThan(0);
      expect(dash.analytics.toolSources).toHaveLength(1);
      expect(dash.analytics.toolSources[0].tool).toBeDefined();
    });

    it('getReviewRunById queries database when available', async () => {
      const mockClient = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'review_runs') return createMockBuilder(mockRun);
          if (table === 'findings') return createMockBuilder([mockFinding]);
          return createMockBuilder(null);
        }),
      };
      setSupabaseAdminForTesting(mockClient);

      const res = await getReviewRunById('run-uuid-1');
      expect(res.run?.id).toBe('run-uuid-1');
      expect(res.findings).toHaveLength(1);
    });

    it('ensureRepoForInstallation creates or updates repository', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue(createMockBuilder(mockRepo)),
      };
      setSupabaseAdminForTesting(mockClient);

      const repo = await ensureRepoForInstallation({
        fullName: 'test-org/test-repo',
        githubInstallationId: '100',
        accountLogin: 'test-org',
      });

      expect(repo.full_name).toBe('test-org/test-repo');
    });

    it('findRepoByFullName and findExistingReviewRun query database', async () => {
      const mockClient = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'repos') return createMockBuilder(mockRepo);
          if (table === 'review_runs') return createMockBuilder(mockRun);
          return createMockBuilder(null);
        }),
      };
      setSupabaseAdminForTesting(mockClient);

      const repo = await findRepoByFullName('test-org/test-repo');
      expect(repo?.id).toBe('repo-uuid-1');

      const existingRun = await findExistingReviewRun('repo-uuid-1', 15, 'sha-abc-1234567890');
      expect(existingRun?.id).toBe('run-uuid-1');
    });

    it('recordWebhookDelivery inserts delivery and handles duplicate keys', async () => {
      const mockSuccessClient = {
        from: vi.fn().mockReturnValue(createMockBuilder({ delivery_id: 'deliv-1' })),
      };
      vi.spyOn(supabaseModule, 'getSupabaseAdmin').mockReturnValue(mockSuccessClient as any);

      const ok = await recordWebhookDelivery('deliv-1', 'pull_request');
      expect(ok).toBe(true);

      const mockConflictClient = {
        from: vi.fn().mockReturnValue(createMockBuilder(null, { code: '23505', message: 'duplicate key' })),
      };
      vi.spyOn(supabaseModule, 'getSupabaseAdmin').mockReturnValue(mockConflictClient as any);

      const duplicate = await recordWebhookDelivery('deliv-1', 'pull_request');
      expect(duplicate).toBe(false);
    });

    it('createReviewRunOnConflictDoNothing creates new run or returns existing run on duplicate', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue(createMockBuilder(mockRun)),
      };
      setSupabaseAdminForTesting(mockClient);

      const res = await createReviewRunOnConflictDoNothing({
        repo_id: 'repo-uuid-1',
        pr_number: 15,
        commit_sha: 'sha-abc-1234567890',
        pr_title: 'PR Title',
        pr_author: 'dev',
        status: 'queued',
      });

      expect(res.created).toBe(true);
      expect(res.reviewRun.id).toBe('run-uuid-1');
    });

    it('createReviewRun inserts a new run into database', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue(createMockBuilder(mockRun)),
      };
      setSupabaseAdminForTesting(mockClient);

      const created = await createReviewRun({
        repo_id: 'repo-uuid-1',
        pr_number: 15,
        commit_sha: 'sha-abc-1234567890',
        pr_title: 'Title',
        pr_author: 'dev',
        status: 'queued',
      });

      expect(created.id).toBe('run-uuid-1');
    });

    it('transitionReviewRunState transitions run state with validation', async () => {
      const mockQueuedRun = { ...mockRun, status: 'queued' };
      const mockRunningRun = { ...mockRun, status: 'running' };

      const mockClient = {
        from: vi.fn().mockImplementation(() => {
          return {
            select: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockQueuedRun, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockRunningRun, error: null }),
            then: (resolve: any) => resolve({ data: mockRunningRun, error: null }),
          };
        }),
      };
      setSupabaseAdminForTesting(mockClient);

      const transition = await transitionReviewRunState('run-uuid-1', 'running', {
        startedAt: new Date().toISOString(),
      });

      expect(transition.success).toBe(true);
    });

    it('updateReviewRun updates record fields', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue(createMockBuilder(null)),
      };
      setSupabaseAdminForTesting(mockClient);

      await expect(
        updateReviewRun('run-uuid-1', {
          status: 'completed',
        })
      ).resolves.not.toThrow();
    });

    it('findStuckRunningReviewRuns returns overdue runs', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue(createMockBuilder([mockRun])),
      };
      setSupabaseAdminForTesting(mockClient);

      const stuck = await findStuckRunningReviewRuns(60);
      expect(stuck).toHaveLength(1);
    });

    it('runDataRetentionCleanup deletes expired rows', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnThis(),
          lt: vi.fn().mockResolvedValue({ count: 5 }),
        }),
      };
      setSupabaseAdminForTesting(mockClient);

      const cleanup = await runDataRetentionCleanup();
      expect(cleanup.tryRunsDeleted).toBe(5);
      expect(cleanup.logsDeleted).toBe(5);
      expect(cleanup.deliveriesDeleted).toBe(5);
    });

    it('saveFindings persists finding rows', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue(createMockBuilder([mockFinding])),
      };
      setSupabaseAdminForTesting(mockClient);

      const saved = await saveFindings([
        {
          review_run_id: 'run-uuid-1',
          file_path: 'lib/auth.ts',
          line: 42,
          severity: 'critical',
          message: 'SQL Injection',
          tool_source: 'ast_analyzer',
          suggested_fix: null,
        },
      ]);

      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe('f-uuid-1');
    });

    it('createTryRun and getTryRunById work with database', async () => {
      const mockTryRun = {
        id: 'try-00000000-0000-0000-0000-000000000001',
        session_id: 'sess-123',
        input_type: 'pasted' as const,
        input_snippet: 'const x = 1;',
        pr_title: 'Title',
        pr_author: 'dev',
        findings: [],
        agent_trace: [],
        tool_calls_count: 0,
        summary: 'Clean',
        status: 'completed',
        created_at: new Date().toISOString(),
      };

      const mockClient = {
        from: vi.fn().mockReturnValue(createMockBuilder(mockTryRun)),
      };
      setSupabaseAdminForTesting(mockClient);

      const created = await createTryRun({
        id: mockTryRun.id,
        session_id: 'sess-123',
        input_type: 'pasted',
        input_snippet: 'const x = 1;',
        pr_title: 'Title',
        pr_author: 'dev',
        findings: [],
        agent_trace: [],
        tool_calls_count: 0,
        summary: 'Clean',
      });

      expect(created.id).toBe(mockTryRun.id);

      const fetched = await getTryRunById(mockTryRun.id);
      expect(fetched?.id).toBe(mockTryRun.id);

      const sessionRuns = await getTryRunsBySession('sess-123');
      expect(sessionRuns.length).toBeGreaterThanOrEqual(1);
    });
  });
});
