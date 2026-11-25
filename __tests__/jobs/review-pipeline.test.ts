import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeReviewJob } from '@/lib/jobs/review-pipeline';
import * as githubClient from '@/lib/github/client';
import * as supabaseDb from '@/lib/db/supabase';
import * as orchestrator from '@/lib/agent/orchestrator';
import * as ingestStore from '@/lib/ingest/store';

vi.mock('@/lib/github/client');
vi.mock('@/lib/db/supabase');
vi.mock('@/lib/agent/orchestrator');
vi.mock('@/lib/ingest/store');
vi.mock('@/lib/observability/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('lib/jobs/review-pipeline.ts', () => {
  const basePayload = {
    reviewRunId: 'run-job-123',
    installationId: 4567,
    repoFullName: 'org/test-repo',
    prNumber: 42,
    commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
    prTitle: 'Test PR',
    prAuthor: 'octocat',
    correlationId: 'corr-xyz-1',
    attempt: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully executes a full review pipeline end-to-end without CI ingest', async () => {
    vi.mocked(supabaseDb.transitionReviewRunState).mockResolvedValue({
      success: true,
      run: null,
    });

    vi.mocked(githubClient.getOctokitClient).mockResolvedValue({} as any);
    vi.mocked(githubClient.fetchPullRequestDetails).mockResolvedValue({
      diff: 'diff --git a/index.js b/index.js\n+console.log("hello");',
      files: ['index.js'],
      fullFiles: new Map([['index.js', 'console.log("hello");']]),
      truncation: {
        analyzedFilesCount: 1,
        totalFilesCount: 1,
        isTruncated: false,
        skippedFilesCount: 0,
      },
    });

    vi.mocked(orchestrator.runAgentOrchestrator).mockResolvedValue({
      summary: 'Security analysis clean.',
      findings: [
        {
          review_run_id: 'run-job-123',
          file_path: 'index.js',
          line: 1,
          message: 'Potential secret',
          severity: 'warning',
          tool_source: 'ast_analyzer',
          suggested_fix: null,
        },
      ],
      toolCallsCount: 2,
      trace: [
        {
          step: 1,
          tool: 'ast_analyzer',
          input: {},
          output: {},
          timestamp: new Date().toISOString(),
        },
      ],
      providerUsed: 'groq',
      modelUsed: 'llama-3.3-70b-versatile',
      fallbackTriggered: false,
      tokenCount: 150,
      estimatedCostUsd: 0.001,
      latencies: { linterMs: 0, depsScanMs: 0, testRunnerMs: 0, synthesisMs: 50, totalDurationMs: 120 },
    });

    vi.mocked(ingestStore.getIngestedCiData).mockResolvedValue(null);
    vi.mocked(githubClient.postGitHubReviewComment).mockResolvedValue(true);
    vi.mocked(supabaseDb.saveFindings).mockResolvedValue([]);

    const result = await executeReviewJob(basePayload);

    expect(result.success).toBe(true);
    expect(result.reviewRunId).toBe('run-job-123');
    expect(result.findingsCount).toBe(1);

    expect(supabaseDb.transitionReviewRunState).toHaveBeenCalledWith(
      'run-job-123',
      'running',
      expect.objectContaining({ attempt: 1, correlationId: 'corr-xyz-1' })
    );

    expect(githubClient.postGitHubReviewComment).toHaveBeenCalledWith(
      expect.anything(),
      'org',
      'test-repo',
      42,
      basePayload.commitSha,
      expect.any(Array),
      'Security analysis clean.',
      expect.any(String),
      expect.anything(),
      'tests: not executed — install devguard-action to enable'
    );

    expect(supabaseDb.saveFindings).toHaveBeenCalled();
    expect(supabaseDb.transitionReviewRunState).toHaveBeenCalledWith(
      'run-job-123',
      'completed',
      expect.objectContaining({
        toolCallsCount: 2,
        correlationId: 'corr-xyz-1',
      })
    );
  });

  it('merges external CI test execution results and findings with corroboration', async () => {
    vi.mocked(supabaseDb.transitionReviewRunState).mockResolvedValue({
      success: true,
      run: null,
    });

    vi.mocked(githubClient.getOctokitClient).mockResolvedValue({} as any);
    vi.mocked(githubClient.fetchPullRequestDetails).mockResolvedValue({
      diff: 'diff --git a/app.js b/app.js',
      files: ['app.js'],
      fullFiles: new Map([['app.js', 'eval(x)']]),
      truncation: {
        analyzedFilesCount: 1,
        totalFilesCount: 1,
        isTruncated: false,
        skippedFilesCount: 0,
      },
    });

    vi.mocked(orchestrator.runAgentOrchestrator).mockResolvedValue({
      summary: 'Findings detected.',
      findings: [
        {
          review_run_id: 'run-job-123',
          file_path: 'app.js',
          line: 10,
          message: 'Arbitrary code execution via eval',
          severity: 'critical',
          tool_source: 'ast_analyzer',
          suggested_fix: null,
        },
      ],
      toolCallsCount: 3,
      trace: [],
      providerUsed: 'groq',
      modelUsed: 'llama-3.3-70b-versatile',
      fallbackTriggered: false,
      tokenCount: 300,
      estimatedCostUsd: 0.002,
      latencies: { linterMs: 0, depsScanMs: 0, testRunnerMs: 0, synthesisMs: 80, totalDurationMs: 250 },
    });

    vi.mocked(ingestStore.getIngestedCiData).mockResolvedValue({
      repository: 'org/test-repo',
      sha: basePayload.commitSha,
      ref: 'refs/pull/42/head',
      runId: 'ci-run-1',
      ingestedAt: new Date().toISOString(),
      semgrepCount: 1,
      osvCount: 1,
      tests: {
        passed: true,
        command: 'npm test',
        durationMs: 1500,
        exitCode: 0,
      },
      findings: [
        // Corroborates existing finding at line 10 (line delta <= 1)
        {
          source: 'semgrep',
          ruleId: 'semgrep.eval',
          file: 'app.js',
          line: 10,
          message: 'Semgrep: avoid eval()',
          severity: 'critical',
        },
        // Distinct new finding
        {
          source: 'osv',
          ruleId: 'osv.dep',
          file: 'package.json',
          line: 5,
          message: 'Vulnerable dep',
          severity: 'warning',
          suggestedFix: 'upgrade to 2.0.0',
        },
      ],
    });

    const result = await executeReviewJob(basePayload);

    expect(result.success).toBe(true);
    expect(result.findingsCount).toBe(2);

    expect(githubClient.postGitHubReviewComment).toHaveBeenCalledWith(
      expect.anything(),
      'org',
      'test-repo',
      42,
      basePayload.commitSha,
      expect.arrayContaining([
        expect.objectContaining({
          file_path: 'app.js',
          line: 10,
          confidence: 'high',
          corroboration_sources: expect.arrayContaining(['ast_analyzer', 'semgrep']),
        }),
        expect.objectContaining({
          file_path: 'package.json',
          line: 5,
          tool_source: 'osv',
        }),
      ]),
      'Findings detected.',
      expect.any(String),
      expect.anything(),
      'tests: executed (npm test passed in 1500ms)'
    );
  });

  it('handles failed CI tests in review comment message', async () => {
    vi.mocked(supabaseDb.transitionReviewRunState).mockResolvedValue({
      success: true,
      run: null,
    });

    vi.mocked(githubClient.getOctokitClient).mockResolvedValue({} as any);
    vi.mocked(githubClient.fetchPullRequestDetails).mockResolvedValue({
      diff: 'diff --git a/app.js b/app.js',
      files: [],
      fullFiles: new Map(),
      truncation: {
        analyzedFilesCount: 0,
        totalFilesCount: 0,
        isTruncated: false,
        skippedFilesCount: 0,
      },
    });

    vi.mocked(orchestrator.runAgentOrchestrator).mockResolvedValue({
      summary: 'Clean',
      findings: [],
      toolCallsCount: 1,
      trace: [],
      providerUsed: 'groq',
      modelUsed: 'llama-3.3-70b-versatile',
      fallbackTriggered: false,
      tokenCount: 100,
      estimatedCostUsd: 0.001,
      latencies: { linterMs: 0, depsScanMs: 0, testRunnerMs: 0, synthesisMs: 40, totalDurationMs: 100 },
    });

    vi.mocked(ingestStore.getIngestedCiData).mockResolvedValue({
      repository: 'org/test-repo',
      sha: basePayload.commitSha,
      ref: 'refs/pull/42/head',
      runId: 'ci-run-2',
      ingestedAt: new Date().toISOString(),
      semgrepCount: 0,
      osvCount: 0,
      tests: {
        passed: false,
        command: 'npm test',
        durationMs: 1200,
        exitCode: 1,
      },
      findings: [],
    });

    await executeReviewJob(basePayload);

    expect(githubClient.postGitHubReviewComment).toHaveBeenCalledWith(
      expect.anything(),
      'org',
      'test-repo',
      42,
      basePayload.commitSha,
      [],
      'Clean',
      expect.any(String),
      expect.anything(),
      'tests: executed (npm test failed with exit code 1)'
    );
  });

  it('skips execution idempotently when review run is already completed', async () => {
    vi.mocked(supabaseDb.transitionReviewRunState).mockResolvedValue({
      success: false,
      run: null,
      reason: 'Review run is already in terminal state: completed',
    });

    vi.mocked(supabaseDb.getReviewRunById).mockResolvedValue({
      run: {
        id: 'run-job-123',
        status: 'completed',
        created_at: '',
      } as any,
      findings: [{ id: 'f-1' } as any, { id: 'f-2' } as any],
    });

    const result = await executeReviewJob(basePayload);

    expect(result.success).toBe(true);
    expect(result.findingsCount).toBe(2);
    expect(githubClient.fetchPullRequestDetails).not.toHaveBeenCalled();
    expect(orchestrator.runAgentOrchestrator).not.toHaveBeenCalled();
  });

  it('halts execution when review run is in failed or timed_out terminal state', async () => {
    vi.mocked(supabaseDb.transitionReviewRunState).mockResolvedValue({
      success: false,
      run: null,
      reason: 'Review run is already in terminal state: timed_out',
    });

    vi.mocked(supabaseDb.getReviewRunById).mockResolvedValue({
      run: {
        id: 'run-job-123',
        status: 'timed_out',
      } as any,
      findings: [],
    });

    const result = await executeReviewJob(basePayload);

    expect(result.success).toBe(false);
    expect(result.findingsCount).toBe(0);
    expect(orchestrator.runAgentOrchestrator).not.toHaveBeenCalled();
  });

  it('throws an error if transition fails for an unhandled non-terminal reason', async () => {
    vi.mocked(supabaseDb.transitionReviewRunState).mockResolvedValue({
      success: false,
      run: null,
      reason: 'DB connection dead',
    });

    vi.mocked(supabaseDb.getReviewRunById).mockResolvedValue({ run: null, findings: [] });

    await expect(executeReviewJob(basePayload)).rejects.toThrow('DB connection dead');
  });

  it('transitions state to failed and logs error when an uncaught exception occurs', async () => {
    vi.mocked(supabaseDb.transitionReviewRunState).mockResolvedValueOnce({
      success: true,
      run: null,
    });

    vi.mocked(githubClient.getOctokitClient).mockRejectedValue(new Error('GitHub API rate limit exceeded'));

    await expect(executeReviewJob(basePayload)).rejects.toThrow('GitHub API rate limit exceeded');

    expect(supabaseDb.transitionReviewRunState).toHaveBeenCalledWith(
      'run-job-123',
      'failed',
      expect.objectContaining({
        errorCode: 'EXECUTION_FAILURE',
        errorMessage: 'GitHub API rate limit exceeded',
        correlationId: 'corr-xyz-1',
      })
    );
  });

  it('throws if repository full name is malformed', async () => {
    vi.mocked(supabaseDb.transitionReviewRunState).mockResolvedValueOnce({
      success: true,
      run: null,
    });

    vi.mocked(githubClient.getOctokitClient).mockResolvedValue({} as any);

    await expect(
      executeReviewJob({
        ...basePayload,
        repoFullName: 'invalid-no-slash',
      })
    ).rejects.toThrow('Invalid repository full name format: invalid-no-slash');
  });
});
