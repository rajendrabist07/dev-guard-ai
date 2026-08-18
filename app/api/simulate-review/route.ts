import { NextRequest, NextResponse } from 'next/server';
import { runAgentOrchestrator } from '@/lib/agent/orchestrator';
import { DisplayReviewRun, Finding } from '@/lib/db/types';
import { inMemorySimulations } from '@/lib/db/supabase';

/**
 * Legacy simulate endpoint — kept strictly for backwards compatibility with in-memory execution.
 * Does NOT pollute Supabase production repos, review_runs, or findings tables.
 * For interactive live agent demos, use POST /api/try or /try.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      prTitle?: string;
      prAuthor?: string;
      diff?: string;
      fileNames?: string[];
    };
    const { prTitle, prAuthor, diff, fileNames } = body;

    const sampleDiff =
      diff ||
      `--- a/app/api/checkout/route.ts
+++ b/app/api/checkout/route.ts
@@ -34,6 +34,8 @@ export async function POST(req: Request) {
+  const { userId } = await req.json();
+  // UNSAFE QUERY
+  const user = await db.raw("SELECT * FROM users WHERE id = '" + userId + "'");
+  await fetch('http://payment-gateway.internal/charge');

--- a/package.json
+++ b/package.json
@@ -12,3 +12,4 @@
+    "axios": "0.19.0",
+    "lodash": "4.17.15"`;

    const targetFiles = fileNames && fileNames.length > 0 ? fileNames : ['app/api/checkout/route.ts', 'package.json'];
    const reviewRunId = `sim-run-${Date.now()}`;
    const prNumber = Math.floor(Math.random() * 90) + 10;
    const title = prTitle || 'feat: payment checkout endpoint refactor & dependency update';
    const author = prAuthor || 'dev-guard-user';
    const commitSha = Math.random().toString(36).substring(2, 10);

    // Run the real Agentic Orchestrator loop (in-memory only)
    const result = await runAgentOrchestrator(sampleDiff, targetFiles, reviewRunId);

    const savedFindings: Finding[] = result.findings.map((f, i) => ({
      ...f,
      id: `find-sim-${Date.now()}-${i}`,
      created_at: new Date().toISOString(),
    }));

    const completedRun: DisplayReviewRun = {
      id: reviewRunId,
      repo_id: 'in-memory-simulation',
      pr_number: prNumber,
      pr_title: title,
      pr_author: author,
      commit_sha: commitSha,
      status: 'completed',
      tool_calls_count: result.toolCallsCount,
      agent_trace: result.trace,
      error_message: null,
      is_simulation: true,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    inMemorySimulations.set(reviewRunId, {
      run: completedRun,
      findings: savedFindings,
    });

    return NextResponse.json({
      success: true,
      reviewRunId,
      status: 'completed',
      toolCallsCount: result.toolCallsCount,
      trace: result.trace,
      summary: result.summary,
      findings: savedFindings,
      providerUsed: result.providerUsed,
    });
  } catch (err: unknown) {
    console.error('Error in legacy simulation endpoint:', err);
    const message = err instanceof Error ? err.message : 'Simulation execution failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
