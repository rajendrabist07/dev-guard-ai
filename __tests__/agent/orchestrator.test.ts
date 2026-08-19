import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgentOrchestrator } from '@/lib/agent/orchestrator';

describe('Agent Orchestrator Loop (lib/agent/orchestrator.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gathers findings from all diagnostic tools in a structured format', async () => {
    const diff = `--- a/app/api/checkout/route.ts
+++ b/app/api/checkout/route.ts
@@ -10,3 +10,4 @@
+ const query = "SELECT * FROM users WHERE id = '" + req.url + "'";
+ const res = await fetch('/api/log');
--- a/package.json
+++ b/package.json
@@ -12,3 +12,4 @@
+ "axios": "0.19.0"`;

    const result = await runAgentOrchestrator(
      diff,
      ['app/api/checkout/route.ts', 'package.json'],
      'test-orchestrator-run'
    );

    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    expect(result.toolCallsCount).toBeGreaterThanOrEqual(2);
    expect(result.trace.length).toBe(result.toolCallsCount);

    // Verify findings severity tags
    const criticalFindings = result.findings.filter((f) => f.severity === 'critical');
    expect(criticalFindings.length).toBeGreaterThanOrEqual(1);

    // Verify empirical trace structure
    result.trace.forEach((step) => {
      expect(step.step).toBeGreaterThanOrEqual(1);
      expect(step.tool).toBeDefined();
      expect(step.input).toBeDefined();
      expect(step.output).toBeDefined();
      expect(step.timestamp).toBeDefined();
    });
  });

  it('enforces the hard 5-iteration cap even when processing large multi-file diffs', async () => {
    const largeDiff = `
      --- a/file1.ts
      +++ b/file1.ts
      + const q1 = "SELECT * FROM t1 WHERE id = '" + a + "'";
      --- a/file2.ts
      +++ b/file2.ts
      + const q2 = "SELECT * FROM t2 WHERE id = '" + b + "'";
      --- a/file3.ts
      +++ b/file3.ts
      + const q3 = "SELECT * FROM t3 WHERE id = '" + c + "'";
      --- a/package.json
      +++ b/package.json
      + "axios": "0.19.0"
      + "lodash": "4.17.15"
    `;

    const files = ['file1.ts', 'file2.ts', 'file3.ts', 'package.json', 'tests/a.test.ts'];
    const result = await runAgentOrchestrator(largeDiff, files, 'test-cap-run');

    // Orchestrator MAX_ITERATIONS is 5
    expect(result.toolCallsCount).toBeLessThanOrEqual(5);
    expect(result.trace.length).toBeLessThanOrEqual(5);
  });

  it('invokes progress callback with step details when provided', async () => {
    const progressSteps: string[] = [];
    const diff = `+ const q = "SELECT * FROM table WHERE id = " + id;`;

    await runAgentOrchestrator(
      diff,
      ['src/query.ts'],
      'test-progress-run',
      (p) => {
        progressSteps.push(p.message);
      }
    );

    expect(progressSteps.length).toBeGreaterThanOrEqual(2);
    expect(progressSteps[0]).toContain('AST Linter');
  });

  it('returns clean summary when safe code with no vulnerabilities is evaluated', async () => {
    const safeDiff = `
      + export function multiply(x: number, y: number) {
      +   return x * y;
      + }
    `;

    const result = await runAgentOrchestrator(safeDiff, ['lib/math.ts'], 'test-safe-run');
    expect(result.findings.length).toBe(0);
    expect(result.providerUsed).toBeDefined();
  });
});
