// src/client/src/domain/canvas/NodeTypes.ts
// Type definitions for the CineNode canvas system.

import type { Node, Edge } from "@xyflow/react";
import type { AssetStatus } from "#shared/types/assets.types.js";
import { CanvasNodeType, EdgeType, ImageNodeFlag } from "#shared/types/canvas.types.js";
export * from "#shared/types/canvas.types.js";

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
    /** Start frame input — accepts images or scene end-frames. */
    frameInput: "scene_frame_input",
    /** Entity input — accepts characters, locations, audio, style refs, images. */
    entityInput: "scene_entity_input",
    /** End frame output — emits the scene's closing frame for continuity or to other nodes. */
    frameOutput: "scene_frame_output",
  },
  character: {
    /** Casts this character into connected scene(s). */
    source: "char_source",
  },
  location: {
    /** Sets this location as the backdrop for connected scene(s). */
    source: "loc_source",
  },
  audio: {
    /** Syncs this audio track to connected scene(s). */
    source: "audio_source",
  },
  image: {
    /** Applies this image to connected scene(s) or composite input(s). */
    source: "img_source",
    /** Accepts composite output — only rendered on composite_output images. */
    target: "img_target",
  },
  composite: {
    // Named inputs retained for the composite-weights UI.
    in1: "composite_in_1",
    in2: "composite_in_2",
    in3: "composite_in_3",
    /** Emits the merged composite result to connected scene(s). */
    source: "composite_source",
  },
  sceneCreator: {
    /** Accepts images as mood-board / style references for scene generation. */
    imageInput: "scene_creator_image_input",
    /** Emits created scenes to a connected scene node (for chaining). */
    output: "scene_creator_output",
  },
} as const;

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
  // Character → Scene (via entity input handle)
  {
    sourceNodeType: "character",
    sourceHandle: HANDLE_IDS.character.source,
    targetNodeType: "scene",
    targetHandle: HANDLE_IDS.scene.entityInput,
    edgeType: "character_in_scene",
  },
  // Location → Scene (via entity input handle)
  {
    sourceNodeType: "location",
    sourceHandle: HANDLE_IDS.location.source,
    targetNodeType: "scene",
    targetHandle: HANDLE_IDS.scene.entityInput,
    edgeType: "location_in_scene",
  },
  // Audio → Scene (via entity input handle)
  {
    sourceNodeType: "audio",
    sourceHandle: HANDLE_IDS.audio.source,
    targetNodeType: "scene",
    targetHandle: HANDLE_IDS.scene.entityInput,
    edgeType: "audio_sync",
  },
  // Image → Scene (style ref via entity input handle)
  {
    sourceNodeType: "image",
    sourceHandle: HANDLE_IDS.image.source,
    targetNodeType: "scene",
    targetHandle: HANDLE_IDS.scene.entityInput,
    edgeType: "style_applied",
  },
  // Image → Scene (start frame via frame input handle)
  {
    sourceNodeType: "image",
    sourceHandle: HANDLE_IDS.image.source,
    targetNodeType: "scene",
    targetHandle: HANDLE_IDS.scene.frameInput,
    edgeType: "frame_input",
    oneToOne: true,
  },
  // Scene → Scene (frame continuity: output frame → input frame)
  {
    sourceNodeType: "scene",
    sourceHandle: HANDLE_IDS.scene.frameOutput,
    targetNodeType: "scene",
    targetHandle: HANDLE_IDS.scene.frameInput,
    edgeType: "frame_input",
    oneToOne: true,
  },
  // Image → Composite input slot
  {
    sourceNodeType: "image",
    sourceHandle: HANDLE_IDS.image.source,
    targetNodeType: "composite",
    edgeType: "composite_input",
  },
  // Composite → Scene (via frame input handle)
  {
    sourceNodeType: "composite",
    sourceHandle: HANDLE_IDS.composite.source,
    targetNodeType: "scene",
    targetHandle: HANDLE_IDS.scene.frameInput,
    edgeType: "composite_output",
  },
  // Scene → Scene (legacy scene_sequence for backwards compat)
  {
    sourceNodeType: "scene",
    sourceHandle: HANDLE_IDS.scene.frameOutput,
    targetNodeType: "scene",
    targetHandle: HANDLE_IDS.scene.frameInput,
    edgeType: "scene_sequence",
    oneToOne: true,
  },
  // Image → SceneCreator (mood-board / style reference for multi-scene generation)
  // NOTE: "scene-creator" / scene_creator_* are cast because the shared
  // CanvasNodeType/EdgeType unions need a composite rebuild to pick them up.
  {
    sourceNodeType: "image" as CanvasNodeType,
    sourceHandle: HANDLE_IDS.image.source,
    targetNodeType: "scene-creator" as CanvasNodeType,
    targetHandle: HANDLE_IDS.sceneCreator.imageInput,
    edgeType: "scene_creator_image_input" as EdgeType,
  },
  // SceneCreator → Scene (output created scene frames)
  {
    sourceNodeType: "scene-creator" as CanvasNodeType,
    sourceHandle: HANDLE_IDS.sceneCreator.output,
    targetNodeType: "scene" as CanvasNodeType,
    targetHandle: HANDLE_IDS.scene.frameInput,
    edgeType: "scene_creator_output" as EdgeType,
  },
];

