import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature, ReviewJobPayload } from '@/lib/queue/qstash';
import { executeReviewJob } from '@/lib/jobs/review-pipeline';
import { logger } from '@/lib/observability/logger';
import { extractCorrelationId } from '@/lib/resilience/fetch-with-retry';

// Vercel serverless function maxDuration configuration (60s on Hobby/Pro default)
export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const correlationId = extractCorrelationId(req.headers);
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('upstash-signature');

  // 1. Signature Verification
  const isValid = await verifyQStashSignature(rawBody, signatureHeader);
  if (!isValid) {
    logger.warn('Rejected review worker request due to invalid QStash signature', {
      module: 'review-worker',
      action: 'verify-signature',
      correlationId,
    });
    return NextResponse.json({ error: 'Invalid queue signature' }, { status: 401 });
  }

  let payload: ReviewJobPayload;
  try {
    payload = JSON.parse(rawBody) as ReviewJobPayload;
  } catch {
    return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  if (!payload.reviewRunId || !payload.repoFullName || !payload.commitSha) {
    return NextResponse.json({ error: 'Missing required review run payload parameters' }, { status: 400 });
  }

  payload.correlationId = payload.correlationId || correlationId;

  try {
    const result = await executeReviewJob(payload);
    return NextResponse.json({
      status: 'success',
      reviewRunId: result.reviewRunId,
      findingsCount: result.findingsCount,
      durationMs: result.durationMs,
    }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Worker execution failed';
    // Returning 500 instructs QStash to retry with exponential backoff
    return NextResponse.json({ error: message, reviewRunId: payload.reviewRunId }, { status: 500 });
  }
}
