import { NextResponse } from 'next/server';
import { getReviewRuns, inMemoryTryRuns } from '@/lib/db/supabase';
import { getCacheStats } from '@/lib/cache/redis';
import { getRecentStructuredLogs } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [reviewRuns, cacheStats, structuredLogs] = await Promise.all([
      getReviewRuns(),
      Promise.resolve(getCacheStats()),
      Promise.resolve(getRecentStructuredLogs(30)),
    ]);

    const tryRuns = Array.from(inMemoryTryRuns.values());

    // Compute fallback & operational metrics
    const totalRuns = reviewRuns.length + tryRuns.length;
    const fallbackRuns = [
      ...reviewRuns.filter((r) => r.fallback_reason || r.provider_used?.includes('Gemini') || r.provider_used?.includes('Fallback')),
      ...tryRuns.filter((r) => r.provider_used?.includes('Gemini') || r.provider_used?.includes('Fallback')),
    ];

    const failedRuns = [
      ...reviewRuns.filter((r) => r.status === 'failed'),
      ...tryRuns.filter((r) => r.status === 'failed'),
    ];

    const recentErrorLogs = structuredLogs.filter((l) => l.level === 'error');
    const recentWarnLogs = structuredLogs.filter((l) => l.level === 'warn');

    return NextResponse.json({
      systemStatus: failedRuns.length === 0 ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      sentryConfigured: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
      metrics: {
        totalRunsProcessed: totalRuns,
        activeWebhooks: reviewRuns.length,
        interactiveTryRuns: tryRuns.length,
        modelFallbacksTriggered: fallbackRuns.length,
        failedRunsCount: failedRuns.length,
        osvCacheHitRate: cacheStats.hitRatePercentage,
        totalCacheLookups: cacheStats.lookups,
        totalCacheHits: cacheStats.hits,
      },
      fallbackEvents: fallbackRuns.slice(0, 10).map((r) => ({
        id: r.id,
        pr: 'pr_number' in r ? `#${r.pr_number} - ${r.pr_title || 'PR'}` : r.pr_title,
        provider: r.provider_used || 'Gemini 2.5 Flash',
        reason: 'fallback_reason' in r ? r.fallback_reason : 'Groq quota fallback',
        timestamp: r.created_at || new Date().toISOString(),
      })),
      recentLogs: structuredLogs.slice(0, 25),
      errorCount: recentErrorLogs.length,
      warnCount: recentWarnLogs.length,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch observability telemetry';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
