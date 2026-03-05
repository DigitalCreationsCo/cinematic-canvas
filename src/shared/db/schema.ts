import {
  pgTable, uuid, text, timestamp, integer,
  jsonb, real, 
  index, uniqueIndex,
  primaryKey
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { sql } from "drizzle-orm";
import { AttemptMetadata, JobState, JobType, RecoveryContext } from "../types/job.types.js";
import { ProjectMetadata } from "../types/metadata.types.js";
import { AssetRegistry, AssetType, AssetVersion } from "../types/assets.types.js";
import { CharacterState } from "../types/character.types.js";
import { LocationState } from "../types/location.types.js";
import { createDefaultMetrics, WorkflowMetrics } from "../types/metrics.types.js";
import { Lighting, Composition, TransitionType, ShotType, CameraAngle, CameraMovement } from "../types/cinematography.types.js";
import { PhysicalTraits } from "../types/character.types.js";
import { AudioAnalysisAttributes } from "../types/audio.types.js";
import { AssetKey, AssetStatus } from "../types/assets.types.js";
import { Storyboard } from "../types/workflow.types.js";
import { nullableJsonb, nullableText } from "./schema-utils.js";



export const users = pgTable("users", {
  id: uuid("id").notNull().primaryKey().$defaultFn(() => uuidv7()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
});

export const worlds = pgTable("worlds", {
  id: uuid("id").notNull().primaryKey().$defaultFn(() => uuidv7()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  name: text("name").notNull(),
  description: text("description"),
});

export const usersToWorlds = pgTable("users_to_worlds", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  worldId: uuid("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" }),
}, (t) => ([primaryKey({ columns: [t.userId, t.worldId] })]));

export const usersToProjects = pgTable("users_to_projects", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
}, (t) => ([primaryKey({ columns: [t.userId, t.projectId] })]));

