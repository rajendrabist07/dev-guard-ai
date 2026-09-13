import { NextRequest, NextResponse } from 'next/server';
import { runAgentOrchestrator } from '@/lib/agent/orchestrator';
import { DisplayReviewRun, Finding } from '@/lib/db/types';
import { saveSimulationRun } from '@/lib/db/supabase';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { TryApiSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/observability/logger';

/**
 * Hardened Simulation Endpoint — Protected against Denial-of-Wallet and quota exhaustion.
 * Enforces sliding-window rate limiting, 100KB payload caps, and persistent cross-instance storage.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Sliding-Window Rate Limiting (5 requests / 10 minutes per client)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rateLimit = await checkRateLimit(ip);

    if (!rateLimit.success) {
      logger.warn('Rate limit exceeded on /api/simulate-review', {
        module: 'simulate-api',
        action: 'rate-limit-blocked',
        ip: '[REDACTED_IP]',
      });
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Maximum 5 simulations allowed per 10 minutes to protect compute resources.',
          retryAfterMs: rateLimit.reset - Date.now(),
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.reset - Date.now()) / 1000)),
            'X-RateLimit-Limit': String(rateLimit.limit),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          },
        }
      );
    }

    // 2. Strict Request Body & Size Validation
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    const validationResult = TryApiSchema.safeParse(rawBody);
    if (!validationResult.success) {
      logger.warn('Invalid /api/simulate-review payload rejected', {
        module: 'simulate-api',
        action: 'validation-failed',
        errors: validationResult.error.flatten(),
      });
      return NextResponse.json(
        {
          error: 'Invalid request payload',
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const body = validationResult.data;
    const { prTitle, prAuthor, diff, fileNames, codeSnippet, files } = body;

    const sampleDiff =
      diff ||
      codeSnippet ||
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

    const targetFiles =
      fileNames && fileNames.length > 0
        ? fileNames
        : files && files.length > 0
        ? files
        : ['app/api/checkout/route.ts', 'package.json'];

    const reviewRunId = `sim-run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const prNumber = Math.floor(Math.random() * 90) + 10;
    const title = prTitle || 'feat: payment checkout endpoint refactor & dependency update';
    const author = prAuthor || 'dev-guard-user';
    const commitSha = Math.random().toString(36).substring(2, 10);

    // Run the real Agentic Orchestrator loop
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

    // Save to Persistent Store (Redis / Supabase) with in-memory fallback
    await saveSimulationRun(completedRun, savedFindings);

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
    console.error('Error in hardened simulation endpoint:', err);
    const message = err instanceof Error ? err.message : 'Simulation execution failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
