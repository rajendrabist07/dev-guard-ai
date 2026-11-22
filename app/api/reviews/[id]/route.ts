import { NextRequest, NextResponse } from 'next/server';
import {
  requireReviewRunAccess,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from '@/lib/security/auth';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const { id } = params;

    // Single authorization layer: verifies identity, repo ownership, or public simulation status
    const { run, findings } = await requireReviewRunAccess(id, req);

    return NextResponse.json({
      run,
      findings,
    });
  } catch (err: unknown) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
