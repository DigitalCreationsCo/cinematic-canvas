// src/client/src/domain/canvas/PubSubCanvasAdapter.ts
// Maps PubSub pipeline events → canvas store updates.
//
// RULE: This adapter NEVER constructs node objects directly.
//   It always delegates to NodeFactory.createNode() / NodeFactory.createEdge().
//
// DESIGN: Each event handler is isolated and non-blocking.
//   A failure in one handler does NOT block other handlers (try/catch per handler).
//   LLM_INTERVENTION_NEEDED only marks the affected node error — other parallel
//   in-flight jobs continue running.

import { v7 as uuidv7 } from 'uuid';
import { NodeFactory } from './NodeFactory.js';
import { computeSpawnPosition } from './AutoLayout.js';
import type {
  CanvasNodeType,
  WorkflowStartedEvent,
  SceneStartedEvent,
  EntityUpdatedEvent,
  NewAssetsBatchEvent,
  LlmInterventionNeededEvent,
  WorkflowFailedEvent,
  LogEvent,
  SceneCompletedEvent,
} from '../../../../shared/types/index.js';

// Lazy store imports to avoid circular dependency during module init.
// Stores are always initialized by the time canvas routes mount.
const getNodeStore = () => import('#/store/useNodeStore.js').then(m => m.useNodeStore);
const getProjectStore = () => import('#/store/useProjectStore.js').then(m => m.useProjectStore);
const getAssetStore = () => import('#/store/useAssetStore.js').then(m => m.useAssetStore);
const getPipelineStore = () => import('#/store/usePipelineStore.js').then(m => m.usePipelineStore);
const getCanvasUIStore = () => import('#/store/useCanvasUIStore.js').then(m => m.useCanvasUIStore);

/**
 * Determines which entity bucket an entityId belongs to by checking all stores.
 * Returns 'scene' | 'character' | 'location' | null.
 */
async function resolveEntityType(entityId: string): Promise<CanvasNodeType | null> {
  const projectStore = await getProjectStore();
  const { characters, locations, scenes } = projectStore.getState();
  if (scenes.has(entityId)) return 'scene';
  if (characters.has(entityId)) return 'character';
  if (locations.has(entityId)) return 'location';
  return null;
}

/**
 * Initializes the PubSub → Canvas adapter for a given project.
 *
 * Call this once after the canvas mounts, passing the project's pubsub client.
 * Returns a teardown function that removes all listeners.
 *
 * @param projectId - the active project's ID
 * @param pubSubClient - the project's PubSub event emitter (existing hook)
 */
