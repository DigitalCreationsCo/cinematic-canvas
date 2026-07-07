/**
 * BaseStateAwareComponent — React counterpart of the Python
 * `px.components.narrative.base_state_aware.BaseStateAwareComponent`.
 *
 * ## Architecture (Gen3 — Stateless Payload Injection)
 *
 * The Python backend runs remotely and **cannot access the end user's
 * local filesystem**.  Narrative entity data must be read from the local
 * NAP repository by the **frontend** and injected into the execution
 * request as a `nap_payload`.
 *
 * ### Flow
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Frontend (this component)                                   │
 * │                                                             │
 * │  Desktop (Tauri):   platform.listEntities() + readEntity()  │
 * │  Web:               backend HTTP API (useRepositoryByFolder)│
 * │                                                             │
 * │  └──→ builds nap_payload ──→ injected into build request    │
 * │                              (inputs.nap_payload)           │
 * └─────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Backend (Python)                                            │
 * │                                                             │
 * │  BaseStateAwareComponent._get_nap_context()                 │
 * │    └── self.graph.flow_state["nap_payload"]                │
 * │                                                             │
 * │  Entities are read strictly from the in-memory payload,     │
 * │  never from the filesystem.                                 │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Usage
 *
 * ```tsx
 * <BaseStateAwareComponent folderId="abc-123">
 *   {({ entities, isLoading, error, buildNapPayload }) => (
 *     <MyCharacterList entities={entities} />
 *   )}
 * </BaseStateAwareComponent>
 * ```
 *
 * The `buildNapPayload()` helper produces the dict the backend's
 * `InjectedNapContext` expects:
 * ```json
 * {
 *   "universe": "my-project",
 *   "entities": [
 *     { "uri": "nap://...", "type": "character", "name": "...", ... }
 *   ]
 * }
 * ```
 *
 * @module
 */

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useRepositoryByFolder } from "@/controllers/API/queries/nap";
import { useEnsureLocalRepository } from "@/hooks/nap/useEnsureLocalRepository";
import { PlatformError, PlatformErrorCode } from "@/platform/errors";
import type { Entity, EntitySummary } from "@/platform/types";
import { usePlatformSafe } from "@/platform/usePlatform";
import useAlertStore from "@/stores/alertStore";
import type { NapPayload, NapRepositoryRead } from "@/types/nap";

// ─── Types (render-prop API — see @/types/nap for NapPayload types) ───

/** Render-prop argument for <BaseStateAwareComponent> children. */
export interface BaseStateAwareRenderProps {
  /** All entities loaded from the repository. */
  entities: Entity[];
  /** Summaries (uri + name + type) for quick listing. */
  summaries: EntitySummary[];
  /** True while entities are being loaded. */
  isLoading: boolean;
  /** Last error, if any. */
  error: Error | null;
  /** Build the `nap_payload` dict for injection into a build request. */
  buildNapPayload: () => NapPayload;
  /** Whether a repository is linked to this folder. */
  hasRepository: boolean;
  /** The repository detail, if available. */
  repository: NapRepositoryRead | null;
}

// ─── Props ────────────────────────────────────────────────────────────

interface BaseStateAwareComponentProps {
  /** The Portals folder (project) ID. */
  folderId: string;

  /**
   * The local filesystem path where the repository lives.
   *
   * **Required on desktop** — the platform layer needs a concrete path
   * to read entities.  The backend is a remote server and has no
   * knowledge of the user's filesystem, so it cannot provide this.
   *
   * On **web**, this is ignored (entities come from the backend API).
   */
  repoPath?: string;

  /**
   * The NAP universe name.
   * Defaults to the repository name, then to `folderId`.
   */
  universe?: string;

  /** Render-prop children receive the loaded entities and helpers. */
  children: (props: BaseStateAwareRenderProps) => ReactNode;

  /**
   * Optional filter: only load entities of these types
   * (e.g. `["character", "location"]`).  Default: all types.
   *
   * ⚠️ Pass a **stable reference** (useMemo / const) to avoid
   * unnecessary re-fetches on every render.
   */
  entityTypes?: string[];
}

// ─── Component ────────────────────────────────────────────────────────

