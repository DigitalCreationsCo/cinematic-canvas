CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY,
	"index" integer NOT NULL,
	"project_id" text NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"dialogue" text,
	"image_url" text,
	"search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('english', "blocks"."content")) STORED,
	"is_notable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"happened_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"title" text DEFAULT 'New Conversation' NOT NULL,
	"context_summary" text,
	"token_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lore" (
	"id" uuid PRIMARY KEY,
	"project_id" text NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"happened_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"is_complete" boolean DEFAULT true NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "props" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_blocks_project_id" ON "blocks" ("project_id");--> statement-breakpoint
CREATE INDEX "idx_blocks_search" ON "blocks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "idx_conversations_project" ON "conversations" ("project_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_user" ON "conversations" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation" ON "messages" ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_messages_created" ON "messages" ("created_at");--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lore" ADD CONSTRAINT "lore_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;