// ============================================================================
// EDGE STYLES
// ============================================================================

// Extended with scene-creator edge types (pending shared composite rebuild).
export const EDGE_STYLES: Record<EdgeType, React.CSSProperties> &
  Partial<Record<"scene_creator_image_input" | "scene_creator_output", React.CSSProperties>> = {
  scene_sequence: { stroke: "#6366f1", strokeWidth: 3, vectorEffect: "non-scaling-stroke" },
  character_in_scene: { stroke: "#f59e0b", strokeWidth: 3, vectorEffect: "non-scaling-stroke" },
  location_in_scene: { stroke: "#10b981", strokeWidth: 3, vectorEffect: "non-scaling-stroke" },
  style_applied: { stroke: "#8b5cf6", strokeWidth: 3, vectorEffect: "non-scaling-stroke" },
  audio_sync: { stroke: "#06b6d4", strokeWidth: 3, vectorEffect: "non-scaling-stroke" },
  composite_input: { stroke: "#f97316", strokeWidth: 3, vectorEffect: "non-scaling-stroke" },
  composite_output: { stroke: "#f97316", strokeWidth: 3, vectorEffect: "non-scaling-stroke" },
  lore_context: { stroke: "#94a3b8", strokeWidth: 3, vectorEffect: "non-scaling-stroke" },
  frame_input: { stroke: "#22d3ee", strokeWidth: 3, vectorEffect: "non-scaling-stroke" },
  scene_creator_image_input: { stroke: "#c9a55a", strokeWidth: 3, vectorEffect: "non-scaling-stroke" },
  scene_creator_output: { stroke: "#c9a55a", strokeWidth: 3, strokeDasharray: "6 3", vectorEffect: "non-scaling-stroke" },
};

export const PENDING_EDGE_STYLE: React.CSSProperties = {
  stroke: "#fbbf24",
  strokeWidth: 3,
  strokeDasharray: "2 6",
  strokeLinecap: "round",
  opacity: 0.9,
  vectorEffect: "non-scaling-stroke",
};

export const PENDING_REMOVE_EDGE_STYLE: React.CSSProperties = {
  stroke: "#ef4444",
  strokeWidth: 3,
  strokeDasharray: "2 6",
  strokeLinecap: "round",
  opacity: 0.75,
  vectorEffect: "non-scaling-stroke",
};

// ============================================================================
// NODE DATA SHAPE
// ============================================================================

export interface CanvasNodeData extends Record<string, unknown> {
  entityId: string;
  contextId: string;
  contextType: "project" | "world";
  nodeTypeFlag?: ImageNodeFlag;
  scope: "world" | "project";
  isLocked: boolean;
  pipelineSelected: boolean;
  collapsed: boolean;
  idxVersion: number;
  status?: string;
  progressMessage?: string;
  pendingChangeCount?: number;
  isSoftDeleted?: boolean;
  isPending?: boolean;
  audioSrc?: string;
  audioFileName?: string;
  audioTitle?: string;
  compositePrompt?: string;
  compositeWeights?: number[];
  compositeBlendModes?: ("normal" | "overlay" | "multiply" | "screen" | "soft-light")[];
}

export interface CanvasNode extends Node {
  type: CanvasNodeType;
  data: CanvasNodeData;
}

// ── Edge data ─────────────────────────────────────────────────────────────────

export interface CanvasEdgeData extends Record<string, unknown> {
  pending?: boolean;
  pendingType?: "add" | "remove";
  hidden?: boolean;
}

export interface CanvasEdge extends Edge {
  type?: EdgeType;
  data?: CanvasEdgeData;
}

// ============================================================================
// NODE STATUS STYLES
// ============================================================================

export const NODE_STATUS_STYLES: Record<AssetStatus, string> = {
  pending: "border-gray-600",
  generating: "border-blue-400 animate-pulse shadow-blue-400/50 shadow-lg",
  evaluating: "border-yellow-400 animate-pulse",
  complete: "border-green-500",
  error: "border-red-500 shadow-red-500/50 shadow-md",
};
