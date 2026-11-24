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
    alias: {
      '@': path.resolve(__dirname, './'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'lib/agent/**/*.ts',
        'lib/github/**/*.ts',
        'lib/badge/**/*.ts',
        'lib/reports/**/*.ts',
      ],
      exclude: ['node_modules/**', '**/*.d.ts', '**/*.test.ts'],
    },
  },
});
