import { Severity } from '../../db/types';

/**
 * Static Pattern & Heuristic Linter.
 * 
 * Performs deterministic regex-based static analysis across diff hunks for high-frequency
 * security vulnerabilities (SQL Injection string concatenations, eval/XSS patterns,
 * hardcoded credentials) and common quality anti-patterns (unhandled promises, unused vars).
 */
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

function findMatchingLineNumber(content: string, matcher: RegExp | string, fallbackLine = 1): number {
  if (!content) return fallbackLine;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineStr = lines[i];
    if (typeof matcher === 'string') {
      if (lineStr.includes(matcher)) return i + 1;
    } else {
      if (matcher.test(lineStr)) return i + 1;
    }
  }
  return fallbackLine;
}

export async function runLinter(files: string[], codeContent?: string): Promise<LintToolOutput> {
  const items: LintResultItem[] = [];
  const contentToScan = codeContent || '';
  const targetFile = files[0] || 'src/index.ts';

  // 1. SQL Injection check (Requires genuine SQL keyword syntax + dynamic string concatenation / template literal)
  const hasSqlKeywords = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(contentToScan) && /\b(FROM|WHERE|VALUES|SET)\b/i.test(contentToScan);
  const hasSqlConcatOrInterpolation =
    /(?:['"`][\s\S]*?\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b[\s\S]*?['"`]\s*\+)|(?:\+\s*['"`][\s\S]*?\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b)|(?:\`[\s\S]*?\b(?:SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*?\$\{[\s\S]*?\}\s*[\s\S]*?\`)/i.test(
      contentToScan
    );

  if (hasSqlKeywords && hasSqlConcatOrInterpolation) {
    const matchedLine = findMatchingLineNumber(contentToScan, /\b(SELECT|INSERT|UPDATE|DELETE)\b/i, 1);
    items.push({
      file: targetFile,
      line: matchedLine,
      message: 'Unsanitized user input string concatenation in database query (SQL Injection risk).',
      severity: 'critical',
      ruleId: 'security/no-unsafe-sql-query',
      suggestedFix: 'const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);',
    });
  }

  // 2. Unhandled async/promise check
  if (contentToScan.includes('fetch(') && !contentToScan.includes('catch') && !contentToScan.includes('try')) {
    const matchedLine = findMatchingLineNumber(contentToScan, 'fetch(', 1);
    items.push({
      file: targetFile,
      line: matchedLine,
      message: 'Unhandled Promise Rejection: fetch() call lacks try/catch block or .catch() handler.',
      severity: 'warning',
      ruleId: 'promise/catch-or-return',
      suggestedFix: 'try {\n  const res = await fetch(url);\n} catch (err) {\n  console.error("Fetch failed:", err);\n}',
    });
  }

  // 3. Dangerous innerHTML or eval
  if (contentToScan.includes('dangerouslySetInnerHTML') || contentToScan.includes('eval(')) {
    const matchedLine = findMatchingLineNumber(contentToScan, /(?:dangerouslySetInnerHTML|eval\()/, 1);
    items.push({
      file: targetFile,
      line: matchedLine,
      message: 'Execution of eval() or direct raw HTML rendering detected (XSS Vulnerability).',
      severity: 'critical',
      ruleId: 'security/no-eval-xss',
      suggestedFix: 'Use safe DOM sanitization libraries like DOMPurify before rendering dynamic HTML content.',
    });
  }

  // 4. Hardcoded Secrets / Tokens (Requires literal credential string, excluding parameter references like webhookSecret)
  const hasKnownSecretPrefix = /['"`](sk_live_[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9_-]{20,}|AIza[0-9A-Za-z-_]{35})['"`]/i.test(contentToScan);
  const hasGenericSecretAssignment = /(?:api[_-]?key|secret|password|auth[_-]?token)\s*[:=]\s*['"`]([a-zA-Z0-9_\-!@#$%^&*()]{16,})['"`]/i.test(contentToScan);

  if (hasKnownSecretPrefix || hasGenericSecretAssignment) {
    const matchedLine = findMatchingLineNumber(
      contentToScan,
      /(?:sk_live_|ghp_|AIza|api[_-]?key|secret|password|auth[_-]?token)/i,
      1
    );
    items.push({
      file: targetFile,
      line: matchedLine,
      message: 'Hardcoded secret or sensitive authentication credential detected in source code.',
      severity: 'critical',
      ruleId: 'security/no-hardcoded-credentials',
      suggestedFix: 'const apiKey = process.env.API_SECRET_KEY;',
    });
  }

  // 5. Unused variables / declarations
  const varMatches = contentToScan.matchAll(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g);
  for (const match of varMatches) {
    const varName = match[1];
    if (varName && !['React', 'useState', 'useEffect', 'req', 'res', 'err', 'db', 'user', 'query'].includes(varName)) {
      // Check if variable name appears only once (declaration only)
      const regex = new RegExp(`\\b${varName}\\b`, 'g');
      const count = (contentToScan.match(regex) || []).length;
      if (count === 1) {
        const matchedLine = findMatchingLineNumber(contentToScan, new RegExp(`\\b${varName}\\b`), 1);
        items.push({
          file: targetFile,
          line: matchedLine,
          message: `'${varName}' is assigned a value but never used in the execution path.`,
          severity: 'warning',
          ruleId: 'eslint/no-unused-vars',
          suggestedFix: `// Remove '${varName}' or prefix with '_' if intentional: const _${varName} = ...`,
        });
        break; // Keep to 1 warning to keep feedback focused
      }
    }
  }

  const errors = items.filter((i) => i.severity === 'critical').length;
  const warnings = items.filter((i) => i.severity === 'warning').length;

  return {
    success: true,
    errorsFound: errors,
    warningsFound: warnings,
    items,
    summary:
      items.length > 0
        ? `Pattern-based static analysis finished. Identified ${errors} critical error(s), ${warnings} warning(s) across target files.`
        : 'Pattern-based static analysis finished. All syntax and code quality checks passed with 0 violations.',
  };
}
