import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/security/auth';

const FORBIDDEN_CLIENT_IDENTITY_HEADERS = [
  'x-github-installation-id',
  'x-account-login',
  'x-user-id',
  'x-devguard-user-id',
  'x-devguard-account-login',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Defense in Depth: Strip all client-supplied identity headers at the edge
  const requestHeaders = new Headers(req.headers);
  for (const headerName of FORBIDDEN_CLIENT_IDENTITY_HEADERS) {
    requestHeaders.delete(headerName);
  }

  // 2. Define Public Routes
  const isPublicRoute =
    pathname === '/' ||
    pathname === '/login' ||
    pathname.startsWith('/auth/') ||
    pathname === '/try' ||
    pathname.startsWith('/try/result/') ||
    pathname.startsWith('/api/try') ||
    pathname.startsWith('/api/badge') ||
    pathname === '/api/webhooks/github' ||
    pathname.startsWith('/api/jobs/') ||
    pathname.startsWith('/api/cron/') ||
    pathname === '/api/health' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico';

  // 3. Admin-Only Routes (/observability & /api/observability)
  const isObservabilityRoute =
    pathname === '/observability' || pathname.startsWith('/api/observability');

  if (isObservabilityRoute) {
    // Authenticate the caller
    const auth = await authenticateRequest(req);
    const adminLogins = (process.env.ADMIN_GITHUB_LOGINS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const userLogin = auth.user?.githubLogin?.toLowerCase();
    const isAdmin = Boolean(userLogin && adminLogins.includes(userLogin));

    if (!auth.isAuthenticated || !isAdmin) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Forbidden: Admin access required.' },
          { status: 403 }
        );
      }
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('error', 'admin_required');
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  if (isPublicRoute) {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // 4. Protected API Routes (/api/dashboard, /api/reviews/*, /api/repos/*)
  const isProtectedApi =
    pathname.startsWith('/api/dashboard') ||
    pathname.startsWith('/api/reviews') ||
    pathname.startsWith('/api/repos');

  if (isProtectedApi) {
    const auth = await authenticateRequest(req);
    if (!auth.isAuthenticated) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in.' },
        { status: 401 }
      );
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // 5. Protected Pages (/dashboard, etc.)
  const isProtectedPage = pathname.startsWith('/dashboard');

  if (isProtectedPage) {
    const auth = await authenticateRequest(req);
    if (!auth.isAuthenticated) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
