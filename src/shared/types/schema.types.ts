import { AttemptMetadata, JOB_STATES, JOB_TYPES, RecoveryContext } from "#shared/types/job.constants.js";
import {
  AssetKey,
  AssetType,
  AssetVersion,
  AssetStatus,
  UserFeedback,
  GuidanceLevel,
  AssetRegistry,
} from "#shared/types/assets.types.js";
import { ProjectMetadata } from "#shared/types/metadata.types.js";
import { CharacterAttributes } from "#shared/types/character.types.js";
import { LocationAttributes } from "#shared/types/location.types.js";
import { SceneAttributes, SceneStatus, ScriptSupervisorScene } from "#shared/types/scene.types.js";
import { Lighting } from "#shared/types/cinematography.types.js";
import { AudioAnalysisAttributes } from "#shared/types/audio.types.js";
import {
  IdentityBase,
  InsertIdentityBase,
  ProjectRef,
  WorldRef,
  WorkflowRef,
  TeamRef,
  UserRef,
  coerceDate,
} from "#shared/types/base.types.js";
import {
  Character,
  CharacterWithAssets,
  Location,
  LocationWithAssets,
  Scene,
  SceneWithAssets,
} from "#shared/types/workflow.types.js";
import { LiveStoryboard } from "#shared/types/storyboard.types.js";
import { z } from "zod";
import { createSelectSchema, createInsertSchema, createUpdateSchema } from "drizzle-zod";
import * as schema from "#shared/db/schema.js";
import { GenerationRules } from "#shared/types/entity.types.js";

// ============================================================================
// WORLDS
// ============================================================================

export const World = createSelectSchema(schema.worlds, {
  ...IdentityBase.shape,
  ...TeamRef.shape,
});
export type World = z.infer<typeof World>;

export const InsertWorld = createInsertSchema(schema.worlds, {
  ...InsertIdentityBase.shape,
  ...TeamRef.shape,
});
export type InsertWorld = z.infer<typeof InsertWorld>;

export const UpdateWorld = createUpdateSchema(schema.worlds, {
  ...InsertWorld.shape,
});
export type UpdateWorld = z.infer<typeof UpdateWorld>;

// ============================================================================
// SCENES
// ============================================================================

export const SceneEntity = createSelectSchema(schema.scenes, {
  ...IdentityBase.shape,
  ...ProjectRef.shape,
  ...SceneAttributes.omit({ description: true }).shape, // descriptions are saved as versioned assets
  ...ScriptSupervisorScene.pick({ locationId: true, characterReferenceIds: true }).shape,
  ...SceneStatus.shape,
  lighting: Lighting,
  guidanceLevel: GuidanceLevel,
});
export type SceneEntity = z.infer<typeof SceneEntity>;

export const InsertScene = createInsertSchema(schema.scenes, {
  ...InsertIdentityBase.shape,
  ...ProjectRef.shape,
  ...SceneAttributes.omit({ description: true }).shape, // descriptions are saved as versioned assets
  ...ScriptSupervisorScene.pick({ locationId: true }).shape,
  ...SceneStatus.shape,
});
export type InsertScene = z.infer<typeof InsertScene>;

export const UpdateScene = createUpdateSchema(schema.scenes, {
  // ...InsertScene.omit({ id: true, createdAt: true }).shape,
  ...InsertScene.shape,
});
export type UpdateScene = z.infer<typeof UpdateScene>;

/**
 * Scene with minimal relationship data (IDs only), and assets object.
 * This is what we SELECT from the database to minimize data transfer
 */
export const SceneQueryResult = SceneEntity.extend({
  characters: z.array(z.object({ id: z.uuid() })).default([]),
});
export type SceneQueryResult = z.infer<typeof SceneQueryResult>;

// ============================================================================
// CHARACTERS
// ============================================================================

export const CharacterEntity = createSelectSchema(schema.characters, {
  ...IdentityBase.shape,
  ...ProjectRef.shape,
  worldId: WorldRef.shape.worldId,
  ...CharacterAttributes.omit({ description: true }).shape, // description is saved as versioned asset
  guidanceLevel: GuidanceLevel,
});
export type CharacterEntity = z.infer<typeof CharacterEntity>;

