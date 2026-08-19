import { describe, it, expect } from 'vitest';
import { runLinter } from '@/lib/agent/tools/lint';

describe('AST Static Code Linter (lib/agent/tools/lint.ts)', () => {
  it('detects SQL injection vulnerabilities in string concatenations', async () => {
    const code = `
      export async function getUser(req: Request) {
        const userId = req.url.split('?id=')[1];
        const query = "SELECT * FROM users WHERE id = '" + userId + "'";
        return await db.query(query);
      }
    `;

    const result = await runLinter(['app/api/user/route.ts'], code);

    expect(result.errorsFound).toBeGreaterThanOrEqual(1);
    const sqli = result.items.find((i) => i.ruleId === 'security/no-unsafe-sql-query');
    expect(sqli).toBeDefined();
    expect(sqli?.severity).toBe('critical');
    expect(sqli?.suggestedFix).toContain('$1');
  });

  it('detects unhandled async Promise rejections with missing try/catch', async () => {
    const code = `
      export async function syncData() {
        const res = await fetch('https://api.external.com/data');
        return res.json();
      }
    `;

    const result = await runLinter(['lib/sync.ts'], code);
    const unhandled = result.items.find((i) => i.ruleId === 'promise/catch-or-return');
    expect(unhandled).toBeDefined();
    expect(unhandled?.severity).toBe('warning');
    expect(unhandled?.suggestedFix).toContain('try {');
  });

  it('detects dangerous innerHTML and eval execution (XSS)', async () => {
    const code = `
      export function RenderMarkdown({ htmlContent }: { htmlContent: string }) {
        return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />;
      }
    `;

    const result = await runLinter(['components/Markdown.tsx'], code);
    const xss = result.items.find((i) => i.ruleId === 'security/no-eval-xss');
    expect(xss).toBeDefined();
    expect(xss?.severity).toBe('critical');
  });

  it('detects hardcoded secret tokens in source code', async () => {
    const code = `
      const authSecretToken = "api_key = 'sample_secret_token_1234567890'";
    `;

    const result = await runLinter(['lib/stripe.ts'], code);
    const secret = result.items.find((i) => i.ruleId === 'security/no-hardcoded-credentials');
    expect(secret).toBeDefined();
    expect(secret?.severity).toBe('critical');
  });

  it('detects unused declared variables', async () => {
    const code = `
      const unusedVariableAlpha = 42;
    `;

    const result = await runLinter(['lib/unused.ts'], code);
    const unused = result.items.find((i) => i.ruleId === 'eslint/no-unused-vars');
    expect(unused).toBeDefined();
    expect(unused?.severity).toBe('warning');
  });

  it('passes cleanly when no security patterns are matched', async () => {
    const safeCode = `
      export function add(a: number, b: number): number {
        return a + b;
      }
    `;

    const result = await runLinter(['lib/math.ts'], safeCode);
    expect(result.errorsFound).toBe(0);
    expect(result.warningsFound).toBe(0);
    expect(result.items.length).toBe(0);
  });
});
