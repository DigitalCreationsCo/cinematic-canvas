/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    testTimeout: 30000,
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      exclude: ["src/**/*.d.ts"],
    },
    projects: [
      {
        // ✅ No extends: true — fully explicit
        plugins: [tsconfigPaths()],
        test: {
          name: "client",
          globals: true,
          pool: "vmForks",
          isolate: true,
          environment: "happy-dom",
          testTimeout: 30000,
          include: ["src/client/**/*.test.{ts,tsx}", "src/client/**/*.spec.{ts,tsx}"],
          setupFiles: ["src/client/tests/setup-tests.ts"],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "backend",
          globals: true,
          pool: "forks",
          isolate: true,
          environment: "node",
          testTimeout: 30000,
          include: ["src/!(client)/**/*.test.{ts,tsx}", "src/!(client)/**/*.spec.{ts,tsx}", "scripts/**/*.test.ts"],
          setupFiles: ["src/tests/setup-tests.ts"],
        },
      },
    ],
  },
});
