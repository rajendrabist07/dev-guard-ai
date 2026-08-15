import { NextRequest, NextResponse } from 'next/server';
import { runAgentOrchestrator, ProgressUpdate } from '@/lib/agent/orchestrator';
import {
  createReviewRun,
  ensureRepoForInstallation,
  inMemorySimulations,
  saveFindings,
  supabaseAdmin,
  updateReviewRun,
} from '@/lib/db/supabase';
import { DisplayReviewRun, Finding } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
+  // UNSAFE DIRECT QUERY
+  const user = await db.raw("SELECT * FROM users WHERE id = '" + userId + "'");
+  await fetch('http://payment-gateway.internal/charge');

--- a/package.json
+++ b/package.json
@@ -12,3 +12,4 @@
+    "axios": "0.19.0",
+    "lodash": "4.17.15"`;

    const targetFiles =
      fileNames && fileNames.length > 0
        ? fileNames
        : ['app/api/checkout/route.ts', 'package.json'];

    const generatedRunId = `try-run-${Date.now()}`;
    const prNumber = Math.floor(Math.random() * 90) + 10;
    const title = prTitle || 'feat: interactive playground review';
    const author = prAuthor || 'try-user';
    const commitSha = Math.random().toString(36).substring(2, 10);

    const isStream = req.headers.get('accept')?.includes('text/event-stream') || true;

    if (isStream) {
      const responseStream = new TransformStream();
      const writer = responseStream.writable.getWriter();
      const encoder = new TextEncoder();

      const sendEvent = async (data: Record<string, unknown>) => {
        try {
          await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Client disconnected
        }
      };

      // Execute in background and stream chunks to response
      (async () => {
        const timeoutController = new AbortController();
        const timeoutTimer = setTimeout(() => {
          timeoutController.abort();
        }, 30000);

        try {
          let dbRun: DisplayReviewRun | null = null;

          if (supabaseAdmin) {
            try {
              const repo = await ensureRepoForInstallation({
                githubInstallationId: 'try-live',
                accountLogin: 'devguard-ai',
                fullName: 'devguard-ai/try-live',
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
              console.warn('Try DB persistence skipped:', dbErr);
            }
          }

          const reviewRunId = dbRun?.id || generatedRunId;

          // Call real orchestrator with live progress streaming
          const result = await runAgentOrchestrator(
            sampleDiff,
            targetFiles,
            reviewRunId,
            async (progress: ProgressUpdate) => {
              await sendEvent({
                type: 'progress',
                step: progress.step,
                totalSteps: progress.totalSteps,
                message: progress.message,
                tool: progress.tool,
              });
              // Brief micro-delay so UI transitions look crystal clear
              await new Promise((resolve) => setTimeout(resolve, 350));
            }
          );

          clearTimeout(timeoutTimer);

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
              console.warn('Could not save try findings to DB:', persistErr);
            }
          }

          if (savedFindings.length === 0) {
            savedFindings = result.findings.map((f, i) => ({
              ...f,
              id: `find-try-${Date.now()}-${i}`,
              created_at: new Date().toISOString(),
            }));
          }

          const completedRun: DisplayReviewRun = {
            id: reviewRunId,
            repo_id: dbRun?.repo_id || 'try-repo',
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

          await sendEvent({
            type: 'complete',
            reviewRunId,
            status: 'completed',
            toolCallsCount: result.toolCallsCount,
            trace: result.trace,
            summary: result.summary,
            findings: savedFindings,
            providerUsed: result.providerUsed,
          });
        } catch (err: unknown) {
          clearTimeout(timeoutTimer);
          console.error('Try execution error:', err);
          const errorMsg =
            err instanceof Error
              ? err.name === 'AbortError'
                ? 'Review execution timed out after 30 seconds. Please try again.'
                : err.message
              : 'Agent execution encountered an error.';
          await sendEvent({
            type: 'error',
            error: errorMsg,
          });
        } finally {
          try {
            await writer.close();
          } catch {
            // Already closed
          }
        }
      })();

      return new Response(responseStream.readable, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        },
      });
    }

    // Standard JSON Fallback
    const result = await runAgentOrchestrator(sampleDiff, targetFiles, generatedRunId);
    return NextResponse.json({
      success: true,
      reviewRunId: generatedRunId,
      status: 'completed',
      toolCallsCount: result.toolCallsCount,
      trace: result.trace,
      summary: result.summary,
      findings: result.findings,
      providerUsed: result.providerUsed,
    });
  } catch (err: unknown) {
    console.error('Error in try API endpoint:', err);
    const message = err instanceof Error ? err.message : 'Try review execution failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
