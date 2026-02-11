import { useEffect } from "react";
import { useStore } from "#/lib/store.js";
import { PipelineEvent } from "../../../shared/types/pipeline.types.js";
import { Project, Scene } from "../../../shared/types/index.js";
import { reviveDates } from "../../../shared/utils/utils.js";
import { requestFullState } from "#/lib/api.js";
import { v7 as uuidv7 } from "uuid";

interface UsePipelineEventsProps {
  projectId: string | null;
}

/**
 * Subscribes to the SSE stream for `projectId` and dispatches every incoming
 * event to the correct store action.
 *
 * Design rules:
 *   • This hook is a DISPATCHER only.It owns no derived state and does no
  * computation beyond the destructure needed to split a backend Scene into
    * its asset and non - asset parts.
 *   • Every store write goes through a named action.The hook never calls
  * useStore.getState() to READ and then feed a write — that pattern is a
    * stale - closure trap.The one exception is isHydrated, which is a
      * one - shot flag read inside the handler(see FULL_STATE).
 *   • Adding a new event type: add an interface to pipeline.types.ts, add it
  * to the PipelineEvent union, add a case here.
 */
export function usePipelineEvents({ projectId }: UsePipelineEventsProps) {
  const setProject = useStore((s) => s.setProject);
  const setIsHydrated = useStore((s) => s.setIsHydrated);
  const setIsLoading = useStore((s) => s.setIsLoading);
  const setError = useStore((s) => s.setError);
  const setConnectionStatus = useStore((s) => s.setConnectionStatus);
  const setProjectStatus = useStore((s) => s.setProjectStatus);
  const setSelectedSceneIndex = useStore((s) => s.setSelectedSceneIndex);
  const setInterruptState = useStore((s) => s.setInterruptState);
  const addMessage = useStore((s) => s.addMessage);

  const updateSceneClientSide = useStore((s) => s.updateSceneClientSide);
  const setAssets = useStore((s) => s.setAssets);
  const mergeAssetHistories = useStore((s) => s.mergeAssetHistories);
  const mergeAssets = useStore((s) => s.mergeAssets);

  useEffect(() => {
    if (!projectId) {
      setConnectionStatus("disconnected");
      setProject(null);
      setIsHydrated(false);
      setIsLoading(false);
      setError(null);
      return;
    }

    setError(null);
    setConnectionStatus("connecting");

    const eventSource = new EventSource(`/api/events/${projectId}`);

    eventSource.onopen = () => {
      setConnectionStatus("connected");
      setError(null);
      console.log({ projectId }, "Client connected");

      requestFullState({ projectId: projectId }).catch(error => console.error({ error }, "Failed to get project full state"));
    };

    eventSource.onmessage = (event) => {
      try {
        setIsLoading(true);

        const rawData = JSON.parse(event.data);
        const parsedEvent = reviveDates(rawData) as PipelineEvent;

        console.log({ event: parsedEvent }, `Client received event.`);

        switch (parsedEvent.type) {
          // ------------------------------------------------------------
          // WORKFLOW_STARTED
          // The server has accepted the pipeline request and is about to
          // begin.  It sends us the current project so we can paint
          // immediately.
          // ------------------------------------------------------------
          case "WORKFLOW_STARTED":
            if (parsedEvent.payload.project) {
              setProject(parsedEvent.payload.project);
              setIsLoading(false);
              setProjectStatus("analyzing");
            }
            break;

          // ------------------------------------------------------------
          // FULL_STATE
          // Complete project snapshot.  Fires on initial connect and on
          // reconnect.  setProject runs normalizeProjectAssets internally,
          // so every entity's .assets is extracted into store.assets
          // automatically.
          //
          // isHydrated is read via getState() here — NOT from the closure.
          // This keeps it out of the effect's dep array and prevents the
          // effect from tearing down and re-opening the EventSource the
          // moment hydration flips.
          // ------------------------------------------------------------
          case "FULL_STATE":
            setProject(parsedEvent.payload.project);
            const isHydrated = useStore.getState().isHydrated;
            if (!isHydrated) {
              setIsHydrated(true);
              setIsLoading(false);
              console.log(`Pipeline state hydrated for projectId: ${projectId}`);
            }
            break;

          case "SCENE_STARTED":
            updateSceneClientSide(parsedEvent.payload.scene.id, { status: "generating" });
            setSelectedSceneIndex(parsedEvent.payload.scene.sceneIndex);
            setProjectStatus("generating");
            break;

          // ------------------------------------------------------------
          // SCENE_UPDATE
          // The backend Scene includes .assets.  We destructure it out
          // here — this hook is the boundary between "raw SSE payload"
          // and "normalised store shape".
          //
          //   setAssets      → replaces the full registry for this scene
          //                    (correct here: SCENE_UPDATE carries the
          //                     complete scene state, not a delta).
          //   updateSceneClientSide → merges the non-asset fields into
          //                    project.scenes[i].
          // ------------------------------------------------------------
          case "SCENE_UPDATE": {
            const { sceneIds, updates } = parsedEvent.payload;

            for (let i = 0; i < updates.length; i++) {
              const update = updates[ i ];
              const { assets: sceneAssets, ...sceneWithoutAssets } = update;

              if (sceneAssets) {
                mergeAssets(update.id, sceneAssets!);
              }

              updateSceneClientSide(update.id, sceneWithoutAssets);
            }

            setSelectedSceneIndex(updates[ 0 ].sceneIndex);

            if (updates.some(u => u.status === "evaluating")) {
              setProjectStatus("evaluating");
            } else if (updates.some(u => u.status === "generating")) {
              setProjectStatus("generating");
            }
            break;
          }

          case "SCENE_SKIPPED":
          // TODO: wire status update when the UI needs it.
            break;

          // ------------------------------------------------------------
          // NEW_ASSETS_BATCH
          // A batch of AssetHistory for one key on one entity.  This is a
          // DELTA — mergeAssetHistories splices it into whatever is already
          // cached without touching sibling keys.
          //
          // ------------------------------------------------------------
          case "NEW_ASSETS_BATCH": {
            const histories = parsedEvent.payload;
            mergeAssetHistories(histories);
            break;
          }

          // ------------------------------------------------------------
          // LOG
          // Only surface errors, warnings, and the summary lines to
          // the message panel — everything else is noise.
          // ------------------------------------------------------------
          case "LOG":
            const { level, message, sceneId } = parsedEvent.payload;
            if (
              level === "error" ||
              level === "warn" ||
              message.includes("✓") ||
              message.includes("✗")
            ) {
              addMessage({
                id: uuidv7(),
                type: level,
                message,
                timestamp: new Date(parsedEvent.timestamp),
                sceneId
              });
            }
            break;

          case "WORKFLOW_COMPLETED":
            setProjectStatus("complete");
            setIsLoading(false);
            break;

          case "WORKFLOW_FAILED":
            setError(parsedEvent.payload.error);
            setProjectStatus("error");
            setIsLoading(false);
            addMessage({
              id: uuidv7(),
              type: "error",
              message: `Workflow failed: ${parsedEvent.payload.error}`,
              timestamp: new Date(parsedEvent.timestamp)
            });
            break;

          case "LLM_INTERVENTION_NEEDED":
            console.log("Intervention needed - received event:", parsedEvent.payload);
            setInterruptState({
              error: parsedEvent.payload.error,
              functionName: parsedEvent.payload.functionName,
              currentParams: parsedEvent.payload.params,
              type: parsedEvent.payload.type
            });
            setProjectStatus("paused");
            addMessage({
              id: uuidv7(),
              type: "warn",
              message: `Paused. Intervention required: ${parsedEvent.payload.error}`,
              timestamp: new Date(parsedEvent.timestamp)
            });
            break;
          default:
            console.log(`[Client] received unexpected event type: ${parsedEvent.type} `, JSON.stringify(parsedEvent));
            break;
        }
      } catch (e) {
        console.error("Failed to parse SSE event", e, event.data);
      }
    };

    eventSource.onerror = (err) => {
      console.error(`SSE Error for projectId ${projectId}:`, err);
      setConnectionStatus("disconnected");
      setError("Connection to event stream failed");
    };

    return () => {
      eventSource.close();
      setConnectionStatus("disconnected");
      console.log(`SSE Disconnected for projectId: ${projectId}`);
    };
  }, [
    projectId,
    setProject,
    setIsHydrated,
    setIsLoading,
    setError,
    setConnectionStatus,
    setProjectStatus,
    setSelectedSceneIndex,
    setInterruptState,
    addMessage,
    updateSceneClientSide,
    setAssets,
    mergeAssetHistories,
  ]);

  return {

  };
}
