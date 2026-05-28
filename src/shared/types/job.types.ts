// shared/types/job.types.ts
import { z } from "zod";
import { AssetKey } from "#shared/types/assets.types.js";
import { AudioAnalysis } from "#shared/types/audio.types.js";
import {
  CharacterBase,
  CharacterWithAssets,
  Location,
  LocationWithAssets,
  SceneGenerationResult,
  SceneWithAssets,
} from "#shared/types/workflow.types.js";
import { StoryboardAttributes } from "#shared/types/storyboard.types.js";
import { QualityEvaluationResult } from "#shared/types/quality.types.js";
import { ReferenceType } from "#shared/lm/provider.js";
import {
  InsertEntitiesInput,
  GenerateEntitiesPayload,
  CreateSceneWithEntitiesInput,
} from "#shared/types/editable.types.js";
import type { Job } from "#shared/types/schema.types.js";
import {
  JOB_STATES,
  JOB_TYPES,
  RETRY_STRATEGIES,
  TERMINAL_JOB_STATES,
  ACTIVE_JOB_STATES,
  JobType,
} from "#shared/types/job.constants.js";
import { IdentityBase, VALID_DURATIONS } from "#shared/types/base.types.js";

export * from "#shared/types/job.constants.js";
export { Job, InsertJob } from "#shared/types/schema.types.js";

export const RecoveryConfig = z.object({
  maxRetries: z.number().nonnegative().default(3).describe("Per-job-record retry ceiling"),
  maxTotalAttempts: z.number().nonnegative().default(10).describe("Lifetime ceiling across all successor jobs"),
  allowAutoRecovery: z.boolean().default(true).describe("true = auto-create successor; false = throw"),
  recoveryInstructions: z.string().nullish().describe("Instructions for manual recovery"),
});
export type RecoveryConfig = z.infer<typeof RecoveryConfig>;

// ============================================================================
// JOB PAYLOAD/RESULT SCHEMAS - defined FIRST for use in Job/InsertJob
// ============================================================================

const CreateScenesWithEntitiesBase = z.object({
  sceneFields: CreateSceneWithEntitiesInput.describe(
    "Scene generation payload that informs the first scene in the sequence, and subsequent scenes will be derived from this payload."
  ),
  sceneIds: z
    .array(IdentityBase.shape.id)
    .describe("New or existing scene identifiers used for continuity, sequencing, dependency ordering, or contextual reference during generation."),
  startFrameGcsUri: z
    .string()
    .optional()
    .describe("Image URI for the starting reference frame. Used to guide opening composition, visual continuity, character positioning, or transition state."),
  startFrameMimeType: z
    .string()
    .optional()
    .describe("MIME type for the starting reference frame asset."),
  endFrameGcsUri: z
    .string()
    .optional()
    .describe("Image URI for the ending reference frame. Used to guide ending composition, transition targets, or continuity into downstream sequences."),
  endFrameMimeType: z
    .string()
    .optional()
    .describe("MIME type for the ending reference frame asset."),
});

