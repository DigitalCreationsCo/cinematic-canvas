// shared/types/entities.types.ts
import { z } from "zod";
import { createSelectSchema, createInsertSchema, createUpdateSchema } from "drizzle-zod";
import * as schema from "../db/schema.js";
import { IdentityBase, InsertIdentityBase, ProjectRef, WorldRef, TeamRef } from "./base.types.js";
import { CharacterAttributes } from "./character.types.js";
import { LocationAttributes, } from "./location.types.js";
import { SceneAttributes, SceneStatus, ScriptSupervisorScene } from "./scene.types.js";
import { AssetRegistry, AssetStatus, GuidanceLevel } from "./assets.types.js";
import { ProjectMetadata } from "./metadata.types.js";
import { AudioAnalysisAttributes } from "./audio.types.js";
import { WorkflowMetrics } from "./metrics.types.js";
import { Lighting, Composition } from "./cinematography.types.js";
import { Character, Location, Scene, Storyboard } from "./workflow.types.js";

// ============================================================================
// SCENE ENTITY
// ============================================================================

export const SceneEntity = createSelectSchema(schema.scenes, {
  ...IdentityBase.shape,
  ...ProjectRef.shape,
  ...SceneAttributes.shape,
  ...ScriptSupervisorScene.pick({ locationId: true }).shape,
  ...SceneStatus.shape,
  lighting: Lighting,
  assets: AssetRegistry,
  guidanceLevel: GuidanceLevel,
});

export type SceneEntity = z.infer<typeof SceneEntity>;

/**
 * Scene with minimal relationship data (IDs only)
 * This is what we SELECT from the database to minimize data transfer
 */
export const SceneQueryResult = SceneEntity.extend({
  characters: z.array(z.object({ id: z.uuid() })).default([]),
});
export type SceneQueryResult = z.infer<typeof SceneQueryResult>;

/**
 * Transforms query result into domain Scene model
 */
export function sceneQueryResultToDomain(result: SceneQueryResult): Scene {
  return Scene.parse({
    ...result,
    characterIds: result.characters.map(c => c.id),
  });
}

// ============================================================================
// INSERT ENTITIES
// ============================================================================

export const InsertScene = createInsertSchema(schema.scenes, {
  ...InsertIdentityBase.shape,
  ...ProjectRef.shape,
  ...SceneAttributes.shape,
  ...ScriptSupervisorScene.pick({ locationId: true, }).shape,
  ...SceneStatus.shape,
  assets: AssetRegistry.default(() => (AssetRegistry.parse({}))),
});
export type InsertScene = z.infer<typeof InsertScene>;

export const UpdateScene = createUpdateSchema(schema.scenes, {
  // ...InsertScene.omit({ id: true, createdAt: true }).shape,
  ...InsertScene.shape,
});
export type UpdateScene = z.infer<typeof UpdateScene>;

export const InsertCharacter = createInsertSchema(schema.characters, {
  ...InsertIdentityBase.shape,
  ...ProjectRef.shape,
  ...CharacterAttributes.shape,
  assets: AssetRegistry.default(() => (AssetRegistry.parse({}))),
});
export type InsertCharacter = z.infer<typeof InsertCharacter>;

export const InsertLocation = createInsertSchema(schema.locations, {
  ...InsertIdentityBase.shape,
  ...ProjectRef.shape,
  ...LocationAttributes.shape,
  assets: AssetRegistry.default(() => (AssetRegistry.parse({}))),
});
export type InsertLocation = z.infer<typeof InsertLocation>;

// ============================================================================
// JUNCTION TABLE
// ============================================================================

export const SceneToCharacterJoin = createSelectSchema(schema.scenesToCharacters);
export type SceneToCharacterJoin = z.infer<typeof SceneToCharacterJoin>;

export const SceneToCharacterJoinInsert = createInsertSchema(schema.scenesToCharacters);
export type SceneToCharacterJoinInsert = z.infer<typeof SceneToCharacterJoinInsert>;

// ============================================================================
// GENERATION RULES
// ============================================================================

export const GenerationRules = z.array(z.string()).default([]).describe("Generation rule guidelines");
export type GenerationRules = z.infer<typeof GenerationRules>;

