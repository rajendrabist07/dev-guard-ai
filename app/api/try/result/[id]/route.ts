import { NextRequest, NextResponse } from 'next/server';
import { getTryRunById } from '@/lib/db/supabase';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Run ID is required' }, { status: 400 });
    }

    const run = await getTryRunById(id);
    if (!run) {
      return NextResponse.json({ error: 'Test run not found or expired' }, { status: 404 });
    }

    return NextResponse.json({ run });
  } catch (err: unknown) {
    logger.error('Error fetching try run by ID', err, {
      module: 'try-api',
      action: 'get-result',
    });
    const message = err instanceof Error ? err.message : 'Failed to retrieve test run';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
