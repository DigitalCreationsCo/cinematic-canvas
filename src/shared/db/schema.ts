import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  real,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
  unique,
  serial,
} from "drizzle-orm/pg-core";
import { generateId } from "#shared/utils/id.js";
import { sql } from "drizzle-orm";
import { nullableJsonb, nullableText, optionalUUID, tsvector } from "./schema.utils.js";


export const users = pgTable("users", {
  id: uuid("id").notNull().primaryKey(), // Using Supabase auth.users.id which is a UUID
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  email: text("email").notNull(),
});

export const usersToTeams = pgTable(
  "users_to_teams",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // 'owner', 'admin', 'member'
  },
  (t) => [primaryKey({ columns: [t.userId, t.teamId] })],
);

export const usersToWorlds = pgTable(
  "users_to_worlds",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    accessLevel: text("access_level").notNull().default("read"), // 'read', 'write', 'admin'
  },
  (t) => [primaryKey({ columns: [t.userId, t.worldId] })],
);

export const usersToProjects = pgTable(
  "users_to_projects",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    accessLevel: text("access_level").notNull().default("read"), // 'read', 'write', 'admin'
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] })],
);

export const teams = pgTable("teams", {
  id: uuid("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => generateId()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  name: text("name").notNull(),
});

export const teamsToWorlds = pgTable(
  "teams_to_worlds",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    accessLevel: text("access_level").notNull().default("read"), // 'read', 'write', 'admin'
  },
  (t) => [primaryKey({ columns: [t.teamId, t.worldId] })],
);

export const teamsToProjects = pgTable(
  "teams_to_projects",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    accessLevel: text("access_level").notNull().default("read"), // 'read', 'write', 'admin'
  },
  (t) => [primaryKey({ columns: [t.teamId, t.projectId] })],
);

export const worlds = pgTable("worlds", {
  id: uuid("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => generateId()),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  worldRepository: text("world_repository").notNull().unique(),
  // SAC ledger repository
  sacRepoId: text("sac_repo_id"),
  sacRepoUrl: text("sac_repo_url"),
});

export const scenes = pgTable(
  "scenes",
  {
    id: uuid("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => generateId()),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    sceneIndex: integer("scene_index").notNull(),
    // Narrative & Sync
    name: text("name").notNull(),
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
    transitionType: text("transition_type").notNull(),
    shotType: text("shot_type").notNull(),
    cameraAngle: text("camera_angle").notNull(),
    cameraMovement: text("camera_movement").notNull(),
    composition: jsonb("composition").notNull(),
    lighting: jsonb("lighting").notNull(),
    // Script Supervisor Links
    continuityNotes: text("continuity_notes").array().default([]).notNull(),
    characterReferenceIds: text("character_reference_ids")
      .array()
      .default([])
      .notNull(),
    locationReferenceId: text("location_reference_id").notNull(),
    locationId: uuid("location_id")
      .references(() => locations.id, { onDelete: "cascade" })
      .notNull(),
    // Persistent Results
    status: text("status").default("pending").notNull(),
    progressMessage: nullableText("progress_message"),
    guidanceLevel: integer("guidance_level"),
  },
  (table) => ({
    guidanceIdx: index("scenes_guidance_idx").on(table.guidanceLevel),
  }),
);

export const characters = pgTable(
  "characters",
  {
    id: uuid("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => generateId()),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    worldId: optionalUUID("world_id").references(() => worlds.id, {
      onDelete: "no action",
    }),
    referenceId: text("reference_id").notNull(),
    name: text("name").notNull(),
    aliases: text("aliases").array().default([]).notNull(),
    physicalTraits: jsonb("physical_traits").notNull(),
    state: jsonb("state").notNull(),
    guidanceLevel: integer("guidance_level"),
  },
  (table) => ({
    guidanceIdx: index("characters_guidance_idx").on(table.guidanceLevel),
  }),
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => generateId()),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    worldId: optionalUUID("world_id").references(() => worlds.id, {
      onDelete: "no action",
    }),
    referenceId: text("reference_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    mood: text("mood").notNull(),
    lightingConditions: jsonb("lighting_conditions")
      .notNull(),
    timeOfDay: text("time_of_day").notNull(),
    weather: text("weather").notNull(),
    colorPalette: jsonb("color_palette").notNull(),
    architecture: jsonb("architecture").notNull(),
    naturalElements: jsonb("natural_elements").notNull(),
    manMadeObjects: jsonb("man_made_objects").notNull(),
    groundSurface: text("ground_surface").notNull(),
    skyOrCeiling: text("sky_or_ceiling").notNull(),
    state: jsonb("state").notNull(),
    guidanceLevel: integer("guidance_level"),
  },
  (table) => ({
    guidanceIdx: index("locations_guidance_idx").on(table.guidanceLevel),
  }),
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => generateId()),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    worldId: optionalUUID("world_id").references(() => worlds.id, {
      onDelete: "no action",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    storyboard: jsonb("storyboard").notNull(),
    metadata: jsonb("metadata").notNull(),
    audioAnalysis: nullableJsonb("audio_analysis"),
    status: text("status").default("pending").notNull(),
    currentSceneIndex: integer("current_scene_index").default(0).notNull(),
    forceRegenerateSceneIds: text("force_regenerate_scene_ids")
      .array()
      .default([])
      .notNull(),
    generationRules: text("generation_rules").array().default([]).notNull(),
    generationRulesHistory: jsonb("generation_rules_history")
      .$type<string[][]>()
      .default([])
      .notNull(),
    guidanceLevel: integer("guidance_level").default(2).notNull(),
    // SAC fork repository (created when project is forked from a licensed world)
    sacForkRepoId: text("sac_fork_repo_id"),
    sacForkRepoUrl: text("sac_fork_repo_url"),
  },
  (table) => ({
    guidanceIdx: index("projects_guidance_idx").on(table.guidanceLevel),
  }),
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => generateId()),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    worldId: optionalUUID("world_id").references(() => worlds.id, { onDelete: "no action" }),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    state: text("state").default("PENDING").notNull(),
    payload: nullableJsonb("payload"),
    result: nullableJsonb("result"),
    error: text("error").default("").notNull(),
    uniqueKey: text("unique_key").notNull(), // Not actually a unique key column, but a logical identifier for the job
    assetKey: text("asset_key").notNull(),
    attempts: jsonb("attempts").notNull(),
    recoveryContext: nullableJsonb("recovery_context"),
    workflowId: optionalUUID("workflow_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
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
      table.createdAt.desc(),
    ),

    // 2. Concurrency Optimization: Fast counting of running jobs per project
    // Partial index ensures we only scan records that matter for 'claimJob'
    projectStateIdx: index("idx_project_running_jobs")
      .on(table.projectId)
      .where(sql`state = 'RUNNING'`),

    // 3. Operational: Composite index for general lookups
    projectCreatedIdx: index("idx_project_created").on(
      table.projectId,
      table.state,
    ),

    // 4. Monitoring: Fast recovery of stale jobs
    stateIdx: index("idx_jobs_state_updated").on(table.state, table.updatedAt),
  }),
);

