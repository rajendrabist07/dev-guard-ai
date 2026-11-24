import ts from 'typescript';
import { Severity } from '@/lib/db/types';

export interface AstFinding {
  ruleId: string;
  cwe: string;
  severity: Severity;
  message: string;
  suggestedFix: string;
  file: string;
  line: number;
  column: number;
}

export interface AstAnalysisResult {
  success: boolean;
  totalFindings: number;
  errorsFound: number;
  warningsFound: number;
  findings: AstFinding[];
  summary: string;
}

// Shannon entropy calculation for secret detection
function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const frequencies = new Map<string, number>();
  for (const char of str) {
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }
  let entropy = 0;
  const len = str.length;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const SECRET_PATTERNS = [
  { name: 'Stripe Live Secret Key', regex: /sk_live_[a-zA-Z0-9_-]{20,}/ },
  { name: 'GitHub Personal Access Token', regex: /ghp_[a-zA-Z0-9_-]{20,}/ },
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z-_]{35}/ },
  { name: 'Slack Bot / User Token', regex: /xox[baprs]-[0-9a-zA-Z-]{20,}/ },
  { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/ },
];

const DUMMY_SECRET_ALLOWLIST = [
  'dummy',
  'example',
  'placeholder',
  'test-token',
  'fake',
  'mock',
  'redacted',
  'process.env',
];

/**
 * Checks if a string literal appears to be a hardcoded credential.
 */
function isHardcodedSecret(value: string, varName?: string): boolean {
  if (!value || value.length < 16) return false;
  // URLs, file paths, and package imports are not secrets
  if (/^https?:\/\/|^\.?\//i.test(value)) return false;

  const lowerVal = value.toLowerCase();
  for (const allowed of DUMMY_SECRET_ALLOWLIST) {
    if (lowerVal.includes(allowed)) return false;
  }

  // 1. Check known prefixes
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(value)) return true;
  }

  // 2. Sensitive variable name with high entropy
  if (varName && /secret|token|api_?key|password|auth_?token|private_?key/i.test(varName)) {
    const entropy = calculateShannonEntropy(value);
    if (entropy >= 3.5 && !/\s/.test(value)) {
      return true;
    }
  }

  // 3. Explicit secret assignment format: "api_key = '...'"
  if (/(?:api[_-]?key|secret|password|auth[_-]?token)\s*[:=]\s*['"`]?([a-zA-Z0-9_\-!@#$%^&*()]{16,})['"`]?/i.test(value)) {
    return true;
  }

  return false;
}

/**
 * Traverses an AST and tracks basic intra-file variable assignments from request sources.
 */
function collectTaintedVariables(sourceFile: ts.SourceFile): Set<string> {
  const taintedVars = new Set<string>();

  function isTaintedExpression(expr: ts.Expression): boolean {
    const text = expr.getText(sourceFile);
    if (
      /\b(req|request)\.(body|query|params|headers)\b/.test(text) ||
      /\b(searchParams\.get|params\.[a-zA-Z0-9_]+)\b/.test(text) ||
      /\b(request\.(json|formData)\(\))\b/.test(text)
    ) {
      return true;
    }
    if (ts.isIdentifier(expr) && taintedVars.has(expr.text)) {
      return true;
    }
    return false;
  }

  function visitor(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (isTaintedExpression(node.initializer)) {
        taintedVars.add(node.name.text);
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      if (isTaintedExpression(node.right)) {
        taintedVars.add(node.left.text);
      }
    }
    ts.forEachChild(node, visitor);
  }

  visitor(sourceFile);
  return taintedVars;
}

/**
 * Analyzes a source file AST for 9 critical security rules.
 */
