// shared/types/assets.types.ts
import { z } from "zod";
import { QualityEvaluationResult } from "./quality.types.js";
import { UserRef } from "#shared/types/base.types.js";

// ============================================================================
// ASSET STATUS & ENUMS
// ============================================================================

export const AssetStatus = z
  .preprocess(
    (val) => (typeof val === "string" ? val.toLowerCase() : val),
    z.enum(["pending", "generating", "evaluating", "complete", "error"]),
  )
  .default("pending");
export type AssetStatus = z.infer<typeof AssetStatus>;

// ============================================================================
// ASSET TYPES
// ============================================================================

export const GcsObjectType = z.union([
  z.literal("batch-data"),
  z.literal("thumbnail"),
  z.literal("final_output"),
  z.literal("scene_video"),
  z.literal("scene_start_frame"),
  z.literal("scene_end_frame"),
  z.literal("render_video"),
  z.literal("image_file"),
  z.literal("character_image"),
  z.literal("location_image"),
]);
export type GcsObjectType = z.infer<typeof GcsObjectType>;

// includes GcsObjectType union values
export const AssetKey = z.union([
  z.literal("batch-data"),
  z.literal("thumbnail"),
  z.literal("final_output"),
  z.literal("scene_video"),
  z.literal("scene_start_frame"),
  z.literal("scene_end_frame"),
  z.literal("render_video"),
  z.literal("image_file"),
  z.literal("character_image"),
  z.literal("location_image"),
  z.literal("prop_image"),

  z.literal("enhanced_prompt"),
  z.literal("storyboard"),
  z.literal("description"),
  z.literal("audio_analysis"),
  z.literal("generation_rules"),
  z.literal("entity"),
]);
export type AssetKey = z.infer<typeof AssetKey>;

export const AssetType = z.enum(["video", "image", "audio", "text", "json"]);
export type AssetType = z.infer<typeof AssetType>;

export type Scope =
  | {
      projectId: string;
    }
  | {
      projectId: string;
      sceneIds: string[];
    }
  | {
      projectId: string;
      characterIds: string[];
    }
  | {
      projectId: string;
      locationIds: string[];
    }
  | {
      projectId: string;
      propIds: string[];
    }
  | {
      projectId: string;
      fileIds: string[];
    };

export const ASSET_TYPE_MAP: Record<z.infer<typeof AssetKey>, AssetType> = {
  "batch-data": "json",
  thumbnail: "image",
  final_output: "video",
  scene_video: "video",
  scene_start_frame: "image",
  scene_end_frame: "image",
  render_video: "video",
  image_file: "image",
  character_image: "image",
  location_image: "image",
  "prop_image": "image",
  enhanced_prompt: "text",
  storyboard: "json",
  description: "text",
  audio_analysis: "json",
  generation_rules: "text",
  entity: "json",
};

/**
 * a typed helper function that asserts the correct mapped assetKey type
 * @param makeValue
 * @returns
 */
export function buildAssetKeyShape<TBase extends z.ZodObject, V extends z.ZodTypeAny>(
  base: TBase,
  makeValue: () => V,
): { [K in Exclude<AssetKey, keyof z.infer<TBase>>]: V } {
  const existingKeys = new Set(Object.keys(base.shape));
  return Object.fromEntries(
    AssetKey.options
      .map((o) => o.value)
      .filter((k) => !existingKeys.has(k))
      .map((k) => [k, makeValue()]),
  ) as { [K in Exclude<AssetKey, keyof z.infer<TBase>>]: V };
}

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
  userId: UserRef.shape.userId.describe("ID of the user who provided the feedback"),
  rating: z.enum(["liked", "disliked"]),
  note: z.string().nullish().describe("Optional free-text reason"),
  recordedAt: z
    .preprocess((val) => (typeof val === "string" ? new Date(val) : val), z.date())
    .default(() => new Date()),
});
export type UserFeedback = z.infer<typeof UserFeedback>;

// ============================================================================
// ASSET VERSION & REGISTRY
// ============================================================================

export const AssetVersion = z.object({
  version: z.number(),
  data: z.string().describe("The content (text) or URI (file)"),
  type: AssetType,

  metadata: z
    .object({
      evaluation: QualityEvaluationResult.nullish().describe("Quality evaluation result"),
      model: z.string().nullish().describe("AI model used for asset generation"),
      promptModel: z.string().nullish().describe("AI model used for prompt generation"),
      jobId: z.string().nullish().describe("Job that created this version"),
      prompt: z.string().nullish().describe("Prompt used for asset generation"),
      duration: z.number().nullish().describe("Duration of the asset in seconds"),
      width: z.number().nullish().describe("Width of the asset in pixels"),
      height: z.number().nullish().describe("Height of the asset in pixels"),
      fps: z.number().nullish().describe("Frames per second of the asset"),
      bitrate: z.number().nullish().describe("Bitrate of the asset in bits per second"),
    })
    .default({})
    .describe("Flexible metadata for evaluations, models, etc."),

  /** Set post-creation when user rates this version. */
  userFeedback: UserFeedback.nullish(),

  startedAt: z
    .preprocess((val) => (typeof val === "string" ? new Date(val) : val), z.date())
    .default(() => new Date()),
  createdAt: z
    .preprocess((val) => (typeof val === "string" ? new Date(val) : val), z.date())
    .default(() => new Date()),
});
export type AssetVersion = z.infer<typeof AssetVersion>;

export const AssetHistory = z
  .object({
    head: z.number().default(0).describe("The highest version number created"),
    best: z.number().default(0).describe("The version currently selected as active/best"),
    versions: z.array(AssetVersion).default([]),
  })
  .strict();
export type AssetHistory = z.infer<typeof AssetHistory>;

export const AssetRegistry = z
  .partialRecord(AssetKey, AssetHistory)
  .default({})
  .describe(
    "The core registry map to be used in Projects, Scenes, Locations, and Characters",
  );
export type AssetRegistry = z.infer<typeof AssetRegistry>;

export type CreateVersionedAssetsBaseArgs = [
  scope: Scope,
  assetKeys: AssetKey[],

  // Now accepts a single type string OR an array of strings
  type: AssetType | AssetType[],

  // The primary data payload (Always an array)
  dataList: string[],

  // Now accepts single metadata object OR array of objects
  metadata: AssetVersion["metadata"] | AssetVersion["metadata"][],

  // Now accepts single boolean OR array of booleans
  setBest?: boolean | boolean[],

  // When the user triggered the generation action (job claim time for batch, click time for manual)
  startedAt?: Date,
];

export const GuidanceLevel = z
  .number()
  .nullish()
  .describe("Entity-scoped guidance control for asset generation");
export type GuidanceLevel = z.infer<typeof GuidanceLevel>;
