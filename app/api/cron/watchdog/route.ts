import { NextRequest, NextResponse } from 'next/server';
import { findStuckRunningReviewRuns, transitionReviewRunState } from '@/lib/db/supabase';
import { logger } from '@/lib/observability/logger';
import { extractCorrelationId } from '@/lib/resilience/fetch-with-retry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // If CRON_SECRET is not set, allow execution in non-production environments
    return process.env.NODE_ENV !== 'production';
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  return false;
}

/**
 * Watchdog cron endpoint: Finds runs stuck in 'running' state past the 5-minute
 * threshold and idempotently transitions them to 'timed_out'.
 */
export async function GET(req: NextRequest) {
  const correlationId = extractCorrelationId(req.headers);

  if (!isCronAuthorized(req)) {
    logger.warn('Unauthorized attempt to trigger watchdog cron', {
      module: 'cron-watchdog',
      action: 'auth-check',
      correlationId,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 5-minute timeout threshold (300 seconds)
    const stuckRuns = await findStuckRunningReviewRuns(300);
    const timedOutRunIds: string[] = [];

    for (const run of stuckRuns) {
      const result = await transitionReviewRunState(run.id, 'timed_out', {
        finishedAt: new Date().toISOString(),
        errorCode: 'EXECUTION_TIMEOUT',
        errorMessage: 'Review run exceeded maximum execution threshold of 300 seconds. Marked as timed_out by watchdog cron.',
        correlationId,
      });

      if (result.success) {
        timedOutRunIds.push(run.id);
        logger.warn('Watchdog cron recovered stuck review run — marked as timed_out', {
          module: 'cron-watchdog',
          action: 'recover-stuck-run',
          reviewRunId: run.id,
          startedAt: run.started_at,
          correlationId,
        });
      }
    }

    return NextResponse.json({
      status: 'success',
      stuckRunsCount: stuckRuns.length,
      timedOutCount: timedOutRunIds.length,
      timedOutRunIds,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Watchdog cron failure';
    logger.error('Watchdog cron execution encountered an error', err, {
      module: 'cron-watchdog',
      action: 'cron-failure',
      correlationId,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
