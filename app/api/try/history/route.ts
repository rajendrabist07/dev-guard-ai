import { NextRequest, NextResponse } from 'next/server';
import { getTryRunsBySession } from '@/lib/db/supabase';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ runs: [] });
    }

    const runs = await getTryRunsBySession(sessionId, 30);
    return NextResponse.json({ runs });
  } catch (err: unknown) {
    logger.error('Failed to fetch try runs history', err, {
      module: 'try-api',
      action: 'get-history',
    });
    const message = err instanceof Error ? err.message : 'Failed to fetch history';
    return NextResponse.json({ error: message, runs: [] }, { status: 500 });
  }
}
