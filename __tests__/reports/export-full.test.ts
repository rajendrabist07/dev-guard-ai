import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateMarkdownReport,
  generateJSONReport,
  generatePDFReport,
  copyMarkdownReport,
  copyJSONReport,
  downloadMarkdownReport,
  downloadJSONReport,
  ReportData,
} from '@/lib/reports/export';

describe('lib/reports/export.ts Report Generation & Exporters', () => {
  const sampleCleanReport: ReportData = {
    title: 'Clean Feature Branch',
    prNumber: 42,
    author: 'developer1',
    commitSha: 'a1b2c3d4e5f6',
    timestamp: '2026-11-24T12:00:00Z',
    status: 'completed',
    reviewType: 'GitHub PR Automated',
    toolCallsCount: 4,
    providerUsed: 'Groq Llama 3.3 70B',
    summary: 'All security checks passed cleanly.',
    findings: [],
  };

  const sampleVulnerableReport: ReportData = {
    title: 'Vulnerable Payment Processing',
    prNumber: 99,
    author: 'dev2',
    commitSha: 'f6e5d4c3b2a1',
    timestamp: '2026-11-24T12:00:00Z',
    status: 'completed',
    findings: [
      {
        id: 'f-1',
        review_run_id: 'run-1',
        file_path: 'app/api/checkout.ts',
        line: 25,
        severity: 'critical',
        message: 'SQL Injection detected in query interpolation',
        tool_source: 'ast_analyzer',
        suggested_fix: 'const query = "SELECT * FROM users WHERE id = $1";',
        created_at: '2026-11-24T12:00:00Z',
      },
      {
        id: 'f-2',
        review_run_id: 'run-1',
        file_path: 'lib/auth.ts',
        line: 12,
        severity: 'warning',
        message: 'Unhandled Promise rejection',
        tool_source: 'ast_analyzer',
        suggested_fix: null,
        created_at: '2026-11-24T12:00:00Z',
      },
      {
        id: 'f-3',
        review_run_id: 'run-1',
        file_path: 'package.json',
        line: 10,
        severity: 'info',
        message: 'Minor version bump available',
        tool_source: 'deps_scan',
        suggested_fix: null,
        created_at: '2026-11-24T12:00:00Z',
      },
    ],
  };

  describe('generateMarkdownReport', () => {
    it('generates a clean markdown report when no findings are detected', () => {
      const md = generateMarkdownReport(sampleCleanReport);
      expect(md).toContain('# 🛡️ DevGuard AI — Automated Code Security & PR Review Report');
      expect(md).toContain('**Review Target:** Clean Feature Branch');
      expect(md).toContain('**PR Number:** #42');
      expect(md).toContain('**Author / Committer:** @developer1');
      expect(md).toContain('**Commit SHA:** `a1b2c3d4e5`');
      expect(md).toContain('🛡️ ALL CHECKS PASSED');
      expect(md).toContain('PASS — No security advisories');
    });

    it('generates a detailed markdown report with remediations when findings are present', () => {
      const md = generateMarkdownReport(sampleVulnerableReport);
      expect(md).toContain('⚠️ Action Items Pending');
      expect(md).toContain('1. [🔴 CRITICAL] `app/api/checkout.ts` (Line 25)');
      expect(md).toContain('SQL Injection detected in query interpolation');
      expect(md).toContain('Suggested Code Remediation:');
      expect(md).toContain('const query = "SELECT * FROM users WHERE id = $1";');
      expect(md).toContain('2. [🟡 WARNING] `lib/auth.ts` (Line 12)');
      expect(md).toContain('3. [🔵 INFO] `package.json` (Line 10)');
    });
  });

  describe('generateJSONReport', () => {
    it('generates structured JSON matching schema and metrics count', () => {
      const jsonStr = generateJSONReport(sampleVulnerableReport);
      const parsed = JSON.parse(jsonStr);
      expect(parsed.devguard_report_version).toBe('1.0.0');
      expect(parsed.title).toBe('Vulnerable Payment Processing');
      expect(parsed.metrics.total).toBe(3);
      expect(parsed.metrics.critical).toBe(1);
      expect(parsed.metrics.warning).toBe(1);
      expect(parsed.metrics.info).toBe(1);
      expect(parsed.findings).toHaveLength(3);
    });
  });

  describe('generatePDFReport', () => {
    it('creates a jsPDF document for clean and vulnerable reports without throwing', () => {
      const cleanDoc = generatePDFReport(sampleCleanReport);
      expect(cleanDoc).toBeDefined();

      const vulnDoc = generatePDFReport(sampleVulnerableReport);
      expect(vulnDoc).toBeDefined();
    });
  });

  describe('Browser Clipboard and Download Helpers', () => {
    beforeEach(() => {
      // Mock navigator.clipboard safely in Node.js
      if (typeof globalThis.navigator === 'undefined') {
        Object.defineProperty(globalThis, 'navigator', {
          value: { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } },
          configurable: true,
          writable: true,
        });
      } else {
        Object.defineProperty(globalThis.navigator, 'clipboard', {
          value: { writeText: vi.fn().mockResolvedValue(undefined) },
          configurable: true,
          writable: true,
        });
      }

      // Mock DOM methods for download
      Object.defineProperty(globalThis, 'document', {
        value: {
          createElement: vi.fn().mockReturnValue({
            click: vi.fn(),
            href: '',
            download: '',
          }),
          body: {
            appendChild: vi.fn(),
            removeChild: vi.fn(),
          },
        },
        configurable: true,
        writable: true,
      });

      if (typeof globalThis.URL === 'undefined' || !globalThis.URL.createObjectURL) {
        Object.defineProperty(globalThis, 'URL', {
          value: {
            createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/test'),
            revokeObjectURL: vi.fn(),
          },
          configurable: true,
          writable: true,
        });
      } else {
        vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob:http://localhost/test');
        vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {});
      }
    });

    it('copies markdown report to clipboard', async () => {
      const success = await copyMarkdownReport(sampleCleanReport);
      expect(success).toBe(true);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('DevGuard AI')
      );
    });

    it('copies JSON report to clipboard', async () => {
      const success = await copyJSONReport(sampleCleanReport);
      expect(success).toBe(true);
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    it('triggers markdown file download via DOM anchor link', () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');

      downloadMarkdownReport(sampleCleanReport);

      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
      expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    });

    it('triggers JSON file download via DOM anchor link', () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');

      downloadJSONReport(sampleCleanReport);

      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
    });

    it('provides PDF file save method on document instance', () => {
      const doc = generatePDFReport(sampleCleanReport);
      expect(typeof doc.save).toBe('function');
    });
  });
});
