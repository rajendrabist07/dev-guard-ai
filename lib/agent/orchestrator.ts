import { AgentTraceStep, NewFinding } from '../db/types';
import { scanDependencies } from './tools/deps-scan';
import { runLinter } from './tools/lint';
import { runTests } from './tools/test-runner';

export interface OrchestrationResult {
  findings: NewFinding[];
  trace: AgentTraceStep[];
  toolCallsCount: number;
  summary: string;
  providerUsed: 'local-agent';
}

const MAX_ITERATIONS = 5;

function toRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function shouldScanDependencies(diff: string, fileNames: string[]): boolean {
  return fileNames.some((fileName) => fileName.endsWith('package.json')) || /dependencies|devDependencies/.test(diff);
}

function shouldRunTests(diff: string): boolean {
  return /api|route|auth|checkout|payment|test|spec/.test(diff);
}

export async function runAgentOrchestrator(
  prDiff: string,
  fileNames: string[],
  reviewRunId = 'sim-run'
): Promise<OrchestrationResult> {
  const trace: AgentTraceStep[] = [];
  const findings: NewFinding[] = [];

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

  if (trace.length < MAX_ITERATIONS && shouldScanDependencies(prDiff, fileNames)) {
    const depsResult = await scanDependencies(prDiff);
    recordTrace('scanDependencies', { manifest: 'package.json' }, toRecord(depsResult));

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

  if (trace.length < MAX_ITERATIONS && shouldRunTests(prDiff)) {
    const testResult = await runTests(undefined, prDiff);
    recordTrace('runTests', { command: 'npm test' }, toRecord(testResult));

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

  const criticals = findings.filter((finding) => finding.severity === 'critical').length;
  const warnings = findings.filter((finding) => finding.severity === 'warning').length;
  const infos = findings.filter((finding) => finding.severity === 'info').length;

  return {
    findings,
    trace,
    toolCallsCount: trace.length,
    providerUsed: 'local-agent',
    summary: [
      '### Summary of Autonomous Review Findings',
      `- Critical findings: ${criticals}`,
      `- Warnings: ${warnings}`,
      `- Informational notes: ${infos}`,
      '',
      `DevGuard AI completed ${trace.length} tool execution(s), capped at ${MAX_ITERATIONS} iterations.`,
    ].join('\n'),
  };
}
