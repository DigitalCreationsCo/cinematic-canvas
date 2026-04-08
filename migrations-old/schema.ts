import { pgTable, text, uuid, integer, timestamp, jsonb, customType, real, boolean, index, uniqueIndex, foreignKey, primaryKey, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const assetEntries = pgTable("asset_entries", {
	id: uuid().primaryKey(),
	projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	sceneId: uuid("scene_id").references(() => scenes.id, { onDelete: "cascade" } ),
	characterId: uuid("character_id").references(() => characters.id, { onDelete: "cascade" } ),
	locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" } ),
	fileId: uuid("file_id").references(() => files.id, { onDelete: "cascade" } ),
	assetKey: text("asset_key").notNull(),
	head: integer().default(0).notNull(),
	best: integer().default(0).notNull(),
	bestLockedByFeedback: boolean("best_locked_by_feedback").default(false).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("idx_asset_entries_character").using("btree", table.characterId.asc().nullsLast()),
	index("idx_asset_entries_file").using("btree", table.fileId.asc().nullsLast()),
	index("idx_asset_entries_location").using("btree", table.locationId.asc().nullsLast()),
	index("idx_asset_entries_project").using("btree", table.projectId.asc().nullsLast()),
	index("idx_asset_entries_scene").using("btree", table.sceneId.asc().nullsLast()),
	uniqueIndex("idx_unq_char_asset").using("btree", table.characterId.asc().nullsLast(), table.assetKey.asc().nullsLast()),
	uniqueIndex("idx_unq_file_asset").using("btree", table.fileId.asc().nullsLast(), table.assetKey.asc().nullsLast()),
	uniqueIndex("idx_unq_loc_asset").using("btree", table.locationId.asc().nullsLast(), table.assetKey.asc().nullsLast()),
	uniqueIndex("idx_unq_project_asset").using("btree", table.projectId.asc().nullsLast(), table.assetKey.asc().nullsLast()).where(sql`((scene_id IS NULL) AND (character_id IS NULL) AND (location_id IS NULL) AND (file_id IS NULL))`),
	uniqueIndex("idx_unq_scene_asset").using("btree", table.sceneId.asc().nullsLast(), table.assetKey.asc().nullsLast()),
]);

export const assetVersions = pgTable("asset_versions", {
	id: uuid().primaryKey(),
	assetEntryId: uuid("asset_entry_id").notNull().references(() => assetEntries.id, { onDelete: "cascade" } ),
	version: integer().notNull(),
	data: text().notNull(),
	mediaId: text("media_id").references(() => mediaObjects.data, { onDelete: "restrict" } ),
	type: text().notNull(),
	metadata: jsonb(),
	userFeedback: jsonb("user_feedback"),
	startedAt: timestamp("started_at").notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
}, (table) => [
	index("idx_asset_history_lookup").using("btree", table.assetEntryId.asc().nullsLast(), table.version.asc().nullsLast()),
	index("idx_entry_version").using("btree", table.assetEntryId.asc().nullsLast(), table.version.asc().nullsLast()),
	uniqueIndex("idx_unq_asset_version_seq").using("btree", table.assetEntryId.asc().nullsLast(), table.version.asc().nullsLast()),
]);

export const canvasNodeLayouts = pgTable("canvas_node_layouts", {
	idLayout: uuid("id_layout").defaultRandom().primaryKey(),
	idContext: uuid("id_context").notNull(),
	contextType: text("context_type").notNull(),
	idEntity: uuid("id_entity").notNull(),
	nodeType: text("node_type").notNull(),
	valPosX: real("val_pos_x").notNull(),
	valPosY: real("val_pos_y").notNull(),
	valWidth: real("val_width"),
	valHeight: real("val_height"),
	jsonUiMetadata: jsonb("json_ui_metadata").default({}),
	idxVersion: integer("idx_version").default(1).notNull(),
	tsUpdated: timestamp("ts_updated", { withTimezone: true }).default(sql`now()`),
}, (table) => [
	index("idx_canvas_layouts_context").using("btree", table.idContext.asc().nullsLast()),
	unique("unq_context_entity").on(table.idContext, table.idEntity),]);

export const characters = pgTable("characters", {
	id: uuid().primaryKey(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	ledgerId: text("ledger_id"),
	referenceId: text("reference_id").notNull(),
	name: text().notNull(),
	aliases: text().array().default([]).notNull(),
	physicalTraits: jsonb("physical_traits").notNull(),
	state: jsonb().notNull(),
	guidanceLevel: integer("guidance_level"),
}, (table) => [
	index("characters_guidance_idx").using("btree", table.guidanceLevel.asc().nullsLast()),
]);

export const checkpointBlobs = pgTable("checkpoint_blobs", {
	threadId: text("thread_id").notNull(),
	checkpointNs: text("checkpoint_ns").default("").notNull(),
	channel: text().notNull(),
	version: text().notNull(),
	type: text().notNull(),
	blob: customType({ dataType: () => 'bytea' })(),
}, (table) => [
	primaryKey({ columns: [table.threadId, table.checkpointNs, table.channel, table.version], name: "checkpoint_blobs_pkey"}),
]);

export const checkpointMigrations = pgTable("checkpoint_migrations", {
	v: integer().primaryKey(),
});

export const checkpointWrites = pgTable("checkpoint_writes", {
	threadId: text("thread_id").notNull(),
	checkpointNs: text("checkpoint_ns").default("").notNull(),
	checkpointId: text("checkpoint_id").notNull(),
	taskId: text("task_id").notNull(),
	idx: integer().notNull(),
	channel: text().notNull(),
	type: text(),
	blob: customType({ dataType: () => 'bytea' })().notNull(),
}, (table) => [
	primaryKey({ columns: [table.threadId, table.checkpointNs, table.checkpointId, table.taskId, table.idx], name: "checkpoint_writes_pkey"}),
]);

export const checkpoints = pgTable("checkpoints", {
	threadId: text("thread_id").notNull(),
	checkpointNs: text("checkpoint_ns").default("").notNull(),
	checkpointId: text("checkpoint_id").notNull(),
	parentCheckpointId: text("parent_checkpoint_id"),
	type: text(),
	checkpoint: jsonb().notNull(),
	metadata: jsonb().default({}).notNull(),
}, (table) => [
	primaryKey({ columns: [table.threadId, table.checkpointNs, table.checkpointId], name: "checkpoints_pkey"}),
]);

export const entityVersionPins = pgTable("entity_version_pins", {
	projectId: uuid("project_id").notNull().references(() => projects.id),
	entityId: uuid("entity_id").notNull(),
	pinnedVersions: jsonb("pinned_versions").notNull(),
});

export const files = pgTable("files", {
	id: uuid().primaryKey(),
	projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	name: text().notNull(),
	description: text(),
	fileType: text("file_type").default("import").notNull(),
	mediaId: text("media_id").notNull().references(() => mediaObjects.data, { onDelete: "restrict" } ),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	index("idx_files_project").using("btree", table.projectId.asc().nullsLast()),
	index("idx_files_type").using("btree", table.fileType.asc().nullsLast()),
]);

export const jobs = pgTable("jobs", {
	id: uuid().primaryKey(),
	projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	type: text().notNull(),
	state: text().default("PENDING").notNull(),
	payload: jsonb(),
	result: jsonb(),
	error: text().default("").notNull(),
	uniqueKey: text("unique_key").notNull(),
	assetKey: text("asset_key").notNull(),
	attempts: jsonb().notNull(),
	recoveryContext: jsonb("recovery_context"),
	workflowId: uuid("workflow_id"),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
}, (table) => [
	uniqueIndex("idx_active_logical_job").using("btree", table.projectId.asc().nullsLast(), table.type.asc().nullsLast(), table.uniqueKey.asc().nullsLast()).where(sql`(state = ANY (ARRAY['CREATED'::text, 'RUNNING'::text]))`),
	index("idx_jobs_state_updated").using("btree", table.state.asc().nullsLast(), table.updatedAt.asc().nullsLast()),
	index("idx_project_created").using("btree", table.projectId.asc().nullsLast(), table.state.asc().nullsLast()),
	index("idx_project_running_jobs").using("btree", table.projectId.asc().nullsLast()).where(sql`(state = 'RUNNING'::text)`),
	index("idx_scoped_latest_job").using("btree", table.projectId.asc().nullsLast(), table.type.asc().nullsLast(), table.uniqueKey.asc().nullsLast(), table.createdAt.desc().nullsLast()),
]);

export const locations = pgTable("locations", {
	id: uuid().primaryKey(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	ledgerId: text("ledger_id"),
	referenceId: text("reference_id").notNull(),
	name: text().notNull(),
	type: text().notNull(),
	mood: text().notNull(),
	lightingConditions: jsonb("lighting_conditions").notNull(),
	timeOfDay: text("time_of_day").notNull(),
	weather: text().notNull(),
	colorPalette: jsonb("color_palette").notNull(),
	architecture: jsonb().notNull(),
	naturalElements: jsonb("natural_elements").notNull(),
	manMadeObjects: jsonb("man_made_objects").notNull(),
	groundSurface: text("ground_surface").notNull(),
	skyOrCeiling: text("sky_or_ceiling").notNull(),
	state: jsonb().notNull(),
	guidanceLevel: integer("guidance_level"),
}, (table) => [
	index("locations_guidance_idx").using("btree", table.guidanceLevel.asc().nullsLast()),
]);

export const mediaObjects = pgTable("media_objects", {
	data: text().primaryKey(),
	refCount: integer("ref_count").default(0).notNull(),
	status: text().default("active").notNull(),
	lastReferencedAt: timestamp("last_referenced_at").default(sql`now()`).notNull(),
});

export const projectLocks = pgTable("project_locks", {
	projectId: text("project_id").primaryKey(),
	workerId: text("worker_id").notNull(),
	acquiredAt: timestamp("acquired_at", { withTimezone: true }).default(sql`now()`).notNull(),
	renewedAt: timestamp("renewed_at", { withTimezone: true }).default(sql`now()`).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	lockVersion: integer("lock_version").default(1).notNull(),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_locks_expires").using("btree", table.expiresAt.asc().nullsLast()),
	index("idx_locks_worker").using("btree", table.workerId.asc().nullsLast()),
]);

export const projects = pgTable("projects", {
	id: uuid().primaryKey(),
	teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	worldId: uuid("world_id").references(() => worlds.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	storyboard: jsonb().notNull(),
	metadata: jsonb().notNull(),
	audioAnalysis: jsonb("audio_analysis"),
	status: text().default("pending").notNull(),
	currentSceneIndex: integer("current_scene_index").default(0).notNull(),
	forceRegenerateSceneIds: text("force_regenerate_scene_ids").array().default([]).notNull(),
	generationRules: text("generation_rules").array().default([]).notNull(),
	generationRulesHistory: jsonb("generation_rules_history").default([]).notNull(),
	guidanceLevel: integer("guidance_level").default(2).notNull(),
	sacForkRepoId: text("sac_fork_repo_id"),
	sacForkRepoUrl: text("sac_fork_repo_url"),
}, (table) => [
	index("projects_guidance_idx").using("btree", table.guidanceLevel.asc().nullsLast()),
]);

export const props = pgTable("props", {
	id: uuid().primaryKey(),
	projectId: uuid("project_id").references(() => projects.id),
	worldId: uuid("world_id").references(() => worlds.id),
	name: text().notNull(),
	description: text(),
	assets: jsonb().default({}),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
});

export const scenes = pgTable("scenes", {
	id: uuid().primaryKey(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	sceneIndex: integer("scene_index").notNull(),
	name: text().notNull(),
	startTime: real("start_time").notNull(),
	endTime: real("end_time").notNull(),
	duration: real().notNull(),
	type: text().notNull(),
	lyrics: text(),
	musicalDescription: text("musical_description"),
	musicChange: text("music_change"),
	intensity: text(),
	mood: text().notNull(),
	tempo: text().notNull(),
	audioEvidence: text("audio_evidence").notNull(),
	transientImpact: text("transient_impact").notNull(),
	audioSync: text("audio_sync").notNull(),
	transitionType: text("transition_type").notNull(),
	shotType: text("shot_type").notNull(),
	cameraAngle: text("camera_angle").notNull(),
	cameraMovement: text("camera_movement").notNull(),
	composition: jsonb().notNull(),
	lighting: jsonb().notNull(),
	continuityNotes: text("continuity_notes").array().default([]).notNull(),
	characterReferenceIds: text("character_reference_ids").array().default([]).notNull(),
	locationReferenceId: text("location_reference_id").notNull(),
	locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" } ),
	status: text().default("pending").notNull(),
	progressMessage: text("progress_message"),
	guidanceLevel: integer("guidance_level"),
}, (table) => [
	index("scenes_guidance_idx").using("btree", table.guidanceLevel.asc().nullsLast()),
]);

export const scenesToCharacters = pgTable("scenes_to_characters", {
	sceneId: uuid("scene_id").notNull().references(() => scenes.id, { onDelete: "set null" } ),
	characterId: uuid("character_id").notNull().references(() => characters.id, { onDelete: "set null" } ),
}, (table) => [
	primaryKey({ columns: [table.sceneId, table.characterId], name: "scenes_to_characters_pkey"}),
]);

export const tagRegistry = pgTable("tag_registry", {
	handle: text().primaryKey(),
	entityType: text("entity_type").notNull(),
	characterId: uuid("character_id").references(() => characters.id, { onDelete: "cascade" } ),
	locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" } ),
	propId: uuid("prop_id").references(() => props.id, { onDelete: "cascade" } ),
	worldId: uuid("world_id").references(() => worlds.id),
	projectId: uuid("project_id").references(() => projects.id),
}, (table) => [
	index("idx_tag_scope").using("btree", table.projectId.asc().nullsLast(), table.worldId.asc().nullsLast()),
]);

export const teams = pgTable("teams", {
	id: uuid().primaryKey(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	name: text().notNull(),
});

export const teamsToProjects = pgTable("teams_to_projects", {
	teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	accessLevel: text("access_level").default("read").notNull(),
}, (table) => [
	primaryKey({ columns: [table.teamId, table.projectId], name: "teams_to_projects_pkey"}),
]);

export const teamsToWorlds = pgTable("teams_to_worlds", {
	teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	worldId: uuid("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" } ),
	accessLevel: text("access_level").default("read").notNull(),
}, (table) => [
	primaryKey({ columns: [table.teamId, table.worldId], name: "teams_to_worlds_pkey"}),
]);

export const users = pgTable("users", {
	id: uuid().primaryKey(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	email: text().notNull(),
});

export const usersToProjects = pgTable("users_to_projects", {
	userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	accessLevel: text("access_level").default("read").notNull(),
}, (table) => [
	primaryKey({ columns: [table.userId, table.projectId], name: "users_to_projects_pkey"}),
]);

export const usersToTeams = pgTable("users_to_teams", {
	userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	role: text().default("member").notNull(),
}, (table) => [
	primaryKey({ columns: [table.userId, table.teamId], name: "users_to_teams_pkey"}),
]);

export const usersToWorlds = pgTable("users_to_worlds", {
	userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	worldId: uuid("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" } ),
	accessLevel: text("access_level").default("read").notNull(),
}, (table) => [
	primaryKey({ columns: [table.userId, table.worldId], name: "users_to_worlds_pkey"}),
]);

export const worldAccessGrants = pgTable("world_access_grants", {
	id: uuid().defaultRandom().primaryKey(),
	worldId: uuid("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" } ),
	userId: uuid("user_id").notNull(),
	role: text().notNull(),
	licenseType: text("license_type"),
	createdAt: timestamp("created_at").default(sql`now()`),
}, (table) => [
	index("idx_world_access_grants_world").using("btree", table.worldId.asc().nullsLast()),
	unique("unq_world_user").on(table.worldId, table.userId),]);

export const worlds = pgTable("worlds", {
	id: uuid().primaryKey(),
	teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
	updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
	name: text().notNull(),
	description: text(),
	worldRepository: text("world_repository").notNull(),
	sacRepoId: text("sac_repo_id"),
	sacRepoUrl: text("sac_repo_url"),
}, (table) => [
	unique("worlds_world_repository_key").on(table.worldRepository),]);
