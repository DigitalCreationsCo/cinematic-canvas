// shared/types/assets.types.ts
import { z } from "zod";
import { QualityEvaluationResult } from "./quality.types.js";
import { createInsertSchema } from "drizzle-zod";
import { assetVersions } from "../db/schema.js";

// ============================================================================
// ASSET STATUS & ENUMS
// ============================================================================

export const AssetStatus = z.preprocess(
  (val) => (typeof val === "string" ? val.toLowerCase() : val), z.enum(["pending", "generating", "evaluating", "complete", "error"])).default("pending");
export type AssetStatus = z.infer<typeof AssetStatus>;

/** The four entity types that own an AssetRegistry. */
export type EntityType = "project" | "scene" | "character" | "location" | "file";

// ============================================================================
// ASSET TYPES
// ============================================================================

export const GcsObjectType = z.union([
  z.literal('batch'),
  z.literal('thumbnail'),
  z.literal('final_output'),
  z.literal('character_image'),
  z.literal('location_image'),
  z.literal('scene_video'),
  z.literal('scene_start_frame'),
  z.literal('scene_end_frame'),
  z.literal('render_video'),
  z.literal('image_file'),
]);
export type GcsObjectType = z.infer<typeof GcsObjectType>;

export const AssetKey = z.union([
  GcsObjectType,
  z.literal('enhanced_prompt'),
  z.literal('storyboard'),
  z.literal('character_description'),
  z.literal('character_prompt'),
  z.literal('location_description'),
  z.literal('location_prompt'),
  z.literal('scene_description'),
  z.literal('scene_prompt'),
  z.literal('start_frame_prompt'),
  z.literal('end_frame_prompt'),
  z.literal('audio_analysis'),
  z.literal('generation_rules'),
]);
export type AssetKey = z.infer<typeof AssetKey>;

export const AssetType = z.enum(['video', 'image', 'audio', 'text', 'json']);
export type AssetType = z.infer<typeof AssetType>;

export type Scope = {
  projectId: string;
} | {
  projectId: string;
  sceneIds: string[];
} | {
  projectId: string;
  characterIds: string[];
} | {
  projectId: string;
  locationIds: string[];
} | {
  projectId: string;
  fileIds: string[];
};

// ============================================================================
// USER FEEDBACK
// ============================================================================

/**
 * User-provided signal on a generated asset version.
 * A 'liked' rating locks the version as best and blocks autonomous overrides.
 * Stored as a top-level field on AssetVersion (nullable) so it can be set
 * post-creation without touching immutable generation metadata.
 */
export const UserFeedback = z.object({
  rating: z.enum(["liked", "disliked"]),
  userId: z.string().describe("ID of the user who provided the feedback"),
  note: z.string().nullish().describe("Optional free-text reason"),
  recordedAt: z.preprocess(
    (val) => (typeof val === "string" ? new Date(val) : val),
    z.date()
  ).default(() => new Date()),
});
export type UserFeedback = z.infer<typeof UserFeedback>;

// ============================================================================
// ASSET VERSION & REGISTRY
// ============================================================================

export const AssetVersion = z.object({
  version: z.number(),
  data: z.string().describe("The content (text) or URI (file)"),
  type: AssetType,

  metadata: z.object({
    evaluation: QualityEvaluationResult.nullish().describe("Quality evaluation result"),
    model: z.string().nullish().describe("AI model used for asset generation"),
    jobId: z.string().nullish().describe("Job that created this version"),
    prompt: z.string().nullish().describe("Prompt used for asset generation"),
    duration: z.number().nullish().describe("Duration of the asset in seconds"),
    width: z.number().nullish().describe("Width of the asset in pixels"),
    height: z.number().nullish().describe("Height of the asset in pixels"),
    fps: z.number().nullish().describe("Frames per second of the asset"),
    bitrate: z.number().nullish().describe("Bitrate of the asset in bits per second"),
  }).default({}).describe("Flexible metadata for evaluations, models, etc."),

  /** Set post-creation when user rates this version. */
  userFeedback: UserFeedback.nullish(),

  startedAt: z.preprocess(
    (val) => (typeof val === "string" ? new Date(val) : val),
    z.date()
  ).default(() => new Date()),
  createdAt: z.preprocess(
    (val) => (typeof val === "string" ? new Date(val) : val),
    z.date()
  ).default(() => new Date()),
});
export type AssetVersion = z.infer<typeof AssetVersion>;

export const AssetVersionInsert = createInsertSchema(assetVersions);
export type AssetVersionInsert = z.infer<typeof AssetVersionInsert>;



export const AssetHistory = z.object({
  head: z.number().default(0).describe("The highest version number created"),
  best: z.number().default(0).describe("The version currently selected as active/best"),
  versions: z.array(AssetVersion).default([]),
});
export type AssetHistory = z.infer<typeof AssetHistory>;

export const AssetRegistry = z.partialRecord(AssetKey, AssetHistory).describe("The core registry map to be used in Projects, Scenes, Locations, and Characters").default({});
export type AssetRegistry = z.infer<typeof AssetRegistry>;

export type CreateVersionedAssetsBaseArgs = [
  scope: Scope,
  assetKeys: AssetKey[],

  // Now accepts a single type string OR an array of strings
  type: AssetType | AssetType[],

  // The primary data payload (Always an array)
  dataList: string[],

  // Now accepts single metadata object OR array of objects
  metadata: AssetVersion['metadata'] | AssetVersion['metadata'][],

  // Now accepts single boolean OR array of booleans
  setBest?: boolean | boolean[],

  // When the user triggered the generation action (job claim time for batch, click time for manual)
  startedAt?: Date,
];

export const GuidanceLevel = z.number().nullish().describe("Entity-scoped guidance control for asset generation");
export type GuidanceLevel = z.infer<typeof GuidanceLevel>;