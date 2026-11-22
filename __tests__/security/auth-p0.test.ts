import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  requireUser,
  requireRepoAccess,
  requireReviewRunAccess,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/security/auth';
import * as supabaseModule from '@/lib/db/supabase';

describe('P0 Security — Authentication & Authorization Layer (lib/security/auth.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Rejection of Client-Supplied Identity Headers', () => {
    it('completely ignores spoofed x-github-installation-id header', async () => {
      const req = new NextRequest('http://localhost:3000/api/dashboard', {
        headers: {
          'x-github-installation-id': 'spoofed-installation-999',
        },
      });

      const auth = await authenticateRequest(req);
      expect(auth.isAuthenticated).toBe(false);
      expect(auth.user).toBeUndefined();
      expect(auth.accessibleRepoIds).toEqual([]);
      await expect(requireUser(req)).rejects.toThrow(UnauthorizedError);
    });

    it('completely ignores spoofed x-account-login and x-user-id headers', async () => {
      const req = new NextRequest('http://localhost:3000/api/dashboard', {
        headers: {
          'x-account-login': 'enterprise-victim',
          'x-user-id': 'victim-uuid-1234',
        },
      });

      const auth = await authenticateRequest(req);
      expect(auth.isAuthenticated).toBe(false);
      expect(auth.user).toBeUndefined();
      expect(auth.accessibleRepoIds).toEqual([]);
      await expect(requireUser(req)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('2. Protection Against user_metadata Tampering', () => {
    it('does not grant access when an attacker mutates user_metadata.user_name', async () => {
      // Attacker has valid JWT as attacker_user_id, but has set user_metadata.user_name = "victim_org"
      const fakeUser = {
        id: 'attacker-uuid',
        email: 'attacker@evil.com',
        user_metadata: {
          user_name: 'victim_org', // Spoofed client-side
        },
        identities: [
          {
            provider: 'github',
            id: 'attacker-github-numeric-id',
            identity_data: {
              sub: '987654321', // Real GitHub ID of attacker
              user_name: 'real-attacker-github-login',
            },
          },
        ],
      };

      // Mock Supabase getUser returning the attacker's user object
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: fakeUser }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              data: [],
              error: null,
            }),
            in: vi.fn().mockReturnValue({
              data: [],
              error: null,
            }),
          }),
        }),
      };
      vi.spyOn(supabaseModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as unknown as ReturnType<typeof supabaseModule.getSupabaseAdmin>);

      const req = new NextRequest('http://localhost:3000/api/dashboard', {
        headers: {
          authorization: 'Bearer valid-jwt-token-attacker',
        },
      });

      const auth = await authenticateRequest(req);
      expect(auth.isAuthenticated).toBe(true);
      // Verified login must NOT come from user_metadata.user_name
      expect(auth.user?.githubLogin).not.toBe('victim_org');
      expect(auth.user?.githubLogin).toBe('real-attacker-github-login');
      expect(auth.accessibleRepoIds).not.toContain('victim-repo');
    });
  });

  describe('3. PostgREST Filter Injection Immunity', () => {
    it('does not execute string-interpolated filter queries when username contains injection payload', async () => {
      const injectionUser = {
        id: 'injection-user',
        email: 'attacker@evil.com',
        identities: [
          {
            provider: 'github',
            id: '123',
            identity_data: {
              sub: '123',
              user_name: "admin',id.eq.victim-id", // PostgREST .or() breakout attempt
            },
          },
        ],
      };

      const orSpy = vi.fn();
      const eqSpy = vi.fn().mockReturnValue({ data: [], error: null });
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: injectionUser }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: eqSpy,
            in: vi.fn().mockReturnValue({ data: [], error: null }),
            or: orSpy,
          }),
        }),
      };
      vi.spyOn(supabaseModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as unknown as ReturnType<typeof supabaseModule.getSupabaseAdmin>);

      const req = new NextRequest('http://localhost:3000/api/dashboard', {
        headers: { authorization: 'Bearer token-with-injection-username' },
      });

      await authenticateRequest(req);

      // Must NEVER call .or() with string interpolation
      expect(orSpy).not.toHaveBeenCalled();
      // Must use parameterized .eq() or .in()
      expect(eqSpy).toHaveBeenCalled();
    });
  });

  describe('4. Cross-Tenant IDOR Enforcement (requireRepoAccess & requireReviewRunAccess)', () => {
    it('denies User B access to User A repository with 403 Forbidden', async () => {
      const userB = {
        id: 'user-b-id',
        identities: [
          {
            provider: 'github',
            id: 'user-b-github',
            identity_data: { sub: '222', user_name: 'user-b' },
          },
        ],
      };

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: userB }, error: null }),
        },
        from: vi.fn((table: string) => {
          if (table === 'repos') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: 'repo-user-a',
                      installation_id: 'inst-user-a',
                      installations: { account_login: 'user-a' },
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ data: [], error: null }),
              in: vi.fn().mockReturnValue({ data: [], error: null }),
            }),
          };
        }),
      };
      vi.spyOn(supabaseModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as unknown as ReturnType<typeof supabaseModule.getSupabaseAdmin>);

      const req = new NextRequest('http://localhost:3000/api/dashboard', {
        headers: { authorization: 'Bearer token-user-b' },
      });

      await expect(requireRepoAccess('repo-user-a', req)).rejects.toThrow(ForbiddenError);
    });

    it('denies User B access to User A private review run with 403 Forbidden', async () => {
      vi.spyOn(supabaseModule, 'getReviewRunById').mockResolvedValue({
        run: {
          id: 'run-user-a',
          repo_id: 'repo-user-a',
          pr_number: 1,
          commit_sha: 'abc1234',
          status: 'completed',
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          pr_title: 'Confidential feature',
          pr_author: 'user-a',
          tool_calls_count: 0,
          agent_trace: [],
          error_message: null,
          is_simulation: false, // NOT simulation
          created_at: new Date().toISOString(),
        },
        findings: [],
      });

      const userB = {
        id: 'user-b-id',
        identities: [
          {
            provider: 'github',
            id: 'user-b-github',
            identity_data: { sub: '222', user_name: 'user-b' },
          },
        ],
      };

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: userB }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              data: [],
              error: null,
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'repo-user-a',
                  installation_id: 'inst-user-a',
                  installations: { account_login: 'user-a' },
                },
                error: null,
              }),
            }),
            in: vi.fn().mockReturnValue({ data: [], error: null }),
          }),
        }),
      };
      vi.spyOn(supabaseModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as unknown as ReturnType<typeof supabaseModule.getSupabaseAdmin>);

      const req = new NextRequest('http://localhost:3000/api/reviews/run-user-a', {
        headers: { authorization: 'Bearer token-user-b' },
      });

      await expect(requireReviewRunAccess('run-user-a', req)).rejects.toThrow(ForbiddenError);
    });

    it('allows public access to simulation runs without authentication', async () => {
      vi.spyOn(supabaseModule, 'getReviewRunById').mockResolvedValue({
        run: {
          id: 'sim-public-run',
          repo_id: 'demo-repo',
          pr_number: 1,
          commit_sha: '1234567',
          status: 'completed',
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          pr_title: 'Demo simulation PR',
          pr_author: 'demo',
          tool_calls_count: 1,
          agent_trace: [],
          error_message: null,
          is_simulation: true, // Simulation run
          created_at: new Date().toISOString(),
        },
        findings: [],
      });

      const req = new NextRequest('http://localhost:3000/api/reviews/sim-public-run');
      const result = await requireReviewRunAccess('sim-public-run', req);
      expect(result.run.id).toBe('sim-public-run');
    });
  });
});
