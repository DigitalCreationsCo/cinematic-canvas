// shared/types/storyboard.types.ts
import { z } from "zod";
import { ProjectMetadata, ProjectMetadataAttributes } from "#shared/types/metadata.types.js";
import { CharacterAttributes } from "#shared/types/character.types.js";
import { LocationAttributes } from "#shared/types/location.types.js";
import { SceneAttributes } from "#shared/types/scene.types.js";
import { CharacterBase, LocationBase, PropBase, SceneBase } from "#shared/types/workflow.types.js";

// ============================================================================
// STORYBOARD
// ============================================================================

export const InitialStoryboardContext = z.object({
  metadata: ProjectMetadataAttributes,
  characters: z.array(CharacterAttributes).default([]),
  locations: z.array(LocationAttributes).default([]),
});
export type InitialStoryboardContext = z.infer<typeof InitialStoryboardContext>;

export const SceneBatch = z.object({
  scenes: z.array(SceneAttributes),
});
export type SceneBatch = z.infer<typeof SceneBatch>;

export const StoryboardAttributes = z.object({
  metadata: ProjectMetadataAttributes,
  characters: z.array(CharacterAttributes).default([]),
  locations: z.array(LocationAttributes).default([]),
  scenes: z.array(SceneAttributes).default([]),
});
export type StoryboardAttributes = z.infer<typeof StoryboardAttributes>;

export const Storyboard = z
  .object({
    metadata: ProjectMetadata,
    characters: z.array(CharacterBase).default([]),
    locations: z.array(LocationBase).default([]),
    scenes: z.array(SceneBase).default([]),
  })
  .readonly()
  .describe("The immutable project snapshot");
export type Storyboard = z.infer<typeof Storyboard>;

// ============================================================================
// CONDENSED ENTITY TYPES
//
// Minimal identity-plus-context shape for each entity in the live storyboard.
// These intentionally omit all generative/cinematic fields — the storyboard is
// a human-readable index of the project, not a data source for generation.
//
// description is sourced from the entity's best "description" versioned asset
// at write time by StoryboardManager. It is a snapshot; authoritative data
// always lives in the asset registry.
// ============================================================================

export const CharacterCondensed = CharacterBase.pick({
  id: true,
  referenceId: true,
  name: true,
  description: true,
});
export type CharacterCondensed = z.infer<typeof CharacterCondensed>;

export const LocationCondensed = LocationBase.pick({
  id: true,
  referenceId: true,
  name: true,
  description: true,
});
export type LocationCondensed = z.infer<typeof LocationCondensed>;

// Scenes use sceneIndex as their narrative-scoped identifier (no referenceId).
export const SceneCondensed = SceneBase.pick({
  id: true,
  name: true,
  description: true,
  sceneIndex: true,
});
export type SceneCondensed = z.infer<typeof SceneCondensed>;

export const PropCondensed = PropBase.pick({
  id: true,
  referenceId: true,
  name: true,
  description: true,
});
export type PropCondensed = z.infer<typeof PropCondensed>;

// ============================================================================
// LIVE STORYBOARD
//
// Replaces the old immutable snapshot Storyboard with a live, always-current
// condensed view of the project. Updated at the end of every generative
// workload via StoryboardManager.applyUpdates.
//
// Stored as a JSONB column on the projects table. Zod .readonly() enforces
// copy-modify-write at the type level — never mutate in place.
// ============================================================================

export const LiveStoryboard = z
  .object({
    metadata: ProjectMetadata,
    characters: z.array(CharacterCondensed).default([]),
    locations: z.array(LocationCondensed).default([]),
    scenes: z.array(SceneCondensed).default([]),
  })
  .readonly()
  .describe("Live project snapshot — updated after every generative workload");
export type LiveStoryboard = z.infer<typeof LiveStoryboard>;

// ============================================================================
// MIGRATION HELPER
//
// Produces a valid empty LiveStoryboard for cases that initialise the
// storyboard from scratch (e.g. PROCESS_AUDIO_TO_SCENES, new projects).
// Pass partial metadata and defaults are applied via Zod parse.
// ============================================================================

export function makeEmptyLiveStoryboard(metadata: ProjectMetadata): LiveStoryboard {
  return LiveStoryboard.parse({
    metadata,
    characters: [],
    locations: [],
    scenes: [],
  });
}
