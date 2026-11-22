import { describe, it, expect } from 'vitest';
import { computeObservabilityHealth, getHealthStatusDisplay } from '@/lib/observability/health';

describe('Observability Health Logic & Telemetry Verification', () => {
  it('reports "no_data" state when zero runs and zero logs exist', () => {
    const health = computeObservabilityHealth({
      totalRuns: 0,
      failedRunsCount: 0,
      dbPing: { ok: true, configured: true },
      redisPing: { ok: true, configured: true },
      recentErrorLogsCount: 0,
      recentWarnLogsCount: 0,
    });

    expect(health.status).toBe('no_data');
    expect(health.reason).toContain('No reviews or telemetry recorded yet');

    const display = getHealthStatusDisplay('no_data');
    expect(display.label).toBe('No Data Yet');
    expect(display.colorClass).toContain('gray');
    expect(display.dotClass).toContain('gray');
  });

  it('reports "down" state when database connectivity fails', () => {
    const health = computeObservabilityHealth({
      totalRuns: 10,
      failedRunsCount: 0,
      dbPing: { ok: false, configured: true, error: 'Connection refused' },
      redisPing: { ok: true, configured: true },
      recentErrorLogsCount: 0,
      recentWarnLogsCount: 0,
    });

    expect(health.status).toBe('down');
    expect(health.reason).toContain('Database ping failed');

    const display = getHealthStatusDisplay('down');
    expect(display.label).toBe('Down');
    expect(display.colorClass).toContain('rose');
    expect(display.dotClass).toContain('rose');
  });

  it('reports "degraded" state when recent error rate is elevated or Redis is down', () => {
    // Case 1: High failure rate (3 out of 10 runs failed = 30%)
    const healthHighErrors = computeObservabilityHealth({
      totalRuns: 10,
      failedRunsCount: 3,
      dbPing: { ok: true, configured: true },
      redisPing: { ok: true, configured: true },
      recentErrorLogsCount: 2,
      recentWarnLogsCount: 1,
    });
    expect(healthHighErrors.status).toBe('degraded');

    // Case 2: Configured Redis fails
    const healthRedisDown = computeObservabilityHealth({
      totalRuns: 10,
      failedRunsCount: 0,
      dbPing: { ok: true, configured: true },
      redisPing: { ok: false, configured: true },
      recentErrorLogsCount: 0,
      recentWarnLogsCount: 0,
    });
    expect(healthRedisDown.status).toBe('degraded');

    const display = getHealthStatusDisplay('degraded');
    expect(display.label).toBe('Degraded');
    expect(display.colorClass).toContain('amber');
    expect(display.dotClass).toContain('amber');
  });

  it('reports "healthy" state when database is reachable and errors are within threshold', () => {
    const health = computeObservabilityHealth({
      totalRuns: 25,
      failedRunsCount: 0,
      dbPing: { ok: true, configured: true },
      redisPing: { ok: true, configured: true },
      recentErrorLogsCount: 0,
      recentWarnLogsCount: 1,
    });

    expect(health.status).toBe('healthy');

    const display = getHealthStatusDisplay('healthy');
    expect(display.label).toBe('Healthy');
    expect(display.colorClass).toContain('emerald');
    expect(display.dotClass).toContain('emerald');
  });
});
