import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: [ 'text', 'json', 'html' ],
      reportsDirectory: './coverage',
    },
    include: [ 'src/**/*.test.ts' ],
    env: {
      POSTGRES_URL: 'postgres://user:password@localhost:5432/testdb',
    },
  },
});
