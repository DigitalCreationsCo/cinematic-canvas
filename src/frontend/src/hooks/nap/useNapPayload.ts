/**
 * useNapPayload — builds a `nap_payload` for injection into flow
 * execution requests.
 *
 * This is the primary bridge between the local NAP repository (read by
 * the frontend) and the remote backend (which receives the data as an
 * in-memory payload).
 *
 * ## Usage
 *
 * ```tsx
 * const { napPayload, isReady, error } = useNapPayload(folderId);
 *
 * // Later, when running the flow:
 * const postData = {
 *   inputs: { input_value: "hello" },
 *   nap_payload: napPayload,      // ← injected here
 * };
 * ```
 *
 * The backend's `BaseStateAwareComponent._get_nap_context()` reads
 * `self.graph.flow_state["nap_payload"]` where `nap_payload` is placed
 * by the `generate_flow_events` handler.
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRepositoryByFolder } from "@/controllers/API/queries/nap";
import type { Entity } from "@/platform/types";
import { usePlatformSafe } from "@/platform/usePlatform";
import type { NapPayload } from "@/types/nap";

// ─── Hook —────────────────────────────────────────────────────────────

/**
 * Build a `nap_payload` for injection into flow execution requests.
 *
 * @param folderId  The Portals folder (project) ID.
 * @param repoPath  **Required on desktop** — the absolute path to the
 *   local NAP repository root.  On web this is ignored.
 */
export function useNapPayload(folderId: string, repoPath?: string) {
  const { platform, runtime } = usePlatformSafe();
  const { data: repository, isLoading: repoLoading } = useRepositoryByFolder(
    { folderId },
    { enabled: !!folderId },
  );

  const [entities, setEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const cancelledRef = useRef(false);

  // Reset cancelled flag on mount.
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, [folderId]);

  // ── Load entities from local repo (desktop) or backend (web) ──
  useEffect(() => {
    let cancelled = false;

    async function loadEntities() {
      if (!repository) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const universe = repository.name ?? folderId;

        if (runtime === "desktop" && platform) {
          // Desktop: read from local filesystem via platform layer.
          // Caller MUST provide `repoPath` — the backend is a remote
          // server and cannot supply this.
          if (!repoPath) {
            console.error(
              "[useNapPayload] A repository path is required on desktop. " +
                "Pass `repoPath` to useNapPayload().  Skipping entity load.",
            );
            setEntities([]);
            return;
          }

          const allSummaries = await platform.listEntities(repoPath, universe);

          if (cancelled) return;

          const entityResults = await Promise.allSettled(
            allSummaries.map((s) => platform.readEntity(s.uri)),
          );

          if (cancelled) return;

          const loaded: Entity[] = [];
          for (const result of entityResults) {
            if (result.status === "fulfilled") {
              loaded.push(result.value);
            }
          }

          if (entityResults.some((r) => r.status === "rejected")) {
            const errors = entityResults
              .filter(
                (r): r is PromiseRejectedResult => r.status === "rejected",
              )
              .map((r) => r.reason?.message ?? String(r.reason));
            console.warn(
              "[useNapPayload] Failed to read some entities:",
              errors,
            );
          }

          setEntities(loaded);
        } else {
          // Web: entities must come from the backend API.
          console.warn(
            "[useNapPayload] Local entity reading not available on " +
              `"${runtime}". Payload will be empty.`,
          );
          setEntities([]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[useNapPayload] Failed to load entities:", msg);
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(msg));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadEntities();

    return () => {
      cancelled = true;
    };
  }, [folderId, repoPath, repository, runtime, platform]);

  // ── Build the payload dict ─────────────────────────────────────
  const napPayload: NapPayload | null = repository
    ? {
        universe: repository.name ?? folderId,
        entities: entities.map((e) => ({
          uri: e.uri,
          name: e.name,
          type: e.entity_type,
          version: e.version,
          properties: e.properties as Record<string, unknown>,
          references: e.references as Record<string, unknown>,
          representations: e.representations as Record<string, unknown>,
        })),
      }
    : null;

  /** Refresh by re-fetching all entities from the repository. */
  const refresh = useCallback(async () => {
    if (!repository) return;

    if (runtime !== "desktop" || !platform) {
      console.warn(
        "[useNapPayload] refresh() is only supported on desktop " +
          "(Tauri).  No entities were reloaded.",
      );
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      if (!repoPath) {
        throw new Error(
          "refresh() requires a repoPath, which was not provided to useNapPayload().",
        );
      }
      const resolvedPath = repoPath;
      const universe = repository.name ?? folderId;

      const allSummaries = await platform.listEntities(resolvedPath, universe);
      const results = await Promise.allSettled(
        allSummaries.map((s) => platform.readEntity(s.uri)),
      );

      const loaded: Entity[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          loaded.push(result.value);
        }
      }
      setEntities(loaded);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(err instanceof Error ? err : new Error(msg));
    } finally {
      setIsLoading(false);
    }
  }, [folderId, repoPath, repository, platform, runtime]);

  return {
    /** The constructed nap_payload, or null if no repo is linked. */
    napPayload,
    /** All loaded entities (raw platform Entity objects). */
    entities,
    /** True while loading. */
    isLoading: isLoading || repoLoading,
    /** Last error, if any. */
    error,
    /** Manually re-fetch entities from the repository. */
    refresh,
    /** True if a repository is linked to this folder. */
    hasRepository: !!repository,
  } as const;
}
