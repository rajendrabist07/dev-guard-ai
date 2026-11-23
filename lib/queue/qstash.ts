import { Client, Receiver } from '@upstash/qstash';
import { logger } from '../observability/logger';
import { qstashCircuitBreaker } from '../resilience/circuit-breaker';

export interface ReviewJobPayload {
  reviewRunId: string;
  installationId: number;
  repoFullName: string;
  prNumber: number;
  commitSha: string;
  prTitle: string;
  prAuthor: string;
  correlationId: string;
  attempt?: number;
}

function getAppBaseUrl(): string {
  const customBase = process.env.APP_BASE_URL;
  if (customBase) return customBase.replace(/\/$/, '');

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, '')}`;

  return 'http://localhost:3000';
}

/**
 * Enqueues a durable review job via Upstash QStash.
 * If QSTASH_TOKEN is not configured (e.g. local dev or test), it falls back
 * to non-blocking direct dispatch so the system remains operational.
 */
export async function enqueueReviewJob(payload: ReviewJobPayload): Promise<{
  enqueued: boolean;
  messageId?: string;
  provider: 'qstash' | 'direct_fallback';
}> {
  const token = process.env.QSTASH_TOKEN;
  const baseUrl = getAppBaseUrl();

  if (!token) {
    logger.info('QSTASH_TOKEN not configured; falling back to direct asynchronous worker execution', {
      module: 'queue',
      action: 'local-dispatch',
      reviewRunId: payload.reviewRunId,
      correlationId: payload.correlationId,
    });

    // Execute directly in background via worker endpoint or microtask
    triggerDirectWorkerExecution(payload).catch((err) => {
      logger.error('Direct worker execution fallback failed', err, {
        module: 'queue',
        reviewRunId: payload.reviewRunId,
        correlationId: payload.correlationId,
      });
    });

    return { enqueued: true, provider: 'direct_fallback' };
  }

  const client = new Client({ token });
  const workerUrl = `${baseUrl}/api/jobs/review-worker`;
  const deadLetterUrl = `${baseUrl}/api/jobs/dead-letter`;

  try {
    const result = await qstashCircuitBreaker.execute(async () => {
      return await client.publishJSON({
        url: workerUrl,
        body: payload,
        retries: 3,
        backoff: { type: 'exponential', factor: 2 },
        callback: deadLetterUrl,
        headers: {
          'x-correlation-id': payload.correlationId,
          'Content-Type': 'application/json',
        },
      });
    });

    logger.info('Successfully enqueued review job to Upstash QStash', {
      module: 'queue',
      action: 'enqueue-job',
      reviewRunId: payload.reviewRunId,
      messageId: result.messageId,
      correlationId: payload.correlationId,
    });

    return { enqueued: true, messageId: result.messageId, provider: 'qstash' };
  } catch (err: unknown) {
    logger.error('Failed to enqueue job to QStash; falling back to direct dispatch', err, {
      module: 'queue',
      action: 'qstash-fallback',
      reviewRunId: payload.reviewRunId,
      correlationId: payload.correlationId,
    });

    // Failover: trigger direct execution so job is not lost
    triggerDirectWorkerExecution(payload).catch(() => {});
    return { enqueued: true, provider: 'direct_fallback' };
  }
}

/**
 * Validates the cryptographic signature of an inbound QStash webhook request.
 */
export async function verifyQStashSignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentKey && !nextKey) {
    // In local dev/test without QStash keys, allow internal calls
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }
    return false;
  }

  if (!signatureHeader) {
    return false;
  }

  try {
    const receiver = new Receiver({
      currentSigningKey: currentKey || '',
      nextSigningKey: nextKey || '',
    });

    await receiver.verify({
      body: rawBody,
      signature: signatureHeader,
    });

    return true;
  } catch (err) {
    logger.warn('Failed to verify QStash signature', {
      module: 'queue',
      action: 'verify-signature',
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function triggerDirectWorkerExecution(payload: ReviewJobPayload): Promise<void> {
  // Dynamic import of worker runner to avoid circular dependencies
  const { executeReviewJob } = await import('@/lib/jobs/review-pipeline');
  await executeReviewJob(payload);
}