export const jobPayloadSchemas = {
  EXPAND_CREATIVE_PROMPT: z.undefined(),
  GENERATE_STORYBOARD: z.undefined(),
  PROCESS_AUDIO_TO_SCENES: z.undefined(),
  ENHANCE_STORYBOARD: z.undefined(),
  SEMANTIC_ANALYSIS: z.undefined(),
  GENERATE_CHARACTERS: z.array(CharacterBase),
  GENERATE_CHARACTER_IMAGES: z.object({ characterIds: z.array(z.string()) }),
  GENERATE_LOCATIONS: z.array(Location),
  GENERATE_LOCATION_IMAGES: z.object({ locationIds: z.array(z.string()) }),
  GENERATE_ENTITIES: InsertEntitiesInput,

  CREATE_SCENES_WITH_ENTITIES: z.discriminatedUnion("mode", [
    CreateScenesWithEntitiesBase.extend({
      mode: z.literal("scenes").describe("Fixed scene-count generation mode."),
      sceneCount: z.number().min(1).max(50).default(1).describe("Total number of scenes to generate from the narrative prompt. Must be between 1 and 50 scenes."),
    }),
    CreateScenesWithEntitiesBase.extend({
      mode: z.literal("duration").describe("Duration-based generation mode."),
      duration: z.number().optional().describe(`Total target duration for the generated sequence, in seconds. The downstream worker segments the sequence into multiple scenes using supported scene duration intervals: ${VALID_DURATIONS.join(", ")}.`),
    }),
  ]).describe(`Takes scene description or scene field data from the user. Dispatches a job to generate scenes and images. This tool can create multiple scenes in a single invocation. If any existing scene is meant to be included, include the existing sceneId in sceneIds parameter. All other sceneIds will be generated automatically by the tool.

  Unified scene generation schema supporting two orchestration modes (duration mode not implemented yet):
  Mode 1 — "scenes"
  Generates a fixed number of scenes from a high-level narrative prompt.
  The downstream worker decomposes the prompt into sceneCount scenes,
  extracting characters, locations, props, and contextual relationships
  from the associated project entities.
 
  Mode 2 — "duration (DO NOT USE: NOT IMPLEMENTED YET!)"
  Generates a timed sequence from a high-level narrative prompt.
  The downstream worker decomposes the prompt into multiple scenes whose
  durations align with the supported segment durations (${VALID_DURATIONS} seconds).
  This mode is useful for music-backed sequences, cinematic timelines,
  trailers, and continuous video generation workflows.
 
  Shared Behavior
  - Existing sceneIds may be used as contextual references, dependencies,
    or continuation anchors during generation.
  - Optional start/end frame assets can be provided to guide visual continuity,
    transitions, composition, or motion direction.
  - sceneFields defines the narrative direction applied to all
    generated scenes.`),

  GENERATE_SCENE_FRAMES: z.object({
    sceneIds: z.array(z.string()).optional(),
    assetKeys: z.array(z.enum(["scene_start_frame", "scene_end_frame"])),
    promptModifications: z.array(z.string()).optional(),
  }),
  GENERATE_SCENE_VIDEO: z.object({
    sceneId: z.string(),
    overridePrompt: z.string(),
    renderInProgress: z.boolean().optional(),
  }),
  RENDER_VIDEO: z.object({
    videoPaths: z.array(z.string()),
    audioGcsUri: z.string().optional(),
  }),
  GENERATE_COMPOSITE: z.object({
    imageId: z.string(),
    inputImages: z.array(
      z.object({
        src: z.string(),
        entityId: z.string(),
        assetKey: AssetKey,
        version: z.number(),
        weight: z.number(),
        blendMode: z.enum(["normal", "overlay", "multiply", "screen", "soft-light"]),
        type: z.enum(["base", "mask", "control", "style", "subject", "content"]),
      }),
    ),
    prompt: z.string(),
    negativePrompt: z.string().optional(),
    numberOfOutputs: z.number(),
  }),
} as const;

export type JobPayloadSchemaMap = typeof jobPayloadSchemas;

const jobResultSchemas = {
  EXPAND_CREATIVE_PROMPT: z.any(),
  GENERATE_STORYBOARD: z.any(),
  PROCESS_AUDIO_TO_SCENES: z.any(),
  ENHANCE_STORYBOARD: z.any(),
  SEMANTIC_ANALYSIS: z.any(),
  GENERATE_CHARACTERS: z.any(),
  GENERATE_CHARACTER_IMAGES: z.any(),
  GENERATE_LOCATIONS: z.any(),
  GENERATE_LOCATION_IMAGES: z.any(),
  GENERATE_ENTITIES: z.any(),
  CREATE_SCENES_WITH_ENTITIES: z.any(),
  GENERATE_SCENE_FRAMES: z.any(),
  GENERATE_SCENE_VIDEO: z.any(),
  RENDER_VIDEO: z.any(),
  GENERATE_COMPOSITE: z.any(),
} as const;

export type JobPayload<T = JobType> = Extract<AnyJob, { type: T }>["payload"];

type JobBaseFields = Omit<Job, "type" | "payload" | "result">;

export type JobExpandCreativePrompt = JobBaseFields & {
  type: "EXPAND_CREATIVE_PROMPT";
  payload: undefined;
  result: GenerativeResultExpandCreativePrompt["data"];
};
export type JobGenerateStoryboard = JobBaseFields & {
  type: "GENERATE_STORYBOARD";
  payload: undefined;
  result: GenerativeResultGenerateStoryboard["data"];
};
export type JobProcessAudioToScenes = JobBaseFields & {
  type: "PROCESS_AUDIO_TO_SCENES";
  payload: undefined;
  result: GenerativeResultProcessAudioToScenes["data"];
};
export type JobEnhanceStoryboard = JobBaseFields & {
  type: "ENHANCE_STORYBOARD";
  payload: undefined;
  result: GenerativeResultEnhanceStoryboard["data"];
};
export type JobSemanticAnalysis = JobBaseFields & {
  type: "SEMANTIC_ANALYSIS";
  payload: undefined;
  result: GenerativeResultSemanticAnalysis["data"];
};

