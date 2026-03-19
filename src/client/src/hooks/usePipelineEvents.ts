// src/client/src/hooks/usePipelineEvents.ts
import { EventSource } from 'eventsource';
import { useEffect } from 'react';
import { useAuth } from '#/lib/auth-context.js';
import { PipelineEvent } from '../../../shared/types/pipeline.types.js';
import { reviveDates } from '../../../shared/utils/utils.js';
import { requestFullState } from '#/lib/api.js';
import { supabase } from '#/lib/supabase.js';
import { v7 as uuidv7 } from 'uuid';
import { restoreUnsavedChanges } from '#/store/middleware/entityDebounce.js';

import { useProjectStore } from '#/store/useProjectStore.js';
import { useAssetStore } from '#/store/useAssetStore.js';
import { usePipelineStore } from '#/store/usePipelineStore.js';
import { useCanvasUIStore } from '#/store/useCanvasUIStore.js';
import { api } from '#/lib/routes.js';

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
  const { activeTeamId } = useAuth();

  useEffect(() => {
    if (!projectId) {
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
      restoreUnsavedChanges(projectId);
      requestFullState({ projectId })
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

          case 'ENTITY_CREATED': {
            const { entityId, entityType, entity } = parsed.payload;
            const projectStore = useProjectStore.getState();
            if (entityType === 'scene') {
              projectStore.addScene(entity as any);
            } else if (entityType === 'character') {
              projectStore.addCharacter(entity as any);
            } else if (entityType === 'location') {
              projectStore.addLocation(entity as any);
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
                id: uuidv7(),
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
              id: uuidv7(),
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
              commandId: uuidv7(),
              jobType: parsed.payload.jobType ?? '',
              type: parsed.payload.type,
            });
            setStatus('paused');
            pushEvent({
              id: uuidv7(),
              type: 'warn',
              message: `Paused. Intervention required: ${parsed.payload.error}`,
              timestamp: new Date(parsed.timestamp),
            });
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
