import { NextRequest, NextResponse } from 'next/server';
import { createReviewRun, saveFindings } from '@/lib/db/supabase';
import { runAgentOrchestrator } from '@/lib/agent/orchestrator';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      prTitle?: string;
      prAuthor?: string;
      diff?: string;
      fileNames?: string[];
    };
    const { prTitle, prAuthor, diff, fileNames } = body;

    const sampleDiff = diff || `--- a/app/api/checkout/route.ts
+++ b/app/api/checkout/route.ts
@@ -34,6 +34,8 @@ export async function POST(req: Request) {
+  const { userId } = await req.json();
+  const user = await db.query("SELECT * FROM users WHERE id = '" + userId + "'");
+  await fetch('http://payments.internal/process');

--- a/package.json
+++ b/package.json
@@ -12,3 +12,4 @@
+    "axios": "0.19.0",
+    "lodash": "4.17.15"`;

    const targetFiles = fileNames && fileNames.length > 0 ? fileNames : ['app/api/checkout/route.ts', 'package.json'];

    // 1. Create a review run in DB
    const run = await createReviewRun({
      pr_number: Math.floor(Math.random() * 90) + 10,
      pr_title: prTitle || 'feat: payment checkout endpoint refactor & dependency update',
      pr_author: prAuthor || 'dev-guard-user',
      commit_sha: Math.random().toString(36).substring(2, 10),
      status: 'running',
    });

    // 2. Run agent orchestrator loop
    const result = await runAgentOrchestrator(sampleDiff, targetFiles, run.id);

    // 3. Save findings to DB
    const savedFindings = await saveFindings(result.findings);

    // 4. Return complete result
    return NextResponse.json({
      success: true,
      reviewRunId: run.id,
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
