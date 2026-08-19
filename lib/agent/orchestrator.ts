import { AgentTraceStep, NewFinding } from '../db/types';
import { scanDependencies } from './tools/deps-scan';
import { runLinter } from './tools/lint';
import { runTests } from './tools/test-runner';
import { synthesizeReviewWithLLM } from './llm';

export interface ProgressUpdate {
  step: number;
  totalSteps: number;
  message: string;
  tool?: string;
  output?: unknown;
}

export interface OrchestrationResult {
  findings: NewFinding[];
  trace: AgentTraceStep[];
  toolCallsCount: number;
  summary: string;
  providerUsed: string;
  modelUsed: string;
  fallbackTriggered: boolean;
  fallbackReason?: string;
}

const MAX_ITERATIONS = 5;

function toRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function shouldScanDependencies(diff: string, fileNames: string[]): boolean {
  return (
    fileNames.some((fileName) => fileName.endsWith('package.json')) ||
    /dependencies|devDependencies|"axios"|"lodash"|"express"|"stripe"|"jsonwebtoken"|"minimist"/.test(diff)
  );
}

function shouldRunTests(diff: string): boolean {
  return /api|route|auth|checkout|payment|test|spec/.test(diff);
}

/**
 * Executes the core empirical agent loop across pull request diffs.
 * 
 * Non-obvious architectural invariants:
 * 1. **Empirical First**: The agent does not prompt the LLM on raw code alone. It first invokes diagnostic
 *    tools (`runLinter`, `scanDependencies`, `runTests`) to gather concrete AST errors, CVE IDs, and test failures.
 * 2. **Hard 5-Iteration Cap (`MAX_ITERATIONS = 5`)**: Caps tool execution steps to 5 iterations maximum to
 *    prevent infinite loops or unbounded cloud compute usage.
 * 3. **Multi-Tier LLM Fallback**: Synthesis attempts primary Groq Llama 3.3 70B, gracefully falling back to
 *    Gemini 2.5 Flash on HTTP 429 rate limits, and finally a deterministic rule-based engine if offline.
 * 
 * @param prDiff - Unified git diff content of the pull request or snippet
 * @param fileNames - List of file paths modified within the diff
 * @param reviewRunId - Unique identifier of the review run for trace tracking
 * @param onProgress - Optional real-time progress callback for SSE streaming
 * @returns {Promise<OrchestrationResult>} Aggregated findings, step-by-step trace, and synthesis metadata
 */
export async function runAgentOrchestrator(
  prDiff: string,
  fileNames: string[],
  reviewRunId = 'sim-run',
  onProgress?: (progress: ProgressUpdate) => void | Promise<void>
): Promise<OrchestrationResult> {
  const trace: AgentTraceStep[] = [];
  const findings: NewFinding[] = [];
  const totalSteps = 4;

  const recordTrace = (tool: string, input: Record<string, unknown>, output: Record<string, unknown>) => {
    if (trace.length >= MAX_ITERATIONS) return;
    trace.push({
      step: trace.length + 1,
      tool,
      input,
      output,
      timestamp: new Date().toISOString(),
    });
  };

  // Step 1: AST Linter
  if (onProgress) {
    await onProgress({
      step: 1,
      totalSteps,
      message: 'Analyzing code structure & executing AST Linter...',
      tool: 'runLinter',
    });
  }

  const lintResult = await runLinter(fileNames, prDiff);
  recordTrace('runLinter', { files: fileNames }, toRecord(lintResult));

  for (const item of lintResult.items) {
    findings.push({
      review_run_id: reviewRunId,
      severity: item.severity,
      file_path: item.file,
      line: item.line,
      message: item.message,
      suggested_fix: item.suggestedFix ?? null,
      tool_source: 'runLinter',
    });
  }

  // Step 2: Dependency Scan
  if (onProgress) {
    await onProgress({
      step: 2,
      totalSteps,
      message: 'Checking dependencies for known CVE vulnerabilities in OSV.dev...',
      tool: 'scanDependencies',
    });
  }

  let depsSummary = 'Dependency scan skipped (no package manifest modified)';
  if (trace.length < MAX_ITERATIONS && shouldScanDependencies(prDiff, fileNames)) {
    const depsResult = await scanDependencies(prDiff);
    recordTrace('scanDependencies', { manifest: 'package.json' }, toRecord(depsResult));
    depsSummary = depsResult.summary;

    for (const vulnerability of depsResult.vulnerabilities) {
      if (vulnerability.vulnerabilityId === 'NONE') continue;
      findings.push({
        review_run_id: reviewRunId,
        severity: vulnerability.severity,
        file_path: 'package.json',
        line: 1,
        message: `[${vulnerability.vulnerabilityId}] ${vulnerability.summary} (${vulnerability.package}@${vulnerability.version})`,
        suggested_fix: vulnerability.recommendedVersion
          ? `"${vulnerability.package}": "${vulnerability.recommendedVersion}"`
          : null,
        tool_source: 'scanDependencies',
      });
    }
  }

  // Step 3: Test Suite Runner
  if (onProgress) {
    await onProgress({
      step: 3,
      totalSteps,
      message: 'Executing programmatic test suite validation...',
      tool: 'runTests',
    });
  }

  let testSummary = 'Test suite skipped (non-executable diff)';
  if (trace.length < MAX_ITERATIONS && shouldRunTests(prDiff)) {
    const testResult = await runTests(undefined, prDiff);
    recordTrace('runTests', { command: 'npm test' }, toRecord(testResult));
    testSummary = testResult.summary;

    for (const failure of testResult.failures) {
      findings.push({
        review_run_id: reviewRunId,
        severity: 'critical',
        file_path: failure.filePath,
        line: 1,
        message: `Test failure: ${failure.testName} - ${failure.errorMessage}`,
        suggested_fix: 'Fix the failing assertion and rerun the project test suite.',
        tool_source: 'runTests',
      });
    }
  }

  // Step 4: LLM Synthesis with Transparent Attribution & Rate Limit Fallback
  if (onProgress) {
    await onProgress({
      step: 4,
      totalSteps,
      message: 'Synthesizing findings with AI model & generating review report...',
      tool: 'synthesizeReview',
    });
  }

  const toolOutputs = [
    { tool: 'runLinter', summary: lintResult.summary, findingsCount: lintResult.items.length },
    { tool: 'scanDependencies', summary: depsSummary, findingsCount: findings.filter((f) => f.tool_source === 'scanDependencies').length },
    { tool: 'runTests', summary: testSummary, findingsCount: findings.filter((f) => f.tool_source === 'runTests').length },
  ];

  const synthesis = await synthesizeReviewWithLLM({
    prTitle: fileNames.join(', '),
    diffSummary: `Modified ${fileNames.length} file(s): ${fileNames.slice(0, 3).join(', ')}`,
    toolOutputs,
  });

  return {
    findings,
    trace,
    toolCallsCount: trace.length,
    providerUsed: synthesis.provider,
    modelUsed: synthesis.model,
    fallbackTriggered: synthesis.fallbackTriggered,
    fallbackReason: synthesis.fallbackReason,
    summary: synthesis.summary,
  };
}
