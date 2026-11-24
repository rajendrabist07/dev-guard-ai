import { Severity } from '../../db/types';
import { runAstSecurityAnalyzer, AstFinding } from './ast-analyzer';

export interface LintResultItem {
  file: string;
  line: number;
  message: string;
  severity: Severity;
  ruleId: string;
  suggestedFix?: string;
}

export interface LintToolOutput {
  success: boolean;
  errorsFound: number;
  warningsFound: number;
  items: LintResultItem[];
  summary: string;
}

/**
 * Static AST-based Security Analyzer & Linter.
 *
 * Traverses TypeScript/JavaScript Abstract Syntax Trees using the TypeScript compiler API
 * to detect 9 critical vulnerability classes and code quality issues:
 * 1. SQL Injection via dynamic string concatenation/template literals
 * 2. Tainted request inputs flowing into sensitive filesystem or execution sinks
 * 3. Command Injection via child_process exec/spawn
 * 4. Server-Side Request Forgery (SSRF) via unvalidated fetch/axios URLs
 * 5. Unhandled Promise Rejections in asynchronous network calls
 * 6. Hardcoded high-entropy credentials, tokens, and API keys
 * 7. Insecure cookie attributes and JWT verification misuse
 * 8. Cross-Site Scripting (XSS) via dangerouslySetInnerHTML or eval()
 * 9. Broken/weak cryptographic algorithms (MD5, SHA1) and Math.random tokens
 */
export async function runLinter(files: string[], codeContent?: string): Promise<LintToolOutput> {
  const targetFile = files[0] || 'src/index.ts';
  const astResult = await runAstSecurityAnalyzer([targetFile], codeContent);

  const items: LintResultItem[] = astResult.findings.map((f: AstFinding) => ({
    file: f.file,
    line: f.line,
    message: f.message,
    severity: f.severity,
    ruleId: f.ruleId,
    suggestedFix: f.suggestedFix,
  }));

  return {
    success: true,
    errorsFound: astResult.errorsFound,
    warningsFound: astResult.warningsFound,
    items,
    summary:
      items.length > 0
        ? `AST static security analysis finished: Identified ${astResult.errorsFound} critical error(s) and ${astResult.warningsFound} warning(s) across parsed ASTs.`
        : 'AST static security analysis finished: All syntax and code quality checks passed with 0 violations.',
  };
}

export { runAstSecurityAnalyzer, analyzeAst } from './ast-analyzer';
export type { AstFinding, AstAnalysisResult } from './ast-analyzer';
