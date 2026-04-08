// shared/types/entity.types.ts
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
import { Lighting } from "./cinematography.types.js";
import { Character, CharacterWithAssets, Location, LocationWithAssets, Scene, SceneWithAssets, Storyboard } from "./workflow.types.js";

// ============================================================================
// ENTITY (database-safe types)
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

export const CharacterEntity = createSelectSchema(schema.characters, {
  ...IdentityBase.shape,
  ...ProjectRef.shape,
  ...CharacterAttributes.omit({ description: true }).shape, // description is saved as versioned asset
  guidanceLevel: GuidanceLevel,
});
export type CharacterEntity = z.infer<typeof CharacterEntity>;

export const LocationEntity = createSelectSchema(schema.locations, {
  ...IdentityBase.shape,
  ...ProjectRef.shape,
  ...LocationAttributes.omit({ description: true }).shape, // descriptions are saved as versioned assets
  guidanceLevel: GuidanceLevel,
});
export type LocationEntity = z.infer<typeof LocationEntity>;


/**
 * Scene with minimal relationship data (IDs only), and assets object.
 * This is what we SELECT from the database to minimize data transfer
 */
export const SceneQueryResult = SceneEntity.extend({
  characters: z.array(z.object({ id: z.uuid() })).default([]),
});
export type SceneQueryResult = z.infer<typeof SceneQueryResult>;

// ============================================================================
// INSERT ENTITIES
// ============================================================================

export const InsertScene = createInsertSchema(schema.scenes, {
  ...InsertIdentityBase.shape,
  ...ProjectRef.shape,
  ...SceneAttributes.omit({ description: true }).shape, // descriptions are saved as versioned assets
  ...ScriptSupervisorScene.pick({ locationId: true, }).shape,
  ...SceneStatus.shape,
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
  ...CharacterAttributes.omit({ description: true }).shape, // descriptions are saved as versioned assets
});
export type InsertCharacter = z.infer<typeof InsertCharacter>;

export const UpdateCharacter = createUpdateSchema(schema.characters, {
  ...InsertCharacter.shape,
});
export type UpdateCharacter = z.infer<typeof UpdateCharacter>;

export const InsertLocation = createInsertSchema(schema.locations, {
  ...InsertIdentityBase.shape,
  ...ProjectRef.shape,
  ...LocationAttributes.omit({ description: true }).shape, // descriptions are saved as versioned assets
});
export type InsertLocation = z.infer<typeof InsertLocation>;

export type InsertLocationInput = z.input<typeof InsertLocation>;

export const UpdateLocation = createUpdateSchema(schema.locations, {
  ...InsertLocation.shape,
});
export type UpdateLocation = z.infer<typeof UpdateLocation>;


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
// PROJECT ENTITY - database-safe transform interface
// ============================================================================

export const ProjectEntity = createSelectSchema(schema.projects, {
  ...IdentityBase.shape,
  teamId: TeamRef.shape.teamId,
  worldId: WorldRef.shape.worldId,
  storyboard: Storyboard.readonly().describe("The immutable storyboard snapshot"),
  metadata: ProjectMetadata.describe("Fully populated production metadata"),
  audioAnalysis: AudioAnalysisAttributes.nullish(),
  generationRules: GenerationRules,
  generationRulesHistory: z.preprocess((val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
    return [];
  }, z.array(GenerationRules)).default([]).describe("history of generation rule guidelines"),
  currentSceneIndex: z.number().default(0).describe("The index of the current scene in the storyboard"),
  status: AssetStatus,
  forceRegenerateSceneIds: z.array(z.string()).default([]).describe("List of scene IDs to force video regenerate"),
  guidanceLevel: z.number().default(2).describe("Entity-scoped guidance control for asset generation"),
});
export type ProjectEntity = z.infer<typeof ProjectEntity>;

// ============================================================================
// PROJECT (WITH ASSETS) - database-safe transform interface with scenes, characters, locations, hydrated with assets (not fully hydrated)
// ============================================================================

export const Project = ProjectEntity.extend({
  assets: AssetRegistry,
  scenes: z.array(SceneWithAssets).default([]),
  characters: z.array(CharacterWithAssets).default([]),
  locations: z.array(LocationWithAssets).default([]),
});
export type Project = z.infer<typeof Project>;

// ============================================================================
// HYDRATEDPROJECT - Hydrated Generative Workload Domain 
// ============================================================================

export const HydratedProject = ProjectEntity.extend({
  assets: AssetRegistry,
  scenes: z.array(Scene).default([]),
  characters: z.array(Character).default([]),
  locations: z.array(Location).default([]),
});
export type HydratedProject = z.infer<typeof HydratedProject>;

// ============================================================================
// INSERT PROJECT
// ============================================================================

export const InsertProject = createInsertSchema(schema.projects, {
  ...InsertIdentityBase.shape,
  ...TeamRef.shape,
  worldId: WorldRef.shape.worldId,
  storyboard: z.object({
    metadata: ProjectMetadata,
    scenes: z.array(InsertScene),
    characters: z.array(InsertCharacter),
    locations: z.array(InsertLocation),
  }).readonly().describe("The immutable storyboard snapshot"),
  metadata: ProjectMetadata.default(() => (ProjectMetadata.parse({}))),
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
  guidanceLevel: GuidanceLevel,
}).extend({
  scenes: z.array(InsertScene).default([]),
  characters: z.array(InsertCharacter).default([]),
  locations: z.array(InsertLocation).default([]),
});
export type InsertProject = z.infer<typeof InsertProject>;

// ============================================================================
// UPDATE PROJECT
// ============================================================================

export const UpdateProject = createUpdateSchema(schema.projects, {
  ...InsertProject.omit({ id: true, createdAt: true }).shape,
});
export type UpdateProject = z.infer<typeof UpdateProject>;

