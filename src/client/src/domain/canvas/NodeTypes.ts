// src/client/src/domain/canvas/NodeTypes.ts
// Core type definitions for the CineNode canvas system.

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

export type ImageNodeFlag =
  | 'style_reference'
  | 'import'
  | 'composite_output'
  | 'lore';

// ============================================================================
// HANDLE IDs — CONSOLIDATED
// ============================================================================
// Each node type exposes at most ONE target handle and ONE source handle.
// This gives users a clean, predictable interaction surface.
//
// SCENE is the only exception: it has a single target that accepts everything
// (characters, locations, images, audio, AND scene-continuity) and a single
// source that emits the scene's end-frame for continuity.
//
// COMPOSITE keeps named inputs (in1/in2/in3) because the weights UI requires
// knowing WHICH input slot each image occupies.
//
// WHY SINGLE HANDLES:
//   Multiple labelled handles per node were confusing to creative users who
//   should not have to distinguish "start_frame input" from "entities input".
//   The edge type is resolved from the SOURCE node type via CONNECTION_RULES,
//   not from which handle was targeted.
//
// RULE: Every <Handle> component MUST use these constants — no raw strings.

export const HANDLE_IDS = {
  scene: {
    /** Single input — accepts characters, locations, images, audio, and scene end-frame. */
    target: 'scene_target',
    /** Single output — emits the scene's closing frame for continuity. */
    source: 'scene_source',
  },
  character: {
    /** Casts this character into connected scene(s). */
    source: 'char_source',
  },
  location: {
    /** Sets this location as the backdrop for connected scene(s). */
    source: 'loc_source',
  },
  audio: {
    /** Syncs this audio track to connected scene(s). */
    source: 'audio_source',
  },
  image: {
    /** Applies this image to connected scene(s) or composite input(s). */
    source: 'img_source',
    /** Accepts composite output — only rendered on composite_output images. */
    target: 'img_target',
  },
  composite: {
    // Named inputs retained for the composite-weights UI.
    in1: 'composite_in_1',
    in2: 'composite_in_2',
    in3: 'composite_in_3',
    /** Emits the merged composite result to connected scene(s). */
    source: 'composite_source',
  },
} as const;

// ============================================================================
// EDGE TYPES
// ============================================================================

export type EdgeType =
  | 'scene_sequence'      // Scene → Scene (frame continuity, one-to-one)
  | 'character_in_scene'  // Character → Scene
  | 'location_in_scene'   // Location  → Scene
  | 'style_applied'       // Image → Scene
  | 'audio_sync'          // Audio → Scene
  | 'composite_input'     // Image → Composite
  | 'composite_output'    // Composite → Scene
  | 'lore_context';       // Image(lore) → Scene

// ============================================================================
// CONNECTION RULES
// ============================================================================
// Single source-of-truth for valid connections.
// oneToOne: enforced by edge-TYPE check in useCanvasConnections (a target node
// may have at most one incoming edge of this type regardless of which handle
// was used, since all connections share the single scene_target handle).

export interface ConnectionRule {
  sourceNodeType: CanvasNodeType;
  sourceHandle?: string;
  targetNodeType: CanvasNodeType;
  targetHandle?: string;
  edgeType: EdgeType;
  /**
   * When true, useCanvasConnections will remove any existing edge of the
   * same EdgeType pointing at the same target before adding the new one.
   * This is checked by edge type — NOT by target handle — because all
   * scene connections share the single scene_target handle.
   */
  oneToOne?: boolean;
}

export const CONNECTION_RULES: ConnectionRule[] = [
  // Character → Scene
  {
    sourceNodeType: 'character',
    sourceHandle: HANDLE_IDS.character.source,
    targetNodeType: 'scene',
    targetHandle: HANDLE_IDS.scene.target,
    edgeType: 'character_in_scene',
  },
  // Location → Scene
  {
    sourceNodeType: 'location',
    sourceHandle: HANDLE_IDS.location.source,
    targetNodeType: 'scene',
    targetHandle: HANDLE_IDS.scene.target,
    edgeType: 'location_in_scene',
  },
  // Audio → Scene
  {
    sourceNodeType: 'audio',
    sourceHandle: HANDLE_IDS.audio.source,
    targetNodeType: 'scene',
    targetHandle: HANDLE_IDS.scene.target,
    edgeType: 'audio_sync',
  },
  // Image → Scene (style ref, lore, import, composite output)
  {
    sourceNodeType: 'image',
    sourceHandle: HANDLE_IDS.image.source,
    targetNodeType: 'scene',
    targetHandle: HANDLE_IDS.scene.target,
    edgeType: 'style_applied',
  },
  // Image → Composite input slot
  {
    sourceNodeType: 'image',
    sourceHandle: HANDLE_IDS.image.source,
    targetNodeType: 'composite',
    edgeType: 'composite_input',
  },
  // Composite → Scene
  {
    sourceNodeType: 'composite',
    sourceHandle: HANDLE_IDS.composite.source,
    targetNodeType: 'scene',
    targetHandle: HANDLE_IDS.scene.target,
    edgeType: 'composite_output',
  },
  // Scene → Scene (frame continuity — strictly one-to-one per target scene)
  {
    sourceNodeType: 'scene',
    sourceHandle: HANDLE_IDS.scene.source,
    targetNodeType: 'scene',
    targetHandle: HANDLE_IDS.scene.target,
    edgeType: 'scene_sequence',
    oneToOne: true,
  },
];

// ============================================================================
// EDGE STYLES
// ============================================================================

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

/** Pending-add: amber dashed overlay. */
export const PENDING_EDGE_STYLE: React.CSSProperties = {
  stroke: '#fbbf24',
  strokeWidth: 2,
  strokeDasharray: '6 3',
  opacity: 0.85,
};

/** Pending-remove: red dashed. */
export const PENDING_REMOVE_EDGE_STYLE: React.CSSProperties = {
  stroke: '#ef4444',
  strokeWidth: 2,
  strokeDasharray: '6 3',
  opacity: 0.75,
};

// ============================================================================
// NODE DATA SHAPE
// ============================================================================

export interface CanvasNodeData extends Record<string, unknown> {
  entityId: string;
  contextId: string;
  contextType: 'project' | 'world';
  nodeTypeFlag?: ImageNodeFlag;
  scope: 'world' | 'project';
  isLocked: boolean;
  pipelineSelected: boolean;
  collapsed: boolean;
  idxVersion: number;
  status?: string;
  progressMessage?: string;
  /** Count of unsaved pending changes touching this node. Drives the pending badge. */
  pendingChangeCount?: number;
  /** Set by NodeGraph when the node is soft-deleted. */
  isSoftDeleted?: boolean;
}

export interface CanvasNode extends Node {
  type: CanvasNodeType;
  data: CanvasNodeData;
}

// ── Edge data ─────────────────────────────────────────────────────────────────

export interface CanvasEdgeData extends Record<string, unknown> {
  pending?: boolean;
  pendingType?: 'add' | 'remove';
}

export interface CanvasEdge extends Edge {
  type?: EdgeType;
  data?: CanvasEdgeData;
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