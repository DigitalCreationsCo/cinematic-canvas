// src/client/src/hooks/usePipelineEvents.ts
import { useEffect } from "react";
import { useAuth } from "#client/lib/auth-context.js";
import { PipelineEvent } from "#shared/types/pipeline.types.js";
import { JobEvent } from "#shared/types/job.types.js";
import { reviveDates } from "#shared/utils/utils.js";
import { requestFullState, fetchActiveJobsForProject, confirmEntityNode } from "#client/lib/api.js";
import { supabase } from "#client/lib/supabase.js";
import { generateId } from "#shared/utils/id.js";
import { restoreUnsavedChanges } from "#client/store/middleware/entityDebounce.js";
import { api } from "#client/lib/api.js";

import { useProjectStore } from "#client/store/useProjectStore.js";
import { useAssetStore } from "#client/store/useAssetStore.js";
import { usePipelineStore } from "#client/store/usePipelineStore.js";
import { useCanvasUIStore } from "#client/store/useCanvasUIStore.js";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { NodeFactory } from "#client/domain/canvas/NodeFactory.js";
import { useWorldStore } from "#client/store/useWorldStore.js";
import { useJobStore, ClientJob } from "#client/store/useJobStore.js";
import { Unsubscribable } from "@trpc/server/observable";
import { useChatStore } from "#client/store/useChatStore.js";

interface UsePipelineEventsProps {
  projectId: string | null;
}

/**
 * Manages the EventSource lifecycle (open, reconnect, auth
 * headers, cleanup) and writes parsed events into the various domain stores.
 * Passing null for demo mode disables the SSE connection entirely.
 *
 * Job events (JOB_DISPATCHED, JOB_STARTED, etc.) now arrive on the same SSE
 * stream as pipeline events and are routed to useJobStore.
 */