export type JobGenerateCharacters = JobBaseFields & {
  type: "GENERATE_CHARACTERS";
  payload: CharacterBase[];
  result: GenerativeResultGenerateCharacters["data"];
};
export type JobGenerateCharacterAssets = JobBaseFields & {
  type: "GENERATE_CHARACTER_IMAGES";
  payload?: { characterIds?: string[]; };
  result: GenerativeResultGenerateCharacterAssets["data"];
};

export type JobGenerateLocations = JobBaseFields & {
  type: "GENERATE_LOCATIONS";
  payload: Location[];
  result: GenerativeResultGenerateLocations["data"];
};
export type JobGenerateLocationAssets = JobBaseFields & {
  type: "GENERATE_LOCATION_IMAGES";
  payload?: { locationIds?: string[]; };
  result: GenerativeResultGenerateLocationAssets["data"];
};
export type JobGenerateEntities = JobBaseFields & {
  type: "GENERATE_ENTITIES";
  payload: GenerateEntitiesPayload;
  result: GenerativeResultGenerateEntities["data"];
};

export type JobCreateSceneWithEntities = JobBaseFields & {
  type: "CREATE_SCENES_WITH_ENTITIES";
  payload: z.infer<JobPayloadSchemaMap["CREATE_SCENES_WITH_ENTITIES"]>;
  result: GenerativeResultCreateSceneWithEntities["data"];
};
export type JobGenerateSceneFrames = JobBaseFields & {
  type: "GENERATE_SCENE_FRAMES";
  payload: {
    sceneIds?: string[];
    assetKeys: ("scene_start_frame" | "scene_end_frame")[];
    promptModifications?: string[];
  };
  result: GenerativeResultGenerateSceneFrames["data"];
};
export type JobGenerateSceneVideo = JobBaseFields & {
  type: "GENERATE_SCENE_VIDEO";
  payload: { sceneId: string; overridePrompt: string; renderInProgress?: boolean };
  result: GenerativeResultGenerateSceneVideo["data"];
};
export type JobRenderVideo = JobBaseFields & {
  type: "RENDER_VIDEO";
  payload: { videoPaths: string[]; audioGcsUri?: string };
  result: GenerativeResultRenderVideo["data"];
};

export type JobGenerateComposite = JobBaseFields & {
  type: "GENERATE_COMPOSITE";
  payload: {
    imageId: string;
    inputImages: {
      src: string;
      entityId: string;
      assetKey: AssetKey;
      version: number;
      weight: number;
      blendMode: "normal" | "overlay" | "multiply" | "screen" | "soft-light";
      type: ReferenceType;
    }[];
    prompt: string;
    negativePrompt?: string;
    numberOfOutputs: number;
  };
  result: GenerativeResultGenerateComposite["data"];
};

export type AnyJob =
  | JobExpandCreativePrompt
  | JobGenerateStoryboard
  | JobProcessAudioToScenes
  | JobEnhanceStoryboard
  | JobSemanticAnalysis
  | JobCreateSceneWithEntities
  | JobGenerateCharacters
  | JobGenerateCharacterAssets
  | JobGenerateLocations
  | JobGenerateLocationAssets
  | JobGenerateEntities
  | JobGenerateSceneFrames
  | JobGenerateSceneVideo
  | JobRenderVideo
  | JobGenerateComposite;

// ============================================================================
// GENERATIVE AI RESULT TYPES  (unchanged – omitted for brevity in this diff)
// ============================================================================

export type GenerativeResultEnvelope<T> = {
  data: T;
  metadata: {
    model: string;
    evaluation?: QualityEvaluationResult;
    attempts: number;
    acceptedAttempt: number;
    prompt?: string;
    warning?: string;
  };
};

