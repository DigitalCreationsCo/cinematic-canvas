/**
 * Runtime detection — the single place we determine which platform
 * environment the app is running in.
 *
 * Detection strategies:
 *   - **desktop**: `window.__TAURI__` is set by Tauri's webview
 *     when the app runs inside a Tauri window.
 *   - **test**: `process.env.NODE_ENV === 'test'` (Jest / Vitest).
 *   - **web**: everything else (browser, Vite dev server, etc.).
 *
 * Once the runtime is determined, it is injected via React Context
 * so that no other module needs to repeat this check.
 */

import type { Runtime } from "./types";

/**
 * Detect the current runtime environment.
 *
 * Called once at startup to select the correct Platform implementation.
 */
export function detectRuntime(): Runtime {
  if (
    typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).__TAURI__
  ) {
    return "desktop";
  }

  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return "test";
  }

  return "web";
}
