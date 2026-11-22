import { NextRequest, NextResponse } from 'next/server';
import { getTryRunById } from '@/lib/db/supabase';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Test run not found or expired' }, { status: 404 });
    }

    const run = await getTryRunById(id);
    if (!run) {
      return NextResponse.json({ error: 'Test run not found or expired' }, { status: 404 });
    }

    // Enforce 30-day retention/expiry limit
    const now = Date.now();
    const expiresAt = run.expires_at
      ? new Date(run.expires_at).getTime()
      : new Date(run.created_at).getTime() + 30 * 24 * 60 * 60 * 1000;

    if (now > expiresAt) {
      return NextResponse.json({ error: 'Test run not found or expired' }, { status: 404 });
    }

    return NextResponse.json(
      { run },
      {
        headers: {
          'X-Robots-Tag': 'noindex, nofollow',
        },
      }
    );
  } catch (err: unknown) {
    logger.error('Error fetching try run by ID', err, {
      module: 'try-api',
      action: 'get-result',
    });
    const message = err instanceof Error ? err.message : 'Failed to retrieve test run';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
