import { NextRequest, NextResponse, after } from 'next/server';
import {
  fetchPullRequestDiff,
  getOctokitClient,
  postGitHubReviewComment,
  verifyGitHubWebhook,
} from '@/lib/github/client';
import {
  createReviewRun,
  ensureRepoForInstallation,
  findExistingReviewRun,
  saveFindings,
  updateReviewRun,
} from '@/lib/db/supabase';
import { runAgentOrchestrator } from '@/lib/agent/orchestrator';
import { logger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Executes the full agentic review pipeline in a non-blocking background context.
 * Features a 2-minute safety watchdog timeout to prevent orphaned 'running' states.
 */
async function processReviewInBackground(params: {
  installationId: number;
  storedRepoId: string;
  repoFullName: string;
  prNumber: number;
  commitSha: string;
  prTitle: string;
  prAuthor: string;
  reviewRunId: string;
  startTime: number;
}) {
  const {
    installationId,
    repoFullName,
    prNumber,
    commitSha,
    reviewRunId,
    startTime,
  } = params;

  // Safeguard: 2-minute timeout watchdog
  const watchdogTimer = setTimeout(async () => {
    try {
      await updateReviewRun(reviewRunId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: 'Execution timed out after 120 seconds.',
      });
      logger.error('Review execution watchdog triggered — marked as failed', {
        module: 'webhook-handler',
        action: 'watchdog-timeout',
        reviewRunId,
      });
    } catch {
      // Ignore fallback cleanup errors
    }
  }, 120_000);

  try {
    const octokit = await getOctokitClient(installationId);
    const [owner = '', repoName = ''] = repoFullName.split('/');
    if (!owner || !repoName) return;

    // 1. Fetch live PR diff & file list
    const { diff, files } = await fetchPullRequestDiff(octokit, owner, repoName, prNumber);

    // 2. Run Agentic Multi-Tool Orchestrator
    const result = await runAgentOrchestrator(diff, files, reviewRunId);

    // 3. Post review comment with diff-hunk line validation to prevent 422 errors
    await postGitHubReviewComment(
      octokit,
      owner,
      repoName,
      prNumber,
      commitSha,
      result.findings,
      result.summary,
      diff
    );

    // 4. Save findings & update review run in Supabase
    await saveFindings(result.findings);
    await updateReviewRun(reviewRunId, {
      status: 'completed',
      tool_calls_count: result.toolCallsCount,
      agent_trace: result.trace,
      completed_at: new Date().toISOString(),
      error_message: null,
    });

    clearTimeout(watchdogTimer);

    logger.info('Autonomous PR review completed successfully in background', {
      module: 'webhook-handler',
      action: 'review-completed',
      reviewRunId,
      findingsCount: result.findings.length,
      durationMs: Date.now() - startTime,
    });
  } catch (err: unknown) {
    clearTimeout(watchdogTimer);
    const message = err instanceof Error ? err.message : 'Review processing failed.';
    await updateReviewRun(reviewRunId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: message,
    });
    logger.error('PR review background execution failed', err, {
      module: 'webhook-handler',
      action: 'agent-orchestration',
      reviewRunId,
    });
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256') || '';
    const eventType = req.headers.get('x-github-event') || '';

    // 1. Verify Webhook Signature
    const isValid = await verifyGitHubWebhook(rawBody, signature);
    if (!isValid) {
      logger.warn('Rejected GitHub webhook due to invalid HMAC-SHA256 signature', {
        module: 'webhook-handler',
        action: 'verify-signature',
        eventType,
      });
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      action?: string;
      installation?: { id?: number };
      pull_request?: {
        number: number;
        title?: string;
        head: { sha: string };
        user?: { login?: string };
      };
      repository?: {
        full_name: string;
        owner?: { login?: string };
      };
    };

    // Filter for pull_request events (opened, synchronize, reopened)
    if (eventType === 'pull_request') {
      const action = payload.action;
      if (action && ['opened', 'synchronize', 'reopened'].includes(action)) {
        const pr = payload.pull_request;
        const repo = payload.repository;

        if (!pr || !repo) {
          logger.warn('Malformed pull_request event payload received', {
            module: 'webhook-handler',
            action: 'parse-payload',
          });
          return NextResponse.json({ message: 'Malformed pull_request event ignored' }, { status: 200 });
        }

        const repoFullName = repo.full_name;
        const prNumber = pr.number;
        const commitSha = pr.head.sha;
        const prTitle = pr.title || '';
        const prAuthor = pr.user?.login || 'unknown';
        const installationId = payload.installation?.id;

        if (!installationId) {
          logger.warn('Missing GitHub installation id in webhook', {
            module: 'webhook-handler',
            repoFullName,
            prNumber,
          });
          return NextResponse.json({ message: 'Missing GitHub installation id' }, { status: 200 });
        }

        const storedRepo = await ensureRepoForInstallation({
          githubInstallationId: String(installationId),
          accountLogin: repo.owner?.login ?? repoFullName.split('/')[0],
          fullName: repoFullName,
        });

        // 2. Idempotency Check
        const existingRun = await findExistingReviewRun(storedRepo.id, prNumber, commitSha);
        if (existingRun && (existingRun.status === 'completed' || existingRun.status === 'running')) {
          logger.info('Duplicate webhook event detected — skipping review execution (idempotent)', {
            module: 'webhook-handler',
            action: 'idempotency-dedupe',
            repoFullName,
            prNumber,
            commitSha: commitSha.substring(0, 7),
            existingRunId: existingRun.id,
          });
          return NextResponse.json({
            message: 'Duplicate event ignored (idempotent)',
            reviewRunId: existingRun.id,
            status: 'duplicate',
          }, { status: 200 });
        }

        // 3. Create initial review_run row in Supabase DB
        const reviewRun = await createReviewRun({
          repo_id: storedRepo.id,
          pr_number: prNumber,
          pr_title: prTitle,
          pr_author: prAuthor,
          commit_sha: commitSha,
          status: 'running',
        });

        // 4. Trigger Asynchronous Background Orchestration (Next.js 15 after API with background fallback)
        const runBackgroundJob = () => {
          processReviewInBackground({
            installationId,
            storedRepoId: storedRepo.id,
            repoFullName,
            prNumber,
            commitSha,
            prTitle,
            prAuthor,
            reviewRunId: reviewRun.id,
            startTime,
          }).catch((err) => {
            logger.error('Background review task uncaught error', err);
          });
        };

        try {
          after(runBackgroundJob);
        } catch {
          // Fallback for non-Next server contexts (e.g. Unit tests / local edge mocks)
          queueMicrotask(runBackgroundJob);
        }

        // 5. IMMEDIATE 202 ACCEPTED RESPONSE — Zero blocking on LLM/OSV calls
        return NextResponse.json(
          {
            status: 'accepted',
            message: 'Webhook received and autonomous review scheduled.',
            reviewRunId: reviewRun.id,
          },
          { status: 202 }
        );
      }
    }

    return NextResponse.json({ message: 'Event ignored' }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Unhandled exception in GitHub webhook handler', err, {
      module: 'webhook-handler',
      action: 'process-request',
    });
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
