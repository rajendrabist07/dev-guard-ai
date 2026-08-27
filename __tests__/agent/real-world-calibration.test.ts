import { describe, it, expect } from 'vitest';
import { runLinter } from '@/lib/agent/tools/lint';

describe('Real-World AST Linter Edge Cases & Calibration', () => {
  it('correctly ignores SQL words in standard TypeScript type definitions and CSS class names', async () => {
    const tsCode = `
      export type QueryStatus = 'pending' | 'active' | 'selected' | 'deleted';
      export const SELECT_DROPDOWN_CLASS = 'bg-slate-900 text-white rounded-md';
      export function getStatus(status: QueryStatus) {
        return status === 'selected' ? 'Active item' : 'Idle';
      }
    `;

    const result = await runLinter(['src/components/Status.tsx'], tsCode);
    const sqliFindings = result.items.filter((i) => i.ruleId === 'security/no-unsafe-sql-query');
    expect(sqliFindings.length).toBe(0);
  });

  it('correctly catches actual dynamic SQL string concatenations', async () => {
    const badCode = `
      const query = "SELECT * FROM users WHERE email = '" + req.body.email + "'";
      const rows = await db.query(query);
    `;

    const result = await runLinter(['src/api/auth.ts'], badCode);
    const sqliFindings = result.items.filter((i) => i.ruleId === 'security/no-unsafe-sql-query');
    expect(sqliFindings.length).toBe(1);
    expect(sqliFindings[0].severity).toBe('critical');
  });

  it('correctly allows fetch inside Promise.all / return statements without false unhandled warning', async () => {
    const cleanFetch = `
      export async function loadUserData(userId: string) {
        try {
          const res = await fetch(\`/api/users/\${userId}\`);
          return await res.json();
        } catch (err) {
          logger.error('Failed to load user', err);
          return null;
        }
      }
    `;

    const result = await runLinter(['src/lib/api.ts'], cleanFetch);
    const promiseFindings = result.items.filter((i) => i.ruleId === 'promise/catch-or-return');
    expect(promiseFindings.length).toBe(0);
  });
});