export type GenerativeResultExpandCreativePrompt = GenerativeResultEnvelope<{ expandedPrompt: string }>;
export type GenerativeResultGenerateStoryboard = GenerativeResultEnvelope<{
  storyboardAttributes: StoryboardAttributes;
}>;
export type GenerativeResultProcessAudioToScenes = GenerativeResultEnvelope<{ analysis: AudioAnalysis }>;
export type GenerativeResultEnhanceStoryboard = GenerativeResultEnvelope<{
  storyboardAttributes: StoryboardAttributes;
}>;
export type GenerativeResultSemanticAnalysis = GenerativeResultEnvelope<{ dynamicRules: string[] }>;
export type GenerativeResultGenerateCharacters = GenerativeResultEnvelope<{ characters: CharacterWithAssets[] }>;
export type GenerativeResultGenerateCharacterAssets = GenerativeResultEnvelope<{ characters: CharacterWithAssets[] }>;
export type GenerativeResultGenerateLocations = GenerativeResultEnvelope<{ locations: LocationWithAssets[] }>;
export type GenerativeResultGenerateLocationAssets = GenerativeResultEnvelope<{ locations: LocationWithAssets[] }>;
export type GenerativeResultGenerateEntities = GenerativeResultEnvelope<{ entities: InsertEntitiesInput[] }>;
export type GenerativeResultGenerateSceneFrames = GenerativeResultEnvelope<{
  updatedScenes: SceneWithAssets[];
  deferredSceneIds: string[];
}>;
export type GenerativeResultGenerateSceneVideo = GenerativeResultEnvelope<SceneGenerationResult>;
export type GenerativeResultRenderVideo = GenerativeResultEnvelope<{ renderedVideo: string }>;
export type GenerativeResultFrameRender = GenerativeResultEnvelope<{ scene: SceneWithAssets; image: string }>;
export type GenerativeResultGenerateComposite = GenerativeResultEnvelope<{
  outputImages: { data: string; version: number }[];
}>;
export type GenerativeResultCreateSceneWithEntities = GenerativeResultEnvelope<{
  scene: SceneWithAssets;
  newCharacters: CharacterWithAssets[];
  newLocation: LocationWithAssets | null;
  // When sceneCount > 1, the worker returns the first scene inline
  // and emits ENTITY_CREATED events for the remaining scenes.
  sceneIds?: string[];
  scenes?: SceneWithAssets[];
}>;

// ============================================================================
// JOB EVENTS
// ============================================================================

/**
 * Metadata embedded in every JobEvent so consumers can act on job type /
 * workflowId without an extra DB lookup.
 *
 * workflowId is present when the job was dispatched by an agentic pipeline run.
 * It is absent (undefined) for user-initiated, standalone jobs.
 */
export type JobEventMetadata = {
  /** The JobType of the job that changed state. */
  jobType: JobType;
  jobId: string;
  /**
   * The pipeline workflow that owns this job, if any.
   * Populated by pipeline-dispatched jobs; absent for standalone user jobs.
   * Used by STOP_PIPELINE to bulk-cancel pending workflow-owned jobs.
   */
  workflowId?: string;
};

/**
 * Events emitted whenever a job changes state.
 *
 * All variants carry userId + teamId so the server can:
 *   1. Filter PubSub subscriptions per user (attribute-level filter).
 *   2. Route SSE events to the correct client session without a DB lookup.
 *
 * All variants carry metadata so the client can display rich job info
 * (type label, pipeline origin) without a round-trip.
 */
export type JobEvent =
  | {
    type: "JOB_DISPATCHED";
    projectId: string;
    userId: string;
    teamId: string;
    metadata: JobEventMetadata;
  }
  | {
    type: "JOB_STARTED";
    projectId: string;
    userId: string;
    teamId: string;
    metadata: JobEventMetadata;
  }
  | {
    type: "JOB_COMPLETED";
    projectId: string;
    userId: string;
    teamId: string;
    metadata: JobEventMetadata;
  }
  | {
    type: "JOB_FAILED";
    projectId: string;
    userId: string;
    teamId: string;
    metadata: JobEventMetadata;
    error: string;
  }
  | {
    type: "JOB_CANCELLED";
    projectId: string;
    userId: string;
    teamId: string;
    metadata: JobEventMetadata;
  };

/**
 * Builds a JobEventMetadata object from a Job (or any object with `type` and
 * optional `workflowId`). Centralises the construction so call sites stay DRY.
 */
export function buildJobEventMetadata(job: Pick<Job, "id" | "type" | "workflowId">): JobEventMetadata {
  return {
    jobType: job.type,
    jobId: job.id,
    ...(job.workflowId ? { workflowId: job.workflowId } : {}),
  };
}