export const scenesToCharacters = pgTable(
  "scenes_to_characters",
  {
    sceneId: uuid("scene_id")
      .references(() => scenes.id, { onDelete: "set null" }),
    characterId: uuid("character_id")
      .references(() => characters.id, { onDelete: "set null" }),
  },
  (t) => [primaryKey({ columns: [t.sceneId, t.characterId] })],
);

/**
 * ASSET ENTRIES - The "slot" for an asset
 * One entry per (entity, assetKey) combination
 * Stores metadata about the asset history (head, best) without the actual data
 */
export const assetEntries = pgTable(
  "asset_entries",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),

    // Polymorphic foreign keys - NO CASCADE deletion (preserve assets when entities deleted)
    sceneId: uuid("scene_id").references(() => scenes.id, {
      onDelete: "no action",
    }),
    characterId: uuid("character_id").references(() => characters.id, {
      onDelete: "no action",
    }),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "no action",
    }),
    propId: uuid("prop_id").references(() => props.id, {
      onDelete: "no action",
    }),
    fileId: uuid("file_id").references(() => files.id, {
      onDelete: "no action",
    }),

    assetKey: text("asset_key").notNull(),

    // Version pointers
    head: integer("head").default(0).notNull(),
    best: integer("best").default(0).notNull(),

    /**
     * When true, a user has 'liked' the current best version.
     * Autonomous setBest calls will not override best while this is set.
     * Only cleared when the user explicitly changes their feedback.
     */
    bestLockedByFeedback: boolean("best_locked_by_feedback")
      .default(false)
      .notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    // Ensure exactly one entry per asset key per entity
    unq_project_asset: uniqueIndex("idx_unq_project_asset")
      .on(t.projectId, t.assetKey)
      .where(
        sql`scene_id IS NULL AND character_id IS NULL AND location_id IS NULL AND file_id IS NULL`,
      ),
    unq_scene_asset: uniqueIndex("idx_unq_scene_asset").on(
      t.sceneId,
      t.assetKey,
    ),
    unq_char_asset: uniqueIndex("idx_unq_char_asset").on(
      t.characterId,
      t.assetKey,
    ),
    unq_loc_asset: uniqueIndex("idx_unq_loc_asset").on(
      t.locationId,
      t.assetKey,
    ),
    unq_file_asset: uniqueIndex("idx_unq_file_asset").on(t.fileId, t.assetKey),

    // Performance indexes for entity lookups
    idx_project: index("idx_asset_entries_project").on(t.projectId),
    idx_scene: index("idx_asset_entries_scene").on(t.sceneId),
    idx_character: index("idx_asset_entries_character").on(t.characterId),
    idx_location: index("idx_asset_entries_location").on(t.locationId),
    idx_file: index("idx_asset_entries_file").on(t.fileId),
  }),
);

