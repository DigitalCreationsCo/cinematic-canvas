CREATE TABLE "asset_entries" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"scene_id" uuid,
	"character_id" uuid,
	"location_id" uuid,
	"file_id" uuid,
	"asset_key" text NOT NULL,
	"head" integer DEFAULT 0 NOT NULL,
	"best" integer DEFAULT 0 NOT NULL,
	"best_locked_by_feedback" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_versions" (
	"id" uuid PRIMARY KEY,
	"asset_entry_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"data" text NOT NULL,
	"media_id" text,
	"type" text NOT NULL,
	"metadata" jsonb,
	"user_feedback" jsonb,
	"started_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvas_node_layouts" (
	"id_layout" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"id_context" uuid NOT NULL,
	"context_type" text NOT NULL,
	"id_entity" uuid NOT NULL,
	"node_type" text NOT NULL,
	"val_pos_x" real NOT NULL,
	"val_pos_y" real NOT NULL,
	"val_width" real,
	"val_height" real,
	"json_ui_metadata" jsonb DEFAULT '{}',
	"idx_version" integer DEFAULT 1 NOT NULL,
	"ts_updated" timestamp with time zone DEFAULT now(),
	CONSTRAINT "unq_context_entity" UNIQUE("id_context","id_entity")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"ledger_id" text,
	"reference_id" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"physical_traits" jsonb NOT NULL,
	"state" jsonb NOT NULL,
	"guidance_level" integer
);
--> statement-breakpoint
CREATE TABLE "entity_version_pins" (
	"project_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"pinned_versions" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"file_type" text DEFAULT 'import' NOT NULL,
	"media_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"world_id" uuid,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"payload" jsonb,
	"result" jsonb,
	"error" text DEFAULT '' NOT NULL,
	"unique_key" text NOT NULL,
	"asset_key" text NOT NULL,
	"attempts" jsonb NOT NULL,
	"recovery_context" jsonb,
	"workflow_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"ledger_id" text,
	"reference_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"mood" text NOT NULL,
	"lighting_conditions" jsonb NOT NULL,
	"time_of_day" text NOT NULL,
	"weather" text NOT NULL,
	"color_palette" jsonb NOT NULL,
	"architecture" jsonb NOT NULL,
	"natural_elements" jsonb NOT NULL,
	"man_made_objects" jsonb NOT NULL,
	"ground_surface" text NOT NULL,
	"sky_or_ceiling" text NOT NULL,
	"state" jsonb NOT NULL,
	"guidance_level" integer
);
--> statement-breakpoint
CREATE TABLE "media_objects" (
	"data" text PRIMARY KEY,
	"ref_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_referenced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY,
	"team_id" uuid NOT NULL,
	"world_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"storyboard" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"audio_analysis" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_scene_index" integer DEFAULT 0 NOT NULL,
	"force_regenerate_scene_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"generation_rules" text[] DEFAULT '{}'::text[] NOT NULL,
	"generation_rules_history" jsonb DEFAULT '[]' NOT NULL,
	"guidance_level" integer DEFAULT 2 NOT NULL,
	"sac_fork_repo_id" text,
	"sac_fork_repo_url" text
);
--> statement-breakpoint
CREATE TABLE "props" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid,
	"world_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"assets" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"scene_index" integer NOT NULL,
	"name" text NOT NULL,
	"start_time" real NOT NULL,
	"end_time" real NOT NULL,
	"duration" real NOT NULL,
	"type" text NOT NULL,
	"lyrics" text,
	"musical_description" text,
	"music_change" text,
	"intensity" text,
	"mood" text NOT NULL,
	"tempo" text NOT NULL,
	"audio_evidence" text NOT NULL,
	"transient_impact" text NOT NULL,
	"audio_sync" text NOT NULL,
	"transition_type" text NOT NULL,
	"shot_type" text NOT NULL,
	"camera_angle" text NOT NULL,
	"camera_movement" text NOT NULL,
	"composition" jsonb NOT NULL,
	"lighting" jsonb NOT NULL,
	"continuity_notes" text[] DEFAULT '{}'::text[] NOT NULL,
	"character_reference_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"location_reference_id" text NOT NULL,
	"location_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress_message" text,
	"guidance_level" integer
);
--> statement-breakpoint
CREATE TABLE "scenes_to_characters" (
	"scene_id" uuid,
	"character_id" uuid,
	CONSTRAINT "scenes_to_characters_pkey" PRIMARY KEY("scene_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "tag_registry" (
	"handle" text PRIMARY KEY,
	"entity_type" text NOT NULL,
	"character_id" uuid,
	"location_id" uuid,
	"prop_id" uuid,
	"world_id" uuid,
	"project_id" uuid
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams_to_projects" (
	"team_id" uuid,
	"project_id" uuid,
	"access_level" text DEFAULT 'read' NOT NULL,
	CONSTRAINT "teams_to_projects_pkey" PRIMARY KEY("team_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "teams_to_worlds" (
	"team_id" uuid,
	"world_id" uuid,
	"access_level" text DEFAULT 'read' NOT NULL,
	CONSTRAINT "teams_to_worlds_pkey" PRIMARY KEY("team_id","world_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users_to_projects" (
	"user_id" uuid,
	"project_id" uuid,
	"access_level" text DEFAULT 'read' NOT NULL,
	CONSTRAINT "users_to_projects_pkey" PRIMARY KEY("user_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "users_to_teams" (
	"user_id" uuid,
	"team_id" uuid,
	"role" text DEFAULT 'member' NOT NULL,
	CONSTRAINT "users_to_teams_pkey" PRIMARY KEY("user_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "users_to_worlds" (
	"user_id" uuid,
	"world_id" uuid,
	"access_level" text DEFAULT 'read' NOT NULL,
	CONSTRAINT "users_to_worlds_pkey" PRIMARY KEY("user_id","world_id")
);
--> statement-breakpoint
CREATE TABLE "world_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"world_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"license_type" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unq_world_user" UNIQUE("world_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "worlds" (
	"id" uuid PRIMARY KEY,
	"team_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"world_repository" text NOT NULL UNIQUE,
	"sac_repo_id" text,
	"sac_repo_url" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_unq_project_asset" ON "asset_entries" ("project_id","asset_key") WHERE scene_id IS NULL AND character_id IS NULL AND location_id IS NULL AND file_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_unq_scene_asset" ON "asset_entries" ("scene_id","asset_key");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_unq_char_asset" ON "asset_entries" ("character_id","asset_key");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_unq_loc_asset" ON "asset_entries" ("location_id","asset_key");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_unq_file_asset" ON "asset_entries" ("file_id","asset_key");--> statement-breakpoint
CREATE INDEX "idx_asset_entries_project" ON "asset_entries" ("project_id");--> statement-breakpoint
CREATE INDEX "idx_asset_entries_scene" ON "asset_entries" ("scene_id");--> statement-breakpoint
CREATE INDEX "idx_asset_entries_character" ON "asset_entries" ("character_id");--> statement-breakpoint
CREATE INDEX "idx_asset_entries_location" ON "asset_entries" ("location_id");--> statement-breakpoint
CREATE INDEX "idx_asset_entries_file" ON "asset_entries" ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_unq_asset_version_seq" ON "asset_versions" ("asset_entry_id","version");--> statement-breakpoint
CREATE INDEX "idx_asset_history_lookup" ON "asset_versions" ("asset_entry_id","version");--> statement-breakpoint
CREATE INDEX "idx_entry_version" ON "asset_versions" ("asset_entry_id","version");--> statement-breakpoint
CREATE INDEX "idx_canvas_layouts_context" ON "canvas_node_layouts" ("id_context");--> statement-breakpoint
CREATE INDEX "characters_guidance_idx" ON "characters" ("guidance_level");--> statement-breakpoint
CREATE INDEX "idx_files_project" ON "files" ("project_id");--> statement-breakpoint
CREATE INDEX "idx_files_type" ON "files" ("file_type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_active_logical_job" ON "jobs" ("project_id","type","unique_key") WHERE state IN ('CREATED', 'RUNNING');--> statement-breakpoint
CREATE INDEX "idx_scoped_latest_job" ON "jobs" ("project_id","type","unique_key","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_project_running_jobs" ON "jobs" ("project_id") WHERE state = 'RUNNING';--> statement-breakpoint
CREATE INDEX "idx_project_created" ON "jobs" ("project_id","state");--> statement-breakpoint
CREATE INDEX "idx_jobs_state_updated" ON "jobs" ("state","updated_at");--> statement-breakpoint
CREATE INDEX "locations_guidance_idx" ON "locations" ("guidance_level");--> statement-breakpoint
CREATE INDEX "projects_guidance_idx" ON "projects" ("guidance_level");--> statement-breakpoint
CREATE INDEX "scenes_guidance_idx" ON "scenes" ("guidance_level");--> statement-breakpoint
CREATE INDEX "idx_tag_scope" ON "tag_registry" ("project_id","world_id");--> statement-breakpoint
CREATE INDEX "idx_world_access_grants_world" ON "world_access_grants" ("world_id");--> statement-breakpoint
ALTER TABLE "asset_entries" ADD CONSTRAINT "asset_entries_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "asset_entries" ADD CONSTRAINT "asset_entries_scene_id_scenes_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "asset_entries" ADD CONSTRAINT "asset_entries_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "asset_entries" ADD CONSTRAINT "asset_entries_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "asset_entries" ADD CONSTRAINT "asset_entries_file_id_files_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_entry_id_asset_entries_id_fkey" FOREIGN KEY ("asset_entry_id") REFERENCES "asset_entries"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_media_id_media_objects_data_fkey" FOREIGN KEY ("media_id") REFERENCES "media_objects"("data") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "entity_version_pins" ADD CONSTRAINT "entity_version_pins_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_media_id_media_objects_data_fkey" FOREIGN KEY ("media_id") REFERENCES "media_objects"("data") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_world_id_worlds_id_fkey" FOREIGN KEY ("world_id") REFERENCES "worlds"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_world_id_worlds_id_fkey" FOREIGN KEY ("world_id") REFERENCES "worlds"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "props" ADD CONSTRAINT "props_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id");--> statement-breakpoint
ALTER TABLE "props" ADD CONSTRAINT "props_world_id_worlds_id_fkey" FOREIGN KEY ("world_id") REFERENCES "worlds"("id");--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "scenes_to_characters" ADD CONSTRAINT "scenes_to_characters_scene_id_scenes_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "scenes_to_characters" ADD CONSTRAINT "scenes_to_characters_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tag_registry" ADD CONSTRAINT "tag_registry_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tag_registry" ADD CONSTRAINT "tag_registry_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tag_registry" ADD CONSTRAINT "tag_registry_prop_id_props_id_fkey" FOREIGN KEY ("prop_id") REFERENCES "props"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tag_registry" ADD CONSTRAINT "tag_registry_world_id_worlds_id_fkey" FOREIGN KEY ("world_id") REFERENCES "worlds"("id");--> statement-breakpoint
ALTER TABLE "tag_registry" ADD CONSTRAINT "tag_registry_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id");--> statement-breakpoint
ALTER TABLE "teams_to_projects" ADD CONSTRAINT "teams_to_projects_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "teams_to_projects" ADD CONSTRAINT "teams_to_projects_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "teams_to_worlds" ADD CONSTRAINT "teams_to_worlds_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "teams_to_worlds" ADD CONSTRAINT "teams_to_worlds_world_id_worlds_id_fkey" FOREIGN KEY ("world_id") REFERENCES "worlds"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "users_to_projects" ADD CONSTRAINT "users_to_projects_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "users_to_projects" ADD CONSTRAINT "users_to_projects_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "users_to_teams" ADD CONSTRAINT "users_to_teams_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "users_to_teams" ADD CONSTRAINT "users_to_teams_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "users_to_worlds" ADD CONSTRAINT "users_to_worlds_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "users_to_worlds" ADD CONSTRAINT "users_to_worlds_world_id_worlds_id_fkey" FOREIGN KEY ("world_id") REFERENCES "worlds"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "world_access_grants" ADD CONSTRAINT "world_access_grants_world_id_worlds_id_fkey" FOREIGN KEY ("world_id") REFERENCES "worlds"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;