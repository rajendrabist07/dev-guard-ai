import {
  fetchPullRequestDetails,
  getOctokitClient,
  postGitHubReviewComment,
} from '@/lib/github/client';
import {
  saveFindings,
  transitionReviewRunState,
  getReviewRunById,
} from '@/lib/db/supabase';
import { runAgentOrchestrator } from '@/lib/agent/orchestrator';
import { logger } from '@/lib/observability/logger';
import { ReviewJobPayload } from '@/lib/queue/qstash';
import { getIngestedCiData } from '@/lib/ingest/store';

export async function executeReviewJob(payload: ReviewJobPayload): Promise<{
  success: boolean;
  reviewRunId: string;
  findingsCount: number;
  durationMs: number;
}> {
  const startTime = Date.now();
  const {
    reviewRunId,
    installationId,
    repoFullName,
    prNumber,
    commitSha,
    correlationId,
    attempt = 1,
  } = payload;

  logger.info('Starting review job execution pipeline', {
    module: 'review-pipeline',
    action: 'start-execution',
    reviewRunId,
    repoFullName,
    prNumber,
    commitSha: commitSha.substring(0, 7),
    attempt,
    correlationId,
  });

  // 1. Idempotency Check & State Machine Transition: queued -> running
  const transition = await transitionReviewRunState(reviewRunId, 'running', {
    startedAt: new Date().toISOString(),
    attempt,
    correlationId,
  });

  if (!transition.success) {
    // If the run is already completed or failed, we exit safely (idempotent retry)
    const existing = await getReviewRunById(reviewRunId);
    if (existing?.run?.status === 'completed') {
      logger.info('Review run is already completed; skipping duplicate execution (idempotent)', {
        module: 'review-pipeline',
        action: 'idempotent-skip',
        reviewRunId,
      });
      return { success: true, reviewRunId, findingsCount: existing.findings.length, durationMs: 0 };
    }

    if (existing?.run?.status === 'failed' || existing?.run?.status === 'timed_out') {
      logger.warn(`Review run is already in terminal state '${existing?.run?.status}'; halting execution`, {
        module: 'review-pipeline',
        action: 'terminal-skip',
        reviewRunId,
      });
      return { success: false, reviewRunId, findingsCount: 0, durationMs: 0 };
    }

    throw new Error(transition.reason || 'Failed to transition review run state to running.');
  }

  try {
    const octokit = await getOctokitClient(installationId);
    const [owner = '', repoName = ''] = repoFullName.split('/');
    if (!owner || !repoName) {
      throw new Error(`Invalid repository full name format: ${repoFullName}`);
    }

    // 2. Fetch live PR details: diff, files, full files at head SHA, and lockfile
    const prDetails = await fetchPullRequestDetails(octokit, owner, repoName, prNumber, commitSha);

    // 3. Execute Empirical Multi-Tool Agent Orchestrator
    const result = await runAgentOrchestrator(prDetails.diff, prDetails.files, reviewRunId, undefined, {
      lockfileContent: prDetails.lockfileContent,
      lockfileFilename: prDetails.lockfileFilename,
      fullFiles: prDetails.fullFiles,
      correlationId,
    });

    // 4. Ingest and merge external CI findings (Semgrep, OSV, test execution) from devguard-action if present
    const ciData = await getIngestedCiData(repoFullName, commitSha);
    let testNotice = 'tests: not executed — install devguard-action to enable';
    const mergedFindings = [...result.findings];

    if (ciData) {
      if (ciData.tests) {
        testNotice = ciData.tests.passed
          ? `tests: executed (${ciData.tests.command} passed in ${ciData.tests.durationMs}ms)`
          : `tests: executed (${ciData.tests.command} failed with exit code ${ciData.tests.exitCode})`;
      }

      // Merge and deduplicate Semgrep & OSV findings
      for (const f of ciData.findings) {
        const existingIdx = mergedFindings.findIndex(
          (m) => m.file_path === f.file && Math.abs(m.line - f.line) <= 1
        );

        if (existingIdx !== -1) {
          const existing = mergedFindings[existingIdx];
          const sources = new Set(existing.corroboration_sources || [existing.tool_source || 'runLinter']);
          sources.add(f.source);
          mergedFindings[existingIdx] = {
            ...existing,
            confidence: 'high',
            corroboration_sources: Array.from(sources),
          };
        } else {
          mergedFindings.push({
            review_run_id: reviewRunId,
            file_path: f.file,
            line: f.line,
            message: f.message,
            severity: f.severity,
            suggested_fix: f.suggestedFix || null,
            tool_source: f.source,
            corroboration_sources: [f.source],
            confidence: 'high',
          });
        }
      }
    }

    // 5. Post GitHub Review Comment with Diff-Hunk Line Validation & Truncation Notice
    await postGitHubReviewComment(
      octokit,
      owner,
      repoName,
      prNumber,
      commitSha,
      mergedFindings,
      result.summary,
      prDetails.diff,
      prDetails.truncation,
      testNotice
    );

    // 6. Persist Findings & Transition State: running -> completed
    await saveFindings(mergedFindings);

    await transitionReviewRunState(reviewRunId, 'completed', {
      finishedAt: new Date().toISOString(),
      toolCallsCount: result.toolCallsCount,
      agentTrace: result.trace,
      correlationId,
    });

    const durationMs = Date.now() - startTime;
    logger.info('Review job pipeline completed successfully', {
      module: 'review-pipeline',
      action: 'execution-completed',
      reviewRunId,
      findingsCount: mergedFindings.length,
      durationMs,
      correlationId,
    });

    return {
      success: true,
      reviewRunId,
      findingsCount: mergedFindings.length,
      durationMs,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : 'Review execution failed.';

    await transitionReviewRunState(reviewRunId, 'failed', {
      finishedAt: new Date().toISOString(),
      errorCode: 'EXECUTION_FAILURE',
      errorMessage,
      correlationId,
    });

    logger.error('Review job pipeline execution failed', err, {
      module: 'review-pipeline',
      action: 'execution-failure',
      reviewRunId,
      attempt,
      durationMs,
      correlationId,
    });

    throw err;
  }
}