/**
 * ASSET VERSIONS - The actual asset data
 * Append-only history of all versions for each entry
 * Never updated, only inserted
 */
export const assetVersions = pgTable(
  "asset_versions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    assetEntryId: uuid("asset_entry_id")
      .references(() => assetEntries.id, { onDelete: "cascade" })
      .notNull(),
    version: integer("version").notNull(),
    // The raw payload (Prompt or URI)
    data: text("data").notNull(),

    // The Managed Media Reference (Nullable)
    // Only populated for image, video, audio
    mediaId: text("media_id").references(() => mediaObjects.data, {
      onDelete: "restrict",
    }),

    type: text("type").notNull(),

    metadata: jsonb("metadata")
      .$defaultFn(() => ({})),
    /** Nullable — only present after user rates this version. */
    userFeedback: jsonb("user_feedback"),
    startedAt: timestamp("started_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    // Ensure version uniqueness per entry
    unq_version_seq: uniqueIndex("idx_unq_asset_version_seq").on(
      t.assetEntryId,
      t.version,
    ),

    // Performance index for version history queries
    idx_history_lookup: index("idx_asset_history_lookup").on(
      t.assetEntryId,
      t.version,
    ),

    // Composite index for best version queries (commonly used in JOINs)
    idx_entry_version: index("idx_entry_version").on(t.assetEntryId, t.version),
  }),
);


export const mediaObjects = pgTable("media_objects", {
  data: text("data").primaryKey(),
  refCount: integer("ref_count").default(0).notNull(),
  status: text("status")
    .$type<"active" | "pending_deletion">()
    .default("active")
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastReferencedAt: timestamp("last_referenced_at").defaultNow().notNull(),
});

// ============================================================================
// FILES - Standalone file entities for canvas nodes
// Enables flexible file management independent of locations/characters
// ============================================================================

export const files = pgTable(
  "files",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    // Source/type of file (image, video, audio, imported, generated, etc.)
    fileType: text("file_type").notNull().default("import"),
    // Current active version (references asset_versions)

    // GCS URI of the current best version
    mediaId: text("media_id")
      .references(() => mediaObjects.data, { onDelete: "restrict" })
      .notNull(),
    // Metadata for the file (dimensions, format, etc.)
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    idxProject: index("idx_files_project").on(t.projectId),
    idxFileType: index("idx_files_type").on(t.fileType),
  }),
);

// ============================================================================
// CANVAS NODE LAYOUTS
// Stores React Flow node positions & UI metadata, persisted per context (project/world).
// OCC (Optimistic Concurrency Control) via idxVersion prevents stale writes.
// ============================================================================

export const canvasNodeLayouts = pgTable(
  "canvas_node_layouts",
  {
    idLayout: uuid("id_layout").primaryKey().defaultRandom(),
    idContext: uuid("id_context").notNull(), // projectId OR worldId
    contextType: text("context_type").notNull(), // 'project' | 'world'
    idEntity: uuid("id_entity").notNull(), // entityId this node represents
    nodeType: text("node_type").notNull(), // CanvasNodeType value
    valPosX: real("val_pos_x").notNull(),
    valPosY: real("val_pos_y").notNull(),
    valWidth: real("val_width"),
    valHeight: real("val_height"),
    jsonUiMetadata: jsonb("json_ui_metadata").default(sql`'{}'::jsonb`),
    // jsonUiMetadata shape: {
    //   nodeTypeFlag?: ImageNodeFlag,
    //   pipelineSelected: boolean,
    //   collapsed: boolean
    // }
    idxVersion: integer("idx_version").default(1).notNull(),
    tsUpdated: timestamp("ts_updated", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    // One layout row per (context, entity) pair
    constraintUniqueContextEntity: unique("unq_context_entity").on(
      t.idContext,
      t.idEntity,
    ),
    // Fast lookup of all nodes for a canvas context
    idxContext: index("idx_canvas_layouts_context").on(t.idContext),
  }),
);

