import { describe, it, expect } from 'vitest';
import { runTests } from '@/lib/agent/tools/test-runner';

describe('Test Runner Engine (lib/agent/tools/test-runner.ts)', () => {
  it('identifies failing assertions when SQL injection or unparameterized queries are tested', async () => {
    const diff = `
      + const user = "SELECT * FROM users WHERE id = '" + userId + "'";
    `;

    const result = await runTests('tests/auth.test.ts', diff);
    expect(result.success).toBe(false);
    expect(result.failedTests).toBeGreaterThanOrEqual(1);
    expect(result.failures[0].errorMessage).toContain('AssertionError');
    expect(result.failures[0].filePath).toBe('tests/auth.test.ts');
  });

  it('reports all tests passing when safe code is validated', async () => {
    const safeDiff = `
      + export function calculateTotal(price: number, tax: number) {
      +   return price + (price * tax);
      + }
    `;

    const result = await runTests('tests/math.test.ts', safeDiff);
    expect(result.success).toBe(true);
    expect(result.failedTests).toBe(0);
    expect(result.passedTests).toBe(result.totalTests);
  });
});
