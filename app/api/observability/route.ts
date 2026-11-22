import { NextResponse } from 'next/server';
import { getReviewRuns, inMemoryTryRuns, pingDatabase } from '@/lib/db/supabase';
import { getCacheStats, pingRedis } from '@/lib/cache/redis';
import { fetchStructuredLogs } from '@/lib/observability/logger';
import { computeObservabilityHealth } from '@/lib/observability/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [reviewRuns, cacheStats, structuredLogs, dbPing, redisPing] = await Promise.all([
      getReviewRuns(),
      Promise.resolve(getCacheStats()),
      fetchStructuredLogs(30),
      pingDatabase(),
      pingRedis(),
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

    // Find timestamp of last successful run
    const completedRuns = [
      ...reviewRuns.filter((r) => r.status === 'completed'),
      ...tryRuns.filter((r) => r.status === 'completed'),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const lastSuccessfulProviderCall = completedRuns[0]?.created_at || null;

    const health = computeObservabilityHealth({
      totalRuns,
      failedRunsCount: failedRuns.length,
      dbPing,
      redisPing,
      recentErrorLogsCount: recentErrorLogs.length,
      recentWarnLogsCount: recentWarnLogs.length,
      lastSuccessfulProviderCall,
    });

    return NextResponse.json({
      systemStatus: health.status,
      statusReason: health.reason,
      timestamp: new Date().toISOString(),
      sentryConfigured: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
      services: {
        database: {
          configured: dbPing.configured,
          status: dbPing.ok ? 'connected' : dbPing.configured ? 'error' : 'offline_fallback',
          latencyMs: dbPing.latencyMs,
          error: dbPing.error,
        },
        redis: {
          configured: redisPing.configured,
          status: redisPing.ok ? 'connected' : redisPing.configured ? 'error' : 'unconfigured',
          latencyMs: redisPing.latencyMs,
        },
      },
      lastSuccessfulProviderCall,
      metrics: {
        totalRunsProcessed: totalRuns,
        activeWebhooks: reviewRuns.length,
        interactiveTryRuns: tryRuns.length,
        modelFallbacksTriggered: fallbackRuns.length,
        failedRunsCount: failedRuns.length,
        errorRatePercentage: health.errorRatePercentage,
        osvCacheHitRate: cacheStats.hitRatePercentage,
        totalCacheLookups: cacheStats.lookups,
        totalCacheHits: cacheStats.hits,
      },
      fallbackEvents: fallbackRuns.slice(0, 10).map((r) => ({
        id: r.id,
        pr: 'pr_number' in r ? `#${r.pr_number} - ${r.pr_title || 'PR'}` : r.pr_title,
        provider: r.provider_used || 'Gemini 2.0 Flash',
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
