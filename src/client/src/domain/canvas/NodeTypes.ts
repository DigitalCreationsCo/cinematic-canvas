// src/client/src/domain/canvas/NodeTypes.ts
// Core type definitions for the CineNode canvas system.
// All canvas types live here — node types, edge types, edge styles, and
// the CanvasNodeData/CanvasNode shapes used throughout the application.

import type { Node, Edge } from '@xyflow/react';

// ============================================================================
// NODE TYPES
// ============================================================================

export type CanvasNodeType =
  | 'scene'       // video + start/end frames + cinematography
  | 'character'   // portrait + traits + state
  | 'location'    // image + attributes + weather/mood
  | 'image'       // polymorphic — see ImageNodeFlag
  | 'composite'   // multi-input image merge with prompt + mask
  | 'audio'       // track or segment reference
  | 'metadata'    // project/world root node
  | 'render';     // final video assembly output node

// The 'image' node type is polymorphic — same React component, different behavior per flag.
export type ImageNodeFlag =
  | 'style_reference'    // mood board / visual style guide
  | 'import'             // user-imported image
  | 'composite_output'   // output slot from a composite node
  | 'lore';              // world-building text/image (influences generation)

// ============================================================================
// EDGE TYPES
// ============================================================================

export type EdgeType =
  | 'scene_sequence'      // Scene → Scene (temporal order)
  | 'character_in_scene'  // Character → Scene
  | 'location_in_scene'   // Location → Scene
  | 'style_applied'       // Image(style_ref) → Scene | Character | Location
  | 'audio_sync'          // Audio → Scene
  | 'composite_input'     // Any → Composite
  | 'composite_output'    // Composite → Scene | Composite
  | 'lore_context';       // Image(lore) → Character | Location | Scene

export const EDGE_STYLES: Record<EdgeType, React.CSSProperties> = {
  scene_sequence: { stroke: '#6366f1', strokeWidth: 2 },
  character_in_scene: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '4 2' },
  location_in_scene: { stroke: '#10b981', strokeWidth: 1.5, strokeDasharray: '4 2' },
  style_applied: { stroke: '#8b5cf6', strokeWidth: 1, strokeDasharray: '2 4' },
  audio_sync: { stroke: '#06b6d4', strokeWidth: 1.5 },
  composite_input: { stroke: '#f97316', strokeWidth: 1.5 },
  composite_output: { stroke: '#f97316', strokeWidth: 2 },
  lore_context: { stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '6 3' },
};

// ============================================================================
// NODE DATA SHAPE
// ============================================================================

/**
 * CRITICAL RULE: Node `data` NEVER embeds entity attribute objects
 * (CharacterAttributes, SceneAttributes, etc.).
 *
 * Node components always read entity data from:
 *   useProjectStore.getState()[type][entityId] (or selectors)
 *
 * This keeps useNodeStore lean and avoids duplication. The node only carries
 * what is needed for canvas-level behavior (position, locked state, pipeline selection).
 */
export interface CanvasNodeData extends Record<string, unknown> {
  entityId: string;               // FK to char/scene/loc/etc in useProjectStore
  contextId: string;              // projectId or worldId
  contextType: 'project' | 'world';
  nodeTypeFlag?: ImageNodeFlag;   // only for 'image' nodes
  scope: 'world' | 'project';    // origin scope of the entity
  isLocked: boolean;              // true = world-scoped + user has no edit rights
  pipelineSelected: boolean;      // included in pipeline context when Run fires
  collapsed: boolean;
  idxVersion: number;             // OCC version from canvas_node_layouts
}

// Full node type extending React Flow's Node
export interface CanvasNode extends Node {
  type: CanvasNodeType;
  data: CanvasNodeData;
}

// Full edge type extending React Flow's Edge
export interface CanvasEdge extends Edge {
  type?: EdgeType;
}

// ============================================================================
// NODE STATUS STYLES
// ============================================================================

import type { AssetStatus } from '../../../../shared/types/assets.types.js';

export const NODE_STATUS_STYLES: Record<AssetStatus, string> = {
  pending: 'border-gray-600',
  generating: 'border-blue-400 animate-pulse shadow-blue-400/50 shadow-lg',
  evaluating: 'border-yellow-400 animate-pulse',
  complete: 'border-green-500',
  error: 'border-red-500 shadow-red-500/50 shadow-md',
};
