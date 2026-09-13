import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { parseDiffModifiedLines, postGitHubReviewComment } from '@/lib/github/client';
import { POST as webhookPostHandler } from '@/app/api/webhooks/github/route';
import * as clientModule from '@/lib/github/client';
import * as supabaseModule from '@/lib/db/supabase';

describe('Sprint 5 & 6 — Webhook Non-blocking Pipeline & Git Diff Line Mapping Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Sprint 5: responds with 202 Accepted within milliseconds on webhook delivery', async () => {
    vi.spyOn(clientModule, 'verifyGitHubWebhook').mockResolvedValue(true);
    vi.spyOn(supabaseModule, 'ensureRepoForInstallation').mockResolvedValue({
      id: 'repo-1',
      installation_id: 'inst-1',
      full_name: 'test-org/test-repo',
      is_active: true,
      created_at: new Date().toISOString(),
    });
    vi.spyOn(supabaseModule, 'findExistingReviewRun').mockResolvedValue(null);
    vi.spyOn(supabaseModule, 'createReviewRun').mockResolvedValue({
      id: 'run-async-123',
      repo_id: 'repo-1',
      pr_number: 99,
      pr_title: 'Async review test',
      pr_author: 'lead-dev',
      commit_sha: '1234567890',
      status: 'running',
      started_at: new Date().toISOString(),
      completed_at: null,
      tool_calls_count: 0,
      agent_trace: [],
      error_message: null,
      is_simulation: false,
      created_at: new Date().toISOString(),
    });

    const payload = {
      action: 'opened',
      installation: { id: 12345 },
      pull_request: {
        number: 99,
        title: 'Async webhook review PR',
        head: { sha: '1234567890' },
        user: { login: 'lead-dev' },
      },
      repository: {
        full_name: 'test-org/test-repo',
        owner: { login: 'test-org' },
      },
    };

    const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
      method: 'POST',
      headers: {
        'x-hub-signature-256': 'sha256=mocked',
        'x-github-event': 'pull_request',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const startTime = Date.now();
    const res = await webhookPostHandler(req);
    const durationMs = Date.now() - startTime;

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe('accepted');
    expect(body.reviewRunId).toBe('run-async-123');
    expect(durationMs).toBeLessThan(100); // Guarantees instant sub-100ms response
  });

  it('Sprint 6: accurately parses git patch hunk headers to map modified lines', () => {
    const diff = `--- a/app/api/auth.ts
+++ b/app/api/auth.ts
@@ -1,4 +1,6 @@
 import { NextRequest } from 'next/server';
+const token = req.headers.get('auth');
+if (!token) throw new Error();
 export async function GET() {

@@ -25,3 +27,5 @@
 function helper() {
+  const x = 1;
+  const y = 2;
 }`;

    const mapped = parseDiffModifiedLines(diff);
    const authLines = mapped.get('app/api/auth.ts');

    expect(authLines).toBeDefined();
    expect(authLines?.has(1)).toBe(true);
    expect(authLines?.has(2)).toBe(true);
    expect(authLines?.has(6)).toBe(true);
    expect(authLines?.has(27)).toBe(true);
    expect(authLines?.has(31)).toBe(true);
    // Line 82 is not in diff hunk
    expect(authLines?.has(82)).toBe(false);
  });

  it('Sprint 6: routes finding on line outside diff hunk to top-level review comment instead of crashing on inline 422', async () => {
    const mockCreateReview = vi.fn().mockResolvedValue({ status: 200 });
    const mockOctokit = {
      rest: {
        pulls: {
          createReview: mockCreateReview,
        },
      },
    };

    const diff = `--- a/app/api/auth.ts
+++ b/app/api/auth.ts
@@ -1,5 +1,5 @@
+const query = "SELECT * FROM users WHERE id = '" + userId + "'";
`;

    const findings = [
      {
        review_run_id: 'run-1',
        file_path: 'app/api/auth.ts',
        line: 1, // Line 1 is inside the diff
        message: 'SQL Injection on line 1',
        severity: 'critical' as const,
        suggested_fix: null,
        tool_source: 'runLinter',
        confidence: 'high' as const,
      },
      {
        review_run_id: 'run-1',
        file_path: 'app/api/auth.ts',
        line: 82, // Line 82 is OUTSIDE the diff hunk
        message: 'Unhandled Promise rejection on line 82',
        severity: 'warning' as const,
        suggested_fix: null,
        tool_source: 'runLinter',
        confidence: 'high' as const,
      },
    ];

    const result = await postGitHubReviewComment(
      mockOctokit as unknown as Parameters<typeof postGitHubReviewComment>[0],
      'test-org',
      'test-repo',
      1,
      'abcdef1234',
      findings,
      'Summary of review',
      diff
    );

    expect(result).toBe(true);
    expect(mockCreateReview).toHaveBeenCalled();

    const callArgs = mockCreateReview.mock.calls[0][0];
    // Inline comment should ONLY contain Line 1 (avoiding Octokit 422 on line 82)
    expect(callArgs.comments.length).toBe(1);
    expect(callArgs.comments[0].line).toBe(1);
    expect(callArgs.comments[0].path).toBe('app/api/auth.ts');

    // Finding on line 82 must be preserved in the top-level review body
    expect(callArgs.body).toContain('Findings in Surrounding Code (Outside Modified Diff)');
    expect(callArgs.body).toContain('app/api/auth.ts:82');
  });
});