export const projects = pgTable("projects", {
  id: uuid("id").notNull().primaryKey().$defaultFn(() => uuidv7()),
  worldId: uuid("world_id").references(() => worlds.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  storyboard: jsonb("storyboard").$type<Storyboard>().notNull(),
  metadata: jsonb("metadata").$type<ProjectMetadata>().notNull(),
  audioAnalysis: nullableJsonb<AudioAnalysisAttributes>("audio_analysis"),
  status: text("status").$type<AssetStatus>().default("pending").notNull(),
  metrics: jsonb("metrics").$type<WorkflowMetrics>().default(createDefaultMetrics()).notNull(),
  assets: jsonb("assets").$type<AssetRegistry>().default({}).notNull(),
  currentSceneIndex: integer("current_scene_index").default(0).notNull(),
  forceRegenerateSceneIds: text("force_regenerate_scene_ids").array().default([]).notNull(),
  generationRules: text("generation_rules").array().default([]).notNull(),
  generationRulesHistory: jsonb("generation_rules_history").$type<string[][]>().default([]).notNull(),
  guidanceLevel: integer('guidance_level').default(2).notNull(),
}, (table) => ({
  guidanceIdx: index('projects_guidance_idx').on(table.guidanceLevel),
})
);

export const characters = pgTable("characters", {
  id: uuid("id").notNull().primaryKey().$defaultFn(() => uuidv7()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  ledgerId: text("ledger_id"),
  referenceId: text("reference_id").notNull(), 
  name: text("name").notNull(),
  aliases: text("aliases").array().default([]).notNull(),
  physicalTraits: jsonb("physical_traits").$type<PhysicalTraits>().notNull(),
  assets: jsonb("assets").$type<AssetRegistry>().default({}).notNull(),
  state: jsonb("state").$type<CharacterState>().notNull(),
  guidanceLevel: integer('guidance_level'),
}, (table) => ({
  guidanceIdx: index('characters_guidance_idx').on(table.guidanceLevel),
})
);

export const scenes = pgTable("scenes", {
  id: uuid("id").notNull().primaryKey().$defaultFn(() => uuidv7()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  sceneIndex: integer("scene_index").notNull(),
  // Narrative & Sync
  name: text("name").notNull(),
  description: text("description").notNull(),
  startTime: real("start_time").notNull(),
  endTime: real("end_time").notNull(),
  duration: real("duration").notNull(),
  type: text("type").notNull(),
  lyrics: text("lyrics"),
  musicalDescription: nullableText("musical_description"),
  musicChange: nullableText("music_change"),
  intensity: nullableText("intensity"),
  mood: text("mood").notNull(),
  tempo: text("tempo").notNull(),
  audioEvidence: text("audio_evidence").notNull(),
  transientImpact: text("transient_impact").notNull(),
  audioSync: text("audio_sync").notNull(),
  // Cinematic Specs
  transitionType: text("transition_type").$type<TransitionType>().notNull(),
  shotType: text("shot_type").$type<ShotType>().notNull(),
  cameraAngle: text("camera_angle").$type<CameraAngle>().notNull(),
  cameraMovement: text("camera_movement").$type<CameraMovement>().notNull(),
  composition: jsonb("composition").$type<Composition>().notNull(),
  lighting: jsonb("lighting").$type<Lighting>().notNull(),
  // Script Supervisor Links
  continuityNotes: text("continuity_notes").array().default([]).notNull(),
  characterReferenceIds: text("character_reference_ids").array().default([]).notNull(),
  locationReferenceId: text("location_reference_id").notNull(),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  // Persistent Results
  status: text("status").$type<AssetStatus>().default("pending").notNull(),
  progressMessage: nullableText("progress_message"),
  assets: jsonb("assets").$type<AssetRegistry>().default({}).notNull(),
  guidanceLevel: integer('guidance_level'),
}, (table) => ({
  guidanceIdx: index('scenes_guidance_idx').on(table.guidanceLevel),
})
);

export const locations = pgTable("locations", {
  id: uuid("id").notNull().primaryKey().$defaultFn(() => uuidv7()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  ledgerId: text("ledger_id"),
  referenceId: text("reference_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  mood: text("mood").notNull(),
  lightingConditions: jsonb("lighting_conditions").$type<Lighting>().notNull(),
  timeOfDay: text("time_of_day").notNull(),
  weather: text("weather").notNull(),
  colorPalette: jsonb("color_palette").$type<string[]>().notNull(),
  architecture: jsonb("architecture").$type<string[]>().notNull(),
  naturalElements: jsonb("natural_elements").$type<string[]>().notNull(),
  manMadeObjects: jsonb("man_made_objects").$type<string[]>().notNull(),
  groundSurface: text("ground_surface").notNull(),
  skyOrCeiling: text("sky_or_ceiling").notNull(),
  assets: jsonb("assets").$type<AssetRegistry>().default({}).notNull(),
  state: jsonb("state").$type<LocationState>().notNull(),
  guidanceLevel: integer('guidance_level'),
}, (table) => ({
  guidanceIdx: index('locations_guidance_idx').on(table.guidanceLevel),
})
);

export const jobs = pgTable("jobs", {
  id: uuid("id").notNull().primaryKey().$defaultFn(() => uuidv7()),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  type: text("type").$type<JobType>().notNull(),
  state: text("state").$type<JobState>().default("PENDING").notNull(),
  payload: nullableJsonb("payload"),
  result: nullableJsonb("result"),
  error: text("error").default("").notNull(),
  uniqueKey: text("unique_key").notNull(), // Not actually a unique key column, but a logical identifier for the job
  assetKey: text("asset_key").$type<AssetKey>().notNull(),
  attempts: jsonb("attempts").$type<AttemptMetadata>().notNull(),
  recoveryContext: nullableJsonb<RecoveryContext>("recovery_context"),
  workflowId: uuid("workflow_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // 1. Versioning & Reset Protection: Only one ACTIVE job per logical task.
  // This allows "move through" failures by inserting a fresh record 
  // once the old one is FAILED or CANCELLED, while preventing double-starts.
  activeLogicalJobIdx: uniqueIndex("idx_active_logical_job")
    .on(table.projectId, table.type, table.uniqueKey)
    .where(sql`state IN ('CREATED', 'RUNNING')`),

  // 2. Maximum Performance: Fast 'Latest Job' lookup
  // Supports Index-Only scans for the core business query
  scopedLatestIdx: index("idx_scoped_latest_job").on(
    table.projectId,
    table.type,
    table.uniqueKey,
    table.createdAt.desc()
  ),

  // 2. Concurrency Optimization: Fast counting of running jobs per project
  // Partial index ensures we only scan records that matter for 'claimJob'
  projectStateIdx: index("idx_project_running_jobs")
    .on(table.projectId)
    .where(sql`state = 'RUNNING'`),

  // 3. Operational: Composite index for general lookups
  projectCreatedIdx: index("idx_project_created").on(table.projectId, table.state),

  // 4. Monitoring: Fast recovery of stale jobs
  stateIdx: index("idx_jobs_state_updated").on(table.state, table.updatedAt),
}));

export const scenesToCharacters = pgTable("scenes_to_characters", {
  sceneId: uuid("scene_id")
    .notNull()
    .references(() => scenes.id, { onDelete: "cascade" }),
  characterId: uuid("character_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
}, (t) => ([ primaryKey({ columns: [ t.sceneId, t.characterId ] }) ])
);

/**
 * ASSET ENTRIES - The "slot" for an asset
 * One entry per (entity, assetKey) combination
 * Stores metadata about the asset history (head, best) without the actual data
 */
export const assetEntries = pgTable("asset_entries", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  
  // Polymorphic foreign keys - NO CASCADE deletion (preserve assets when entities deleted)
  sceneId: uuid("scene_id").references(() => scenes.id, { onDelete: "set null" }),
  characterId: uuid("character_id").references(() => characters.id, { onDelete: "set null" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),

  assetKey: text("asset_key").$type<AssetKey>().notNull(),
  
  // Version pointers
  head: integer("head").default(0).notNull(),
  best: integer("best").default(0).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  // Ensure exactly one entry per asset key per entity
  unq_project_asset: uniqueIndex("idx_unq_project_asset")
    .on(t.projectId, t.assetKey)
    .where(sql`scene_id IS NULL AND character_id IS NULL AND location_id IS NULL`),
  unq_scene_asset: uniqueIndex("idx_unq_scene_asset").on(t.sceneId, t.assetKey),
  unq_char_asset: uniqueIndex("idx_unq_char_asset").on(t.characterId, t.assetKey),
  unq_loc_asset: uniqueIndex("idx_unq_loc_asset").on(t.locationId, t.assetKey),
  
  // Performance indexes for entity lookups
  idx_project: index("idx_asset_entries_project").on(t.projectId),
  idx_scene: index("idx_asset_entries_scene").on(t.sceneId),
  idx_character: index("idx_asset_entries_character").on(t.characterId),
  idx_location: index("idx_asset_entries_location").on(t.locationId),
}));
export type AssetEntry = typeof assetEntries.$inferSelect;
export type InsertAssetEntry = typeof assetEntries.$inferInsert;

/**
 * ASSET VERSIONS - The actual asset data
 * Append-only history of all versions for each entry
 * Never updated, only inserted
 */
export const assetVersions = pgTable("asset_versions", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  assetEntryId: uuid("asset_entry_id").references(() => assetEntries.id, { onDelete: "cascade" }).notNull(),
  
  version: integer("version").notNull(),
  data: text("data").notNull(),
  type: text("type").$type<AssetType>().notNull(),
  metadata: jsonb("metadata").$type<AssetVersion['metadata']>().notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  // Ensure version uniqueness per entry
  unq_version_seq: uniqueIndex("idx_unq_asset_version_seq").on(t.assetEntryId, t.version),
  
  // Performance index for version history queries
  idx_history_lookup: index("idx_asset_history_lookup").on(t.assetEntryId, t.version),
  
  // Composite index for best version queries (commonly used in JOINs)
  idx_entry_version: index("idx_entry_version").on(t.assetEntryId, t.version),
}));
export type AssetVersionRow = typeof assetVersions.$inferSelect;
export type InsertAssetVersion = typeof assetVersions.$inferInsert;