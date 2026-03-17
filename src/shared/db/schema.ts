import {
  pgTable, uuid, text, timestamp, integer,
  jsonb, real, boolean,
  index, uniqueIndex,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { sql } from "drizzle-orm";
import { AttemptMetadata, JobState, JobType, RecoveryContext } from "../types/job.types.js";
import { ProjectMetadata } from "../types/metadata.types.js";
import { AssetRegistry, AssetType, AssetVersion } from "../types/assets.types.js";
import { CharacterState } from "../types/character.types.js";
import { LocationState } from "../types/location.types.js";
import { Lighting, Composition, TransitionType, ShotType, CameraAngle, CameraMovement } from "../types/cinematography.types.js";
import { PhysicalTraits } from "../types/character.types.js";
import { AudioAnalysisAttributes } from "../types/audio.types.js";
import { AssetKey, AssetStatus, UserFeedback } from "../types/assets.types.js";
import { Storyboard } from "../types/workflow.types.js";
import { nullableJsonb, nullableText } from "./schema-utils.js";



export const users = pgTable("users", {
  id: uuid("id").notNull().primaryKey(), // Using Supabase auth.users.id which is a UUID
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  email: text("email").notNull(),
});

export const usersToTeams = pgTable("users_to_teams", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // 'owner', 'admin', 'member'
}, (t) => ([primaryKey({ columns: [t.userId, t.teamId] })]));

export const usersToWorlds = pgTable("users_to_worlds", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  worldId: uuid("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" }),
  accessLevel: text("access_level").notNull().default("read"), // 'read', 'write', 'admin'
}, (t) => ([primaryKey({ columns: [t.userId, t.worldId] })]));

export const usersToProjects = pgTable("users_to_projects", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  accessLevel: text("access_level").notNull().default("read"), // 'read', 'write', 'admin'
}, (t) => ([primaryKey({ columns: [t.userId, t.projectId] })]));

export const teams = pgTable("teams", {
  id: uuid("id").notNull().primaryKey().$defaultFn(() => uuidv7()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  name: text("name").notNull(),
});

export const teamsToWorlds = pgTable("teams_to_worlds", {
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  worldId: uuid("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" }),
  accessLevel: text("access_level").notNull().default("read"), // 'read', 'write', 'admin'
}, (t) => ([primaryKey({ columns: [t.teamId, t.worldId] })]));

export const teamsToProjects = pgTable("teams_to_projects", {
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  accessLevel: text("access_level").notNull().default("read"), // 'read', 'write', 'admin'
}, (t) => ([primaryKey({ columns: [t.teamId, t.projectId] })]));