export function usePipelineEvents({ projectId }: UsePipelineEventsProps) {
  // --- project store ---
  const hydrateProject = useProjectStore((s) => s.hydrateProject);
  const updateScene = useProjectStore((s) => s.updateScene);
  const updateCharacter = useProjectStore((s) => s.updateCharacter);
  const updateLocation = useProjectStore((s) => s.updateLocation);
  const setSelectedSceneIndex = useProjectStore((s) => s.setSelectedSceneIndex);

  // --- world store ---
  const worldId = useWorldStore((s) => s.worldId) ?? undefined;

  // --- asset store ---
  const mergeAssetHistories = useAssetStore((s) => s.mergeAssetHistories);
  const mergeAssets = useAssetStore((s) => s.mergeAssets);

  // --- pipeline store ---
  const setStatus = usePipelineStore((s) => s.setStatus);
  const setConnectionStatus = usePipelineStore((s) => s.setConnectionStatus);
  const setInterrupt = usePipelineStore((s) => s.setInterrupt);
  const pushEvent = usePipelineStore((s) => s.pushEvent);

  // --- canvas UI store ---
  const setIsHydrated = useCanvasUIStore((s) => s.setIsHydrated);
  const setIsLoading = useCanvasUIStore((s) => s.setIsLoading);
  const setError = useCanvasUIStore((s) => s.setError);

  // --- auth ---
  const { activeTeamId, user } = useAuth();

  // ── NEW: job store actions ────────────────────────────────────────────────
  // Pull as stable store references — Zustand actions never change identity,
  // so these do not cause re-renders or effect re-runs.
  const hydrateJobs = useJobStore((s) => s.hydrateJobs);
  const upsertJob = useJobStore((s) => s.upsertJob);
  const setJobState = useJobStore((s) => s.setJobState);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!projectId || !activeTeamId || !user?.id) {
      setConnectionStatus("disconnected");
      setIsLoading(false);
      setError(null);
      return;
    }

    setError(null);
    setConnectionStatus("connecting");

    let isMounted = true;
    // let eventSource: EventSource | null = null;

    let sub: Unsubscribable | null = null;

    const connectEventSource = async () => {
      try {
        await supabase.auth.getSession();
        if (!isMounted) return;

        // const sseUrl = `/trpc/events.project?input=${encodeURIComponent(JSON.stringify({ projectId }))}`;
        // eventSource = new EventSource(sseUrl, {
        //   fetch: (input, init) =>
        //     fetch(input, {
        //       ...init,
        //       headers: {
        //         ...init.headers,
        //         ...(session?.access_token
        //           ? { Authorization: `Bearer ${session.access_token}` }
        //           : {}),
        //         ...(activeTeamId ? { 'x-team-id': activeTeamId } : {}),
        //       },
        //     }),
        // });

        sub = api.events!.project.subscribe(
          { projectId },
          {
            onStarted: () => handleOpen(),
            onData: (data) => handleMessage(data),
            onError: (err) => handleError(err),
          },
        );

        // eventSource.onopen = handleOpen;
        // eventSource.onmessage = handleMessage;
        // eventSource.onerror = handleError;
      } catch (err) {
        console.error("Failed to setup SSE", err);
        if (isMounted) {
          setConnectionStatus("disconnected");
          setError("Failed to fetch authentication session for stream");
        }
      }
    };

    const handleOpen = () => {
      setConnectionStatus("connected");
      setError(null);
      console.debug("[usePipelineEvents] SSE connected, requesting full state for projectId:", projectId);

      restoreUnsavedChanges({ projectId, worldId, teamId: activeTeamId, userId: user.id });

      // ── Request project data ───────────────────────────────────────────────
      requestFullState({ projectId })
        .then(() => console.debug("[usePipelineEvents] requestFullState succeeded"))
        .catch((e) => console.error("[usePipelineEvents] Failed to request full state", e));

      // ── NEW: Hydrate job store ─────────────────────────────────────────────
      // Fetch active (non-terminal) jobs independently of project state.
      // Jobs are on a separate SSE subscription and a separate REST endpoint
      // so they do not pollute the FULL_STATE payload.
      fetchActiveJobsForProject({ projectId })
        .then(({ jobs }) => {
          if (isMounted) {
            hydrateJobs(jobs as ClientJob[]);
            console.debug(`[usePipelineEvents] Hydrated ${jobs.length} active job(s).`);
          }
        })
        .catch((e) => console.error("[usePipelineEvents] Failed to fetch active jobs", e));
      // ─────────────────────────────────────────────────────────────────────
    };

    const handleMessage = (event: any) => {
      try {
        setIsLoading(true);
        const rawPayload =
          typeof event === "string" ? (event.startsWith("data: ") ? event.slice(6).trim() : event) : event;
        const raw = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
        // reviveDates is safe to call on both PipelineEvent and JobEvent shapes.
        const parsed = reviveDates(raw) as PipelineEvent | JobEvent;

        switch (parsed.type) {
          // ------------------------------------------------------------------
          // JOB EVENTS
          // These arrive on the same SSE connection as pipeline events because
          // the server opens a second (ephemeral) subscription to the job-events
          // topic for each SSE session, and writes to the same res stream.
          // ------------------------------------------------------------------

          case "JOB_DISPATCHED": {
            // A new job has been created. Insert it into the store so it appears
            // in the job list immediately, before the worker claims it.
            const jobEvent = parsed as JobEvent & { type: "JOB_DISPATCHED" };
            upsertJob(buildClientJobFromEvent(jobEvent, "PENDING"));
            break;
          }

          case "JOB_STARTED": {
            // Worker claimed the job — transition PENDING → RUNNING.
            setJobState(parsed.metadata.jobId, "RUNNING");
            break;
          }

          case "JOB_COMPLETED": {
            // Job finished successfully — keep in store for history display.
            setJobState(parsed.metadata.jobId, "COMPLETED");
            break;
          }

          case "JOB_FAILED": {
            const failedEvent = parsed as JobEvent & { type: "JOB_FAILED" };
            setJobState(failedEvent.metadata.jobId, "FAILED", failedEvent.error);
            break;
          }

          case "JOB_CANCELLED": {
            // Cancelled by user via REST or by STOP_PIPELINE cascade.
            setJobState(parsed.metadata.jobId, "CANCELLED");
            break;
          }

          // ------------------------------------------------------------------
          // PIPELINE EVENTS (unchanged from original)
          // ------------------------------------------------------------------

          case "WORKFLOW_STARTED":
            if (parsed.payload?.project) {
              hydrateProject(parsed.payload.project);
              setIsLoading(false);
              setStatus("analyzing");
            }
            break;

          case "FULL_STATE": {
            const fullState = parsed;
            console.debug("[usePipelineEvents] Received FULL_STATE event", {
              hasProject: !!fullState.payload?.project,
              scenesCount: fullState.payload?.project?.scenes?.length ?? 0,
              charactersCount: fullState.payload?.project?.characters?.length ?? 0,
              locationsCount: fullState.payload?.project?.locations?.length ?? 0,
            });
            hydrateProject(fullState.payload.project);
            if (!useCanvasUIStore.getState().isHydrated) {
              setIsHydrated(true);
              setIsLoading(false);
            }
            break;
          }

          case "SCENE_STARTED": {
            const sceneStarted = parsed;
            updateScene(sceneStarted.payload.scene.id, { status: "generating" });
            setSelectedSceneIndex(sceneStarted.payload.scene.sceneIndex);
            setStatus("generating");
            break;
          }

          case "ENTITY_UPDATED": {
            const updates = parsed.payload;
            for (const update of updates) {
              const { assets, entity, id, entityType } = update;
              if (assets) mergeAssets(id, assets);
              if (entityType === "scene") {
                updateScene(id, entity as any);
                const scene = entity as any;
                if (scene.sceneIndex !== undefined) setSelectedSceneIndex(scene.sceneIndex);
                if (scene.status === "evaluating") setStatus("evaluating");
                else if (scene.status === "generating") setStatus("generating");
              } else if (entityType === "character") {
                updateCharacter(id, entity as any);
              } else if (entityType === "location") {
                updateLocation(id, entity as any);
              }
            }
            const first = updates.shift();
            pushEvent({
              id: generateId(),
              type: "success",
              message: `Updated ${first?.entityType} ${first?.entity.name}${updates.length ? ` and ${updates.length} more` : ""}`,
              timestamp: new Date(parsed.timestamp),
            });
            break;
          }

          case "ENTITY_CREATED": {
            const items = parsed.payload;
            const projectStore = useProjectStore.getState();
            const nodeStore = useNodeStore.getState();
            for (const { entityId, entityType, entity, pendingId } of items) {
              const { assets: entityAssets, ...entityData } = entity as any;
              if (entityAssets) mergeAssets(entityId, entityAssets);
              if (entityType === "scene") projectStore.addScene(entityData as any);
              else if (entityType === "character") projectStore.addCharacter(entityData as any);
              else if (entityType === "location") projectStore.addLocation(entityData as any);
              if (entityType === "scene" || entityType === "character" || entityType === "location") {
                if (pendingId && nodeStore.nodes.find((n) => n.id === pendingId)) {
                  confirmEntityNode(pendingId, entityId, entityData);
                } else {
                  const canvasNode = NodeFactory.createNode({
                    type: entityType,
                    entityId,
                    contextId: projectId!,
                    contextType: "project",
                    posCanvas: { x: 120 + Math.random() * 400, y: 120 + Math.random() * 400 },
                    scope: "project",
                  });
                  nodeStore.addNode(canvasNode);
                }
              }
            }
            const first = items.shift();
            pushEvent({
              id: generateId(),
              type: "success",
              message: `Created ${first?.entityType} ${first?.entity.name}${items.length ? ` and ${items.length} more` : ""}`,
              timestamp: new Date(parsed.timestamp),
            });
            break;
          }

          case "NEW_ASSETS_BATCH":
            mergeAssetHistories(parsed.payload);
            break;

          case "SCENE_SKIPPED":
            break;

          case "LOG": {
            const logPayload = parsed.payload;
            const { level, message, sceneId } = logPayload;
            if (level === "error" || level === "warn" || message.includes("✓") || message.includes("✗")) {
              pushEvent({
                id: generateId(),
                type: level,
                message,
                timestamp: new Date(parsed.timestamp),
                sceneId,
              });
            }
            break;
          }

          case "WORKFLOW_COMPLETED":
            setStatus("complete");
            setIsLoading(false);
            break;

          case "WORKFLOW_FAILED": {
            const failedPayload = parsed.payload;
            setError(failedPayload.error);
            setStatus("error");
            setIsLoading(false);
            pushEvent({
              id: generateId(),
              type: "error",
              message: `Workflow failed: ${failedPayload.error}`,
              timestamp: new Date(parsed.timestamp),
            });
            break;
          }

          case "LLM_INTERVENTION_NEEDED": {
            const interventionPayload = parsed.payload;
            setInterrupt({
              error: interventionPayload.error,
              functionName: interventionPayload.functionName,
              originalParams: interventionPayload.params ?? {},
              commandId: generateId(),
              jobType: interventionPayload.jobType ?? "",
              type: interventionPayload.type,
            });
            setStatus("paused");
            pushEvent({
              id: generateId(),
              type: "warn",
              message: `Paused. Intervention required: ${interventionPayload.error}`,
              timestamp: new Date(parsed.timestamp),
            });
            break;
          }

          case "LAYOUT_UPDATED": {
            const layoutPayload = parsed.payload;
            window.dispatchEvent(
              new CustomEvent("canvas:layout-updated", {
                detail: {
                  contextType: layoutPayload.contextType,
                  contextId: layoutPayload.contextId,
                  nodes: layoutPayload.nodes,
                },
              }),
            );
            break;
          }

          case "CHAT_STREAM_CHUNK": {
            const chunkPayload = parsed.payload;
            if (chunkPayload.isComplete) {
              // Append the final chunk content to streamChunk before clearing
              // isStreaming so the UI doesn't flash a blank state before the
              // CHAT_MESSAGE event arrives with the full AI message.
              useChatStore.setState((state) => ({
                isStreaming: false,
                streamChunk: state.streamChunk + chunkPayload.chunk,
              }));
              // Process any messages that were queued while the agent was
              // streaming — they will be concatenated and sent as one message.
              setTimeout(() => {
                useChatStore.getState().processQueue?.();
              }, 0);
            } else {
              useChatStore.setState((state) => ({
                isStreaming: true,
                streamChunk: state.streamChunk + chunkPayload.chunk,
              }));
            }
            break;
          }

          case "CHAT_MESSAGE": {
            const msgPayload = parsed.payload;
            useChatStore.setState((state) => {
              // Dedup: skip if a message with this ID already exists (e.g. from
              // the optimistic tRPC response or a previous duplicate event).
              if (state.messages.some((m) => m.id === msgPayload.messageId)) {
                return state;
              }
              return {
                messages: [
                  ...state.messages,
                  {
                    id: msgPayload.messageId,
                    conversationId: msgPayload.conversationId,
                    userId: parsed.userId,
                    role: msgPayload.role,
                    content: msgPayload.content,
                    isComplete: true,
                    tokenCount: msgPayload.tokenCount || 0,
                    metadata: msgPayload.metadata || {},
                    createdAt: new Date(),
                  },
                ],
              };
            });
            break;
          }

          default:
            console.warn("[SSE] Unexpected event type:", parsed.type);
        }
      } catch (e) {
        console.error("Failed to parse SSE event:", e, event);
      }
    };

    const handleError = (err: any) => {
      console.error(`SSE error for project ${projectId}:`, err);
      setConnectionStatus("disconnected");
      setError("Connection to event stream failed");
    };

    connectEventSource();

    return () => {
      isMounted = false;
      sub?.unsubscribe();
      // eventSource?.close();
      setConnectionStatus("disconnected");
    };
  }, [
    projectId,
    hydrateProject,
    updateScene,
    updateCharacter,
    updateLocation,
    setSelectedSceneIndex,
    mergeAssetHistories,
    mergeAssets,
    setStatus,
    setConnectionStatus,
    setInterrupt,
    pushEvent,
    setIsHydrated,
    setIsLoading,
    setError,
    activeTeamId,
    // ── NEW ──────────────────────────────────────────────────────────────────
    // Zustand actions are stable — adding them does not cause extra re-runs.
    hydrateJobs,
    upsertJob,
    setJobState,
    // ─────────────────────────────────────────────────────────────────────────
  ]);

  return {};
}

/**
 * Constructs a ClientJob from a JOB_DISPATCHED event.
 * Called when a new job arrives via SSE before the REST hydration resolves,
 * or when a job is dispatched after the initial hydration.
 */
function buildClientJobFromEvent(
  event: Extract<JobEvent, { type: "JOB_DISPATCHED" }>,
  initialState: ClientJob["state"],
): ClientJob {
  const now = new Date();
  return {
    id: event.metadata.jobId,
    state: initialState,
    type: event.metadata.jobType,
    projectId: event.projectId,
    userId: event.userId,
    teamId: event.teamId,
    workflowId: event.metadata.workflowId ?? null,
    error: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Type guard ───────────────────────────────────────────────────────────────
// Narrow the union for the job-event cases in the switch.

type JobEventType = JobEvent["metadata"]["jobType"];
const JOB_EVENT_TYPES = new Set<string>([
  "JOB_DISPATCHED",
  "JOB_STARTED",
  "JOB_COMPLETED",
  "JOB_FAILED",
  "JOB_CANCELLED",
]);

/** True if the event type belongs to the JobEvent union. */
export function isJobEventType(type: string): type is JobEventType {
  return JOB_EVENT_TYPES.has(type);
}
