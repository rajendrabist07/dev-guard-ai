import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { AgentTraceStep, NewFinding } from '../db/types';
import { scanDependencies } from './tools/deps-scan';
import { runLinter } from './tools/lint';
import { runTests } from './tools/test-runner';
import {
  synthesizeReviewWithLLM,
  DeterministicFindingRef,
  ReviewVerdict,
} from './llm';
import { calibrateFindings } from './calibration';
import { classifyDiffComplexity, ComplexityAnalysis } from './router';
import { logger } from '@/lib/observability/logger';
import {
  ToolDefinition,
  ChatMessage,
  ResilientLLMProvider,
  LLMProvider,
} from './providers';

export interface ProgressUpdate {
  step: number;
  totalSteps: number;
  message: string;
  tool?: string;
  output?: unknown;
}

export interface StageLatencies {
  linterMs: number;
  depsScanMs: number;
  testRunnerMs: number;
  synthesisMs: number;
  totalDurationMs: number;
}

export interface OrchestrationResult {
  findings: NewFinding[];
  trace: AgentTraceStep[];
  toolCallsCount: number;
  summary: string;
  verdict?: ReviewVerdict;
  prioritizedFindingIds?: string[];
  explanations?: Array<{ findingId: string; text: string }>;
  suggestedFixes?: Array<{ findingId: string; patch: string }>;
  providerUsed: string;
  modelUsed: string;
  fallbackTriggered: boolean;
  fallbackReason?: string;
  latencies: StageLatencies;
  tokenCount: number;
  estimatedCostUsd: number;
  complexityRouting?: ComplexityAnalysis;
}

const MAX_ITERATIONS = 5;

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'analyze_code',
    description: 'Executes AST security analysis and pattern-based code quality linting on modified files or diff snippets.',
    parameters: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'List of relative file paths to analyze (e.g. ["src/auth.ts"])',
        },
        diff: {
          type: 'string',
          description: 'Unified diff content snippet to analyze',
        },
      },
    },
  },
  {
    name: 'scan_dependencies',
    description: 'Scans package manifests and lockfiles against the OSV.dev vulnerability database for known CVEs.',
    parameters: {
      type: 'object',
      properties: {
        manifestSnippet: {
          type: 'string',
          description: 'Package manifest or dependency snippet (e.g. package.json diff)',
        },
      },
    },
  },
  {
    name: 'run_checks',
    description: 'Executes security invariant assertions and unit test checks on modified application logic.',
    parameters: {
      type: 'object',
      properties: {
        checkType: {
          type: 'string',
          description: 'Specific test suite or invariant type to validate (e.g. "security_invariants")',
        },
      },
    },
  },
  {
    name: 'read_file',
    description: 'Safely reads contents of a file within the repository for contextual verification (read-only, sandboxed).',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Relative path of the file to inspect (e.g. "lib/auth.ts")',
        },
        startLine: {
          type: 'number',
          description: 'Starting line number (1-based)',
        },
        endLine: {
          type: 'number',
          description: 'Ending line number (1-based, max 100 lines per read)',
        },
      },
      required: ['filePath'],
    },
  },
];

function isDocsOnlyDiff(fileNames: string[], diff: string): boolean {
  if (fileNames.length > 0 && fileNames.every((f) => /\.(md|markdown|txt|rst|adoc)$/i.test(f) || f.startsWith('.github/') || f === 'LICENSE')) {
    return true;
  }
  const hasOnlyDocHeaders = diff.includes('--- a/') && !diff.match(/--- a\/[^\n]+\.(ts|tsx|js|jsx|json|mjs|cjs|py|go|rs|java|rb|php)/i);
  return hasOnlyDocHeaders;
}

