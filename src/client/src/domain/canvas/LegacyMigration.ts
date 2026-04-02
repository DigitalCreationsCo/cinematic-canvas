// src/client/src/domain/canvas/LegacyMigration.ts
// Converts existing project entity data (characters, locations, scenes) into
// a React Flow canvas DAG on first load.
//
// TRIGGER: Called when a project/world has entities but zero canvas_node_layouts rows.
// GUARANTEE: Purely additive — no existing DB data is modified. All existing entities
//            get a node. All scene.characterIds get character_in_scene edges.
//            All scene.locationId gets a location_in_scene edge. No data loss.

import { NodeFactory } from './NodeFactory.js';
import { computeAutoLayout } from './AutoLayout.js';
import { HANDLE_IDS } from './NodeTypes.js';
import type { CanvasNode, CanvasEdge } from './NodeTypes.js';

// Minimal subset of Project shape needed for layout generation
// (avoids circular import with full entity types)
interface MigrationCharacter { id: string; }
interface MigrationLocation  { id: string; }
interface MigrationScene {
  id: string;
  sceneIndex: number;
  characterIds?: string[];  // legacy shape — use scenesToCharacters join
  locationId?: string;
}
interface MigrationProject {
  id: string;
  characters?: MigrationCharacter[];
  locations?: MigrationLocation[];
  scenes?: MigrationScene[];
}

/**
 * Generates an initial canvas layout from project/world entity data.
 *
 * Call this exactly once per project/world — when canvas_node_layouts is empty.
 * The result should be persisted to canvas_node_layouts via upsertBatchCanvasLayouts.
 * After write, subsequent loads use the persisted layout and never call this again.
 *
 * @param project - minimal project shape (id + characters + locations + scenes)
 * @param contextId - projectId or worldId (same as project.id for project context)
 * @param contextType - 'project' | 'world'
 */
export function generateLayoutFromProject(
  project: MigrationProject,
  contextId: string,
  contextType: 'project' | 'world'
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodesAccum: CanvasNode[] = [];
  const edgesAccum: CanvasEdge[] = [];

  console.debug(`[LegacyMigration] Generating layout for contextId=${contextId} contextType=${contextType}`);

  // 1. Metadata node at (0, 0)
  nodesAccum.push(NodeFactory.createNode({
    type: 'metadata', entityId: project.id,
    contextId, contextType, posCanvas: { x: 0, y: 0 }, scope: contextType,
  }));

  // 2. Character nodes
  (project.characters ?? []).forEach((char, i) => {
    nodesAccum.push(NodeFactory.createNode({
      type: 'character', entityId: char.id,
      contextId, contextType, posCanvas: { x: i * 260, y: 200 }, scope: contextType,
    }));
  });

  // 3. Location nodes
  (project.locations ?? []).forEach((loc, i) => {
    nodesAccum.push(NodeFactory.createNode({
      type: 'location', entityId: loc.id,
      contextId, contextType, posCanvas: { x: i * 260, y: 400 }, scope: contextType,
    }));
  });

  // 4. Scene nodes + sequence edges + character/location edges
  const sortedScenes = [...(project.scenes ?? [])].sort(
    (a, b) => a.sceneIndex - b.sceneIndex
  );
  sortedScenes.forEach((scene, i) => {
    nodesAccum.push(NodeFactory.createNode({
      type: 'scene', entityId: scene.id,
      contextId, contextType, posCanvas: { x: i * 260, y: 800 }, scope: contextType,
    }));

    // Scene → Scene sequence edges (connector between consecutive scenes)
    if (i > 0) {
      edgesAccum.push(NodeFactory.createEdge({
        sourceId: sortedScenes[i - 1].id,
        targetId: scene.id,
        type: 'scene_sequence',
        sourceHandle: HANDLE_IDS.scene.frameOutput,
        targetHandle: HANDLE_IDS.scene.frameInput,
      }));
    }

    // Character → Scene edges
    (scene.characterIds ?? []).forEach((charId) => {
      edgesAccum.push(NodeFactory.createEdge({
        sourceId: charId,
        targetId: scene.id,
        type: 'character_in_scene',
        sourceHandle: HANDLE_IDS.character.source,
        targetHandle: HANDLE_IDS.scene.entityInput,
      }));
    });

    // Location → Scene edge
    if (scene.locationId) {
      edgesAccum.push(NodeFactory.createEdge({
        sourceId: scene.locationId,
        targetId: scene.id,
        type: 'location_in_scene',
        sourceHandle: HANDLE_IDS.location.source,
        targetHandle: HANDLE_IDS.scene.entityInput,
      }));
    }
  });

  // 5. Render node (after last scene)
  const lastScene = sortedScenes[sortedScenes.length - 1];
  if (lastScene) {
    nodesAccum.push(NodeFactory.createNode({
      type: 'render', entityId: `render_${contextId}`,
      contextId, contextType,
      posCanvas: { x: sortedScenes.length * 260, y: 800 },
      scope: contextType,
    }));
  }

  // 6. Apply auto-layout to finalize positions (overrides rough initial values above)
  const sceneIndexMap = new Map(
    sortedScenes.map((s, i) => [s.id, i])
  );
  const positionedNodes = computeAutoLayout(nodesAccum, sceneIndexMap);

  console.debug(
    `[LegacyMigration] Generated: ${positionedNodes.length} nodes, ${edgesAccum.length} edges`
  );

  return { nodes: positionedNodes, edges: edgesAccum };
}
