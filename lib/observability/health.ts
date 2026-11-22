export type ObservabilityHealthState = 'healthy' | 'degraded' | 'down' | 'no_data';

export interface HealthCheckInputs {
  totalRuns: number;
  failedRunsCount: number;
  dbPing: { ok: boolean; configured: boolean; latencyMs?: number; error?: string };
  redisPing: { ok: boolean; configured: boolean; latencyMs?: number };
  recentErrorLogsCount: number;
  recentWarnLogsCount: number;
  lastSuccessfulProviderCall?: string | null;
}

export interface ObservabilityHealthResult {
  status: ObservabilityHealthState;
  reason: string;
  errorRatePercentage: number;
}

/**
 * Computes authoritative health status from empirical service checks and error rates.
 * Resolves to 'healthy', 'degraded', 'down', or 'no_data'.
 */
export function computeObservabilityHealth(inputs: HealthCheckInputs): ObservabilityHealthResult {
  const { totalRuns, failedRunsCount, dbPing, redisPing, recentErrorLogsCount } = inputs;
  const errorRatePercentage = totalRuns === 0 ? 0 : Number(((failedRunsCount / totalRuns) * 100).toFixed(1));

  // 1. If database is configured but down
  if (dbPing.configured && !dbPing.ok) {
    return {
      status: 'down',
      reason: `Database ping failed: ${dbPing.error || 'Connection unreachable'}`,
      errorRatePercentage,
    };
  }

  // 2. If no runs or logs have been recorded yet
  if (totalRuns === 0 && recentErrorLogsCount === 0) {
    return {
      status: 'no_data',
      reason: 'No reviews or telemetry recorded yet in current deployment',
      errorRatePercentage: 0,
    };
  }

  // 3. Degraded if error rate is elevated, recent errors exist, or configured Redis is down
  if (
    errorRatePercentage >= 20 ||
    recentErrorLogsCount >= 5 ||
    (redisPing.configured && !redisPing.ok)
  ) {
    let reason = 'Elevated operational issues detected';
    if (redisPing.configured && !redisPing.ok) {
      reason = 'Upstash Redis cache connection failed';
    } else if (errorRatePercentage >= 20) {
      reason = `Review failure rate is ${errorRatePercentage}% (exceeds 20% threshold)`;
    } else if (recentErrorLogsCount >= 5) {
      reason = `${recentErrorLogsCount} errors logged in recent activity window`;
    }

    return {
      status: 'degraded',
      reason,
      errorRatePercentage,
    };
  }

  return {
    status: 'healthy',
    reason: 'All integrated services and diagnostic pipelines are operational',
    errorRatePercentage,
  };
}

export interface HealthStatusDisplay {
  label: string;
  colorClass: string;
  dotClass: string;
}

/**
 * Maps health states to guaranteed matching UI labels and colors, preventing contradictory badges.
 */
export function getHealthStatusDisplay(status: ObservabilityHealthState): HealthStatusDisplay {
  switch (status) {
    case 'healthy':
      return {
        label: 'Healthy',
        colorClass: 'text-emerald-400',
        dotClass: 'bg-emerald-500',
      };
    case 'degraded':
      return {
        label: 'Degraded',
        colorClass: 'text-amber-400',
        dotClass: 'bg-amber-500',
      };
    case 'down':
      return {
        label: 'Down',
        colorClass: 'text-rose-400',
        dotClass: 'bg-rose-500',
      };
    case 'no_data':
    default:
      return {
        label: 'No Data Yet',
        colorClass: 'text-gray-400',
        dotClass: 'bg-gray-500',
      };
  }
}
