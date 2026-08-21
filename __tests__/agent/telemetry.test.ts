import { describe, it, expect, beforeEach } from 'vitest';
import { scanDependencies } from '@/lib/agent/tools/deps-scan';
import { getCacheStats, resetCacheStats } from '@/lib/cache/redis';
import { calculateEstimatedCost } from '@/lib/agent/llm';

describe('Sprint W3: Cost, Latency & OSV Cache Telemetry', () => {
  beforeEach(() => {
    resetCacheStats();
  });

  it('calculates realistic token costs for Groq and Gemini providers', () => {
    // 1000 input tokens, 200 output tokens on Groq Llama 3.3 70B
    const groqCost = calculateEstimatedCost('Groq Llama 3.3 70B', 1000, 200);
    expect(groqCost).toBeGreaterThan(0);
    expect(groqCost).toBeLessThan(0.01); // $0.00075 approx

    // 1000 input tokens, 200 output tokens on Gemini 2.5 Flash
    const geminiCost = calculateEstimatedCost('Gemini 2.5 Flash', 1000, 200);
    expect(geminiCost).toBeGreaterThan(0);
    expect(geminiCost).toBeLessThan(groqCost); // Gemini Flash is cheaper per token
  });

  it('demonstrates Redis caching for duplicate dependency queries (second call hits cache)', async () => {
    const diff = '--- a/package.json\n+++ b/package.json\n@@ -1,3 +1,4 @@\n+ "axios": "0.19.0"';

    // PR 1: First scan (Cache Miss / External Fetch)
    const result1 = await scanDependencies(diff);
    expect(result1.vulnerabilities.length).toBeGreaterThan(0);

    const statsAfterFirst = getCacheStats();
    expect(statsAfterFirst.lookups).toBe(1);

    // PR 2: Second scan with identical dependency (Cache Hit)
    const result2 = await scanDependencies(diff);
    expect(result2.vulnerabilities.length).toBe(result1.vulnerabilities.length);

    const statsAfterSecond = getCacheStats();
    expect(statsAfterSecond.lookups).toBe(2);
    expect(statsAfterSecond.hits).toBe(1);
    expect(statsAfterSecond.hitRatePercentage).toBe(50);
  });
});
