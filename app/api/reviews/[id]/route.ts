import { NextRequest, NextResponse } from 'next/server';
import { getReviewRunById } from '@/lib/db/supabase';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const { id } = params;
    const { run, findings } = await getReviewRunById(id);

    if (!run) {
      return NextResponse.json({ error: 'Review run not found' }, { status: 404 });
    }

    return NextResponse.json({
      run,
      findings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