export const InsertCharacter = createInsertSchema(schema.characters, {
  ...InsertIdentityBase.shape,
  ...ProjectRef.shape,
  worldId: WorldRef.shape.worldId,
  ...CharacterAttributes.omit({ description: true }).shape, // descriptions are saved as versioned assets
});
export type InsertCharacter = z.infer<typeof InsertCharacter>;

export const UpdateCharacter = createUpdateSchema(schema.characters, {
  ...InsertCharacter.shape,
});
export type UpdateCharacter = z.infer<typeof UpdateCharacter>;

// ============================================================================
// LOCATIONS
// ============================================================================

export const LocationEntity = createSelectSchema(schema.locations, {
  ...IdentityBase.shape,
  ...ProjectRef.shape,
  worldId: WorldRef.shape.worldId,
  ...LocationAttributes.omit({ description: true }).shape, // descriptions are saved as versioned assets
  guidanceLevel: GuidanceLevel,
});
export type LocationEntity = z.infer<typeof LocationEntity>;

export const InsertLocation = createInsertSchema(schema.locations, {
  ...InsertIdentityBase.shape,
  ...ProjectRef.shape,
  worldId: WorldRef.shape.worldId,
  ...LocationAttributes.omit({ description: true }).shape, // descriptions are saved as versioned assets
});
export type InsertLocation = z.infer<typeof InsertLocation>;
export type InsertLocationInput = z.input<typeof InsertLocation>;

export const UpdateLocation = createUpdateSchema(schema.locations, {
  ...InsertLocation.shape,
});
export type UpdateLocation = z.infer<typeof UpdateLocation>;

// ============================================================================
// PROJECTS
// ============================================================================

export const ProjectEntity = createSelectSchema(schema.projects, {
  ...IdentityBase.shape,
  teamId: TeamRef.shape.teamId,
  worldId: WorldRef.shape.worldId,
  storyboard: LiveStoryboard,
  metadata: ProjectMetadata.describe("Fully populated production metadata"),
  audioAnalysis: AudioAnalysisAttributes.nullish(),
  generationRules: GenerationRules,
  generationRulesHistory: z
    .preprocess((val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch {
          return [];
        }
      }
      return [];
    }, z.array(GenerationRules))
    .default([])
    .describe("history of generation rule guidelines"),
  currentSceneIndex: z.number().default(0).describe("The index of the current scene in the storyboard"),
  status: AssetStatus,
  forceRegenerateSceneIds: z.array(z.string()).default([]).describe("List of scene IDs to force video regenerate"),
  guidanceLevel: z.number().default(2).describe("Entity-scoped guidance control for asset generation"),
});
export type ProjectEntity = z.infer<typeof ProjectEntity>;

export const Project = ProjectEntity.extend({
  assets: AssetRegistry,
  scenes: z.array(SceneWithAssets).default([]),
  characters: z.array(CharacterWithAssets).default([]),
  locations: z.array(LocationWithAssets).default([]),
});
export type Project = z.infer<typeof Project>;

export const HydratedProject = ProjectEntity.extend({
  assets: AssetRegistry,
  scenes: z.array(Scene).default([]),
  characters: z.array(Character).default([]),
  locations: z.array(Location).default([]),
});
export type HydratedProject = z.infer<typeof HydratedProject>;

export const InsertProject = createInsertSchema(schema.projects, {
  ...InsertIdentityBase.shape,
  ...TeamRef.shape,
  worldId: WorldRef.shape.worldId,
  storyboard: LiveStoryboard,
  metadata: ProjectMetadata.default(() => ProjectMetadata.parse({})),
  audioAnalysis: AudioAnalysisAttributes.nullish(),

  status: AssetStatus.default("pending"),
  currentSceneIndex: z.number().default(0).describe("Index of scene currently being processed"),
  forceRegenerateSceneIds: z.array(z.string()).default([]).describe("List of scene IDs to force video regenerate"),
  generationRules: GenerationRules.default([]),
  generationRulesHistory: z
    .preprocess((val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch {
          return [];
        }
      }
      return [];
    }, z.array(GenerationRules))
    .default([])
    .describe("history of generation rule guidelines"),
  guidanceLevel: GuidanceLevel,
}).extend({
  scenes: z.array(InsertScene).default([]),
  characters: z.array(InsertCharacter).default([]),
  locations: z.array(InsertLocation).default([]),
});
export type InsertProject = z.infer<typeof InsertProject>;

