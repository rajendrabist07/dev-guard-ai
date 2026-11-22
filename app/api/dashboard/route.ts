import { NextRequest, NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/db/supabase';
import { authenticateRequest, requireUser, UnauthorizedError, ForbiddenError } from '@/lib/security/auth';

export async function GET(req: NextRequest) {
  try {
    // Single authorization layer: require user session
    await requireUser(req);
    const auth = await authenticateRequest(req);
    
    // Authorized user gets access only to their verified repositories
    const data = await getDashboardData(auth.accessibleRepoIds);
    return NextResponse.json(data);
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : 'Dashboard data could not be loaded.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
