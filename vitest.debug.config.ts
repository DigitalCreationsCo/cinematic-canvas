// vitest.debug.config.ts
//
// Debug-optimized Vitest configuration.
//
// KEY DESIGN DECISIONS:
//
// 1. pool: "threads" — Worker threads share the V8 inspector with the main
//    process. Unlike "forks" (child_process.fork()), there's no separate V8
//    instance to lose when a worker finishes. The --inspect=9229 flag on the
//    main process covers all worker threads automatically.
//
// 2. isolate: false — Per Vitest docs: "In watch mode you can keep the
//    debugger open during test re-runs by using --isolate false." With
//    isolate: true, Vitest destroys and recreates the worker context between
//    test files, killing the inspector target and causing the debugger to
//    detach. With isolate: false, the same worker is reused across re-runs.
//
// 3. testTimeout: 0 / hookTimeout: 0 — Prevents Vitest from killing tests
//    while paused at a breakpoint.
//
// 4. fileParallelism: false + maxWorkers: 1 — Forces all tests into a single
//    worker thread so there's exactly one inspector target to attach to.
//
// PREVIOUS BUG (signal 9 / SIGKILL):
// The old config used pool: "forks" + isolate: true. When the debugger was
// attached to the forked child's inspector and tests completed, Vitest would
// tear down the child (isolate: true). The child, held open by the inspector
// connection, wouldn't exit gracefully, so Vitest escalated to SIGKILL (signal 9).

import baseConfig from "./vitest.config";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      testTimeout: 0,
      hookTimeout: 0,
      pool: "threads",
      fileParallelism: false,
      maxWorkers: 1,
      isolate: false,
    },
  }),
);