export const UpdateProject = createUpdateSchema(schema.projects, {
  metadata: ProjectMetadata.partial(),
}).extend({
  scenes: z.array(SceneWithAssets).default([]),
  characters: z.array(CharacterWithAssets).default([]),
  locations: z.array(LocationWithAssets).default([]),
});
export type UpdateProject = Partial<
  Omit<z.infer<typeof UpdateProject>, "metadata"> & {
    metadata?: Partial<ProjectMetadata>;
  }
>;

// ============================================================================
// JOBS
// ============================================================================

export const Job = createSelectSchema(schema.jobs, {
  ...IdentityBase.shape,
  worldId: WorldRef.shape.worldId,
  workflowId: WorkflowRef.shape.workflowId,
  projectId: ProjectRef.shape.projectId,
  teamId: TeamRef.shape.teamId,
  userId: UserRef.shape.userId,
  type: z.enum(JOB_TYPES),
  state: z.enum(JOB_STATES),
  assetKey: AssetKey,
  error: z.string(),
  uniqueKey: z.string(),
  payload: z.any().optional(),
  result: z.any().optional(),
  attempts: AttemptMetadata,
  recoveryContext: RecoveryContext.nullish(),
});

export type Job = z.infer<typeof Job>;

export const InsertJob = createInsertSchema(schema.jobs, {
  ...InsertIdentityBase.shape,
  worldId: WorldRef.shape.worldId,
  workflowId: WorkflowRef.shape.workflowId,
  projectId: ProjectRef.shape.projectId,
  teamId: TeamRef.shape.teamId,
  userId: UserRef.shape.userId,
  type: z.enum(JOB_TYPES),
  state: z.enum(JOB_STATES).default(JOB_STATES[0]),
  assetKey: AssetKey,
  error: z.string().default(""),
  uniqueKey: z.string(),
  payload: z.any().optional(),
  result: z.any().optional(),
  attempts: AttemptMetadata.default(() => AttemptMetadata.parse({})),
  recoveryContext: RecoveryContext.nullish(),
});
export type InsertJob = z.infer<typeof InsertJob>;

// ============================================================================
// SCENES TO CHARACTERS
// ============================================================================

export const SceneToCharacterJoin = createSelectSchema(schema.scenesToCharacters);
export type SceneToCharacterJoin = z.infer<typeof SceneToCharacterJoin>;

export const SceneToCharacterJoinInsert = createInsertSchema(schema.scenesToCharacters);
export type SceneToCharacterJoinInsert = z.infer<typeof SceneToCharacterJoinInsert>;

// ============================================================================
// ASSET ENTRIES ROW
// ============================================================================

export const AssetEntry = createSelectSchema(schema.assetEntries, {
  ...IdentityBase.shape,
  ...ProjectRef.shape,
  sceneId: z.uuid().optional(),
  characterId: z.uuid().optional(),
  locationId: z.uuid().optional(),
  propId: z.uuid().optional(),
  fileId: z.uuid().optional(),
  assetKey: AssetKey,
  head: z.number(),
  best: z.number(),
  bestLockedByFeedback: z.boolean(),
});
export type AssetEntry = z.infer<typeof AssetEntry>;

export const InsertAssetEntry = createInsertSchema(schema.assetEntries, {
  ...InsertIdentityBase.shape,
  ...ProjectRef.shape,
  sceneId: z.uuid().optional(),
  characterId: z.uuid().optional(),
  locationId: z.uuid().optional(),
  propId: z.uuid().optional(),
  fileId: z.uuid().optional(),
  assetKey: AssetKey,
  head: z.number().optional(),
  best: z.number().optional(),
  bestLockedByFeedback: z.boolean(),
});
export type InsertAssetEntry = z.infer<typeof InsertAssetEntry>;

// ============================================================================
// ASSET VERSIONS ROW
// ============================================================================

export const AssetVersionRow = createSelectSchema(schema.assetVersions, {
  id: IdentityBase.shape.id,
  assetEntryId: z.uuid(),
  version: z.number(),
  data: z.string(),
  mediaId: z.string().optional(),
  type: AssetType,
  metadata: AssetVersion.shape.metadata,
  userFeedback: UserFeedback,
  startedAt: coerceDate,
  createdAt: coerceDate,
});
export type AssetVersionRow = z.infer<typeof AssetVersionRow>;

