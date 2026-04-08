// src/client/src/hooks/usePipelineEvents.ts
import { EventSource } from 'eventsource';
import { useEffect } from 'react';
import { useAuth } from '#client/lib/auth-context.js';
import { PipelineEvent } from '../../../shared/types/pipeline.types.js';
import { reviveDates } from '../../../shared/utils/utils.js';
import { requestFullState } from '#client/lib/api.js';
import { supabase } from '#client/lib/supabase.js';
import { generateId } from "#shared/utils/id.js";
import { restoreUnsavedChanges } from '#client/store/middleware/entityDebounce.js';

import { useProjectStore } from '#client/store/useProjectStore.js';
import { useAssetStore } from '#client/store/useAssetStore.js';
import { usePipelineStore } from '#client/store/usePipelineStore.js';
import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';
import { api } from '#client/lib/routes.js';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { NodeFactory } from '#client/domain/canvas/NodeFactory.js';
import { useWorldStore } from '#client/store/useWorldStore.js';

interface UsePipelineEventsProps {
  projectId: string | null;
}

/** 
* usePipelineEvents manages the
* EventSource lifecycle (open, reconnect, auth headers, cleanup) and writes
* parsed events into useProjectStore / usePipelineStore / useCanvasUIStore.
* Passing null for demo mode disables the SSE connection entirely.
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

  useEffect(() => {
    if (!projectId || !activeTeamId || !user?.id) {
      setConnectionStatus('disconnected');
      setIsLoading(false);
      setError(null);
      return;
    }

    setError(null);
    setConnectionStatus('connecting');

    let isMounted = true;
    let eventSource: EventSource | null = null;

    const connectEventSource = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        const sseUrl = `/api${api.events.project(projectId)}`;
        console.debug('[usePipelineEvents] Connecting to SSE:', sseUrl);
        eventSource = new EventSource(sseUrl, {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              headers: {
                ...init.headers,
                ...(session?.access_token
                  ? { Authorization: `Bearer ${session.access_token}` }
                  : {}),
                ...(activeTeamId ? { 'x-team-id': activeTeamId } : {}),
              },
            }),
        });

        eventSource.onopen = handleOpen;
        eventSource.onmessage = handleMessage;
        eventSource.onerror = handleError;
      } catch (err) {
        console.error('Failed to setup SSE', err);
        if (isMounted) {
          setConnectionStatus('disconnected');
          setError('Failed to fetch authentication session for stream');
        }
      }
    };

    const handleOpen = () => {
      setConnectionStatus('connected');
      setError(null);
      console.debug('[usePipelineEvents] SSE connected, requesting full state for projectId:', projectId);
      // Restore any locally-backed-up unsaved changes from the previous session
      restoreUnsavedChanges({ projectId, worldId, teamId: activeTeamId, userId: user.id });
      requestFullState({ projectId, worldId: worldId ?? undefined, teamId: activeTeamId, userId: user.id })
        .then(() => console.debug('[usePipelineEvents] requestFullState succeeded'))
        .catch((e) => console.error('[usePipelineEvents] Failed to request full state', e));
    };

    const handleMessage = (event: any) => {
      try {
        setIsLoading(true);
        const raw = JSON.parse(event.data);
        const parsed = reviveDates(raw) as PipelineEvent;

        switch (parsed.type) {
          // ------------------------------------------------------------------
          // WORKFLOW_STARTED
          // ------------------------------------------------------------------
          case 'WORKFLOW_STARTED':
            if (parsed.payload.project) {
              hydrateProject(parsed.payload.project);
              setIsLoading(false);
              setStatus('analyzing');
            }
            break;

          // ------------------------------------------------------------------
          // FULL_STATE
          // isHydrated is read via getState() — NOT from the closure — to
          // prevent the effect from tearing down the EventSource when it flips.
          // ------------------------------------------------------------------
          case 'FULL_STATE':
            console.debug('[usePipelineEvents] Received FULL_STATE event', {
              hasProject: !!parsed.payload.project,
              scenesCount: parsed.payload.project?.scenes?.length ?? 0,
              charactersCount: parsed.payload.project?.characters?.length ?? 0,
              locationsCount: parsed.payload.project?.locations?.length ?? 0,
            });
            hydrateProject(parsed.payload.project);
            if (!useCanvasUIStore.getState().isHydrated) {
              setIsHydrated(true);
              setIsLoading(false);
            }
            break;

          // ------------------------------------------------------------------
          // SCENE_STARTED — pipeline signals a scene is beginning generation
          // ------------------------------------------------------------------
          case 'SCENE_STARTED':
            updateScene(parsed.payload.scene.id, { status: 'generating' });
            setSelectedSceneIndex(parsed.payload.scene.sceneIndex);
            setStatus('generating');
            break;

          // ------------------------------------------------------------------
          // ENTITY_UPDATED
          // Replaces the old SCENE_UPDATE. Handles scenes, characters, locations.
          // Strips assets from entity payload and routes them to useAssetStore.
          // ------------------------------------------------------------------
          case 'ENTITY_UPDATED': {
            const updates = parsed.payload;
            for (const update of updates) {
              const { assets, entity, id, entityType } = update;

              // Merge assets if included in the payload
              if (assets) {
                mergeAssets(id, assets);
              }

              // Update entity in the correct store map
              if (entityType === 'scene') {
                updateScene(id, entity as any);
                const scene = entity as any;
                if (scene.sceneIndex !== undefined) {
                  setSelectedSceneIndex(scene.sceneIndex);
                }
                if (scene.status === 'evaluating') setStatus('evaluating');
                else if (scene.status === 'generating') setStatus('generating');
              } else if (entityType === 'character') {
                updateCharacter(id, entity as any);
              } else if (entityType === 'location') {
                updateLocation(id, entity as any);
              }
            }
            break;
          }

          case "ENTITY_CREATED": {
            // payload is now Array<{ entityId, entityType, entity }>
            const items = parsed.payload;
            const projectStore = useProjectStore.getState();

            for (const { entityId, entityType, entity } of items) {
              // Split assets out of the entity data before storing in project store
              const { assets: entityAssets, ...entityData } = entity as any;
              if (entityAssets) {
                mergeAssets(entityId, entityAssets);
              }

              // Update the appropriate project store slice
              if (entityType === "scene") {
                projectStore.addScene(entityData as any);
              } else if (entityType === "character") {
                projectStore.addCharacter(entityData as any);
              } else if (entityType === "location") {
                projectStore.addLocation(entityData as any);
              }

              // Create a canvas node for scene / character / location entities.
              // File entities and other types do not get canvas nodes.
              if (entityType === "scene" || entityType === "character" || entityType === "location") {
                const canvasNode = NodeFactory.createNode({
                  type: entityType,
                  entityId,
                  contextId: projectId!,
                  contextType: "project",
                  posCanvas: {
                    x: 120 + Math.random() * 400,
                    y: 120 + Math.random() * 400,
                  },
                  scope: "project",
                });
                useNodeStore.getState().addNode(canvasNode);
              }
            }
            break;
          }

          // ------------------------------------------------------------------
          // NEW_ASSETS_BATCH — delta asset history merge
          // ------------------------------------------------------------------
          case 'NEW_ASSETS_BATCH':
            mergeAssetHistories(parsed.payload);
            break;

          case 'SCENE_SKIPPED':
            // Reserved for future UI wiring
            break;

          // ------------------------------------------------------------------
          // LOG — surface errors, warnings, and summary markers
          // ------------------------------------------------------------------
          case 'LOG': {
            const { level, message, sceneId } = parsed.payload;
            if (
              level === 'error' ||
              level === 'warn' ||
              message.includes('✓') ||
              message.includes('✗')
            ) {
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

          case 'WORKFLOW_COMPLETED':
            setStatus('complete');
            setIsLoading(false);
            break;

          case 'WORKFLOW_FAILED':
            setError(parsed.payload.error);
            setStatus('error');
            setIsLoading(false);
            pushEvent({
              id: generateId(),
              type: 'error',
              message: `Workflow failed: ${parsed.payload.error}`,
              timestamp: new Date(parsed.timestamp),
            });
            break;

          case 'LLM_INTERVENTION_NEEDED':
            setInterrupt({
              error: parsed.payload.error,
              functionName: parsed.payload.functionName,
              originalParams: parsed.payload.params ?? {},
              commandId: generateId(),
              jobType: parsed.payload.jobType ?? '',
              type: parsed.payload.type,
            });
            setStatus('paused');
            pushEvent({
              id: generateId(),
              type: 'warn',
              message: `Paused. Intervention required: ${parsed.payload.error}`,
              timestamp: new Date(parsed.timestamp),
            });
            break;

          case 'LAYOUT_UPDATED':
            window.dispatchEvent(new CustomEvent('canvas:layout-updated', {
              detail: {
                contextType: parsed.payload.contextType,
                contextId: parsed.payload.contextId,
                nodes: parsed.payload.nodes,
              }
            }));
            break;

          default:
            console.warn('[SSE] Unexpected event type:', (parsed as any).type);
        }
      } catch (e) {
        console.error('Failed to parse SSE event:', e, event.data);
      }
    };

    const handleError = (err: any) => {
      console.error(`SSE error for project ${projectId}:`, err);
      setConnectionStatus('disconnected');
      setError('Connection to event stream failed');
    };

    connectEventSource();

    return () => {
      isMounted = false;
      eventSource?.close();
      setConnectionStatus('disconnected');
    };
  }, [
    projectId,
    hydrateProject,
    updateScene, updateCharacter, updateLocation,
    setSelectedSceneIndex,
    mergeAssetHistories, mergeAssets,
    setStatus, setConnectionStatus, setInterrupt, pushEvent,
    setIsHydrated, setIsLoading, setError,
    activeTeamId,
  ]);

  return {};
}
