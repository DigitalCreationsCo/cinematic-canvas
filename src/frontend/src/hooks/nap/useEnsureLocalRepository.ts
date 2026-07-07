/**
 * useEnsureLocalRepository — platform-aware repository check + clone.
 *
 * **Desktop (Tauri):**
 *   1. Calls `platform.openRepository(path, universe)` to verify the
 *      local filesystem already has the repo.
 *   2. If that throws `NOT_FOUND`, calls `platform.initRepository(path,
 *      universe)` to create + clone the repository locally.
 *
 * **Web / Test:**
 *   Falls back to the backend HTTP API (which manages repos server-side).
 *   Any failure is surfaced to the user (toast / alert banner) rather than
 *   silently swallowed.
 *
 * Usage:
 * ```tsx
 * const { ensureCloned, isCloning, error } = useEnsureLocalRepository();
 * const result = await ensureCloned("/path/to/repo", "my-universe");
 * ```
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PlatformError, PlatformErrorCode } from "@/platform/errors";
import type { RepoInfo } from "@/platform/types";
import { usePlatformSafe } from "@/platform/usePlatform";

// ─── Error ID constants (mirrors constants/errorIds.ts convention) ───

const ERR_REPO_CHECK_FAILED = "NAP_ENSURE_REPO_CHECK_FAILED";
const ERR_REPO_INIT_FAILED = "NAP_ENSURE_REPO_INIT_FAILED";

// ─── Result type ──────────────────────────────────────────────────────

export interface EnsureLocalRepositoryResult {
  /** The resolved repository info (path, universe, branch, head). */
  repoInfo: RepoInfo;
  /** True if the repo was freshly initialised (cloned locally). */
  wasCloned: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────

export function useEnsureLocalRepository() {
  const { platform, runtime, isLoading: platformLoading } = usePlatformSafe();
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const cancelledRef = useRef(false);

  // Track mount state so async callbacks don't set React state after
  // the component unmounts (React 18 strict-mode warning).
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  /**
   * Ensure the narrative repository exists at `repoPath` for the given
   * `universe`.  On desktop this uses Tauri commands; on web it delegates
   * to the backend API.
   *
   * @param repoPath  Absolute filesystem path where the repo should live.
   * @param universe  NAP universe name (e.g. project slug).
   * @returns The repository info and whether it was freshly cloned.
   * @throws {PlatformError} if the operations fails (caller must surface).
   */
  const ensureCloned = useCallback(
    async (
      repoPath: string,
      universe: string,
    ): Promise<EnsureLocalRepositoryResult> => {
      setIsCloning(true);
      setError(null);

      try {
        // ── Desktop (Tauri) — local filesystem ──────────────────
        if (runtime === "desktop" && platform) {
          try {
            // Attempt 1: Open existing repository (fast path).
            const info = await platform.openRepository(repoPath, universe);
            if (!cancelledRef.current) setIsCloning(false);
            return { repoInfo: info, wasCloned: false };
          } catch (openErr) {
            if (
              openErr instanceof PlatformError &&
              openErr.code === PlatformErrorCode.NotFound
            ) {
              // Repo doesn't exist yet — initialise (create + clone).
              try {
                const info = await platform.initRepository(repoPath, universe);
                console.info(
                  "[useEnsureLocalRepository] Repository initialised at",
                  repoPath,
                );
                if (!cancelledRef.current) setIsCloning(false);
                return { repoInfo: info, wasCloned: true };
              } catch (initErr) {
                const msg =
                  initErr instanceof PlatformError
                    ? initErr.message
                    : `Failed to initialise repository at ${repoPath}: ${String(initErr)}`;
                const wrapped = new PlatformError(PlatformErrorCode.Repo, msg, {
                  repoPath,
                  universe,
                  errorId: ERR_REPO_INIT_FAILED,
                });
                if (!cancelledRef.current) setError(wrapped);
                throw wrapped;
              }
            }
            // Real error — propagate with context.
            const msg =
              openErr instanceof PlatformError
                ? openErr.message
                : `Failed to check repository at ${repoPath}: ${String(openErr)}`;
            const wrapped = new PlatformError(PlatformErrorCode.Repo, msg, {
              repoPath,
              universe,
              errorId: ERR_REPO_CHECK_FAILED,
            });
            if (!cancelledRef.current) setError(wrapped);
            throw wrapped;
          }
        }

        // ── Web / Test — backend API manages repos ──────────────
        console.warn(
          "[useEnsureLocalRepository] Local FS repo operations are not available on " +
            `"${runtime}". Ensure the backend has cloned the repository.`,
        );
        if (!cancelledRef.current) setIsCloning(false);
        // Return a stub RepoInfo.  The `current_branch` and `head`
        // values are placeholders — they are NOT accurate and should
        // not be used for VCS logic on web (the backend manages all
        // VCS operations server-side).
        return {
          repoInfo: {
            path: repoPath,
            universe,
            current_branch: "main" as const,
            head: "" as const,
          },
          wasCloned: false,
        };
      } catch (err) {
        if (!cancelledRef.current) setIsCloning(false);
        throw err;
      }
    },
    [platform, runtime],
  );

  return {
    /** Check (and clone if missing) a local repository. */
    ensureCloned,
    /** True while the clone operation is in-flight. */
    isCloning,
    /** Last error, if any. Reset on each call to `ensureCloned`. */
    error,
    /** True while the platform adapter is still initialising. */
    isLoading: platformLoading || isCloning,
  } as const;
}
