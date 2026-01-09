import { z } from "zod";
import { relations } from "drizzle-orm";
import { jsonb } from "drizzle-orm/pg-core";
import { createTableFromZod } from "zod-to-drizzle";
import { InitialProjectSchema, CharacterSchema, LocationSchema, ProjectSchema, SceneSchema } from "./types/pipeline.types";

const UserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email().optional(),
  createdAt: z.string().default(new Date().toISOString()),
  updatedAt: z.string().default(new Date().toISOString()),
});

const users = createTableFromZod("users", UserSchema, {
  dialect: "pg",
  primaryKey: "id"
});

export type InsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// export const projects = pgTable("projects", {
//   id: uuid("id").primaryKey().defaultRandom(),
//   name: text("name").notNull(),

//   // High-level status for list filtering
//   status: varchar("status", { length: 50 }).default("active").notNull(),

//   // The original prompt that started it all
//   enhancedPrompt: text("creative_prompt").notNull(),

//   // Complex metadata (Genre, Style, user preferences)
//   // Validated by: ProjectMetadataSchema
//   metadata: jsonb("metadata").default({}),

//   createdAt: timestamp("created_at").defaultNow().notNull(),
//   updatedAt: timestamp("updated_at").defaultNow().notNull(),
// });

export const scenes = createTableFromZod("scenes", SceneSchema, {
  dialect: "pg",
  primaryKey: "id",
  jsonColumns: (schema) => {
    const { projectId, sceneIndex, status, createdAt, updatedAt, ...metadataFields } = schema.shape;

    return {
      data: {
        fields: [ 'projectId' ],
        exclusive: true,
      }
    };
  }
  // id: uuid("id").primaryKey().defaultRandom(),

  // // Foreign Key to Project
  // projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),

  // // Ordering
  // sceneIndex: integer("scene_index").notNull(),

  // // Core Workflow AssetStatus (Queryable)
  // status: varchar("status", { length: 50 }).default("pending").notNull(),

  // // Artifact Pointers (GCS URIs) - Kept top-level for easy access
  // videoUri: text("video_uri"),
  // startFrameUri: text("start_frame_uri"),
  // endFrameUri: text("end_frame_uri"),

  // // THE CORE PAYLOAD
  // // Contains: DirectorScene, Lighting, Camera, Metrics
  // // Validated by: SceneSchema (minus the ID which is now the PK)
  // data: jsonb("data").notNull(),

  // createdAt: timestamp("created_at").defaultNow().notNull(),
  // updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type InsertScene = typeof scenes.$inferInsert;

export const characters = createTableFromZod("characters", CharacterSchema, {
  dialect: "pg",
  primaryKey: "id",
  jsonColumns: (schema) => {
    const { id, projectId, name, createdAt, updatedAt, ...dataFields } = schema.shape;
    return {
      data: {
        fields: [ 'id' ],
        exclusive: true
      }
    };
  }
});
export type InsertCharacter = typeof characters.$inferInsert;

export const locations = createTableFromZod("locations", LocationSchema, {
  dialect: "pg",
  primaryKey: "id",
  jsonColumns: (schema) => {
    const { id, projectId, name, createdAt, updatedAt, ...dataFields } = schema.shape;
    return {
      data: {
        fields: [ 'mood' ],
        exclusive: true
      }
    };
  }
});
export type InsertLocation = typeof locations.$inferInsert;

export const projects = createTableFromZod("projects", InitialProjectSchema, {
  dialect: "pg",
  primaryKey: 'id',
  jsonColumns: (schema) => {
    return {
      metadata: {
        fields: [ 'metadata' ],
        exclusive: true,
      },
      storyboard: {
        fields: [ 'storyboard' ],
        exclusive: false,
      }
    };
  },
});

export const projectRelations = relations(projects, ({ many }) => ({
  scenes: many(scenes),
  characters: many(characters),
  locations: many(locations),
}));

export const sceneRelations = relations(scenes, ({ many }) => ({
  project: many(projects),
}));

export const characterRelations = relations(characters, ({ many }) => ({
  project: many(projects),
}));

export const locationRelations = relations(locations, ({ many }) => ({
  project: many(projects),
}));