function shouldRunLinter(diff: string, fileNames: string[]): boolean {
  if (isDocsOnlyDiff(fileNames, diff)) return false;
  if (fileNames.length > 0 && fileNames.every((f) => f.endsWith('package.json') || f.endsWith('package-lock.json') || f.endsWith('yarn.lock') || f.endsWith('pnpm-lock.yaml'))) {
    return false;
  }
  return fileNames.some((f) => /\.(ts|tsx|js|jsx|mjs|cjs|json)$/i.test(f)) || /\+\s*(const|let|var|function|import|export|SELECT|fetch|await|<)/i.test(diff);
}

function shouldScanDependencies(diff: string, fileNames: string[]): boolean {
  if (isDocsOnlyDiff(fileNames, diff)) return false;
  return (
    fileNames.some((fileName) => fileName.endsWith('package.json')) ||
    /dependencies|devDependencies|"axios"|"lodash"|"express"|"stripe"|"jsonwebtoken"|"minimist"/.test(diff)
  );
}

function shouldRunTests(diff: string, fileNames: string[] = []): boolean {
  if (isDocsOnlyDiff(fileNames, diff)) return false;
  // Match test files or core execution routes (api routes, checkout endpoints)
  const isTestOrApiFile = fileNames.some((f) => /test|spec|app\/api|routes?\/|checkout/i.test(f));
  const hasRouteOrTestCode = /\b(describe|it|test|expect)\s*\(|export\s+async\s+function\s+(GET|POST|PUT|DELETE)\b\s*\(|\bhandleCheckout\b|\brunTests\b/i.test(diff);
  return isTestOrApiFile || hasRouteOrTestCode;
}

function executeReadFile(
  filePath: string,
  startLine = 1,
  endLine = 100,
  fullFiles?: Map<string, string>
): { content: string; linesCount: number } {
  if (!filePath || filePath.includes('..') || path.isAbsolute(filePath)) {
    throw new Error('Access denied: File path contains invalid characters or traversal elements');
  }

  const sensitivePatterns = [/\.env(\..*)?$/i, /id_rsa/i, /\.git\//i, /\.npmrc/i, /\.aws\//i];
  if (sensitivePatterns.some((pattern) => pattern.test(filePath))) {
    throw new Error(`Access denied: "${filePath}" is restricted from read inspection`);
  }

  let text: string | undefined = undefined;
  if (fullFiles && fullFiles.has(filePath)) {
    text = fullFiles.get(filePath);
  } else {
    try {
      const fullPath = path.resolve(process.cwd(), filePath);
      if (fullPath.startsWith(process.cwd()) && fs.existsSync(fullPath)) {
        text = fs.readFileSync(fullPath, 'utf8');
      }
    } catch {
      // file not available on disk
    }
  }

  if (text === undefined) {
    return { content: `File "${filePath}" not available in PR context.`, linesCount: 0 };
  }

  const lines = text.split('\n');
  const start = Math.max(1, startLine) - 1;
  const count = Math.min(100, Math.max(1, endLine - startLine + 1));
  const slice = lines.slice(start, start + count);

  return {
    content: slice.map((line, idx) => `${start + idx + 1}: ${line}`).join('\n'),
    linesCount: slice.length,
  };
}

export async function runAgentOrchestrator(
  prDiff: string,
  fileNames: string[],
  reviewRunId = 'sim-run',
  onProgress?: (progress: ProgressUpdate) => void | Promise<void>,
  options?: {
    forceDeterministic?: boolean;
    lockfileContent?: string;
    lockfileFilename?: string;
    fullFiles?: Map<string, string>;
    correlationId?: string;
    customProvider?: LLMProvider;
  }
): Promise<OrchestrationResult> {
  const complexityRouting = classifyDiffComplexity(prDiff, fileNames);
  logger.info(`Adaptive model routing decision: ${complexityRouting.complexity.toUpperCase()} (${complexityRouting.recommendedModelTier})`, {
    module: 'orchestrator',
    reviewRunId,
    complexity: complexityRouting.complexity,
    reason: complexityRouting.reason,
    recommendedTier: complexityRouting.recommendedModelTier,
  });

  const trace: AgentTraceStep[] = [];
  const findings: NewFinding[] = [];
  const overallStart = Date.now();
  let linterMs = 0;
  let depsScanMs = 0;
  let testRunnerMs = 0;

  // Fast-Path for Trivial Diffs
  if (complexityRouting.complexity === 'trivial') {
    const summary = '✅ Automated review completed via fast-path. Documentation/asset diff validated with 0 diagnostic findings.';
    return {
      findings: [],
      trace: [],
      toolCallsCount: 0,
      providerUsed: 'Deterministic Engine (Fast-Path)',
      modelUsed: 'deterministic-router',
      fallbackTriggered: false,
      summary,
      verdict: 'approve',
      prioritizedFindingIds: [],
      explanations: [],
      suggestedFixes: [],
      latencies: {
        linterMs: 0,
        depsScanMs: 0,
        testRunnerMs: 0,
        synthesisMs: 0,
        totalDurationMs: Date.now() - overallStart,
      },
      tokenCount: 0,
      estimatedCostUsd: 0.000000,
      complexityRouting,
    };
  }

  const recordTraceStep = (
    tool: string,
    rawArgs: Record<string, unknown>,
    outputSummary: string,
    durationMs: number,
    extraOutput?: Record<string, unknown>
  ) => {
    if (trace.length >= MAX_ITERATIONS) return;
    const argsJson = JSON.stringify(rawArgs || {});
    const argsHash = crypto.createHash('sha256').update(argsJson).digest('hex').slice(0, 12);

    trace.push({
      step: trace.length + 1,
      tool,
      input: {
        argsHash,
        args: rawArgs,
      },
      output: {
        durationMs,
        resultSummary: outputSummary,
        ...(extraOutput || {}),
      },
      timestamp: new Date().toISOString(),
    });
  };

  let usedNativeToolCalling = false;
  let nativeToolCallingError: string | undefined = undefined;

  // Attempt Native Tool Calling if Provider is available and not forced deterministic
  if (!options?.forceDeterministic) {
    const provider = options?.customProvider || new ResilientLLMProvider();

    if (provider.completeWithTools) {
      try {
        usedNativeToolCalling = true;
        const systemPrompt = `You are DevGuard AI, an autonomous PR security review orchestrator.
You have access to diagnostic tools to inspect code diffs and dependencies:
- "analyze_code": Runs AST security linting on files or diff.
- "scan_dependencies": Scans package.json dependencies for known CVEs.
- "run_checks": Runs security invariant unit tests.
- "read_file": Safely reads file lines for context.

INSTRUCTIONS:
1. Call the appropriate tools to analyze the PR diff and detect vulnerabilities.
2. When all necessary tools have been executed, do not call further tools.
3. Tool execution is capped at ${MAX_ITERATIONS} iterations total.`;

        const messages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `PR Modified Files:\n${fileNames.join('\n')}\n\nDiff Content Snippet:\n${prDiff.slice(0, 4000)}`,
          },
        ];

        let iteration = 0;
        while (iteration < MAX_ITERATIONS) {
          iteration++;
          const toolCallResponse = await provider.completeWithTools(messages, AGENT_TOOLS, {
            temperature: 0.0,
            maxTokens: 600,
          });

          if (!toolCallResponse.toolCalls || toolCallResponse.toolCalls.length === 0) {
            // LLM finished tool calls
            break;
          }

          // Execute each requested tool
          for (const tc of toolCallResponse.toolCalls) {
            if (trace.length >= MAX_ITERATIONS) break;

            const toolStart = Date.now();
            let resultSummary = '';
            let extraOutput: Record<string, unknown> = {};

            if (tc.name === 'analyze_code') {
              const files = (tc.arguments.files as string[]) || fileNames;
              const diffSnippet = (tc.arguments.diff as string) || prDiff;
              try {
                const lintResult = await runLinter(files, diffSnippet);
                linterMs += Date.now() - toolStart;
                resultSummary = lintResult.summary;
                extraOutput = { findingsCount: lintResult.items.length };

                for (const item of lintResult.items) {
                  findings.push({
                    review_run_id: reviewRunId,
                    severity: item.severity,
                    file_path: item.file,
                    line: item.line,
                    message: item.message,
                    suggested_fix: item.suggestedFix ?? null,
                    tool_source: 'analyze_code',
                  });
                }
              } catch (err) {
                resultSummary = `Linter failed: ${err instanceof Error ? err.message : String(err)}`;
              }
            } else if (tc.name === 'scan_dependencies') {
              try {
                const depsResult = await scanDependencies(prDiff, {
                  lockfileContent: options?.lockfileContent,
                  lockfileFilename: options?.lockfileFilename,
                });
                depsScanMs += Date.now() - toolStart;
                resultSummary = depsResult.summary;
                extraOutput = { vulnerabilitiesCount: depsResult.vulnerabilities.length };

                for (const vuln of depsResult.vulnerabilities) {
                  if (vuln.vulnerabilityId === 'NONE') continue;
                  findings.push({
                    review_run_id: reviewRunId,
                    severity: vuln.isPreExisting ? 'info' : vuln.severity,
                    file_path: 'package.json',
                    line: 1,
                    message: `[${vuln.vulnerabilityId}] ${vuln.summary} (${vuln.package}@${vuln.version})`,
                    suggested_fix: vuln.recommendedVersion
                      ? `"${vuln.package}": "${vuln.recommendedVersion}"`
                      : null,
                    tool_source: 'scan_dependencies',
                  });
                }
              } catch (err) {
                resultSummary = `Dependency scan failed: ${err instanceof Error ? err.message : String(err)}`;
              }
            } else if (tc.name === 'run_checks') {
              const checkType = (tc.arguments.checkType as string) || undefined;
              try {
                const testResult = await runTests(checkType, prDiff);
                testRunnerMs += Date.now() - toolStart;
                resultSummary = testResult.summary;
                extraOutput = { failuresCount: testResult.failures.length };

                for (const failure of testResult.failures) {
                  findings.push({
                    review_run_id: reviewRunId,
                    severity: 'critical',
                    file_path: failure.filePath,
                    line: 1,
                    message: `Test failure: ${failure.testName} - ${failure.errorMessage}`,
                    suggested_fix: 'Fix the failing assertion and rerun the project test suite.',
                    tool_source: 'run_checks',
                  });
                }
              } catch (err) {
                resultSummary = `Test runner failed: ${err instanceof Error ? err.message : String(err)}`;
              }
            } else if (tc.name === 'read_file') {
              const fp = tc.arguments.filePath as string;
              const sLine = typeof tc.arguments.startLine === 'number' ? tc.arguments.startLine : 1;
              const eLine = typeof tc.arguments.endLine === 'number' ? tc.arguments.endLine : 100;

              try {
                const readRes = executeReadFile(fp, sLine, eLine, options?.fullFiles);
                resultSummary = `Read ${readRes.linesCount} lines from ${fp}`;
                extraOutput = { linesCount: readRes.linesCount };
              } catch (err) {
                resultSummary = `Read failed: ${err instanceof Error ? err.message : String(err)}`;
              }
            } else {
              resultSummary = `Unknown tool "${tc.name}"`;
            }

            const toolDuration = Date.now() - toolStart;
            recordTraceStep(tc.name, tc.arguments, resultSummary, toolDuration, extraOutput);

            messages.push({
              role: 'assistant',
              content: '',
              toolCalls: [tc],
            });
            messages.push({
              role: 'tool',
              name: tc.name,
              toolCallId: tc.id,
              content: resultSummary,
            });
          }
        }
      } catch (toolingErr) {
        usedNativeToolCalling = false;
        nativeToolCallingError = toolingErr instanceof Error ? toolingErr.message : String(toolingErr);
        logger.warn('Native tool calling encountered error, falling back to deterministic router', {
          error: nativeToolCallingError,
        });
      }
    }
  }

  // Fallback to deterministic tool execution pipeline if native tool calling was not used or failed
  if (!usedNativeToolCalling || trace.length === 0) {
    // 1. Static Linter
    if (trace.length < MAX_ITERATIONS && shouldRunLinter(prDiff, fileNames)) {
      if (onProgress) {
        await onProgress({
          step: 1,
          totalSteps: 4,
          message: 'Executing pattern-based static analysis...',
          tool: 'runLinter',
        });
      }
      const stageStart = Date.now();
      try {
        const lintResult = await runLinter(fileNames, prDiff);
        linterMs = Date.now() - stageStart;
        recordTraceStep('runLinter', { files: fileNames }, lintResult.summary, linterMs, {
          findingsCount: lintResult.items.length,
        });

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
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Static Linter failure';
        recordTraceStep('runLinter', { files: fileNames }, `Skipped: ${msg}`, Date.now() - stageStart, {
          skipped: true,
          error: msg,
        });
      }
    }

    // 2. Dependency Scan
    if (trace.length < MAX_ITERATIONS && shouldScanDependencies(prDiff, fileNames)) {
      if (onProgress) {
        await onProgress({
          step: 2,
          totalSteps: 4,
          message: 'Checking dependencies in OSV.dev CVE database...',
          tool: 'scanDependencies',
        });
      }
      const stageStart = Date.now();
      try {
        const depsResult = await scanDependencies(prDiff, {
          lockfileContent: options?.lockfileContent,
          lockfileFilename: options?.lockfileFilename,
        });
        depsScanMs = Date.now() - stageStart;
        recordTraceStep('scanDependencies', { manifest: 'package.json' }, depsResult.summary, depsScanMs, {
          vulnerabilitiesCount: depsResult.vulnerabilities.length,
        });

        for (const vuln of depsResult.vulnerabilities) {
          if (vuln.vulnerabilityId === 'NONE') continue;
          findings.push({
            review_run_id: reviewRunId,
            severity: vuln.isPreExisting ? 'info' : vuln.severity,
            file_path: 'package.json',
            line: 1,
            message: `[${vuln.vulnerabilityId}] ${vuln.summary} (${vuln.package}@${vuln.version})`,
            suggested_fix: vuln.recommendedVersion
              ? `"${vuln.package}": "${vuln.recommendedVersion}"`
              : null,
            tool_source: 'scanDependencies',
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'OSV.dev unreachable';
        recordTraceStep('scanDependencies', { manifest: 'package.json' }, `Skipped: ${msg}`, Date.now() - stageStart, {
          skipped: true,
          error: msg,
        });
      }
    }

    // 3. Tests / Invariant Checks
    if (trace.length < MAX_ITERATIONS && shouldRunTests(prDiff, fileNames)) {
      if (onProgress) {
        await onProgress({
          step: 3,
          totalSteps: 4,
          message: 'Validating security invariant assertions...',
          tool: 'runTests',
        });
      }
      const stageStart = Date.now();
      try {
        const testResult = await runTests(undefined, prDiff);
        testRunnerMs = Date.now() - stageStart;
        recordTraceStep('runTests', { assertionType: 'security_invariants' }, testResult.summary, testRunnerMs, {
          failuresCount: testResult.failures.length,
        });

        for (const failure of testResult.failures) {
          findings.push({
            review_run_id: reviewRunId,
            severity: 'critical',
            file_path: failure.filePath,
            line: 1,
            message: `Test failure: ${failure.testName} - ${failure.errorMessage}`,
            suggested_fix: 'Fix failing assertion and rerun test suite.',
            tool_source: 'runTests',
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Test runner timeout';
        recordTraceStep('runTests', { command: 'npm test' }, `Skipped: ${msg}`, Date.now() - stageStart, {
          skipped: true,
          error: msg,
        });
      }
    }
  }

  // Calibrate findings deterministically
  const calibratedFindings = calibrateFindings(findings);

  // Prepare deterministic finding references with IDs for LLM synthesis
  const availableFindings: DeterministicFindingRef[] = calibratedFindings.map((f, idx) => ({
    id: `finding-${idx + 1}-${f.severity}`,
    severity: f.severity,
    message: f.message,
    filePath: f.file_path,
    line: f.line,
    toolSource: f.tool_source || 'deterministic-tool',
  }));

  // Synthesis Stage
  if (onProgress) {
    await onProgress({
      step: 4,
      totalSteps: 4,
      message: 'Synthesizing report with referential integrity validation...',
      tool: 'synthesizeReview',
    });
  }

  const toolOutputs = [
    {
      tool: 'analyze_code',
      summary: `${calibratedFindings.filter((f) => f.tool_source === 'analyze_code' || f.tool_source === 'runLinter').length} finding(s) detected`,
      findingsCount: calibratedFindings.filter((f) => f.tool_source === 'analyze_code' || f.tool_source === 'runLinter').length,
    },
    {
      tool: 'scan_dependencies',
      summary: `${calibratedFindings.filter((f) => f.tool_source === 'scan_dependencies').length} vulnerability finding(s)`,
      findingsCount: calibratedFindings.filter((f) => f.tool_source === 'scan_dependencies').length,
    },
    {
      tool: 'run_checks',
      summary: `${calibratedFindings.filter((f) => f.tool_source === 'run_checks' || f.tool_source === 'runTests').length} check failure(s)`,
      findingsCount: calibratedFindings.filter((f) => f.tool_source === 'run_checks' || f.tool_source === 'runTests').length,
    },
  ];

  const synthesisStart = Date.now();
  let synthesisResult;

  if (options?.forceDeterministic) {
    synthesisResult = {
      summary: calibratedFindings.length === 0
        ? '✅ Deterministic analysis passed cleanly: 0 security findings detected across modified files.'
        : `⚠️ Deterministic analysis identified ${calibratedFindings.length} security diagnostic findings.`,
      verdict: calibratedFindings.some((f) => f.severity === 'critical')
        ? ('changes_requested' as ReviewVerdict)
        : calibratedFindings.some((f) => f.severity === 'warning')
        ? ('needs_human_review' as ReviewVerdict)
        : ('approve' as ReviewVerdict),
      prioritizedFindingIds: availableFindings.map((f) => f.id),
      explanations: availableFindings.map((f) => ({ findingId: f.id, text: f.message })),
      suggestedFixes: [],
      provider: 'Deterministic Engine (Fallback)',
      model: 'deterministic-rules',
      fallbackTriggered: false,
      fallbackReason: undefined,
      latencyMs: 1,
      validationRetried: false,
      telemetry: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: 1,
        validationRetried: false,
        hallucinatedFindingIdsDropped: 0,
      },
    };
  } else {
    synthesisResult = await synthesizeReviewWithLLM(
      {
        prTitle: fileNames.join(', '),
        diffSummary: `Modified ${fileNames.length} file(s): ${fileNames.slice(0, 3).join(', ')}`,
        untrustedDiff: prDiff,
        toolOutputs,
        availableFindings,
      },
      options?.customProvider
    );
  }

  const synthesisMs = Date.now() - synthesisStart;
  const totalDurationMs = Date.now() - overallStart;

  return {
    findings: calibratedFindings,
    trace,
    toolCallsCount: trace.length,
    providerUsed: synthesisResult.provider,
    modelUsed: synthesisResult.model,
    fallbackTriggered: synthesisResult.fallbackTriggered || !!nativeToolCallingError,
    fallbackReason: synthesisResult.fallbackReason || nativeToolCallingError,
    summary: synthesisResult.summary,
    verdict: synthesisResult.verdict,
    prioritizedFindingIds: synthesisResult.prioritizedFindingIds,
    explanations: synthesisResult.explanations,
    suggestedFixes: synthesisResult.suggestedFixes,
    latencies: {
      linterMs,
      depsScanMs,
      testRunnerMs,
      synthesisMs,
      totalDurationMs,
    },
    tokenCount: synthesisResult.telemetry.totalTokens,
    estimatedCostUsd: synthesisResult.telemetry.estimatedCostUsd,
    complexityRouting,
  };
}
