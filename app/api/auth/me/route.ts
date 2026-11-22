import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/security/auth';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.isAuthenticated || !auth.user) {
    return NextResponse.json({ isAuthenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    isAuthenticated: true,
    user: auth.user,
  });
}
