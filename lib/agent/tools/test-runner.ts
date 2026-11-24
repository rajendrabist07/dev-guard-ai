/**
 * Security Invariant Assertion Checker (Static).
 * 
 * DESIGN NOTE: In a webhook/serverless PR-review context where arbitrary containerized
 * test execution (e.g. `npm test` inside an isolated microVM) is not provisioned without
 * devguard-action, this tool performs static verification of critical code patterns
 * against security and functional invariant assertions rather than fabricating full test runner output.
 */
export interface TestRunnerOutput {
  success: boolean;
  totalAssertionsChecked: number;
  passedAssertions: number;
  failedAssertions: number;
  failures: Array<{
    testName: string;
    filePath: string;
    errorMessage: string;
  }>;
  summary: string;
  isRealExecution?: boolean;
}

/**
 * Runs static security invariant checks against code snippets or diffs.
 */
export async function runSecurityInvariantChecks(
  targetFilePath?: string,
  diffSnippet?: string
): Promise<TestRunnerOutput> {
  const failures: Array<{ testName: string; filePath: string; errorMessage: string }> = [];
  const targetFile = targetFilePath || 'tests/security-invariants.test.ts';
  const content = diffSnippet || '';

  try {
    let assertionsChecked = 0;

    // Security Invariant Assertion 1: Unparameterized SQL checks
    assertionsChecked++;
    const hasUnsafeSql =
      /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(content) &&
      (/\bFROM\b/i.test(content) || /\bWHERE\b/i.test(content)) &&
      (content.includes('+') || content.includes('${'));

    if (hasUnsafeSql) {
      failures.push({
        testName: 'Security Invariant: SQL Parameterization Assertion',
        filePath: targetFile,
        errorMessage: 'AssertionError: Database query must be parameterized with bind variables, not dynamic string interpolation.',
      });
    }

    // Security Invariant Assertion 2: Unhandled async network calls
    if (content.includes('fetch(')) {
      assertionsChecked++;
      if (!content.includes('catch') && !content.includes('try')) {
        failures.push({
          testName: 'Reliability Invariant: Promise Error Handling Assertion',
          filePath: targetFile,
          errorMessage: 'AssertionError: Asynchronous network call lacks rejection handling block.',
        });
      }
    }

    const failedCount = failures.length;
    const passedCount = assertionsChecked - failedCount;

    return {
      success: failedCount === 0,
      totalAssertionsChecked: assertionsChecked,
      passedAssertions: passedCount,
      failedAssertions: failedCount,
      failures,
      isRealExecution: false,
      summary: failedCount === 0
        ? `Security Invariant Validator (Static): Verified ${assertionsChecked} security/reliability invariants (0 failures).`
        : `Security Invariant Validator (Static): ${failedCount} invariant failure(s) detected across target code paths.`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Assertion validation failure';
    return {
      success: false,
      totalAssertionsChecked: 0,
      passedAssertions: 0,
      failedAssertions: 0,
      failures: [],
      isRealExecution: false,
      summary: `Static security invariant check skipped: ${errorMsg}`,
    };
  }
}

/**
 * Backward-compatible alias for orchestrator and existing suites.
 */
export const runTests = runSecurityInvariantChecks;
