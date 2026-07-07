/**
 * useApplyFlowToCanvas — shared pipeline for loading a flow onto the canvas.
 *
 * Pipeline order:
 *   1. Ensure the NAP repository exists locally (desktop: platform layer;
 *      web: backend API).
 *   2. Deep-clone the flow and run `processFlows`.
 *   3. Set the current flow (triggers `resetFlow` in flowStore).
 *   4. Fit the view.
 *   5. Refresh model inputs.
 *
 * Error handling:  repository failures are **surfaced to the user** via
 * the alert store, not silently swallowed.  The flow still loads so the
 * user can view/edit it, but they are warned that NAP features may be
 * degraded.
 *
 * @module
 */

import { cloneDeep } from "lodash";
import { useCallback } from "react";
import { useEnsureRepositoryCloned } from "@/controllers/API/queries/nap";
import { useEnsureLocalRepository } from "@/hooks/nap/useEnsureLocalRepository";
import { useRefreshModelInputs } from "@/hooks/use-refresh-model-inputs";
import { usePlatformSafe } from "@/platform/usePlatform";
import useAlertStore from "@/stores/alertStore";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import type { FlowType } from "@/types/flow";
import { processFlows } from "@/utils/reactflowUtils";

// ─── Hook ─────────────────────────────────────────────────────────────

/**
 * Returns a function that applies a flow to the canvas.
 *
 * @param resolveRepoPath  Optional callback that maps a `folderId` to a
 *   local filesystem path + universe name.  Required on **desktop** where
 *   the platform layer needs to know where the repo lives.
 *
 *   Signature: `(folderId: string) => Promise<{ repoPath: string; universe: string }>`
 *
 *   On **web** this is unused — the backend manages repos.
 *
 * @example
 * ```ts
 * const applyFlow = useApplyFlowToCanvas(async (folderId) => ({
 *   repoPath: `/Users/me/Documents/nap-repos/my-project`,
 *   universe: "my-project",
 * }));
 * ```
 */
const useApplyFlowToCanvas = (
  resolveRepoPath?: (folderId: string) => Promise<{
    repoPath: string;
    universe: string;
  }>,
) => {
  const setCurrentFlow = useFlowsManagerStore((state) => state.setCurrentFlow);
  const { refreshAllModelInputs } = useRefreshModelInputs();

  // Platform-aware repository management.
  const { ensureCloned, isCloning } = useEnsureLocalRepository();
  const { mutateAsync: ensureRepoClonedRemote } = useEnsureRepositoryCloned();
  const { runtime } = usePlatformSafe();
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const setNoticeData = useAlertStore((state) => state.setNoticeData);

  const applyFlowToCanvas = useCallback(
    async (flow: FlowType) => {
      // ── Step 1: Ensure NAP repository is available ────────────
      if (flow.folder_id) {
        try {
          if (runtime === "desktop") {
            // Desktop: use the platform layer (Tauri) to check &
            // clone locally.
            let repoPath: string;
            let universe: string;

            if (resolveRepoPath) {
              const resolved = await resolveRepoPath(flow.folder_id);
              repoPath = resolved.repoPath;
              universe = resolved.universe;
            } else {
              // Fallback: derive path from folder ID.
              // In production, useDesktopRepoPath() or similar
              // should provide the actual path.
              repoPath = `/tmp/nap/${flow.folder_id}`;
              universe = flow.folder_id;
              console.warn(
                "[useApplyFlowToCanvas] No resolveRepoPath provided. " +
                  "Using fallback path. NAP entities may not load correctly.",
              );
            }

            await ensureCloned(repoPath, universe);
          } else {
            // Web / Test: delegate to backend API.
            await ensureRepoClonedRemote({ folderId: flow.folder_id });
          }
        } catch (err) {
          // Surface to the user — don't block flow loading, but
          // warn that NAP features may not work.
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            "[useApplyFlowToCanvas] Repository setup failed for folder",
            flow.folder_id,
            err,
          );

          setErrorData({
            title: "Narrative Repository Not Available",
            list: [
              `Could not prepare the narrative repository for this flow: ${message}`,
              "The flow will load, but narrative (NAP) entities may not be editable. " +
                "Try reopening the flow or checking your network connection.",
            ],
          });
        }
      }

      // ── Step 2: Deep-clone and process the flow ───────────────
      const clonedFlow = cloneDeep(flow);
      const hadNodes = (clonedFlow.data?.nodes?.length ?? 0) > 0;
      processFlows([clonedFlow]);

      // Safety check: if processFlows destroyed all nodes, abort.
      if (hadNodes && !clonedFlow.data?.nodes?.length) {
        const errorMsg =
          "Flow data was corrupted during processing — all nodes were removed. " +
          "This may indicate an incompatible flow format.";
        setErrorData({ title: "Flow Loading Error", list: [errorMsg] });
        throw new Error(errorMsg);
      }

      // ── Step 3: Set the current flow ──────────────────────────
      setCurrentFlow(clonedFlow);

      // ── Step 4: Fit the canvas view ───────────────────────────
      requestAnimationFrame(() => {
        useFlowStore.getState().reactFlowInstance?.fitView();
      });

      // ── Step 5: Refresh model inputs (best-effort async) ──────
      try {
        await refreshAllModelInputs({ silent: true });
      } catch (err) {
        console.error(
          "[useApplyFlowToCanvas] Failed to refresh model inputs:",
          err,
        );
        // Not user-visible — model inputs failing shouldn't block the UI.
      }
    },
    [
      setCurrentFlow,
      refreshAllModelInputs,
      ensureCloned,
      ensureRepoClonedRemote,
      runtime,
      resolveRepoPath,
      setErrorData,
    ],
  );

  return applyFlowToCanvas;
};

export default useApplyFlowToCanvas;