export const InsertAssetVersion = createInsertSchema(schema.assetVersions, {
  id: InsertIdentityBase.shape.id,
  assetEntryId: z.uuid(),
  version: z.number(),
  data: z.string(),
  mediaId: z.string().optional(),
  type: AssetType,
  metadata: AssetVersion.shape.metadata,
  userFeedback: UserFeedback.optional(),
  startedAt: coerceDate,
  createdAt: coerceDate,
});
export type InsertAssetVersion = z.infer<typeof InsertAssetVersion>;

// ============================================================================
// MEDIA OBJECTS
// ============================================================================

export const MediaObject = createSelectSchema(schema.mediaObjects, {
  data: z.string(),
  refCount: z.number(),
  status: z
    .union([z.literal("active"), z.literal("pending_deletion")])
    .optional()
    .default("active"),
  createdAt: coerceDate,
  lastReferencedAt: coerceDate,
});
export type MediaObject = z.infer<typeof MediaObject>;

export const InsertMediaObject = createInsertSchema(schema.mediaObjects, {
  data: z.string(),
  refCount: z.number(),
  status: z
    .union([z.literal("active"), z.literal("pending_deletion")])
    .optional()
    .default("active"),
  createdAt: coerceDate,
  lastReferencedAt: coerceDate,
});
export type InsertMediaObject = z.infer<typeof MediaObject>;

// ============================================================================
// ENTITY VERSION PINS
// ============================================================================

export const EntityVersionPins = createSelectSchema(schema.entityVersionPins, {
  projectId: ProjectRef.shape.projectId,
  entityId: z.uuid(),
  pinnedVersions: z.partialRecord(AssetKey, z.number()).nonoptional(),
});
export type EntityVersionPins = z.infer<typeof EntityVersionPins>;

export const InsertEntityVersionPins = createInsertSchema(schema.entityVersionPins, {
  projectId: ProjectRef.shape.projectId,
  entityId: z.uuid(),
  pinnedVersions: z.partialRecord(AssetKey, z.number()).nonoptional(),
});
export type InsertEntityVersionPins = z.infer<typeof InsertEntityVersionPins>;

// ============================================================================
// FILES
// ============================================================================

export type FileEntity = typeof schema.files.$inferSelect;
export type InsertFileEntity = typeof schema.files.$inferInsert;

// ============================================================================
// CANVAS LAYOUTS
// ============================================================================

export type CanvasNodeLayout = typeof schema.canvasNodeLayouts.$inferSelect;
export type InsertCanvasNodeLayout = typeof schema.canvasNodeLayouts.$inferInsert;

// ============================================================================
// WORLD ACCESS GRANTS
// ============================================================================

export type WorldAccessGrant = typeof schema.worldAccessGrants.$inferSelect;
export type InsertWorldAccessGrant = typeof schema.worldAccessGrants.$inferInsert;

// ============================================================================
// PROPS
// ============================================================================

export const PropEntity = createSelectSchema(schema.props, {
  ...IdentityBase.shape,
  ...ProjectRef.shape,
  worldId: WorldRef.shape.worldId,
  referenceId: z.string().describe("Narrative-scoped identifier for the prop (e.g., prop_1)"),
  name: z.string().describe("Prop name"),
  type: z.string().describe("Prop type e.g. car, weapon, furniture, etc."),
});
export type PropEntity = z.infer<typeof PropEntity>;

export const InsertProp = createInsertSchema(schema.props, {
  ...InsertIdentityBase.shape,
  ...ProjectRef.shape,
  worldId: WorldRef.shape.worldId,
  referenceId: z.string().describe("Narrative-scoped identifier for the prop (e.g., prop_1)"),
  name: z.string().describe("Prop name"),
  type: z.string().describe("Prop type e.g. car, weapon, furniture, etc."),
});
export type InsertProp = z.infer<typeof InsertProp>;

export const UpdateProp = createUpdateSchema(schema.props, {
  ...InsertProp.shape,
});
export type UpdateProp = z.infer<typeof UpdateProp>;
