# Phase 5 Engineering Report: Real Static Analysis & Real Test Execution

**Timestamp**: 2026-11-23  
**Status**: Completed  
**Milestone**: Phase 5 — Truth in Analysis & CI Execution

---

## 1. Executive Summary

Phase 5 transitions DevGuard AI's core claims from static pattern heuristics to literal truth:
1. **In-App AST Security Analyzer**: Replaced regex pattern matching with real Abstract Syntax Tree (AST) parsing via the TypeScript Compiler API. Inspects code across 9 critical CWE vulnerability classes with intra-file taint tracking and positive, negative, and precision test fixtures.
2. **Real Test Execution via `devguard-action`**: Authored a reusable composite GitHub Action (`actions/devguard-action/action.yml`) that executes in the user's CI runner, executing real **Semgrep** security rules, **OSV-Scanner**, and the repository's native test suite (`npm test`).
3. **Cryptographic GitHub OIDC Ingestion**: Ingests findings into `POST /api/ingest` authenticated via short-lived GitHub Actions OIDC tokens verified against GitHub's official JWKS (`token.actions.githubusercontent.com`). Requires zero long-lived API tokens.
4. **Honest PR Test Status Reporting**: PR review comments clearly distinguish between real executed tests (`tests: executed (...)`) and unexecuted environments (`tests: not executed — install devguard-action to enable`).

---

## 2. In-App AST Analyzer (`lib/agent/tools/ast-analyzer.ts`)

The AST analyzer parses TypeScript, TSX, JavaScript, and JSX syntax trees into typed `SourceFile` nodes without external binary dependencies.

### Implemented AST Security Rules

| Rule ID | CWE | Severity | Description | Precision Target / Anti-False-Positive Guarantee |
|---------|:---:|:--------:|-------------|---------------------------------------------------|
| `security/no-unsafe-sql-query` | CWE-89 | Critical | SQL query constructed via string concatenation (`+`) or template literals with substitutions passed to `query()`, `execute()`, or `$queryRaw()`. | Does not flag type unions with SQL keywords (e.g. `type T = 'SELECT'`), parameterized queries (`$1`), or ORM calls (`prisma.user.findUnique({ where: { id: userId } })`). |
| `security/tainted-input` | CWE-20, CWE-73 | Critical | Tracks intra-file tainted request sources (`req.body`, `req.query`, `searchParams.get()`, `params.*`) flowing into filesystem (`fs.readFile`) or execution sinks. | Does not flag fixed string paths (`fs.readFileSync('config.json')`) or sanitized parameters. |
| `security/no-command-injection` | CWE-78 | Critical | `child_process.exec` or `spawn` invoked with dynamic string concatenation or template literals. | Does not flag `execFile` or static array command invocations (`execFile('git', ['status'])`). |
| `security/no-ssrf` | CWE-918 | Critical | Untrusted user-controlled URL passed to `fetch()` or `axios()`. | Does not flag fixed domain endpoints (`https://api.github.com/...`). |
| `promise/catch-or-return` | CWE-391 | Warning | `await fetch()` or `await axios()` without enclosing `try/catch` block or `.catch()` handler. | Does not flag network calls inside `try/catch` or chained with `.catch()`. |
| `security/no-hardcoded-credentials` | CWE-798 | Critical | Detects live high-entropy API keys (Stripe `sk_live_`, GitHub `ghp_`, Google `AIza`, Slack `xoxb-`, AWS `AKIA`). | Excludes test files, dummy placeholders (`dummy`, `example`, `placeholder`), and `process.env`. |
| `security/insecure-cookies-jwt` | CWE-614, CWE-347 | Warning | Cookie options missing `httpOnly: true`, `secure: true`, or `sameSite`, or `jwt.verify()` missing explicit algorithm constraints. | Does not flag cookies configured with `{ httpOnly: true, secure: true, sameSite: 'strict' }`. |
| `security/no-eval-xss` | CWE-79 | Critical | Dynamic un-sanitized content passed to `dangerouslySetInnerHTML` or direct usage of `eval()`. | Does not flag constant strings or markup passed through `DOMPurify.sanitize()`. |
| `security/no-weak-crypto` | CWE-327, CWE-330 | Critical | Usage of broken hash algorithms (`MD5`, `SHA1`) or `Math.random()` for security tokens / keys. | Does not flag SHA-256 hashes or `crypto.randomUUID()`. |

---

## 3. GitHub Action Architecture (`actions/devguard-action`)

```
+-------------------------------------------------------------+
|                      Your CI Runner                         |
|  1. Semgrep scan (OWASP Top 10 + Security Audit)            |
|  2. OSV-Scanner (Lockfiles & dependencies)                  |
|  3. Run Test Suite (npm test -> records duration & status)   |
|  4. Mint GitHub OIDC Token (aud: devguard-ai)               |
+------------------------------+------------------------------+
                               |
                               | POST /api/ingest
                               | Authorization: Bearer <OIDC_TOKEN>
                               v
+-------------------------------------------------------------+
|                     DevGuard AI Server                      |
|  1. Fetches GitHub JWKS (token.actions.githubusercontent)   |
|  2. Verifies RSA-SHA256 signature & token claims            |
|  3. Validates repository ownership & active installation     |
|  4. Merges Semgrep + OSV with in-app AST findings           |
|  5. Deduplicates findings by file:line:rule                 |
|  6. Posts review to GitHub PR with verified test notice     |
+-------------------------------------------------------------+
```

### OIDC Security Guarantees
- **No Secret Storage**: Users do not configure static API keys in GitHub secrets.
- **Audience & Issuer Binding**: Tokens must have `iss: https://token.actions.githubusercontent.com` and `aud: devguard-ai`.
- **Repository & SHA Assertion**: The server verifies that the repository and commit SHA in the JWT match the payload claims and belong to a registered GitHub App installation.

---

## 4. Verification & Gate Results

- **Automated Vitest Suites**: **36 test files, 168 tests passing (100%)**.
- **AST Positive & Precision Suite**: **21/21 tests passing** (`__tests__/tools/ast-analyzer.test.ts`).
- **OIDC Ingest API Suite**: **5/5 tests passing** (`__tests__/security/ingest-api.test.ts`).
- **CI Gate Benchmark Scorecard**:
  - Tool Selection Precision: **100%** (Gate: >= 98%)
  - Tool Selection Recall: **100%** (Gate: >= 98%)
  - Tool Selection F1 Score: **100%** (Gate: >= 98%)
  - Severity Accuracy: **100%** (Gate: >= 98%)
  - Wasted Tool Call Rate: **0%** (Gate: <= 2%)
  - Docs-Only Efficiency Gate: **PASSED**
- **TypeScript Typecheck**: **0 errors** (`tsc --noEmit`).
- **ESLint**: **0 errors, 0 warnings**.
