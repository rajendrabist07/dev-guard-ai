import { NextRequest, NextResponse } from 'next/server';
import { runDataRetentionCleanup } from '@/lib/db/supabase';
import { logger } from '@/lib/observability/logger';
import { extractCorrelationId } from '@/lib/resilience/fetch-with-retry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return process.env.NODE_ENV !== 'production';
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  return false;
}

/**
 * Retention cron endpoint: Purges expired try_runs, system_logs older than 14 days,
 * and webhook_deliveries older than 7 days.
 */
export async function GET(req: NextRequest) {
  const correlationId = extractCorrelationId(req.headers);

  if (!isCronAuthorized(req)) {
    logger.warn('Unauthorized attempt to trigger retention cron', {
      module: 'cron-retention',
      action: 'auth-check',
      correlationId,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runDataRetentionCleanup();
    logger.info('Data retention cleanup executed successfully', {
      module: 'cron-retention',
      action: 'retention-cleanup',
      ...result,
      correlationId,
    });

    return NextResponse.json({
      status: 'success',
      ...result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Retention cron failure';
    logger.error('Retention cron encountered an error', err, {
      module: 'cron-retention',
      action: 'cron-failure',
      correlationId,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
