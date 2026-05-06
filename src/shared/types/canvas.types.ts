// Core node type definitions without dependencies

import { projects } from "#shared/db/schema.js";

// ============================================================================
// NODE TYPES
// ============================================================================

export type CanvasNodeType =
  | "scene" // video + start/end frames + cinematography
  | "character" // portrait + traits + state
  | "location" // image + attributes + weather/mood
  | "image" // polymorphic — see ImageNodeFlag
  | "composite" // multi-input image merge with prompt + mask
  | "audio" // track or segment reference
  | "metadata" // project/world root node
  | "prop" // project/world prop
  | "render"; // final video assembly output node

export type ImageNodeFlag = "style_reference" | "import" | "composite_output" | "lore";

// ============================================================================
// EDGE TYPES
// ============================================================================

export type EdgeType =
  | "scene_sequence" // Scene → Scene (frame continuity, one-to-one)
  | "character_in_scene" // Character → Scene
  | "location_in_scene" // Location  → Scene
  | "style_applied" // Image → Scene (style reference)
  | "audio_sync" // Audio → Scene
  | "composite_input" // Image → Composite
  | "composite_output" // Composite → Scene
  | "lore_context" // Image(lore) → Scene
  | "frame_input"; // Image/Scene → Scene (start/end frame - creates new asset version)

export type EdgeVisibilityMode = "all" | "none";
export type PendingChangeType = "add" | "remove";

export interface PendingChange {
  /** Matches the CanvasEdge.id this change is associated with. */
  edgeId: string;
  changeType: PendingChangeType;
  sourceId: string;
  targetId: string;
  sourceHandle?: string;
  targetHandle?: string;
  sourceType?: CanvasNodeType;
  targetType?: CanvasNodeType;
  edgeType: EdgeType;
  timestamp: number;
  jsonUiMetadata?: Record<string, unknown>;
}
