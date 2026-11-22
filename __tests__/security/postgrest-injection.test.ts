import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('P0 Security — PostgREST Template-Literal Filter Injection Guard', () => {
  function scanDir(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.next' && file !== 'coverage' && file !== '.git') {
          scanDir(fullPath, fileList);
        }
      } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  it('fails if any code uses template literals inside .or() or .filter() PostgREST calls', () => {
    const appFiles = scanDir(path.resolve(process.cwd(), 'app'));
    const libFiles = scanDir(path.resolve(process.cwd(), 'lib'));
    const allFiles = [...appFiles, ...libFiles];

    const violations: { file: string; line: number; match: string }[] = [];

    // Pattern detecting .or(`...${...}...`) or .filter(`...${...}...`)
    const dangerousPattern = /\.(or|filter)\s*\(\s*`[^`]*\$\{[^}]*\}[^`]*`\s*\)/g;

    for (const filePath of allFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (dangerousPattern.test(line)) {
          violations.push({
            file: path.relative(process.cwd(), filePath),
            line: index + 1,
            match: line.trim(),
          });
        }
      });
    }

    expect(
      violations,
      `Found dangerous string interpolation in PostgREST query:\n${JSON.stringify(violations, null, 2)}`
    ).toEqual([]);
  });
});
