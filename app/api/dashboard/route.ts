import { NextRequest, NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/db/supabase';
import { authenticateRequest } from '@/lib/security/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    // If authenticated, scope dashboard to user's authorized repos; if guest demo, show public demo data
    const accessibleRepoIds = auth.isAuthenticated ? auth.accessibleRepoIds : undefined;
    const data = await getDashboardData(accessibleRepoIds);
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('Error loading dashboard data:', err);
    const message = err instanceof Error ? err.message : 'Dashboard data could not be loaded.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
