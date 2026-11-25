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
    expect(progressSteps[0]).toContain('pattern-based static analysis');
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

  it('executes native tool calling loop for analyze_code, scan_dependencies, run_checks, and read_file', async () => {
    let callCount = 0;
    const mockProvider = {
      providerLabel: 'Mock-Tool-Caller',
      modelId: 'mock-model-1',
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          summary: 'Native tool calling review synthesized successfully.',
          prioritizedFindingIds: [],
          explanations: [],
          suggestedFixes: [],
        }),
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        durationMs: 25,
        providerLabel: 'Mock-Tool-Caller',
        modelId: 'mock-model-1',
      }),
      completeWithTools: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            content: '',
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            durationMs: 40,
            providerLabel: 'Mock-Tool-Caller',
            modelId: 'mock-model-1',
            toolCalls: [
              {
                id: 'call-1',
                name: 'analyze_code',
                arguments: { filePath: 'app.ts', code: 'const sql = "SELECT * FROM users WHERE id = " + id;' },
              },
              {
                id: 'call-2',
                name: 'scan_dependencies',
                arguments: { dependencies: { axios: '0.19.0' } },
              },
            ],
          };
        }
        if (callCount === 2) {
          return {
            content: '',
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            durationMs: 30,
            providerLabel: 'Mock-Tool-Caller',
            modelId: 'mock-model-1',
            toolCalls: [
              {
                id: 'call-3',
                name: 'run_checks',
                arguments: { checkType: 'security' },
              },
              {
                id: 'call-4',
                name: 'read_file',
                arguments: { filePath: 'app.ts', startLine: 1, endLine: 10 },
              },
              {
                id: 'call-5',
                name: 'unknown_custom_tool',
                arguments: {},
              },
            ],
          };
        }
        return {
          content: 'Done analyzing',
          inputTokens: 50,
          outputTokens: 20,
          totalTokens: 70,
          durationMs: 10,
          providerLabel: 'Mock-Tool-Caller',
          modelId: 'mock-model-1',
          toolCalls: [],
        };
      }),
    };

    const fullFiles = new Map<string, string>();
    fullFiles.set('app.ts', 'const sql = "SELECT * FROM users WHERE id = " + id;\nconsole.log(sql);');

    const result = await runAgentOrchestrator(
      '+ const sql = "SELECT * FROM users WHERE id = " + id;',
      ['app.ts'],
      'test-native-tooling-run',
      undefined,
      {
        customProvider: mockProvider as any,
        fullFiles,
      }
    );

    expect(result.toolCallsCount).toBeGreaterThanOrEqual(4);
    expect(result.trace.some((t) => t.tool === 'analyze_code')).toBe(true);
    expect(result.trace.some((t) => t.tool === 'scan_dependencies')).toBe(true);
    expect(result.trace.some((t) => t.tool === 'run_checks')).toBe(true);
    expect(result.trace.some((t) => t.tool === 'read_file')).toBe(true);
  });

  it('gracefully falls back to deterministic router when native tool calling encounters an exception', async () => {
    const explodingProvider = {
      providerLabel: 'Exploding-Provider',
      modelId: 'exploding-1',
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          summary: 'Fallback review synthesized.',
          prioritizedFindingIds: [],
          explanations: [],
          suggestedFixes: [],
        }),
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        durationMs: 25,
        providerLabel: 'Exploding-Provider',
        modelId: 'exploding-1',
      }),
      completeWithTools: vi.fn().mockRejectedValue(new Error('LLM Gateway Failure')),
    };

    const result = await runAgentOrchestrator(
      '+ const q = "SELECT * FROM t WHERE id = " + x;',
      ['query.ts'],
      'test-fallback-run',
      undefined,
      {
        customProvider: explodingProvider as any,
      }
    );

    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.toolCallsCount).toBeGreaterThanOrEqual(1);
  });
});