export const worlds = pgTable("worlds", {
  id: uuid("id").notNull().primaryKey().$defaultFn(() => uuidv7()),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  worldRepository: text("world_repository").notNull().unique(),
  // SAC ledger repository
  sacRepoId: text("sac_repo_id"),
  sacRepoUrl: text("sac_repo_url"),
});
export const projects = pgTable("projects", {
  id: uuid("id").notNull().primaryKey().$defaultFn(() => uuidv7()),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  worldId: uuid("world_id").references(() => worlds.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  storyboard: jsonb("storyboard").$type<Storyboard>().notNull(),
  metadata: jsonb("metadata").$type<ProjectMetadata>().notNull(),
  audioAnalysis: nullableJsonb<AudioAnalysisAttributes>("audio_analysis"),
  status: text("status").$type<AssetStatus>().default("pending").notNull(),
  currentSceneIndex: integer("current_scene_index").default(0).notNull(),
  forceRegenerateSceneIds: text("force_regenerate_scene_ids").array().default([]).notNull(),
  generationRules: text("generation_rules").array().default([]).notNull(),
  generationRulesHistory: jsonb("generation_rules_history").$type<string[][]>().default([]).notNull(),
  guidanceLevel: integer('guidance_level').default(2).notNull(),
  // SAC fork repository (created when project is forked from a licensed world)
  sacForkRepoId: text("sac_fork_repo_id"),
  sacForkRepoUrl: text("sac_fork_repo_url"),
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
}, (t) => ([primaryKey({ columns: [t.sceneId, t.characterId] })])
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

  /**
   * When true, a user has 'liked' the current best version.
   * Autonomous setBest calls will not override best while this is set.
   * Only cleared when the user explicitly changes their feedback.
   */
  bestLockedByFeedback: boolean("best_locked_by_feedback").default(false).notNull(),

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
  // NOTE: Changed to strictly reference mediaObjects.data
  data: text("data").notNull().references(() => mediaObjects.data, { onDelete: "restrict" }),

  type: text("type").$type<AssetType>().notNull(),
  metadata: jsonb("metadata").$type<AssetVersion['metadata']>().notNull(),
  /** Nullable — only present after user rates this version. */
  userFeedback: jsonb("user_feedback").$type<UserFeedback>(),
  startedAt: timestamp("started_at").notNull(),
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

export const mediaObjects = pgTable("media_objects", {
  data: text("data").primaryKey(),
  refCount: integer("ref_count").default(0).notNull(),
  status: text("status").$type<"active" | "pending_deletion">().default("active").notNull(),
  lastReferencedAt: timestamp("last_referenced_at").defaultNow().notNull(),
});
export type MediaObject = typeof mediaObjects.$inferSelect;
export type InsertMediaObject = typeof mediaObjects.$inferInsert;

// ============================================================================
// CANVAS NODE LAYOUTS
// Stores React Flow node positions & UI metadata, persisted per context (project/world).
// OCC (Optimistic Concurrency Control) via idxVersion prevents stale writes.
// ============================================================================

export const canvasNodeLayouts = pgTable('canvas_node_layouts', {
  idLayout: uuid('id_layout').primaryKey().defaultRandom(),
  idContext: uuid('id_context').notNull(),       // projectId OR worldId
  contextType: text('context_type').notNull(),     // 'project' | 'world'
  idEntity: uuid('id_entity').notNull(),        // entityId this node represents
  nodeType: text('node_type').notNull(),        // CanvasNodeType value
  valPosX: real('val_pos_x').notNull(),
  valPosY: real('val_pos_y').notNull(),
  valWidth: real('val_width'),
  valHeight: real('val_height'),
  jsonUiMetadata: jsonb('json_ui_metadata').default(sql`'{}'::jsonb`),
  // jsonUiMetadata shape: {
  //   nodeTypeFlag?: ImageNodeFlag,
  //   pipelineSelected: boolean,
  //   collapsed: boolean
  // }
  idxVersion: integer('idx_version').default(1).notNull(),
  tsUpdated: timestamp('ts_updated', { withTimezone: true }).defaultNow(),
}, (t) => ({
  // One layout row per (context, entity) pair
  constraintUniqueContextEntity: unique('unq_context_entity').on(t.idContext, t.idEntity),
  // Fast lookup of all nodes for a canvas context
  idxContext: index('idx_canvas_layouts_context').on(t.idContext),
}));

export type CanvasNodeLayout = typeof canvasNodeLayouts.$inferSelect;
export type InsertCanvasNodeLayout = typeof canvasNodeLayouts.$inferInsert;

// ============================================================================
// WORLD ACCESS GRANTS
// RBAC grants for world entity access. Determines what a user can do with
// world-scoped entities when working on a project that references that world.
// ============================================================================

export const worldAccessGrants = pgTable('world_access_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  worldId: uuid('world_id').notNull().references(() => worlds.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  role: text('role').notNull(),
  // role values: 'owner' | 'editor' | 'collaborator' | 'viewer' | 'licensed_creator'
  licenseType: text('license_type'),
  // licenseType is a slug referencing a license definition in the .sac base ledger
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
  uniqueWorldUser: unique('unq_world_user').on(t.worldId, t.userId),
  idxWorldId: index('idx_world_access_grants_world').on(t.worldId),
}));

export type WorldAccessGrant = typeof worldAccessGrants.$inferSelect;
export type InsertWorldAccessGrant = typeof worldAccessGrants.$inferInsert;