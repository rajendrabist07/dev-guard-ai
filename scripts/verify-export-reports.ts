import { generateMarkdownReport, ReportData } from '../lib/reports/export';
import { Finding } from '../lib/db/types';

async function testReportExports() {
  console.log('=== SPRINT U2 REPORT EXPORT VERIFICATION ===');

  // Case 1: Multi-findings Report
  console.log('\n[TEST 1] Generating Markdown report with 3 findings...');
  const sampleFindings: Finding[] = [
    {
      id: 'f1',
      review_run_id: 'run-1',
      severity: 'critical',
      file_path: 'app/api/checkout/route.ts',
      line: 34,
      message: 'Unsanitized user input string concatenation in database query (SQL Injection risk).',
      suggested_fix: 'const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);',
      tool_source: 'runLinter',
    },
    {
      id: 'f2',
      review_run_id: 'run-1',
      severity: 'critical',
      file_path: 'package.json',
      line: 12,
      message: '[GHSA-4w2v-q235-vp99] Axios Server-Side Request Forgery (SSRF) vulnerability. (axios@0.19.0)',
      suggested_fix: '"axios": "^1.7.4"',
      tool_source: 'scanDependencies',
    },
    {
      id: 'f3',
      review_run_id: 'run-1',
      severity: 'warning',
      file_path: 'app/api/checkout/route.ts',
      line: 82,
      message: 'Unhandled Promise Rejection: fetch() call lacks try/catch block or .catch() handler.',
      suggested_fix: 'try {\n  const res = await fetch(url);\n} catch (err) {\n  console.error("Fetch failed:", err);\n}',
      tool_source: 'runLinter',
    },
  ];

  const report1Data: ReportData = {
    title: 'feat: add user checkout endpoint and update network dependencies',
    prNumber: 42,
    author: 'alex-developer',
    commitSha: 'a1b2c3d4e5f6',
    timestamp: '2026-08-18T12:00:00Z',
    status: 'completed',
    toolCallsCount: 3,
    providerUsed: 'local-agent',
    findings: sampleFindings,
  };

  const md1 = generateMarkdownReport(report1Data);
  console.log('Generated Markdown length:', md1.length, 'characters.');
  if (!md1.includes('SQL Injection risk') || !md1.includes('GHSA-4w2v-q235-vp99') || !md1.includes('Critical Security Vulnerabilities')) {
    throw new Error('FAIL: Markdown report missing expected findings or summary sections');
  }
  console.log('✅ TEST 1 PASSED: Multi-finding Markdown report generated accurately.');

  // Case 2: Clean Zero-Findings Report
  console.log('\n[TEST 2] Generating Clean "All-Clear" Markdown report...');
  const report2Data: ReportData = {
    title: 'fix: safe parameterized query refactor',
    prNumber: 43,
    author: 'security-team',
    commitSha: '998877665544',
    timestamp: '2026-08-18T12:30:00Z',
    status: 'completed',
    toolCallsCount: 3,
    providerUsed: 'local-agent',
    findings: [],
  };

  const md2 = generateMarkdownReport(report2Data);
  console.log('Generated Clean Markdown length:', md2.length, 'characters.');
  if (!md2.includes('ALL CHECKS PASSED') || !md2.includes('PASS — No security advisories')) {
    throw new Error('FAIL: Clean report did not format zero-findings positive state correctly');
  }
  console.log('✅ TEST 2 PASSED: Clean 0-findings Markdown report generated accurately.');

  console.log('\n==========================================================');
  console.log('✅ ALL SPRINT U2 REPORT EXPORT TESTS PASSED!');
  console.log('==========================================================');
}

testReportExports().catch((err) => {
  console.error('\n❌ REPORT EXPORT TEST FAILED:', err);
  process.exit(1);
});
