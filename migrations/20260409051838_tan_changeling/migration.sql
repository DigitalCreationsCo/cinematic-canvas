ALTER TABLE "asset_entries" ADD COLUMN "prop_id" uuid;--> statement-breakpoint
ALTER TABLE "props" ADD COLUMN "reference_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "props" ADD COLUMN "type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "props" ADD COLUMN "guidance_level" integer;--> statement-breakpoint
ALTER TABLE "props" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "props" DROP COLUMN "assets";--> statement-breakpoint
ALTER TABLE "asset_entries" ADD CONSTRAINT "asset_entries_prop_id_props_id_fkey" FOREIGN KEY ("prop_id") REFERENCES "props"("id");--> statement-breakpoint
ALTER TABLE "asset_entries" DROP CONSTRAINT "asset_entries_scene_id_scenes_id_fkey", ADD CONSTRAINT "asset_entries_scene_id_scenes_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id");--> statement-breakpoint
ALTER TABLE "asset_entries" DROP CONSTRAINT "asset_entries_character_id_characters_id_fkey", ADD CONSTRAINT "asset_entries_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "asset_entries" DROP CONSTRAINT "asset_entries_location_id_locations_id_fkey", ADD CONSTRAINT "asset_entries_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "asset_entries" DROP CONSTRAINT "asset_entries_file_id_files_id_fkey", ADD CONSTRAINT "asset_entries_file_id_files_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id");--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_world_id_worlds_id_fkey", ADD CONSTRAINT "jobs_world_id_worlds_id_fkey" FOREIGN KEY ("world_id") REFERENCES "worlds"("id");--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_world_id_worlds_id_fkey", ADD CONSTRAINT "projects_world_id_worlds_id_fkey" FOREIGN KEY ("world_id") REFERENCES "worlds"("id");--> statement-breakpoint
ALTER TABLE "tag_registry" DROP CONSTRAINT "tag_registry_character_id_characters_id_fkey", ADD CONSTRAINT "tag_registry_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "tag_registry" DROP CONSTRAINT "tag_registry_location_id_locations_id_fkey", ADD CONSTRAINT "tag_registry_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "tag_registry" DROP CONSTRAINT "tag_registry_prop_id_props_id_fkey", ADD CONSTRAINT "tag_registry_prop_id_props_id_fkey" FOREIGN KEY ("prop_id") REFERENCES "props"("id");