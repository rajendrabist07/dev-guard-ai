import { describe, it, expect } from 'vitest';
import { getDashboardData } from '@/lib/db/supabase';

describe('Dashboard Truthful Metrics & Empty States (lib/db/supabase.ts)', () => {
  it('returns null for cost and latency percentiles when 0 review runs exist', async () => {
    // When no runs exist in database/memory
    const data = await getDashboardData();

    expect(data.stats.reviewRuns).toBe(0);
    // Crucial: Must be null, NEVER fabricated constants like 0.000072, 1.85, 3.10, or 52%
    expect(data.stats.avgCostPerReviewUsd).toBeNull();
    expect(data.stats.baselineCostWithoutRoutingUsd).toBeNull();
    expect(data.stats.adaptiveRoutingCostSavingsPercentage).toBeNull();
    expect(data.stats.p50LatencySeconds).toBeNull();
    expect(data.stats.p95LatencySeconds).toBeNull();
    expect(data.stats.avgReviewTimeSeconds).toBeNull();
  });

  it('guarantees that 0 findings exist when 0 review runs exist (data invariant)', async () => {
    const data = await getDashboardData();
    if (data.stats.reviewRuns === 0) {
      expect(data.stats.securityFindings).toBe(0);
      expect(data.stats.toolsExecuted).toBe(0);
    }
  });
});
