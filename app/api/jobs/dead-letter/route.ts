import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature, ReviewJobPayload } from '@/lib/queue/qstash';
import { transitionReviewRunState } from '@/lib/db/supabase';
import { logger } from '@/lib/observability/logger';
import { extractCorrelationId } from '@/lib/resilience/fetch-with-retry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const correlationId = extractCorrelationId(req.headers);
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('upstash-signature');

  const isValid = await verifyQStashSignature(rawBody, signatureHeader);
  if (!isValid) {
    logger.warn('Rejected dead-letter request due to invalid QStash signature', {
      module: 'dead-letter',
      action: 'verify-signature',
      correlationId,
    });
    return NextResponse.json({ error: 'Invalid queue signature' }, { status: 401 });
  }

  let body: { body?: string | ReviewJobPayload; error?: string } = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    // Malformed JSON
  }

  let payload: ReviewJobPayload | null = null;
  if (body.body) {
    if (typeof body.body === 'string') {
      try {
        payload = JSON.parse(body.body) as ReviewJobPayload;
      } catch {
        // Fallback
      }
    } else {
      payload = body.body as ReviewJobPayload;
    }
  }

  const reviewRunId = payload?.reviewRunId;
  const failureReason = body.error || 'Max retry attempts exceeded in queue pipeline.';

  if (reviewRunId) {
    await transitionReviewRunState(reviewRunId, 'failed', {
      finishedAt: new Date().toISOString(),
      errorCode: 'DEAD_LETTER_MAX_RETRIES',
      errorMessage: `Job routed to dead-letter queue: ${failureReason}`,
      correlationId,
    });

    logger.error('Review run routed to dead-letter queue — marked as permanently failed', {
      module: 'dead-letter',
      action: 'process-dead-letter',
      reviewRunId,
      failureReason,
      correlationId,
    });
  }

  return NextResponse.json({ received: true, status: 'processed_dead_letter' }, { status: 200 });
}
