/**
 * Platform abstraction layer — single entry point for all exports.
 *
 * Usage:
 * ```tsx
 * // 1. Wrap your app
 * import { PlatformProvider } from "@/platform";
 *
 * <PlatformProvider>
 *   <App />
 * </PlatformProvider>
 *
 * // 2. Use the platform in any component
 * import { usePlatform } from "@/platform";
 *
 * const platform = usePlatform();
 * const info = await platform.openRepository("/path", "my-universe");
 * ```
 *
 * For components that need to handle loading/error states:
 * ```tsx
 * import { usePlatformSafe } from "@/platform";
 *
 * const { platform, isLoading, error } = usePlatformSafe();
 * ```
 */

// ─── Core types ───────────────────────────────────────────────────────

export { PlatformError, PlatformErrorCode } from "./errors";
export type { Platform } from "./interface";
export type {
  AssetImportResult,
  Change,
  Entity,
  EntitySummary,
  PullResult,
  RepoInfo,
  RepoStatus,
  Runtime,
} from "./types";

// ─── Context & Provider ───────────────────────────────────────────────

export type { PlatformContextValue } from "./PlatformContext";
export { PlatformProvider } from "./PlatformContext";

// ─── Hooks ────────────────────────────────────────────────────────────

export { usePlatform, usePlatformSafe } from "./usePlatform";

// ─── Runtime detection (for advanced use) ─────────────────────────────

export { detectRuntime } from "./runtime";

// ─── Factory functions (for tests / custom setup) ─────────────────────

export { createTestPlatform, resetTestPlatform } from "./test";
export { createWebPlatform } from "./web";
