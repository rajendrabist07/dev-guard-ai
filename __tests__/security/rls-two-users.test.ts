import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireRepoAccess, requireReviewRunAccess, ForbiddenError } from '@/lib/security/auth';
import * as supabaseModule from '@/lib/db/supabase';

describe('P0 Security — RLS Two-User Isolation Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const userAlice = {
    id: 'uuid-alice',
    identities: [
      {
        provider: 'github',
        id: 'github-alice',
        identity_data: { sub: '111', user_name: 'alice' },
      },
    ],
  };

  const userBob = {
    id: 'uuid-bob',
    identities: [
      {
        provider: 'github',
        id: 'github-bob',
        identity_data: { sub: '222', user_name: 'bob' },
      },
    ],
  };

  it('prevents Bob from reading Alice repository', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockImplementation((token: string) => {
          if (token === 'token-bob') return Promise.resolve({ data: { user: userBob }, error: null });
          if (token === 'token-alice') return Promise.resolve({ data: { user: userAlice }, error: null });
          return Promise.resolve({ data: { user: null }, error: new Error('Invalid token') });
        }),
      },
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn((col: string, val: string) => {
            if (table === 'repos' && val === 'repo-alice') {
              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'repo-alice',
                    installation_id: 'inst-alice',
                    installations: { account_login: 'alice' },
                  },
                  error: null,
                }),
              };
            }
            return {
              data: col === 'account_login' && val === 'bob' ? [{ id: 'inst-bob' }] : [],
              error: null,
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
          in: vi.fn().mockReturnValue({
            data: [{ id: 'repo-bob' }],
            error: null,
          }),
        }),
      })),
    };
    vi.spyOn(supabaseModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as unknown as ReturnType<typeof supabaseModule.getSupabaseAdmin>);

    // Alice accessing her own repo => SUCCESS
    const reqAlice = { headers: new Headers({ authorization: 'Bearer token-alice' }) };
    const aliceAccess = await requireRepoAccess('repo-alice', reqAlice);
    expect(aliceAccess.id).toBe('repo-alice');

    // Bob accessing Alice's repo => FORBIDDEN
    const reqBob = { headers: new Headers({ authorization: 'Bearer token-bob' }) };
    await expect(requireRepoAccess('repo-alice', reqBob)).rejects.toThrow(ForbiddenError);
  });

  it('prevents Bob from accessing findings of Alice private review run', async () => {
    vi.spyOn(supabaseModule, 'getReviewRunById').mockResolvedValue({
      run: {
        id: 'run-alice-private',
        repo_id: 'repo-alice',
        pr_number: 1,
        commit_sha: 'sha-alice',
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        pr_title: 'Alice Private PR',
        pr_author: 'alice',
        tool_calls_count: 2,
        agent_trace: [],
        error_message: null,
        is_simulation: false,
        created_at: new Date().toISOString(),
      },
      findings: [
        {
          id: 'finding-1',
          review_run_id: 'run-alice-private',
          severity: 'critical',
          file_path: 'lib/secret.ts',
          line: 10,
          message: 'Alice confidential finding',
          suggested_fix: null,
          tool_source: 'linter',
        },
      ],
    });

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: userBob }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            data: [],
            error: null,
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'repo-alice',
                installation_id: 'inst-alice',
                installations: { account_login: 'alice' },
              },
              error: null,
            }),
          }),
          in: vi.fn().mockReturnValue({ data: [], error: null }),
        }),
      }),
    };
    vi.spyOn(supabaseModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase as unknown as ReturnType<typeof supabaseModule.getSupabaseAdmin>);

    const reqBob = { headers: new Headers({ authorization: 'Bearer token-bob' }) };
    await expect(requireReviewRunAccess('run-alice-private', reqBob)).rejects.toThrow(ForbiddenError);
  });
});
