import { NextRequest, NextResponse, after } from 'next/server';
import {
  fetchPullRequestDiff,
  getOctokitClient,
  postGitHubReviewComment,
  verifyGitHubWebhook,
} from '@/lib/github/client';
import {
  createReviewRunOnConflictDoNothing,
  ensureRepoForInstallation,
  recordWebhookDelivery,
  saveFindings,
  updateReviewRun,
} from '@/lib/db/supabase';
import { runAgentOrchestrator } from '@/lib/agent/orchestrator';
import { logger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_WEBHOOK_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5MB payload limit

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

    // 1. Enforce Maximum Payload Size (5MB)
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_PAYLOAD_BYTES) {
      logger.warn('Rejected GitHub webhook exceeding max payload size limit (5MB)', {
        module: 'webhook-handler',
        action: 'check-payload-size',
        size: Buffer.byteLength(rawBody, 'utf8'),
      });
      return NextResponse.json({ error: 'Payload too large (max 5MB)' }, { status: 413 });
    }

    const signature = req.headers.get('x-hub-signature-256');
    const eventType = req.headers.get('x-github-event') || '';
    const deliveryId = req.headers.get('x-github-delivery');

    // 2. Reject Missing or Invalid Signature Header (401)
    if (!signature) {
      logger.warn('Rejected GitHub webhook missing x-hub-signature-256 header', {
        module: 'webhook-handler',
        action: 'verify-signature',
        eventType,
      });
      return NextResponse.json({ error: 'Missing x-hub-signature-256 header' }, { status: 401 });
    }

    // Verify Webhook Signature via Timing-Safe HMAC-SHA256
    const isValid = await verifyGitHubWebhook(rawBody, signature);
    if (!isValid) {
      logger.warn('Rejected GitHub webhook due to invalid HMAC-SHA256 signature', {
        module: 'webhook-handler',
        action: 'verify-signature',
        eventType,
      });
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    // 3. Reject Missing Delivery ID (400)
    if (!deliveryId) {
      logger.warn('Rejected GitHub webhook missing x-github-delivery header', {
        module: 'webhook-handler',
        action: 'verify-delivery',
        eventType,
      });
      return NextResponse.json({ error: 'Missing x-github-delivery header' }, { status: 400 });
    }

    // 4. Delivery ID Replay Prevention
    const isNewDelivery = await recordWebhookDelivery(deliveryId, eventType);
    if (!isNewDelivery) {
      logger.info('Duplicate webhook delivery ignored (replay prevention)', {
        module: 'webhook-handler',
        action: 'replay-dedupe',
        deliveryId,
      });
      return NextResponse.json(
        { message: 'Duplicate webhook delivery ignored (replay prevention)' },
        { status: 200 }
      );
    }

    // 5. Filter and Handle Unsupported Events (Return 202 with Log Line)
    if (eventType !== 'pull_request') {
      logger.info('Ignored unsupported GitHub webhook event type', {
        module: 'webhook-handler',
        action: 'unsupported-event',
        eventType,
      });
      return NextResponse.json({ message: `Event ${eventType} ignored` }, { status: 202 });
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

    const action = payload.action;
    if (!action || !['opened', 'synchronize', 'reopened'].includes(action)) {
      logger.info('Ignored unsupported pull_request action', {
        module: 'webhook-handler',
        action: 'unsupported-action',
        actionName: action,
      });
      return NextResponse.json({ message: `Pull request action ${action || 'none'} ignored` }, { status: 202 });
    }

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

    // 6. Idempotent Review Run Creation (ON CONFLICT DO NOTHING)
    const { created, reviewRun } = await createReviewRunOnConflictDoNothing({
      repo_id: storedRepo.id,
      pr_number: prNumber,
      pr_title: prTitle,
      pr_author: prAuthor,
      commit_sha: commitSha,
      status: 'running',
    });

    if (!created) {
      logger.info('Duplicate webhook event detected — skipping review execution (idempotent)', {
        module: 'webhook-handler',
        action: 'idempotency-dedupe',
        repoFullName,
        prNumber,
        commitSha: commitSha.substring(0, 7),
        existingRunId: reviewRun.id,
      });
      return NextResponse.json(
        {
          message: 'Duplicate event ignored (idempotent)',
          reviewRunId: reviewRun.id,
          status: 'duplicate',
        },
        { status: 200 }
      );
    }

    // 7. Trigger Asynchronous Background Orchestration
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
      queueMicrotask(runBackgroundJob);
    }

    return NextResponse.json(
      {
        status: 'accepted',
        message: 'Webhook received and autonomous review scheduled.',
        reviewRunId: reviewRun.id,
      },
      { status: 202 }
    );
  } catch (err: unknown) {
    logger.error('Unhandled exception in GitHub webhook handler', err, {
      module: 'webhook-handler',
      action: 'process-request',
    });
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
