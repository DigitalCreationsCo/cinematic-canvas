// shared/types/workflow.types.ts
import { z } from "zod";
import { IdentityBase, ProjectRef, TeamRef, UserRef, ValidDurations, WorldRef } from "./base.types.js";
import { CharacterAttributes } from "./character.types.js";
import { LocationAttributes } from "./location.types.js";
import { ProjectMetadata, ProjectMetadataAttributes } from "./metadata.types.js";
import { AssetHistory, AssetKey, AssetRegistry, AssetStatus, GuidanceLevel } from "./assets.types.js";
import { SceneAttributes, SceneStatus, ScriptSupervisorScene } from "./scene.types.js";


// ============================================================================
// HYDRATED ENTITIES (narrative domain types)
// ============================================================================

export const SceneBase = IdentityBase
  .extend({
    ...ProjectRef.shape,
    ...SceneAttributes.shape,
    ...ScriptSupervisorScene.shape,
    ...SceneStatus.shape,
    guidanceLevel: GuidanceLevel,
  });
export type SceneBase = z.infer<typeof SceneBase>;

export const Scene = SceneBase
  .extend({
    assets: AssetRegistry,
  })
  .and(z.partialRecord(AssetKey, z.string()));
export type Scene = z.infer<typeof Scene>;


export const CharacterBase = IdentityBase.extend({
  ...ProjectRef.shape,
  ...CharacterAttributes.shape,
  guidanceLevel: GuidanceLevel,
});
export type CharacterBase = z.infer<typeof CharacterBase>;

export const Character = CharacterBase
  .extend({
    assets: AssetRegistry,
  })
  .and(z.partialRecord(AssetKey, z.string()));
export type Character = z.infer<typeof Character>;


export const LocationBase = IdentityBase.extend({
  ...ProjectRef.shape,
  ...LocationAttributes.shape,
  guidanceLevel: GuidanceLevel,
});
export type LocationBase = z.infer<typeof LocationBase>;

export const Location = LocationBase
  .extend({
    assets: AssetRegistry,
  })
  .and(z.partialRecord(AssetKey, z.string()));
export type Location = z.infer<typeof Location>;

export const PropBase = IdentityBase.extend({
  ...ProjectRef.shape,
  worldId: WorldRef.shape.worldId,
  referenceId: z.string().describe("Narrative-scoped identifier for the prop (e.g., prop_1)"),
  name: z.string().describe("Prop name"),
  description: z.string().describe("Prop description"),
  type: z.string().describe("Prop type e.g. car, weapon, furniture, etc."),
  guidanceLevel: GuidanceLevel,
});
export type PropBase = z.infer<typeof PropBase>;

export const Prop = PropBase
  .extend({
    assets: AssetRegistry,
  })
  .and(z.partialRecord(AssetKey, z.string()));
export type Prop = z.infer<typeof Prop>;


// ============================================================================
// DTO types - dehydrated entity for transfer
// ============================================================================

export const SceneWithAssets = SceneBase.omit({ description: true }).extend({
  assets: AssetRegistry,
});
export type SceneWithAssets = z.infer<typeof SceneWithAssets>;


export const CharacterWithAssets = CharacterBase.omit({ description: true }).extend({
  assets: AssetRegistry,
});
export type CharacterWithAssets = z.infer<typeof CharacterWithAssets>;


export const LocationWithAssets = LocationBase.omit({ description: true }).extend({
  assets: AssetRegistry,
});
export type LocationWithAssets = z.infer<typeof LocationWithAssets>;


export const PropWithAssets = PropBase.omit({ description: true }).extend({
  assets: AssetRegistry,
});
export type PropWithAssets = z.infer<typeof PropWithAssets>;


export type HydratedEntity<T> = T & { assets: AssetRegistry } & Record<keyof AssetRegistry, string>;


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
  scenes: z.array(SceneAttributes)
});
export type SceneBatch = z.infer<typeof SceneBatch>;


export const StoryboardAttributes = z.object({
  metadata: ProjectMetadataAttributes,
  characters: z.array(CharacterAttributes).default([]),
  locations: z.array(LocationAttributes).default([]),
  scenes: z.array(SceneAttributes).default([]),
});
export type StoryboardAttributes = z.infer<typeof StoryboardAttributes>;