export function analyzeAst(filePath: string, sourceCode: string): AstFinding[] {
  if (!sourceCode || sourceCode.trim().length === 0) {
    return [];
  }

  // Detect script kind based on file extension
  let scriptKind = ts.ScriptKind.TSX;
  if (filePath.endsWith('.js')) scriptKind = ts.ScriptKind.JS;
  else if (filePath.endsWith('.jsx')) scriptKind = ts.ScriptKind.JSX;
  else if (filePath.endsWith('.ts')) scriptKind = ts.ScriptKind.TS;

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );

  const findings: AstFinding[] = [];
  const taintedVars = collectTaintedVariables(sourceFile);

  const isTestFile = /\b(__tests__|tests?|evals?|fixtures?)\b|\.(test|spec)\.[jt]sx?$/i.test(filePath);

  function getLineAndCol(node: ts.Node) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return { line: line + 1, column: character + 1 };
  }

  function isInsideTryCatch(node: ts.Node): boolean {
    let child: ts.Node = node;
    let curr: ts.Node | undefined = node.parent;
    while (curr) {
      if (ts.isTryStatement(curr) && curr.tryBlock === child) {
        return true;
      }
      child = curr;
      curr = curr.parent;
    }
    return false;
  }

  function hasPromiseCatch(callNode: ts.CallExpression): boolean {
    if (ts.isPropertyAccessExpression(callNode.expression) && callNode.expression.name.text === 'catch') {
      return true;
    }
    let curr: ts.Node = callNode;
    while (curr.parent && ts.isPropertyAccessExpression(curr.parent) && curr.parent.expression === curr) {
      const propAccess = curr.parent;
      if (propAccess.name.text === 'catch') {
        return true;
      }
      if (propAccess.parent && ts.isCallExpression(propAccess.parent)) {
        curr = propAccess.parent;
      } else {
        break;
      }
    }
    return false;
  }

  function visitor(node: ts.Node) {
    // ----------------------------------------------------------------------------------
    // RULE 1: SQL Injection (built by string concat or template literals passed to query/raw/execute)
    // CWE-89
    // ----------------------------------------------------------------------------------
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      const isSqlCall =
        /\b(query|execute|raw|\$queryRaw|\$queryRawUnsafe|\$executeRaw|\$executeRawUnsafe|executeSql|execSql)\b/.test(
          callText
        );

      if (isSqlCall && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        // Check if first arg is binary expression with '+' or a TemplateExpression with substitutions
        const isConcat = ts.isBinaryExpression(firstArg) && firstArg.operatorToken.kind === ts.SyntaxKind.PlusToken;
        const isInterpolatedTemplate = ts.isTemplateExpression(firstArg) && firstArg.templateSpans.length > 0;

        if (isConcat || isInterpolatedTemplate) {
          const { line, column } = getLineAndCol(node);
          findings.push({
            ruleId: 'security/no-unsafe-sql-query',
            cwe: 'CWE-89',
            severity: 'critical',
            message: `SQL Injection risk: Dynamic string concatenation or template literal passed to ${callText}().`,
            suggestedFix: 'const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);',
            file: filePath,
            line,
            column,
          });
        }
      }
    } else if (ts.isTemplateExpression(node)) {
      // Check if template expression itself contains raw SQL keywords
      const templateText = node.getText(sourceFile);
      const hasSqlKeywords = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(templateText) &&
        /\b(FROM|WHERE|SET|VALUES)\b/i.test(templateText);

      // Verify node is not inside a TypeNode
      let isTypeContext = false;
      let p: ts.Node | undefined = node.parent;
      while (p) {
        if (ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p)) {
          isTypeContext = true;
          break;
        }
        p = p.parent;
      }

      if (hasSqlKeywords && !isTypeContext && node.templateSpans.length > 0) {
        // Only add if not already added by parent call expression
        const isChildOfSqlCall =
          node.parent && ts.isCallExpression(node.parent) && node.parent.arguments[0] === node;
        if (!isChildOfSqlCall) {
          const { line, column } = getLineAndCol(node);
          findings.push({
            ruleId: 'security/no-unsafe-sql-query',
            cwe: 'CWE-89',
            severity: 'critical',
            message: 'SQL Injection risk: Unescaped template literal contains SQL command with embedded variable substitutions.',
            suggestedFix: 'const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);',
            file: filePath,
            line,
            column,
          });
        }
      }
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const isPartOfLargerConcat =
        node.parent &&
        ts.isBinaryExpression(node.parent) &&
        node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken;

      if (!isPartOfLargerConcat) {
        const text = node.getText(sourceFile);
        const hasSqlKeywords =
          /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(text) &&
          /\b(FROM|WHERE|SET|VALUES)\b/i.test(text);

        if (hasSqlKeywords) {
          const { line, column } = getLineAndCol(node);
          findings.push({
            ruleId: 'security/no-unsafe-sql-query',
            cwe: 'CWE-89',
            severity: 'critical',
            message: 'SQL Injection risk: Unsanitized user input string concatenation in database query.',
            suggestedFix: 'const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);',
            file: filePath,
            line,
            column,
          });
        }
      }
    }

    // ----------------------------------------------------------------------------------
    // RULE 2: Tainted request data flowing into a query, exec, eval, or file path
    // CWE-20 / CWE-73
    // ----------------------------------------------------------------------------------
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      const isFileSink = /\b(readFile|readFileSync|writeFile|writeFileSync|unlink|createReadStream|createWriteStream)\b/.test(callText);
      const isExecSink = /\b(exec|execSync|spawn|spawnSync|eval)\b/.test(callText);

      if (isFileSink || isExecSink) {
        for (const arg of node.arguments) {
          const argText = arg.getText(sourceFile);
          const isTainted =
            (ts.isIdentifier(arg) && taintedVars.has(arg.text)) ||
            taintedVars.has(argText) ||
            /\b(req|request)\.(body|query|params|headers)\b/.test(argText) ||
            /\b(searchParams\.get|params\.[a-zA-Z0-9_]+)\b/.test(argText);

          if (isTainted) {
            const { line, column } = getLineAndCol(node);
            findings.push({
              ruleId: 'security/tainted-input',
              cwe: isFileSink ? 'CWE-73' : 'CWE-20',
              severity: 'critical',
              message: `Tainted request input flows directly into security-sensitive sink ${callText}().`,
              suggestedFix: 'Validate and sanitize untrusted request parameters against an allowlist before passing to filesystem or execution sinks.',
              file: filePath,
              line,
              column,
            });
            break;
          }
        }
      }
    }

    // ----------------------------------------------------------------------------------
    // RULE 3: child_process exec/spawn with interpolated input
    // CWE-78
    // ----------------------------------------------------------------------------------
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      const isCommandExec = /\b(child_process\.)?(exec|execSync|spawn|spawnSync)\b/.test(callText);

      if (isCommandExec && node.arguments.length > 0) {
        const cmdArg = node.arguments[0];
        const isConcat = ts.isBinaryExpression(cmdArg) && cmdArg.operatorToken.kind === ts.SyntaxKind.PlusToken;
        const isTemplate = ts.isTemplateExpression(cmdArg) && cmdArg.templateSpans.length > 0;

        if (isConcat || isTemplate) {
          const { line, column } = getLineAndCol(node);
          findings.push({
            ruleId: 'security/no-command-injection',
            cwe: 'CWE-78',
            severity: 'critical',
            message: `Command Injection risk: Shell command constructed via dynamic string concatenation or template literal in ${callText}().`,
            suggestedFix: 'Use execFile() or spawn() with argument arrays rather than shell string interpolation.',
            file: filePath,
            line,
            column,
          });
        }
      }
    }

    // ----------------------------------------------------------------------------------
    // RULE 4: fetch/axios with user-controlled URL (SSRF)
    // CWE-918
    // ----------------------------------------------------------------------------------
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      const isHttpFetch = /\b(fetch|axios(\.(get|post|put|delete))?)\b/.test(callText);

      if (isHttpFetch && node.arguments.length > 0) {
        const urlArg = node.arguments[0];
        const urlText = urlArg.getText(sourceFile);
        const isDirectTaint =
          (ts.isIdentifier(urlArg) && taintedVars.has(urlArg.text)) ||
          /\b(req|request)\.(body|query|params)\b/.test(urlText) ||
          /\bsearchParams\.get\(['"](url|target|dest|endpoint)['"]\)/.test(urlText);

        const isUserControlledTemplate =
          ts.isTemplateExpression(urlArg) &&
          urlArg.templateSpans.length > 0 &&
          !urlArg.head.text.startsWith('http://') &&
          !urlArg.head.text.startsWith('https://');

        if (isDirectTaint || isUserControlledTemplate) {
          const { line, column } = getLineAndCol(node);
          findings.push({
            ruleId: 'security/no-ssrf',
            cwe: 'CWE-918',
            severity: 'critical',
            message: `Server-Side Request Forgery (SSRF) risk: User-controlled URL parameter passed to ${callText}().`,
            suggestedFix: 'Validate the destination URL against an explicit domain allowlist and block private IP ranges (RFC 1918).',
            file: filePath,
            line,
            column,
          });
        }
      }
    }

    // ----------------------------------------------------------------------------------
    // RULE 5: await fetch without try/catch or .catch (unhandled rejection)
    // CWE-391
    // ----------------------------------------------------------------------------------
    if (ts.isAwaitExpression(node)) {
      const awaitExpr = node.expression;
      if (ts.isCallExpression(awaitExpr)) {
        const callText = awaitExpr.expression.getText(sourceFile);
        if (/\b(fetch|axios)\b/.test(callText)) {
          if (!isInsideTryCatch(node) && !hasPromiseCatch(awaitExpr)) {
            const { line, column } = getLineAndCol(node);
            findings.push({
              ruleId: 'promise/catch-or-return',
              cwe: 'CWE-391',
              severity: 'warning',
              message: `Unhandled Promise Rejection: 'await ${callText}()' is not wrapped in a try/catch block and lacks a .catch() handler.`,
              suggestedFix: 'try {\n  const res = await fetch(url);\n} catch (err) {\n  console.error("Fetch failed:", err);\n}',
              file: filePath,
              line,
              column,
            });
          }
        }
      }
    }

    // ----------------------------------------------------------------------------------
    // RULE 6: Hardcoded secrets (known key formats + entropy check, allow-list for tests)
    // CWE-798
    // ----------------------------------------------------------------------------------
    if (!isTestFile && ts.isStringLiteral(node)) {
      let varName: string | undefined;
      if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
        varName = node.parent.name.text;
      } else if (node.parent && ts.isPropertyAssignment(node.parent) && ts.isIdentifier(node.parent.name)) {
        varName = node.parent.name.text;
      }

      if (isHardcodedSecret(node.text, varName)) {
        const { line, column } = getLineAndCol(node);
        findings.push({
          ruleId: 'security/no-hardcoded-credentials',
          cwe: 'CWE-798',
          severity: 'critical',
          message: 'Hardcoded sensitive credential or API key detected in source code.',
          suggestedFix: 'Move credentials into server environment variables (e.g. process.env.API_KEY) and access them securely.',
          file: filePath,
          line,
          column,
        });
      }
    }

    // ----------------------------------------------------------------------------------
    // RULE 7: Insecure cookies (missing httpOnly/secure/sameSite) and JWT misuse
    // CWE-614 / CWE-1275 / CWE-347
    // ----------------------------------------------------------------------------------
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      const isCookieSet = /\b(cookie|cookies\.set|res\.cookie|response\.cookies\.set)\b/.test(callText);
      const isJwtVerify = /\b(jwt\.verify|verifyToken)\b/.test(callText);

      if (isCookieSet && node.arguments.length >= 3) {
        const optionsArg = node.arguments[2];
        if (ts.isObjectLiteralExpression(optionsArg)) {
          let hasHttpOnly = false;
          let hasSecure = false;
          let hasSameSite = false;

          for (const prop of optionsArg.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
              if (prop.name.text === 'httpOnly' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
                hasHttpOnly = true;
              }
              if (prop.name.text === 'secure' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
                hasSecure = true;
              }
              if (prop.name.text === 'sameSite') {
                hasSameSite = true;
              }
            }
          }

          if (!hasHttpOnly || !hasSameSite || !hasSecure) {
            const { line, column } = getLineAndCol(node);
            const missing = [
              !hasHttpOnly ? 'httpOnly: true' : null,
              !hasSecure ? 'secure: true' : null,
              !hasSameSite ? 'sameSite' : null,
            ].filter(Boolean).join(', ');

            findings.push({
              ruleId: 'security/insecure-cookies-jwt',
              cwe: 'CWE-614',
              severity: 'warning',
              message: `Insecure cookie configuration: Cookie options missing ${missing}.`,
              suggestedFix: 'Configure cookies with { httpOnly: true, secure: true, sameSite: "lax" } to mitigate XSS and CSRF attacks.',
              file: filePath,
              line,
              column,
            });
          }
        }
      } else if (isJwtVerify && node.arguments.length === 2) {
        // jwt.verify without options argument specifying algorithms
        const { line, column } = getLineAndCol(node);
        findings.push({
          ruleId: 'security/insecure-cookies-jwt',
          cwe: 'CWE-347',
          severity: 'warning',
          message: 'JWT verification missing explicit algorithm specification in options.',
          suggestedFix: "Specify accepted algorithms explicitly: jwt.verify(token, secret, { algorithms: ['HS256'] }).",
          file: filePath,
          line,
          column,
        });
      }
    }

    // ----------------------------------------------------------------------------------
    // RULE 8: dangerouslySetInnerHTML with non-constant input
    // CWE-79
    // ----------------------------------------------------------------------------------
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'dangerouslySetInnerHTML') {
      if (node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        const expr = node.initializer.expression;
        if (ts.isObjectLiteralExpression(expr)) {
          for (const prop of expr.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === '__html') {
              const htmlExpr = prop.initializer;
              // If not a plain string literal and not sanitized with DOMPurify
              const htmlText = htmlExpr.getText(sourceFile);
              const isSanitized = /DOMPurify\.sanitize|sanitizeHtml/i.test(htmlText);
              const isConstant = ts.isStringLiteral(htmlExpr) || ts.isNoSubstitutionTemplateLiteral(htmlExpr);

              if (!isConstant && !isSanitized) {
                const { line, column } = getLineAndCol(node);
                findings.push({
                  ruleId: 'security/no-eval-xss',
                  cwe: 'CWE-79',
                  severity: 'critical',
                  message: 'Cross-Site Scripting (XSS) risk: Dynamic un-sanitized content passed to dangerouslySetInnerHTML.',
                  suggestedFix: 'Sanitize dynamic HTML content using DOMPurify.sanitize(content) before passing to dangerouslySetInnerHTML.',
                  file: filePath,
                  line,
                  column,
                });
              }
            }
          }
        }
      }
    } else if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      if (callText === 'eval' && node.arguments.length > 0) {
        const { line, column } = getLineAndCol(node);
        findings.push({
          ruleId: 'security/no-eval-xss',
          cwe: 'CWE-79',
          severity: 'critical',
          message: 'Arbitrary code execution / XSS risk: Direct usage of eval().',
          suggestedFix: 'Avoid eval(); parse data with JSON.parse() or use safe typed dispatchers.',
          file: filePath,
          line,
          column,
        });
      }
    }

    // ----------------------------------------------------------------------------------
    // RULE 9: Weak crypto (md5/sha1 for passwords, Math.random for tokens)
    // CWE-327 / CWE-330
    // ----------------------------------------------------------------------------------
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      if (/\b(crypto\.)?createHash\b/.test(callText) && node.arguments.length > 0) {
        const hashArg = node.arguments[0];
        if (ts.isStringLiteral(hashArg) && /^(md5|sha1)$/i.test(hashArg.text)) {
          const { line, column } = getLineAndCol(node);
          findings.push({
            ruleId: 'security/no-weak-crypto',
            cwe: 'CWE-327',
            severity: 'critical',
            message: `Weak cryptographic algorithm: '${hashArg.text.toUpperCase()}' is collision-vulnerable and cryptographically broken.`,
            suggestedFix: 'Use SHA-256 (SHA256) or SHA-512 for integrity hashes, and bcrypt or argon2 for password storage.',
            file: filePath,
            line,
            column,
          });
        }
      } else if (callText === 'Math.random' || node.getText(sourceFile).startsWith('Math.random(')) {
        // Check if assigned to token, secret, id, key, or session
        let isSecurityContext = false;
        let curr: ts.Node | undefined = node.parent;
        let depth = 0;
        while (curr && depth < 6) {
          const currText = curr.getText(sourceFile);
          if (/(?:token|secret|session|key|auth|password|csrf|reset)/i.test(currText)) {
            isSecurityContext = true;
            break;
          }
          curr = curr.parent;
          depth++;
        }

        if (isSecurityContext) {
          const { line, column } = getLineAndCol(node);
          findings.push({
            ruleId: 'security/no-weak-crypto',
            cwe: 'CWE-330',
            severity: 'critical',
            message: 'Insecure randomness: Math.random() is pseudorandom (PRNG) and predictable; unsuitable for security tokens.',
            suggestedFix: 'Use crypto.randomBytes() or crypto.randomUUID() for cryptographically secure random values.',
            file: filePath,
            line,
            column,
          });
        }
      }
    }

    ts.forEachChild(node, visitor);
  }

  visitor(sourceFile);

  // Quality Heuristic: Unused declared variables
  const declaredVars = new Map<string, ts.Node>();
  const identifierUsages = new Map<string, number>();

  function collectVarsAndUsages(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      let isExported = false;
      let p: ts.Node | undefined = node.parent;
      while (p) {
        if (ts.isVariableStatement(p)) {
          isExported = Boolean(p.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
          break;
        }
        p = p.parent;
      }
      if (!isExported && !node.name.text.startsWith('_')) {
        declaredVars.set(node.name.text, node);
      }
    }
    if (ts.isIdentifier(node)) {
      identifierUsages.set(node.text, (identifierUsages.get(node.text) || 0) + 1);
    }
    ts.forEachChild(node, collectVarsAndUsages);
  }

  collectVarsAndUsages(sourceFile);

  for (const [varName, declNode] of declaredVars.entries()) {
    const usages = identifierUsages.get(varName) || 0;
    if (usages === 1 && !['React', 'useState', 'useEffect', 'req', 'res', 'err', 'db', 'user', 'query'].includes(varName)) {
      const { line, column } = getLineAndCol(declNode);
      findings.push({
        ruleId: 'eslint/no-unused-vars',
        cwe: 'CWE-563',
        severity: 'warning',
        message: `'${varName}' is assigned a value but never used in the execution path.`,
        suggestedFix: `// Remove '${varName}' or prefix with '_' if intentional: const _${varName} = ...`,
        file: filePath,
        line,
        column,
      });
      break;
    }
  }

  return findings;
}

/**
 * Runs the AST Security Analyzer on multiple files or a raw code snippet.
 */
export async function runAstSecurityAnalyzer(
  files: string[],
  codeContent?: string
): Promise<AstAnalysisResult> {
  const allFindings: AstFinding[] = [];
  const targetFile = files[0] || 'src/index.ts';

  if (codeContent && codeContent.trim().length > 0) {
    const findings = analyzeAst(targetFile, codeContent);
    allFindings.push(...findings);
  }

  const errors = allFindings.filter((f) => f.severity === 'critical').length;
  const warnings = allFindings.filter((f) => f.severity === 'warning').length;

  return {
    success: true,
    totalFindings: allFindings.length,
    errorsFound: errors,
    warningsFound: warnings,
    findings: allFindings,
    summary:
      allFindings.length > 0
        ? `AST Static Security Analysis completed: Identified ${errors} critical vulnerability(ies) and ${warnings} warning(s).`
        : 'AST Static Security Analysis completed: 0 vulnerabilities identified across parsed syntax trees.',
  };
}
