import { NextRequest, NextResponse } from 'next/server';
import { verifyGitHubWebhook } from '@/lib/github/client';
import {
  createReviewRunOnConflictDoNothing,
  ensureRepoForInstallation,
  recordWebhookDelivery,
} from '@/lib/db/supabase';
import { enqueueReviewJob } from '@/lib/queue/qstash';
import { logger } from '@/lib/observability/logger';
import { extractCorrelationId } from '@/lib/resilience/fetch-with-retry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_WEBHOOK_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5MB payload limit

export async function POST(req: NextRequest) {
  const correlationId = extractCorrelationId(req.headers);

  try {
    const rawBody = await req.text();

    // 1. Enforce Maximum Payload Size (5MB)
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_PAYLOAD_BYTES) {
      logger.warn('Rejected GitHub webhook exceeding max payload size limit (5MB)', {
        module: 'webhook-handler',
        action: 'check-payload-size',
        size: Buffer.byteLength(rawBody, 'utf8'),
        correlationId,
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
        correlationId,
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
        correlationId,
      });
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    // 3. Reject Missing Delivery ID (400)
    if (!deliveryId) {
      logger.warn('Rejected GitHub webhook missing x-github-delivery header', {
        module: 'webhook-handler',
        action: 'verify-delivery',
        eventType,
        correlationId,
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
        correlationId,
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
        correlationId,
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
        correlationId,
      });
      return NextResponse.json({ message: `Pull request action ${action || 'none'} ignored` }, { status: 202 });
    }

    const pr = payload.pull_request;
    const repo = payload.repository;

    if (!pr || !repo) {
      logger.warn('Malformed pull_request event payload received', {
        module: 'webhook-handler',
        action: 'parse-payload',
        correlationId,
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
        correlationId,
      });
      return NextResponse.json({ message: 'Missing GitHub installation id' }, { status: 200 });
    }

    const storedRepo = await ensureRepoForInstallation({
      githubInstallationId: String(installationId),
      accountLogin: repo.owner?.login ?? repoFullName.split('/')[0],
      fullName: repoFullName,
    });

    // 6. Idempotent Review Run Creation (status = 'queued', ON CONFLICT DO NOTHING)
    const { created, reviewRun } = await createReviewRunOnConflictDoNothing({
      repo_id: storedRepo.id,
      pr_number: prNumber,
      pr_title: prTitle,
      pr_author: prAuthor,
      commit_sha: commitSha,
      status: 'queued',
      correlation_id: correlationId,
    });

    if (!created) {
      logger.info('Duplicate webhook event detected — skipping review execution (idempotent)', {
        module: 'webhook-handler',
        action: 'idempotency-dedupe',
        repoFullName,
        prNumber,
        commitSha: commitSha.substring(0, 7),
        existingRunId: reviewRun.id,
        correlationId,
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

    // 7. Enqueue Review Run via Durable Queue (Upstash QStash)
    await enqueueReviewJob({
      reviewRunId: reviewRun.id,
      installationId,
      repoFullName,
      prNumber,
      commitSha,
      prTitle,
      prAuthor,
      correlationId,
      attempt: 1,
    });

    return NextResponse.json(
      {
        status: 'accepted',
        message: 'Webhook received and review job enqueued.',
        reviewRunId: reviewRun.id,
      },
      { status: 202 }
    );
  } catch (err: unknown) {
    logger.error('Unhandled exception in GitHub webhook handler', err, {
      module: 'webhook-handler',
      action: 'process-request',
      correlationId,
    });
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
