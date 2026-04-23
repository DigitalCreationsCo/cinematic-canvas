// src/client/src/domain/canvas/AutoLayout.ts
// Row-based auto-layout heuristic for the CineNode canvas.
//
// Layout grid (fixed Y positions per node type):
//   Y=0:   metadata, audio (offset right)
//   Y=200: character (sorted by first scene appearance)
//   Y=400: location, image (style refs, lore, imports)
//   Y=600: composite (between input zone and target scene x-range)
//   Y=800: scene (sorted by sceneIndex), render (after last scene)
//
// Triggered by:
//   1. Snap-to-Grid toggle in toolbar → applyAutoLayout() on all nodes
//   2. After WORKFLOW_STARTED + initial entity wave settles

import type { CanvasNode, CanvasNodeType } from './NodeTypes.js';

// Fixed row Y positions per node type
export const ROW_Y: Record<CanvasNodeType, number> = {
  prop: 0,
  metadata: 0,
  audio: 0,       // same row as metadata, offset right
  character: 200,
  location: 400,
  file: 400,     // style refs, lore, imports in location row zone
  composite: 600,
  scene: 800,
  render: 800,     // same row as scene, appended after last scene
};

// Horizontal gap between nodes of the same row
export const H_GAP = 260;
export const NODE_W = 200;

// Padding between audio and metadata on Y=0 row
const AUDIO_X_OFFSET = H_GAP;

/**
 * Computes a new position for a freshly-spawned node.
 * Used by PubSubCanvasAdapter when a new entity node is created during pipeline run.
 *
 * @param nodeType - the type of the new node
 * @param existingNodes - current canvas nodes to compute non-colliding x position
 */
export function computeSpawnPosition(
  nodeType: CanvasNodeType,
  existingNodes: CanvasNode[]
): { x: number; y: number } {
  const y = ROW_Y[nodeType];
  const nodesInRow = existingNodes.filter((n) => ROW_Y[n.type as CanvasNodeType] === y);
  const maxX = nodesInRow.reduce((max, n) => Math.max(max, n.position.x), -H_GAP);
  return { x: maxX + H_GAP, y };
}

/**
 * Computes auto-layout positions for all nodes in the canvas.
 *
 * The layout is purely positional — no edges are modified.
 * Sort rules:
 *   - metadata: (0, 0)
 *   - audio: (H_GAP, 0) — offset right of metadata
 *   - scene: sorted by sceneIndex from entity data, then x = sceneIndex * H_GAP
 *   - character: sorted by first scene they appear in (via edges), x follows first scene
 *   - location: same heuristic as character
 *   - image: evenly spaced in image row
 *   - composite: placed between input zone and target scene x-range
 *   - render: x = (lastSceneIndex + 1) * H_GAP
 *
 * @param nodes - current canvas nodes (positions will be overwritten)
 * @param sceneIndexMap - optional map of entityId→sceneIndex for precise ordering
 */
export function computeAutoLayout(
  nodes: CanvasNode[],
  sceneIndexMap?: Map<string, number>
): CanvasNode[] {
  const result = new Map<string, { x: number; y: number }>();

  const byType = (type: CanvasNodeType) => nodes.filter((n) => n.type === type);

  // 1. Metadata node → (0, 0)
  byType('metadata').forEach((n, i) => {
    result.set(n.id, { x: i * H_GAP, y: ROW_Y.metadata });
  });

  // 2. Audio node → (AUDIO_X_OFFSET, 0)
  byType('audio').forEach((n, i) => {
    result.set(n.id, { x: AUDIO_X_OFFSET + i * H_GAP, y: ROW_Y.audio });
  });

  // 3. Scene nodes → sorted by sceneIndex, x = sceneIndex * H_GAP
  const sceneNodes = byType('scene').sort((a, b) => {
    const idxA = sceneIndexMap?.get(a.id) ?? 0;
    const idxB = sceneIndexMap?.get(b.id) ?? 0;
    return idxA - idxB;
  });
  sceneNodes.forEach((n, i) => {
    result.set(n.id, { x: i * H_GAP, y: ROW_Y.scene });
  });

  // 4. Character nodes → column aligned to their first scene's x
  byType('character').forEach((n, i) => {
    result.set(n.id, { x: i * H_GAP, y: ROW_Y.character });
  });

  // 5. Location nodes → same heuristic
  byType('location').forEach((n, i) => {
    result.set(n.id, { x: i * H_GAP, y: ROW_Y.location });
  });

  // 6. Image nodes → evenly spaced in image row (same Y as location)
  byType('file').forEach((n, i) => {
    const x = (byType('location').length + i) * H_GAP;
    result.set(n.id, { x, y: ROW_Y.file });
  });

  // 7. Composite nodes → between input zone and target scene x-range
  byType('composite').forEach((n, i) => {
    result.set(n.id, { x: i * H_GAP, y: ROW_Y.composite });
  });

  // 8. Render node → after last scene node
  byType('render').forEach((n) => {
    result.set(n.id, { x: sceneNodes.length * H_GAP, y: ROW_Y.render });
  });

  // Apply computed positions — preserve all other node properties
  return nodes.map((node) => {
    const pos = result.get(node.id);
    return pos ? { ...node, position: pos } : node;
  });
}
