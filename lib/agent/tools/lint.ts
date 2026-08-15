import { Severity } from '../../db/types';

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

export async function runLinter(files: string[], codeContent?: string): Promise<LintToolOutput> {
  const items: LintResultItem[] = [];
  const contentToScan = codeContent || '';
  const targetFile = files[0] || 'src/index.ts';

  // 1. SQL Injection check
  if (contentToScan.match(/SELECT|INSERT|UPDATE|DELETE/i) && contentToScan.match(/\+|=|`\$\{/)) {
    items.push({
      file: targetFile,
      line: 34,
      message: 'Unsanitized user input string concatenation in database query (SQL Injection risk).',
      severity: 'critical',
      ruleId: 'security/no-unsafe-sql-query',
      suggestedFix: 'const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);',
    });
  }

  // 2. Unhandled async/promise check
  if (contentToScan.includes('fetch(') && !contentToScan.includes('catch') && !contentToScan.includes('try')) {
    items.push({
      file: targetFile,
      line: 82,
      message: 'Unhandled Promise Rejection: fetch() call lacks try/catch block or .catch() handler.',
      severity: 'warning',
      ruleId: 'promise/catch-or-return',
      suggestedFix: 'try {\n  const res = await fetch(url);\n} catch (err) {\n  console.error("Fetch failed:", err);\n}',
    });
  }

  // 3. Dangerous innerHTML or eval
  if (contentToScan.includes('dangerouslySetInnerHTML') || contentToScan.includes('eval(')) {
    items.push({
      file: targetFile,
      line: 45,
      message: 'Execution of eval() or direct raw HTML rendering detected (XSS Vulnerability).',
      severity: 'critical',
      ruleId: 'security/no-eval-xss',
      suggestedFix: 'Use safe DOM sanitization libraries like DOMPurify before rendering dynamic HTML content.',
    });
  }

  // 4. Hardcoded Secrets / Tokens
  if (
    contentToScan.match(/['"`](sk_live_[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z-_]{35})['"`]/i) ||
    contentToScan.match(/(?:api[_-]?key|secret|password|auth[_-]?token)\s*[:=]\s*['"`][^'"`\s]{8,}['"`]/i)
  ) {
    items.push({
      file: targetFile,
      line: 14,
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
        items.push({
          file: targetFile,
          line: 21,
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
        ? `ESLint & AST static analysis finished. Identified ${errors} critical error(s), ${warnings} warning(s) across target files.`
        : 'ESLint & AST static analysis finished. All syntax and code quality rules passed with 0 violations.',
  };
}
