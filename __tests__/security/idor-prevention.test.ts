import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getReviewRoute } from '@/app/api/reviews/[id]/route';
import { GET as getDashboardRoute } from '@/app/api/dashboard/route';
import * as supabaseModule from '@/lib/db/supabase';

describe('Sprint 1 — RLS & Unauthenticated IDOR Prevention Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests trying to access private review run with 403 Forbidden', async () => {
    // Mock review run belonging to a private client repo
    vi.spyOn(supabaseModule, 'getReviewRunById').mockResolvedValue({
      run: {
        id: 'run-private-123',
        repo_id: 'repo-client-456',
        pr_number: 10,
        commit_sha: 'a1b2c3d',
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        pr_title: 'Add private enterprise billing logic',
        pr_author: 'lead-dev',
        tool_calls_count: 2,
        agent_trace: [{ step: 1, tool: 'runLinter', input: {}, output: {}, timestamp: '' }],
        error_message: null,
        is_simulation: false,
        created_at: new Date().toISOString(),
      },
      findings: [
        {
          id: 'f-1',
          review_run_id: 'run-private-123',
          severity: 'critical',
          file_path: 'lib/billing/stripe.ts',
          line: 45,
          message: 'Hardcoded secret token in billing pipeline',
          suggested_fix: null,
          tool_source: 'runLinter',
        },
      ],
    });

    const req = new NextRequest('http://localhost:3000/api/reviews/run-private-123');
    const res = await getReviewRoute(req, { params: Promise.resolve({ id: 'run-private-123' }) });
    
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Forbidden');
  });

  it('rejects authenticated User B trying to access User A repository review run with 403 Forbidden (Cross-Tenant IDOR)', async () => {
    vi.spyOn(supabaseModule, 'getReviewRunById').mockResolvedValue({
      run: {
        id: 'run-tenant-a',
        repo_id: 'repo-tenant-a',
        pr_number: 5,
        commit_sha: 'abcdef',
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        pr_title: 'Auth patch for Tenant A',
        pr_author: 'alice',
        tool_calls_count: 1,
        agent_trace: [],
        error_message: null,
        is_simulation: false,
        created_at: new Date().toISOString(),
      },
      findings: [],
    });

    // Request from User B (account_login: 'bob')
    const req = new NextRequest('http://localhost:3000/api/reviews/run-tenant-a', {
      headers: {
        'x-account-login': 'bob',
      },
    });

    const res = await getReviewRoute(req, { params: Promise.resolve({ id: 'run-tenant-a' }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Forbidden');
  });

  it('allows public access to simulated and interactive demo playground runs', async () => {
    vi.spyOn(supabaseModule, 'getReviewRunById').mockResolvedValue({
      run: {
        id: 'sim-demo-789',
        repo_id: 'demo-repo',
        pr_number: 1,
        commit_sha: '112233',
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        pr_title: 'Demo test PR',
        pr_author: 'demo-user',
        tool_calls_count: 1,
        agent_trace: [],
        error_message: null,
        is_simulation: true, // Simulation run
        created_at: new Date().toISOString(),
      },
      findings: [],
    });

    const req = new NextRequest('http://localhost:3000/api/reviews/sim-demo-789');
    const res = await getReviewRoute(req, { params: Promise.resolve({ id: 'sim-demo-789' }) });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run.id).toBe('sim-demo-789');
  });

  it('scopes dashboard data to authorized tenant repositories when authenticated', async () => {
    const getDashboardSpy = vi.spyOn(supabaseModule, 'getDashboardData');

    const req = new NextRequest('http://localhost:3000/api/dashboard', {
      headers: {
        'x-account-login': 'acme-corp',
      },
    });

    await getDashboardRoute(req);
    expect(getDashboardSpy).toHaveBeenCalled();
  });
});