// ============================================================================
// WORLD ENTITY
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
// PROJECT ENTITY
// ============================================================================

const ProjectBaseSchema = createSelectSchema(schema.projects, {
  ...IdentityBase.shape,
  ...TeamRef.shape,
  ...WorldRef.shape,
  storyboard: Storyboard.readonly().describe("The immutable storyboard snapshot"),
  metadata: ProjectMetadata.describe("Fully populated production metadata"),
  audioAnalysis: AudioAnalysisAttributes.nullish(),
  metrics: WorkflowMetrics,
  generationRules: GenerationRules,
  generationRulesHistory: z.preprocess((val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
    return [];
  }, z.array(GenerationRules)),

  currentSceneIndex: z.number().default(0).describe("The index of the current scene in the storyboard"),
  status: AssetStatus,
  forceRegenerateSceneIds: z.array(z.string()).default([]).describe("List of scene IDs to force video regenerate"),
  assets: AssetRegistry,
  guidanceLevel: z.number().default(2).describe("Entity-scoped guidance control for asset generation"),
});

export const ProjectEntity = ProjectBaseSchema;
export type ProjectEntity = z.infer<typeof ProjectEntity>;

// ============================================================================
// PROJECT (Application Runtime Schema)
// ============================================================================

const ProjectBase = IdentityBase.extend({
  ...TeamRef.shape,
  ...WorldRef.shape,
  storyboard: Storyboard.readonly().describe("The immutable storyboard snapshot"),
  metadata: ProjectMetadata.describe("Fully populated production metadata"),
  audioAnalysis: AudioAnalysisAttributes.nullish(),
  metrics: WorkflowMetrics,
  generationRules: GenerationRules,
  generationRulesHistory: z.preprocess((val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
    return [];
  }, z.array(GenerationRules)),

  currentSceneIndex: z.number().default(0).describe("The index of the current scene in the storyboard"),
  status: AssetStatus,
  forceRegenerateSceneIds: z.array(z.string()).default([]).describe("List of scene IDs to force video regenerate"),
  assets: AssetRegistry,
  guidanceLevel: z.number().default(2).describe("Entity-scoped guidance control for asset generation"),
});

export const Project = ProjectBase.extend({
  scenes: z.array(Scene).default([]),
  characters: z.array(Character).default([]),
  locations: z.array(Location).default([]),
});
export type Project = z.infer<typeof Project>;

// ============================================================================
// INSERT PROJECT
// ============================================================================

export const InsertProjectBaseSchema = createInsertSchema(schema.projects, {
  ...InsertIdentityBase.shape,
  ...TeamRef.shape,
  ...WorldRef.shape,
  // JSONB Overrides
  storyboard: z.object({
    metadata: ProjectMetadata,
    scenes: z.array(InsertScene),
    characters: z.array(InsertCharacter),
    locations: z.array(InsertLocation),
  }).readonly().describe("The immutable storyboard snapshot"),
  metadata: ProjectMetadata.default(() => (ProjectMetadata.parse({}))),
  metrics: WorkflowMetrics.default(() => (WorkflowMetrics.parse({}))),
  audioAnalysis: AudioAnalysisAttributes.nullish(),

  status: AssetStatus.default("pending"),
  currentSceneIndex: z.number().default(0).describe("Index of scene currently being processed"),
  forceRegenerateSceneIds: z.array(z.string()).default([]).describe("List of scene IDs to force video regenerate"),
  generationRules: GenerationRules.default([]),
  generationRulesHistory: z.preprocess((val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
    return [];
  }, z.array(GenerationRules)).default([]).describe("history of generation rule guidelines"),
  assets: AssetRegistry.default(() => (AssetRegistry.parse({}))),
  guidanceLevel: GuidanceLevel,
}).extend({
  scenes: z.array(InsertScene).default([]),
  characters: z.array(InsertCharacter).default([]),
  locations: z.array(InsertLocation).default([]),
});

export const InsertProject = InsertProjectBaseSchema;
export type InsertProject = z.infer<typeof InsertProject>;

export const UpdateProject = createUpdateSchema(schema.projects, {
  ...InsertProjectBaseSchema.omit({ id: true, createdAt: true }).shape,
});
export type UpdateProject = z.infer<typeof UpdateProject>;

