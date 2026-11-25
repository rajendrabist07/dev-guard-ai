import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
    include: ['__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'e2e/**', '.next/**'],
    alias: {
      '@': path.resolve(__dirname, './'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'lib/**/*.ts',
      ],
      exclude: ['node_modules/**', '**/*.d.ts', '**/*.test.ts', 'lib/db/types.ts'],
      thresholds: {
        lines: 85,
      },
    },
  },
});
