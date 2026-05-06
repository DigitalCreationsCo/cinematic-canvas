// vitest.debug.config.ts
import baseConfig from "./vitest.config";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      testTimeout: 0,
      hookTimeout: 0,
      pool: "forks",
      fileParallelism: false,
      maxWorkers: 1,
      isolate: true,
    },
  }),
);
