import { Severity } from '@/lib/db/types';

export interface IngestedTestResult {
  command: string;
  exitCode: number;
  passed: boolean;
  durationMs: number;
  outputSnippet?: string;
}

export interface IngestedFinding {
  source: 'semgrep' | 'osv' | 'action-test';
  ruleId: string;
  file: string;
  line: number;
  message: string;
  severity: Severity;
  suggestedFix?: string;
  cwe?: string;
}

export interface IngestedCiData {
  repository: string;
  sha: string;
  ref: string;
  runId: string;
  ingestedAt: string;
  tests: IngestedTestResult | null;
  findings: IngestedFinding[];
  semgrepCount: number;
  osvCount: number;
}
