/**
 * React Context and Provider for the Platform abstraction.
 *
 * The provider detects the runtime at mount time and lazily loads the
 * correct adapter:
 *   - **Desktop**: dynamically imports `platform/desktop/index.ts`
 *     (which depends on `@tauri-apps/api`).
 *   - **Web / Test**: statically imports the platform module.
 *
 * ⚠️  Web builds never execute the dynamic import path for desktop,
 *     so `@tauri-apps/api` is never loaded in a browser.
 *
 * @remarks `runtimeOverride` is only honoured on the **first render**.
 * Changing it after mount has no effect.  In tests, mount a new
 * `PlatformProvider` with the desired override instead of mutating
 * an existing one.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Platform } from "./interface";
import { detectRuntime } from "./runtime";
import { createTestPlatform } from "./test";
import type { Runtime } from "./types";
import { createWebPlatform } from "./web";

// ─── Context value ────────────────────────────────────────────────────

export interface PlatformContextValue {
  /** The resolved platform adapter.  `null` while loading (desktop only). */
  platform: Platform | null;

  /** The detected runtime.  Available immediately (no async needed). */
  runtime: Runtime;

  /** True while the desktop adapter is being loaded. */
  isLoading: boolean;

  /** Error if platform initialisation failed. */
  error: Error | null;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────

interface PlatformProviderProps {
  children: ReactNode;

  /**
   * Optional override for the runtime.  Use in tests and Storybook
   * to inject a specific platform without relying on runtime detection.
   *
   * @remarks Only read on first render.  To change the runtime, unmount
   * and remount the provider (e.g. via React `key` prop).
   */
  runtimeOverride?: Runtime;
}

export function PlatformProvider({
  children,
  runtimeOverride,
}: PlatformProviderProps) {
  // Capture runtime on first render — subsequent changes are ignored
  // (see docstring above).
  const [runtime] = useState(() => runtimeOverride ?? detectRuntime());
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const initRef = useRef(false);

  const initPlatform = useCallback(async () => {
    if (initRef.current) return;
    initRef.current = true;

    try {
      switch (runtime) {
        case "desktop": {
          // Dynamic import — only resolves inside a Tauri webview.
          const { createDesktopPlatform } = await import("./desktop");
          setPlatform(createDesktopPlatform());
          break;
        }
        case "test": {
          setPlatform(createTestPlatform());
          break;
        }
        case "web":
        default: {
          setPlatform(createWebPlatform());
          break;
        }
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : err != null
            ? String(err)
            : "Unknown error";
      setError(
        new Error(`Failed to initialise platform (${runtime}): ${message}`),
      );
    }
  }, [runtime]);

  useEffect(() => {
    initPlatform();
  }, [initPlatform]);

  const value: PlatformContextValue = {
    platform,
    runtime,
    isLoading: platform === null && error === null,
    error,
  };

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}

export default PlatformContext;
