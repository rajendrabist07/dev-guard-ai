import { NextRequest, NextResponse } from 'next/server';
import {
  createReviewRun,
  ensureRepoForInstallation,
  inMemorySimulations,
  saveFindings,
  supabaseAdmin,
  updateReviewRun,
} from '@/lib/db/supabase';
import { runAgentOrchestrator } from '@/lib/agent/orchestrator';
import { DisplayReviewRun, Finding } from '@/lib/db/types';

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
    const generatedRunId = `sim-run-${Date.now()}`;
    const prNumber = Math.floor(Math.random() * 90) + 10;
    const title = prTitle || 'feat: payment checkout endpoint refactor & dependency update';
    const author = prAuthor || 'dev-guard-user';
    const commitSha = Math.random().toString(36).substring(2, 10);

    let dbRun: DisplayReviewRun | null = null;

    // Try creating Supabase records if database is configured and ready
    if (supabaseAdmin) {
      try {
        const repo = await ensureRepoForInstallation({
          githubInstallationId: 'simulation',
          accountLogin: 'devguard-ai',
          fullName: 'devguard-ai/simulated-review',
        });

        dbRun = await createReviewRun({
          repo_id: repo.id,
          pr_number: prNumber,
          pr_title: title,
          pr_author: author,
          commit_sha: commitSha,
          status: 'running',
          is_simulation: true,
        });
      } catch (dbErr) {
        console.warn('Simulation DB persistence skipped/fallback to in-memory:', dbErr);
      }
    }

    const reviewRunId = dbRun?.id || generatedRunId;

    // Run the real Agentic Orchestrator loop
    const result = await runAgentOrchestrator(sampleDiff, targetFiles, reviewRunId);

    let savedFindings: Finding[] = [];

    if (dbRun) {
      try {
        savedFindings = await saveFindings(result.findings);
        await updateReviewRun(dbRun.id, {
          status: 'completed',
          tool_calls_count: result.toolCallsCount,
          agent_trace: result.trace,
          completed_at: new Date().toISOString(),
          error_message: null,
        });
      } catch (persistErr) {
        console.warn('Could not save simulation findings to DB:', persistErr);
      }
    }

    if (savedFindings.length === 0) {
      savedFindings = result.findings.map((f, i) => ({
        ...f,
        id: `find-sim-${Date.now()}-${i}`,
        created_at: new Date().toISOString(),
      }));
    }

    const completedRun: DisplayReviewRun = {
      id: reviewRunId,
      repo_id: dbRun?.repo_id || 'sim-repo',
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

    // Cache in memory so GET /api/reviews/[id] works instantaneously
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
    console.error('Error in simulation endpoint:', err);
    const message = err instanceof Error ? err.message : 'Simulation execution failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
