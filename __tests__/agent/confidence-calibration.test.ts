import { describe, it, expect } from 'vitest';
import { calibrateFindings } from '@/lib/agent/calibration';
import { Finding } from '@/lib/db/types';

describe('Sprint X3 — Confidence-Based Selective Autonomy Calibration', () => {
  it('assigns HIGH confidence when a finding is corroborated by multiple independent tools', () => {
    const multiToolFindings: Finding[] = [
      {
        id: 'f1',
        review_run_id: 'run-1',
        severity: 'critical',
        file_path: 'src/api/auth.ts',
        line: 42,
        message: 'Unsanitized user input string concatenation in database query (SQL Injection risk).',
        suggested_fix: 'db.query("SELECT * FROM users WHERE id = $1", [id])',
        tool_source: 'runLinter',
      },
      {
        id: 'f2',
        review_run_id: 'run-1',
        severity: 'critical',
        file_path: 'tests/auth.test.ts',
        line: 1,
        message: 'Test failure: checkout signature & database query security assertion',
        suggested_fix: null,
        tool_source: 'runTests',
      },
    ];

    const calibrated = calibrateFindings(multiToolFindings);

    expect(calibrated.length).toBe(2);
    expect(calibrated[0].confidence).toBe('high');
    expect(calibrated[0].confidence_score).toBeGreaterThanOrEqual(0.90);
    expect(calibrated[0].corroboration_sources).toContain('runLinter');
    expect(calibrated[0].corroboration_sources).toContain('runTests');
    expect(calibrated[0].human_judgment_recommended).toBe(false);
  });

  it('assigns LOW confidence to single-tool static heuristic warnings and flags human judgment recommended', () => {
    const singleToolWarning: Finding[] = [
      {
        id: 'f3',
        review_run_id: 'run-2',
        severity: 'warning',
        file_path: 'src/components/button.tsx',
        line: 15,
        message: "'unusedVar' is assigned a value but never used in the execution path.",
        suggested_fix: '// Remove unusedVar',
        tool_source: 'runLinter',
      },
    ];

    const calibrated = calibrateFindings(singleToolWarning);

    expect(calibrated.length).toBe(1);
    expect(calibrated[0].confidence).toBe('low');
    expect(calibrated[0].confidence_score).toBeLessThan(0.70);
    expect(calibrated[0].human_judgment_recommended).toBe(true);
  });

  it('assigns HIGH confidence to deterministic CVE database lookups even from a single tool', () => {
    const depFinding: Finding[] = [
      {
        id: 'f4',
        review_run_id: 'run-3',
        severity: 'critical',
        file_path: 'package.json',
        line: 1,
        message: '[GHSA-c2qf-rxjj-qqgw] Prototype Pollution in lodash',
        suggested_fix: '"lodash": "^4.17.21"',
        tool_source: 'scanDependencies',
      },
    ];

    const calibrated = calibrateFindings(depFinding);

    expect(calibrated.length).toBe(1);
    expect(calibrated[0].confidence).toBe('high');
    expect(calibrated[0].confidence_score).toBeGreaterThanOrEqual(0.88);
    expect(calibrated[0].human_judgment_recommended).toBe(false);
  });
});
