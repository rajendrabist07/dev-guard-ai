import { describe, it, expect } from 'vitest';
import { analyzeAst, runAstSecurityAnalyzer } from '@/lib/agent/tools/ast-analyzer';

describe('AST Static Security Analyzer (lib/agent/tools/ast-analyzer.ts)', () => {
  // -------------------------------------------------------------------------
  // Rule 1: SQL Injection (CWE-89)
  // -------------------------------------------------------------------------
  describe('Rule 1: SQL Injection (CWE-89)', () => {
    it('detects SQL injection via string concatenation', () => {
      const code = `
        async function getUser(id: string) {
          const sql = "SELECT * FROM users WHERE id = '" + id + "'";
          return await db.query(sql);
        }
      `;
      const findings = analyzeAst('src/users.ts', code);
      const sqli = findings.find((f) => f.ruleId === 'security/no-unsafe-sql-query');
      expect(sqli).toBeDefined();
      expect(sqli?.cwe).toBe('CWE-89');
      expect(sqli?.severity).toBe('critical');
      expect(sqli?.suggestedFix).toContain('$1');
    });

    it('detects SQL injection via unescaped template literal', () => {
      const code = `
        async function getOrders(userId: string) {
          return await db.query(\`SELECT * FROM orders WHERE customer_id = \${userId}\`);
        }
      `;
      const findings = analyzeAst('src/orders.ts', code);
      const sqli = findings.find((f) => f.ruleId === 'security/no-unsafe-sql-query');
      expect(sqli).toBeDefined();
      expect(sqli?.severity).toBe('critical');
    });

    it('precision: does NOT flag type unions, parameterized queries, or ORMs', () => {
      const benignCode = `
        // Type union with SQL keyword
        type QueryType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

        export async function getSafeUser(userId: string) {
          // Parameterized query
          const res1 = await db.query("SELECT * FROM users WHERE id = $1", [userId]);

          // ORM call with parameter named userId
          const res2 = await prisma.user.findUnique({
            where: { id: userId },
          });

          return { res1, res2 };
        }
      `;
      const findings = analyzeAst('src/safe-user.ts', benignCode);
      const sqli = findings.filter((f) => f.ruleId === 'security/no-unsafe-sql-query');
      expect(sqli.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 2: Tainted Input (CWE-20 / CWE-73)
  // -------------------------------------------------------------------------
  describe('Rule 2: Tainted Input to Sensitive Sinks (CWE-20 / CWE-73)', () => {
    it('detects tainted request parameter flowing directly into readFile sink', () => {
      const code = `
        import fs from 'fs';
        export async function handleFile(req: Request) {
          const filename = req.query.file;
          return fs.readFileSync(filename, 'utf-8');
        }
      `;
      const findings = analyzeAst('src/files.ts', code);
      const taint = findings.find((f) => f.ruleId === 'security/tainted-input');
      expect(taint).toBeDefined();
      expect(taint?.cwe).toBe('CWE-73');
      expect(taint?.severity).toBe('critical');
    });

    it('precision: does NOT flag fixed paths or safe constant filesystem reads', () => {
      const benignCode = `
        import fs from 'fs';
        export function readConfig() {
          const configPath = 'config/settings.json';
          return fs.readFileSync(configPath, 'utf-8');
        }
      `;
      const findings = analyzeAst('src/config.ts', benignCode);
      const taint = findings.filter((f) => f.ruleId === 'security/tainted-input');
      expect(taint.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 3: Command Injection (CWE-78)
  // -------------------------------------------------------------------------
  describe('Rule 3: Command Injection via child_process (CWE-78)', () => {
    it('detects child_process.exec with interpolated template string', () => {
      const code = `
        import { exec } from 'child_process';
        export function pingHost(host: string) {
          exec(\`ping -c 1 \${host}\`);
        }
      `;
      const findings = analyzeAst('src/net.ts', code);
      const cmd = findings.find((f) => f.ruleId === 'security/no-command-injection');
      expect(cmd).toBeDefined();
      expect(cmd?.cwe).toBe('CWE-78');
      expect(cmd?.severity).toBe('critical');
    });

    it('precision: does NOT flag execFile or static array argument commands', () => {
      const benignCode = `
        import { execFile } from 'child_process';
        export function runGitStatus() {
          execFile('git', ['status', '--porcelain'], (err, stdout) => {
            console.log(stdout);
          });
        }
      `;
      const findings = analyzeAst('src/git.ts', benignCode);
      const cmd = findings.filter((f) => f.ruleId === 'security/no-command-injection');
      expect(cmd.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 4: SSRF (CWE-918)
  // -------------------------------------------------------------------------
  describe('Rule 4: Server-Side Request Forgery (SSRF) (CWE-918)', () => {
    it('detects unvalidated user-controlled URL in fetch call', () => {
      const code = `
        export async function proxy(req: Request) {
          const userUrl = req.body.url;
          return await fetch(userUrl);
        }
      `;
      const findings = analyzeAst('src/proxy.ts', code);
      const ssrf = findings.find((f) => f.ruleId === 'security/no-ssrf');
      expect(ssrf).toBeDefined();
      expect(ssrf?.cwe).toBe('CWE-918');
      expect(ssrf?.severity).toBe('critical');
    });

    it('precision: does NOT flag calls to fixed domain endpoints', () => {
      const benignCode = `
        export async function getRepo(repoName: string) {
          try {
            return await fetch(\`https://api.github.com/repos/\${repoName}\`);
          } catch (e) {
            return null;
          }
        }
      `;
      const findings = analyzeAst('src/github.ts', benignCode);
      const ssrf = findings.filter((f) => f.ruleId === 'security/no-ssrf');
      expect(ssrf.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 5: Unhandled Fetch Rejection (CWE-391)
  // -------------------------------------------------------------------------
  describe('Rule 5: Unhandled Promise Rejection on Network Calls (CWE-391)', () => {
    it('detects await fetch without try/catch or .catch() handler', () => {
      const code = `
        export async function loadUserData() {
          const res = await fetch('https://api.example.com/user');
          return res.json();
        }
      `;
      const findings = analyzeAst('src/loader.ts', code);
      const unhandled = findings.find((f) => f.ruleId === 'promise/catch-or-return');
      expect(unhandled).toBeDefined();
      expect(unhandled?.cwe).toBe('CWE-391');
      expect(unhandled?.severity).toBe('warning');
    });

    it('precision: does NOT flag fetch wrapped in try/catch or chained with .catch()', () => {
      const benignCode = `
        export async function safeLoader() {
          try {
            const res = await fetch('https://api.example.com/user');
            return await res.json();
          } catch (err) {
            console.error(err);
            return null;
          }
        }

        export async function chainedLoader() {
          const res = await fetch('https://api.example.com/user').catch(() => null);
          return res;
        }
      `;
      const findings = analyzeAst('src/safe-loader.ts', benignCode);
      const unhandled = findings.filter((f) => f.ruleId === 'promise/catch-or-return');
      expect(unhandled.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 6: Hardcoded Secrets (CWE-798)
  // -------------------------------------------------------------------------
  describe('Rule 6: Hardcoded Credentials & API Keys (CWE-798)', () => {
    it('detects live Stripe and GitHub secret keys in source files', () => {
      const code = [
        'const stripeKey = "' + 'sk' + '_live' + '_51M0000000000000000000000000000000000000000";',
        'const githubToken = "' + 'ghp' + '_1111222233334444555566667777888899990000";',
      ].join('\n');
      const findings = analyzeAst('src/keys.ts', code);
      const secrets = findings.filter((f) => f.ruleId === 'security/no-hardcoded-credentials');
      expect(secrets.length).toBeGreaterThanOrEqual(1);
      expect(secrets[0].cwe).toBe('CWE-798');
      expect(secrets[0].severity).toBe('critical');
    });

    it('precision: does NOT flag process.env, test fixtures, or placeholder tokens', () => {
      const benignCode = `
        const apiKey = process.env.STRIPE_API_KEY;
        const dummyToken = "example_placeholder_token_value";
      `;
      const findings = analyzeAst('src/safe-keys.ts', benignCode);
      const secrets = findings.filter((f) => f.ruleId === 'security/no-hardcoded-credentials');
      expect(secrets.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 7: Insecure Cookies & JWT Misuse (CWE-614 / CWE-347)
  // -------------------------------------------------------------------------
  describe('Rule 7: Insecure Cookies & JWT Misuse (CWE-614 / CWE-347)', () => {
    it('detects cookies missing httpOnly or sameSite attributes', () => {
      const code = `
        export function setAuthCookie(res: any, token: string) {
          res.cookie('auth_session', token, { path: '/' });
        }
      `;
      const findings = analyzeAst('src/cookies.ts', code);
      const cookie = findings.find((f) => f.ruleId === 'security/insecure-cookies-jwt');
      expect(cookie).toBeDefined();
      expect(cookie?.cwe).toBe('CWE-614');
      expect(cookie?.severity).toBe('warning');
    });

    it('detects jwt.verify without explicit algorithm specifications', () => {
      const code = `
        import jwt from 'jsonwebtoken';
        export function verify(token: string) {
          return jwt.verify(token, 'secret_key');
        }
      `;
      const findings = analyzeAst('src/jwt.ts', code);
      const jwtFinding = findings.find((f) => f.ruleId === 'security/insecure-cookies-jwt');
      expect(jwtFinding).toBeDefined();
      expect(jwtFinding?.cwe).toBe('CWE-347');
    });

    it('precision: does NOT flag properly configured cookies with httpOnly and sameSite', () => {
      const benignCode = `
        export function setSafeCookie(res: any, token: string) {
          res.cookie('auth_session', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            path: '/',
          });
        }
      `;
      const findings = analyzeAst('src/safe-cookies.ts', benignCode);
      const cookie = findings.filter((f) => f.ruleId === 'security/insecure-cookies-jwt');
      expect(cookie.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 8: Dangerously Set Inner HTML & eval (CWE-79)
  // -------------------------------------------------------------------------
  describe('Rule 8: Raw HTML Injection / XSS (CWE-79)', () => {
    it('detects un-sanitized dynamic markup passed to dangerouslySetInnerHTML', () => {
      const code = `
        export function Render({ userContent }: { userContent: string }) {
          return <div dangerouslySetInnerHTML={{ __html: userContent }} />;
        }
      `;
      const findings = analyzeAst('src/Render.tsx', code);
      const xss = findings.find((f) => f.ruleId === 'security/no-eval-xss');
      expect(xss).toBeDefined();
      expect(xss?.cwe).toBe('CWE-79');
      expect(xss?.severity).toBe('critical');
    });

    it('precision: does NOT flag sanitized markup or constant string literals', () => {
      const benignCode = `
        import DOMPurify from 'dompurify';
        export function SafeRender({ userContent }: { userContent: string }) {
          return (
            <div>
              <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />
              <div dangerouslySetInnerHTML={{ __html: "<strong>Static</strong>" }} />
            </div>
          );
        }
      `;
      const findings = analyzeAst('src/SafeRender.tsx', benignCode);
      const xss = findings.filter((f) => f.ruleId === 'security/no-eval-xss');
      expect(xss.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 9: Weak Crypto (CWE-327 / CWE-330)
  // -------------------------------------------------------------------------
  describe('Rule 9: Weak Cryptographic Primitives (CWE-327 / CWE-330)', () => {
    it('detects MD5 hash creation and Math.random token generation', () => {
      const code = `
        import crypto from 'crypto';
        export function hashPassword(pw: string) {
          return crypto.createHash('md5').update(pw).digest('hex');
        }
        export function generateResetToken() {
          const resetToken = Math.random().toString(36);
          return resetToken;
        }
      `;
      const findings = analyzeAst('src/crypto.ts', code);
      const weakCrypto = findings.filter((f) => f.ruleId === 'security/no-weak-crypto');
      expect(weakCrypto.length).toBeGreaterThanOrEqual(2);
      expect(weakCrypto[0].severity).toBe('critical');
    });

    it('precision: does NOT flag SHA-256 hashes or crypto.randomUUID()', () => {
      const benignCode = `
        import crypto from 'crypto';
        export function hashFile(content: Buffer) {
          return crypto.createHash('sha256').update(content).digest('hex');
        }
        export function generateSecureToken() {
          return crypto.randomUUID();
        }
      `;
      const findings = analyzeAst('src/safe-crypto.ts', benignCode);
      const weakCrypto = findings.filter((f) => f.ruleId === 'security/no-weak-crypto');
      expect(weakCrypto.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // High-Level Aggregation Test
  // -------------------------------------------------------------------------
  it('runAstSecurityAnalyzer aggregates findings and formats summary correctly', async () => {
    const code = `
      export async function route(req: Request) {
        const id = req.query.id;
        const q = "SELECT * FROM t WHERE id = '" + id + "'";
        const res = await fetch(q);
      }
    `;
    const res = await runAstSecurityAnalyzer(['app/api/test.ts'], code);
    expect(res.success).toBe(true);
    expect(res.totalFindings).toBeGreaterThanOrEqual(2);
    expect(res.errorsFound).toBeGreaterThanOrEqual(1);
    expect(res.summary).toContain('AST Static Security Analysis completed');
  });
});