export function BaseStateAwareComponent({
  folderId,
  repoPath: explicitRepoPath,
  universe: explicitUniverse,
  children,
  entityTypes,
}: BaseStateAwareComponentProps) {
  const { platform, runtime } = usePlatformSafe();
  const { ensureCloned } = useEnsureLocalRepository();
  const setErrorData = useAlertStore((state) => state.setErrorData);

  const [entities, setEntities] = useState<Entity[]>([]);
  const [summaries, setSummaries] = useState<EntitySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch the folder→repository mapping from the backend.
  const { data: repository, isLoading: repoLoading } = useRepositoryByFolder(
    { folderId },
    { enabled: !!folderId },
  );

  const hasRepository = !!repository;

  // ── Load entities from the repository ──────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadEntities() {
      if (!repository) {
        // No repo linked to this folder — nothing to load.
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // The repository path is a **frontend-only concern** — the
        // backend is a remote server with no visibility to the user's
        // local filesystem, so it can never return this.
        //
        // On desktop, the caller MUST provide `explicitRepoPath`.
        // There is no automatic fallback.
        const repoPath: string | undefined = explicitRepoPath;

        if (runtime === "desktop" && !repoPath) {
          throw new PlatformError(
            PlatformErrorCode.Other,
            "A local repository path is required on desktop. " +
              "Pass `repoPath` to <BaseStateAwareComponent>.",
            { folderId, errorId: "BASE_STATE_AWARE_NO_PATH" },
          );
        }

        const universe = explicitUniverse ?? repository.name ?? folderId;

        if (runtime === "desktop" && platform) {
          // repoPath is guaranteed defined here because we throw above
          // when it's missing on desktop.
          const localPath: string = repoPath!;

          // ── Desktop: read entities from the local filesystem ──
          // Step 1: Ensure the repo is cloned locally.
          await ensureCloned(localPath, universe);

          // Step 2: List all entities in the repository.
          const allSummaries = await platform.listEntities(localPath, universe);

          if (cancelled) return;
          setSummaries(allSummaries);

          // Step 3: Read each entity's full manifest.
          const entityResults = await Promise.allSettled(
            allSummaries
              .filter(
                (s) =>
                  !entityTypes ||
                  entityTypes.length === 0 ||
                  entityTypes.includes(s.entity_type),
              )
              .map((s) => platform.readEntity(s.uri)),
          );

          if (cancelled) return;

          const loaded: Entity[] = [];
          const errors: string[] = [];

          for (const result of entityResults) {
            if (result.status === "fulfilled") {
              loaded.push(result.value);
            } else {
              errors.push(result.reason?.message ?? String(result.reason));
            }
          }

          if (errors.length > 0) {
            console.warn(
              "[BaseStateAwareComponent] Failed to read some entities:",
              errors,
            );
          }

          setEntities(loaded);
        } else {
          // ── Web / Test: read entities from the backend API ────
          // The backend can only serve entities it already knows
          // about (e.g. previously published).  For web, we rely on
          // the backend's /nap/entities endpoint.
          console.warn(
            "[BaseStateAwareComponent] Local entity reading is not available on " +
              `"${runtime}". Available entities will be loaded from the backend.`,
          );
          // On web, entities come from the backend API and are not
          // read synchronously.  The component will have an empty
          // entities list unless the caller provides pre-fetched data.
          setEntities([]);
          setSummaries([]);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : `Failed to load entities: ${String(err)}`;
        console.error("[BaseStateAwareComponent]", errorMessage);

        if (!cancelled) {
          const error = err instanceof Error ? err : new Error(errorMessage);
          setError(error);
          setErrorData({
            title: "Failed to Load Narrative Entities",
            list: [errorMessage],
          });
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
  }, [
    folderId,
    repository,
    explicitRepoPath,
    explicitUniverse,
    runtime,
    platform,
    ensureCloned,
    entityTypes,
    setErrorData,
  ]);

  // ── Build the nap_payload for backend injection ────────────────
  const buildNapPayload = useCallback((): NapPayload => {
    const universe = explicitUniverse ?? repository?.name ?? folderId;

    return {
      universe,
      entities: entities.map((e) => ({
        uri: e.uri,
        name: e.name,
        type: e.entity_type,
        version: e.version,
        properties: e.properties as Record<string, unknown>,
        references: e.references as Record<string, unknown>,
        representations: e.representations as Record<string, unknown>,
      })),
    };
  }, [entities, explicitUniverse, repository?.name, folderId]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <>
      {children({
        entities,
        summaries,
        isLoading: isLoading || repoLoading,
        error,
        buildNapPayload,
        hasRepository,
        repository: repository ?? null,
      })}
    </>
  );
}

export default BaseStateAwareComponent;
