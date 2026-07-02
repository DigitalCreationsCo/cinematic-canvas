/**
 * Hook to access the current platform adapter.
 *
 * Must be called inside a `<PlatformProvider>`.
 *
 * Returns the fully-initialised `Platform` object.  Throws if the
 * provider is missing, if the platform is still loading, or if
 * initialisation failed.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const platform = usePlatform();
 *   const handleSave = async () => {
 *     await platform.commit("/path/to/repo", "my message");
 *   };
 *   // ...
 * }
 * ```
 */

import { useContext } from "react";
import type { Platform } from "./interface";
import PlatformContext from "./PlatformContext";

/**
 * Access the platform adapter.
 *
 * **Throws** if called outside `<PlatformProvider>`, while the platform
 * is still loading, or if it failed to initialise.
 */
export function usePlatform(): Platform {
  const ctx = useContext(PlatformContext);

  if (!ctx) {
    throw new Error(
      "usePlatform() must be used within a <PlatformProvider>. " +
        "Wrap your component tree with <PlatformProvider>.",
    );
  }

  if (ctx.isLoading) {
    throw new Error(
      "Platform is still initialising. " +
        "Ensure the provider has finished loading before calling usePlatform(). " +
        "Consider using usePlatformSafe() for a non-throwing alternative.",
    );
  }

  if (ctx.error) {
    throw new Error(`Platform initialisation failed: ${ctx.error.message}`);
  }

  // Guaranteed non-null because isLoading=false and error=null
  return ctx.platform!;
}

/**
 * Safe variant that returns `null` instead of throwing while the
 * platform is loading or errored.
 *
 * Use this when you need to handle the loading/error states
 * gracefully in your component.
 */
export function usePlatformSafe(): {
  platform: Platform | null;
  isLoading: boolean;
  error: Error | null;
  runtime: import("./types").Runtime;
} {
  const ctx = useContext(PlatformContext);

  if (!ctx) {
    throw new Error(
      "usePlatformSafe() must be used within a <PlatformProvider>.",
    );
  }

  return {
    platform: ctx.platform,
    isLoading: ctx.isLoading,
    error: ctx.error,
    runtime: ctx.runtime,
  };
}
