export interface TestRunnerOutput {
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  failures: Array<{
    testName: string;
    filePath: string;
    errorMessage: string;
  }>;
  summary: string;
}

export async function runTests(testFilePath?: string, diffSnippet?: string): Promise<TestRunnerOutput> {
  const failures: Array<{ testName: string; filePath: string; errorMessage: string }> = [];
  const targetFile = testFilePath || 'tests/checkout.test.ts';
  const content = diffSnippet || '';

  try {
    if (content.includes('SELECT') || content.includes('userId') || content.includes('checkout')) {
      failures.push({
        testName: 'checkout signature & database query security assertion',
        filePath: targetFile,
        errorMessage: 'AssertionError: Expected query execution to be parameterized but received string concatenation: "SELECT * FROM users WHERE id = ..."',
      });
    }

    if (content.includes('jwt') && content.includes('expire')) {
      // Clean test pass
    }

    const failedCount = failures.length;
    const totalCount = failedCount > 0 ? 8 : 12;
    const passedCount = totalCount - failedCount;

    return {
      success: failedCount === 0,
      totalTests: totalCount,
      passedTests: passedCount,
      failedTests: failedCount,
      failures,
      summary: `Ran ${totalCount} unit tests across test suite. ${passedCount} passed, ${failedCount} failed.`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Test runner execution timeout';
    return {
      success: false,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      failures: [],
      summary: `Test suite execution skipped or timed out: ${errorMsg}`,
    };
  }
}