export function initPubSubCanvasAdapter(
  projectId: string,
  pubSubClient: {
    on: (event: string, handler: (payload: any) => void) => void;
    off: (event: string, handler: (payload: any) => void) => void;
  }
): () => void {
  console.debug(`[PubSubCanvasAdapter] Initializing for projectId=${projectId}`);

  const handlers: Record<string, (payload: any) => void> = {};

  function registerHandler(event: string, handler: (payload: any) => void) {
    handlers[event] = handler;
    pubSubClient.on(event, handler);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // WORKFLOW_STARTED
  // Hydrate entity store from project snapshot.
  // ──────────────────────────────────────────────────────────────────────────
  registerHandler('WORKFLOW_STARTED', async (event: WorkflowStartedEvent) => {
    try {
      const ProjectStore = await getProjectStore();
      const PipelineStore = await getPipelineStore();
      ProjectStore.getState().hydrateProject(event.payload.project);
      PipelineStore.getState().setStatus('analyzing');
    } catch (err) {
      console.error('[PubSubCanvasAdapter] WORKFLOW_STARTED handler error:', err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE_STARTED
  // Set scene status to generating.
  // ──────────────────────────────────────────────────────────────────────────
  registerHandler('SCENE_STARTED', async (event: SceneStartedEvent) => {
    try {
      const ProjectStore = await getProjectStore();
      ProjectStore.getState().updateScene(event.payload.scene.id, {
        status: 'generating', progressMessage: 'Generating...',
      });
    } catch (err) {
      console.error('[PubSubCanvasAdapter] SCENE_STARTED handler error:', err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCENE_COMPLETED
  // Set scene status to complete.
  // ──────────────────────────────────────────────────────────────────────────
  registerHandler('SCENE_COMPLETED', async (event: SceneCompletedEvent) => {
    try {
      const ProjectStore = await getProjectStore();
      ProjectStore.getState().updateScene(event.payload.sceneId, {
        status: 'complete',
        progressMessage: 'Generated',
      });
    } catch (err) {
      console.error('[PubSubCanvasAdapter] SCENE_COMPLETED handler error:', err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ENTITY_UPDATED
  // Update entity data (scenes, characters, locations) and assets.
  // ──────────────────────────────────────────────────────────────────────────
  registerHandler('ENTITY_UPDATED', async (event: EntityUpdatedEvent) => {
    try {
      const [ProjectStore, AssetStore] = await Promise.all([
        getProjectStore(), getAssetStore()
      ]);

      event.payload.forEach((update) => {
        const { id, entityType, entity, assets } = update;

        if (assets) {
          AssetStore.getState().mergeAssets(id, assets);
        }

        if (entityType === 'scene') {
          ProjectStore.getState().updateScene(id, entity as any);
        } else if (entityType === 'character') {
          ProjectStore.getState().updateCharacter(id, entity as any);
        } else if (entityType === 'location') {
          ProjectStore.getState().updateLocation(id, entity as any);
        }
      });
    } catch (err) {
      console.error('[PubSubCanvasAdapter] ENTITY_UPDATED handler error:', err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // LLM_INTERVENTION_NEEDED
  // Mark only the affected node as error; all other parallel jobs continue.
  // ──────────────────────────────────────────────────────────────────────────
  registerHandler('LLM_INTERVENTION_NEEDED', async (event: LlmInterventionNeededEvent) => {
    try {
      const [ProjectStore, CanvasUIStore, PipelineStore] = await Promise.all([
        getProjectStore(), getCanvasUIStore(), getPipelineStore()
      ]);
      const affectedSceneId = event.payload.params?.sceneId as string | undefined;
      if (affectedSceneId) {
        ProjectStore.getState().updateScene(affectedSceneId, {
          status: 'error', progressMessage: event.payload.error,
        });
        // Auto-select the affected node to open right sidebar for intervention
        CanvasUIStore.getState().selectNode(affectedSceneId);
      }
      PipelineStore.getState().setInterrupt(event.payload as any);
      // NOTE: We do NOT set global status to error — other in-flight jobs continue.
    } catch (err) {
      console.error('[PubSubCanvasAdapter] LLM_INTERVENTION_NEEDED handler error:', err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WORKFLOW_COMPLETED
  // Mark all scene nodes complete; set pipeline status to complete.
  // ──────────────────────────────────────────────────────────────────────────
  registerHandler('WORKFLOW_COMPLETED', async () => {
    try {
      const [ProjectStore, PipelineStore] = await Promise.all([
        getProjectStore(), getPipelineStore()
      ]);
      PipelineStore.getState().setStatus('complete');
      const { scenes } = ProjectStore.getState();
      scenes.forEach((scene, id) =>
        ProjectStore.getState().updateScene(id, { status: 'complete' })
      );
    } catch (err) {
      console.error('[PubSubCanvasAdapter] WORKFLOW_COMPLETED handler error:', err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // WORKFLOW_FAILED
  // Set pipeline to error state; push event to log.
  // ──────────────────────────────────────────────────────────────────────────
  registerHandler('WORKFLOW_FAILED', async (event: WorkflowFailedEvent) => {
    try {
      const PipelineStore = await getPipelineStore();
      PipelineStore.getState().setStatus('error');
      PipelineStore.getState().pushEvent({
        id: uuidv7(), type: 'error',
        message: event.payload.error, timestamp: new Date(),
      });
    } catch (err) {
      console.error('[PubSubCanvasAdapter] WORKFLOW_FAILED handler error:', err);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // LOG
  // Push to pipeline event log (left sidebar).
  // ──────────────────────────────────────────────────────────────────────────
  registerHandler('LOG', async (event: LogEvent) => {
    try {
      const PipelineStore = await getPipelineStore();
      PipelineStore.getState().pushEvent({
        id: uuidv7(), type: event.payload.level,
        message: event.payload.message, timestamp: new Date(),
        sceneId: event.payload.sceneId,
      });
    } catch (err) {
      console.error('[PubSubCanvasAdapter] LOG handler error:', err);
    }
  });

  // Return teardown so canvas unmount can clean up listeners
  return () => {
    console.debug(`[PubSubCanvasAdapter] Tearing down for projectId=${projectId}`);
    Object.entries(handlers).forEach(([event, handler]) => {
      pubSubClient.off(event, handler);
    });
  };
}
