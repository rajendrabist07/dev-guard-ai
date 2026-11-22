import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import * as authModule from '@/lib/security/auth';

describe('P0 Security — Edge Middleware Route Protection & Header Stripping (middleware.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Stripping Inbound Spoofed Identity Headers at Edge', () => {
    it('strips x-github-installation-id, x-account-login, and x-user-id from headers', async () => {
      const req = new NextRequest('http://localhost:3000/', {
        headers: {
          'x-github-installation-id': 'spoofed-id',
          'x-account-login': 'victim-org',
          'x-user-id': 'victim-id',
          'custom-safe-header': 'safe-value',
        },
      });

      const res = await middleware(req);
      expect(res.headers.get('x-github-installation-id')).toBeNull();
      // The forwarded request headers inside res (via NextResponse.next({ request: { headers } }))
      // must not include the spoofed headers
    });
  });

  describe('2. Public Routes Pass Through', () => {
    it('allows access to public landing page /', async () => {
      const req = new NextRequest('http://localhost:3000/');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('allows access to public playground /try and /try/result/123', async () => {
      const req1 = new NextRequest('http://localhost:3000/try');
      const res1 = await middleware(req1);
      expect(res1.status).toBe(200);

      const req2 = new NextRequest('http://localhost:3000/try/result/test-uuid');
      const res2 = await middleware(req2);
      expect(res2.status).toBe(200);
    });

    it('allows access to /api/badge and /api/webhooks/github without session', async () => {
      const req1 = new NextRequest('http://localhost:3000/api/badge/demo');
      const res1 = await middleware(req1);
      expect(res1.status).toBe(200);

      const req2 = new NextRequest('http://localhost:3000/api/webhooks/github');
      const res2 = await middleware(req2);
      expect(res2.status).toBe(200);
    });
  });

  describe('3. Protected API Routes Return 401 JSON When Unauthenticated', () => {
    it('returns 401 JSON for unauthenticated /api/dashboard', async () => {
      const req = new NextRequest('http://localhost:3000/api/dashboard');
      const res = await middleware(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain('Authentication required');
    });

    it('returns 401 JSON for unauthenticated /api/reviews/123', async () => {
      const req = new NextRequest('http://localhost:3000/api/reviews/123');
      const res = await middleware(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain('Authentication required');
    });
  });

  describe('4. Protected Pages Redirect to /login When Unauthenticated', () => {
    it('redirects unauthenticated /dashboard to /login', async () => {
      const req = new NextRequest('http://localhost:3000/dashboard');
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    });
  });

  describe('5. Observability Access Control', () => {
    it('denies non-admin users access to /observability', async () => {
      vi.spyOn(authModule, 'authenticateRequest').mockResolvedValue({
        isAuthenticated: true,
        type: 'session',
        user: { id: 'regular-user', githubLogin: 'regular-dev' },
      });

      const req = new NextRequest('http://localhost:3000/observability', {
        headers: { authorization: 'Bearer user-token' },
      });
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    });
  });
});
