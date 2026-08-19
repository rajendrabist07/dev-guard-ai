import { describe, it, expect, vi } from 'vitest';
import { generateBadgeSvg } from '@/lib/badge/svg';
import { generateMarkdownReport, ReportData } from '@/lib/reports/export';

describe('Public Badge & Compliance Reports (lib/badge & lib/reports)', () => {
  it('generates valid SVG badges with accurate colors and tags', () => {
    const passingSvg = generateBadgeSvg({
      label: 'DevGuard AI',
      value: '0 critical issues',
      color: 'green',
    });

    expect(passingSvg).toContain('<svg');
    expect(passingSvg).toContain('</svg>');
    expect(passingSvg).toContain('DevGuard AI');
    expect(passingSvg).toContain('0 critical issues');
    expect(passingSvg).toContain('#10b981'); // Emerald color

    const alertSvg = generateBadgeSvg({
      label: 'DevGuard AI',
      value: '3 critical',
      color: 'red',
    });

    expect(alertSvg).toContain('3 critical');
    expect(alertSvg).toContain('#e11d48'); // Red color
  });

  it('generates structured GitHub Markdown reports for findings', () => {
    const reportData: ReportData = {
      title: 'feat: add payment processing endpoint',
      prNumber: 88,
      author: 'dev-team',
      commitSha: 'abcdef123456',
      timestamp: '2026-08-19T10:00:00Z',
      status: 'completed',
      toolCallsCount: 3,
      providerUsed: 'Groq Llama 3.3 70B',
      findings: [
        {
          id: 'f1',
          review_run_id: 'r1',
          severity: 'critical',
          file_path: 'app/api/pay.ts',
          line: 45,
          message: 'Hardcoded payment secret',
          suggested_fix: 'process.env.PAYMENT_KEY',
          tool_source: 'runLinter',
        },
      ],
    };

    const md = generateMarkdownReport(reportData);
    expect(md).toContain('# 🛡️ DevGuard AI — Automated Code Security & PR Review Report');
    expect(md).toContain('PR Number:** #88');
    expect(md).toContain('Critical Security Vulnerabilities');
    expect(md).toContain('Hardcoded payment secret');
    expect(md).toContain('process.env.PAYMENT_KEY');
  });

  it('generates clean ALL CLEAR report when findings are zero', () => {
    const cleanData: ReportData = {
      title: 'fix: typo in documentation',
      prNumber: 89,
      author: 'contributor',
      findings: [],
    };

    const md = generateMarkdownReport(cleanData);
    expect(md).toContain('PASS — No security advisories');
    expect(md).toContain('ALL CHECKS PASSED');
  });
});
