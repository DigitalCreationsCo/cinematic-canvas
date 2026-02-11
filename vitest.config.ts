/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/shared/lm/tests/**/*.test.ts',
      'src/shared/utils/tests/**/*.test.ts',
      'src/shared/services/tests/**/*.test.ts',
      'src/shared/prompts/tests/**/*.test.ts',
      'src/shared/agents/tests/**/*.test.ts'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/**/tests/**'
      ]
    },
    testTimeout: 30000
  }
});