// ============================================================================
// WORLD ACCESS GRANTS
// RBAC grants for world entity access. Determines what a user can do with
// world-scoped entities when working on a project that references that world.
// ============================================================================

export const worldAccessGrants = pgTable(
  "world_access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull(),
    // role values: 'owner' | 'editor' | 'collaborator' | 'viewer' | 'licensed_creator'
    licenseType: text("license_type"),
    // licenseType is a slug referencing a license definition in the .sac base ledger
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    uniqueWorldUser: unique("unq_world_user").on(t.worldId, t.userId),
    idxWorldId: index("idx_world_access_grants_world").on(t.worldId),
  }),
);


export const props = pgTable("props", {
  id: uuid("id").notNull().primaryKey().$defaultFn(() => generateId()),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  worldId: optionalUUID("world_id").references(() => worlds.id, { // Null if Project-scoped
    onDelete: "no action",
  }),
  referenceId: text("reference_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  guidanceLevel: integer("guidance_level"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tagRegistry = pgTable("tag_registry", {
  handle: text("handle").primaryKey(), // The unique @handle
  entityType: text("entity_type").$type<'character' | 'location' | 'prop'>().notNull(),

  characterId: uuid("character_id").references(() => characters.id, {
    onDelete: "no action",
  }),
  locationId: uuid("location_id").references(() => locations.id, {
    onDelete: "no action",
  }),
  propId: uuid("prop_id").references(() => props.id, {
    onDelete: "no action",
  }),

  worldId: optionalUUID("world_id").references(() => worlds.id, { // Null if Project-scoped
    onDelete: "no action",
  }),
  projectId: uuid("project_id").references(() => projects.id),
}, (t) => ({
  idxScope: index("idx_tag_scope").on(t.projectId, t.worldId),
}));

export const entityVersionPins = pgTable("entity_version_pins", {
  projectId: uuid("project_id").notNull().references(() => projects.id),
  entityId: uuid("entity_id").notNull(),
  // Maps AssetKey (e.g., 'description') to a specific version number
  pinnedVersions: jsonb("pinned_versions").notNull(),
});

export const blocks = pgTable("blocks", {
  id: uuid("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => generateId()),
  index: integer("index").notNull(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onUpdate: 'cascade', onDelete: "cascade" }),
  title: text("title"),
  content: text("content").notNull(),
  dialogue: text("dialogue"),
  imageUrl: text("image_url"),
  searchVector: tsvector("search_vector").generatedAlwaysAs(
    (): any => sql`to_tsvector('english', ${blocks.content})`
  ),
  isNotable: boolean("is_notable").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  happenedAt: timestamp("happened_at", { withTimezone: true }),
}, (table) => {
  return {
    idxBlocksProjectId: index("idx_blocks_project_id").on(table.projectId),
    idxBlocksSearch: index("idx_blocks_search").using("gin", table.searchVector),
  };
});

export const lore = pgTable("lore", {
  id: uuid("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => generateId()),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onUpdate: 'cascade', onDelete: "no action" }),
  content: text("content").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  happenedAt: timestamp("happened_at", { withTimezone: true }),
});

// ============================================================================
// CHAT CONVERSATIONS & MESSAGES
// Project-scoped AI chat with user attribution
// ============================================================================

export const conversations = pgTable("conversations", {
  id: uuid("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => generateId()),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "no action" }),
  title: text("title").notNull().default("New Conversation"),
  contextSummary: nullableText("context_summary"),
  tokenCount: integer("token_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  idxProjectId: index("idx_conversations_project").on(t.projectId),
  idxUserId: index("idx_conversations_user").on(t.userId),
}));

export const messages = pgTable("messages", {
  id: uuid("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => generateId()),
  conversationId: uuid("conversation_id")
    .references(() => conversations.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "no action" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  isComplete: boolean("is_complete").default(true).notNull(),
  tokenCount: integer("token_count").default(0).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  idxConversationId: index("idx_messages_conversation").on(t.conversationId),
  idxCreatedAt: index("idx_messages_created").on(t.createdAt),
}));
