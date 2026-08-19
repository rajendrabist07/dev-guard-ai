import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
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