export const Storyboard = z.object({
  metadata: ProjectMetadata,
  characters: z.array(CharacterBase).default([]),
  locations: z.array(LocationBase).default([]),
  scenes: z.array(SceneBase).default([]),
}).readonly().describe("The immutable project snapshot");
export type Storyboard = z.infer<typeof Storyboard>;


// ============================================================================
// GENERATION 
// ============================================================================

export interface SceneGenerationInput {
  scene: SceneAttributes;
  enhancedPrompt: string;
}

export type SceneGenerationResult = {
  scene: Scene;
  enhancedPrompt: string;
  videoUrl: string;
};

export interface VideoGenerationConfig {
  resolution: "480p" | "720p" | "1080p";
  durationSeconds: ValidDurations;
  numberOfVideos: number;
  personGeneration: "ALLOW_ALL" | "DONT_ALLOW";
  generateAudio: boolean;
  negativePrompt?: string;
}

// ============================================================================
// WORKFLOW STATE & ERRORS
// ============================================================================

export const ErrorRecord = z.object({
  projectId: z.string(),
  node: z.string(),
  error: z.string(),
  value: z.record(z.string(), z.any()).default({}),
  shouldRetry: z.boolean(),
  timestamp: z.string(),
});
export type ErrorRecord = z.infer<typeof ErrorRecord>;

export const WorkflowState = IdentityBase.pick({ id: true })
  .extend(ProjectRef.shape)
  .extend({
    teamId: TeamRef.shape.teamId,
    userId: UserRef.shape.userId,
    localAudioPath: z.string().nullish().describe("User-provided audio filepath"),
    hasAudio: z.boolean().default(false).describe("Whether this workflow uses audio"),
    jobIds: z.record(z.string(), z.string()).default({}).describe("Active generative worker jobs"),
    currentSceneIndex: z.number().default(0).describe("Index of scene currently being processed"),
    nodeAttempts: z.record(z.string(), z.number()).default({}).describe("Count of node executions in the current workflow"),
    errors: z.array(ErrorRecord).default([]).describe("Errors encountered during workflow"),
    userApprovedStoryboard: z.boolean().default(false).describe("Whether the user has approved the generated storyboard"),
    userApprovedVideoProcessing: z.boolean().default(false).describe("Whether the user has approved video processing step"),
    __interrupt__: z.array(z.any()).default([]).describe("Interrupts encountered during workflow"),
    __interrupt_resolved__: z.boolean().default(false).describe("Whether interrupts have been resolved"),
  });
export type WorkflowState = z.infer<typeof WorkflowState>;

export type InterruptValueType = "user_approval_before_video_gen" | "user_approval_after_storyboard_gen" | "lm_retry_exhausted" | "lm_intervention" | "waiting_for_job" | "waiting_for_batch";
export interface InterruptValue {
  type: InterruptValueType;
  error: string;
  errorDetails?: Record<string, unknown>;
  stackTrace?: string;
  functionName: string;
  nodeName: string;
  projectId: string;
  params?: Record<string, any>;
  attempts: number;
  maxRetries: number;
  lastAttemptTimestamp: string;
  jobType?: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export interface ContinuityCheck {
  characterConsistency: boolean;
  locationConsistency: boolean;
  timingConsistency: boolean;
  issues: string[];
}

export function isLyricalScene(scene: Scene): boolean {
  return (
    scene.audioSync === "Lip Sync" ||
    (scene.lyrics && scene.lyrics.length > 0) ||
    false
  );
}

export function isInstrumentalScene(scene: Scene): boolean {
  return (
    scene.audioSync === "Mood Sync" ||
    scene.description?.includes("[Instrumental") ||
    false
  );
}

export function requiresTransition(scene: Scene): boolean {
  return scene.transitionType !== "Continuous" && scene.transitionType !== "none";
}

// ============================================================================
// USER
// ============================================================================

export const User = IdentityBase.extend({
  name: z.string(),
  email: z.email(),
});
export type User = z.infer<typeof User>;
