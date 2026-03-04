import { z } from "zod";
import { AssetKey } from "./assets.types.js";
import { AudioAnalysis } from "./audio.types.js";
import { Character, Location, Scene } from "./workflow.types.js";
import { QualityEvaluationResult } from "./quality.types.js";
import { IdentityBase, InsertIdentityBase, coerceDate } from "./base.types.js";
import { StoryboardAttributes, SceneGenerationResult } from "./workflow.types.js";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import *  as schema from "../db/schema.js"

// ============================================================================
// JOB PROPERTIES
// ============================================================================

export const JOB_STATES = [
    "PENDING", // Created, waiting for a worker
    "RUNNING", // Worker is executing
    "COMPLETED", // Terminal: success
    "FAILED", // Non-terminal: retriable within current job lifecycle
    "FATAL", // Terminal: retries exhausted or permanent error
    "CANCELLED" // Terminal: user / system cancelled
] as const;
export type JobState = (typeof JOB_STATES)[ number ];


export const JOB_TYPES = [
    "EXPAND_CREATIVE_PROMPT",
    "GENERATE_STORYBOARD",
    "PROCESS_AUDIO_TO_SCENES",
    "ENHANCE_STORYBOARD",
    "SEMANTIC_ANALYSIS",
    "GENERATE_CHARACTER_ASSETS",
    "GENERATE_LOCATION_ASSETS",
    "GENERATE_SCENE_FRAMES",
    "GENERATE_SCENE_VIDEO",
    "RENDER_VIDEO",
] as const;
export type JobType = (typeof JOB_TYPES)[ number ];

export const RETRY_STRATEGIES = [
    "BACKOFF_RETRY",        // Failed job, retry with exponential backoff
    "STALE_RECOVERY",       // Re-queue same job record
    "SUCCESSOR_RECOVERY"    // Create a new job record
] as const;
export type RetryStrategy = (typeof RETRY_STRATEGIES)[ number ];

export const AttemptFailure = z.object({
    attempt: z.number(),
    totalAttempts: z.number(),
    error: z.string(),
    timestamp: coerceDate,
    strategy: z.enum(RETRY_STRATEGIES),
});
export type AttemptFailure = z.infer<typeof AttemptFailure>;

export const AttemptMetadata = z.object({
    currentAttempt: z.number().nonnegative().default(1).describe("Current attempt number (1-indexed)"),
    totalAttempts: z.number().nonnegative().default(1).describe("Monotonic lifetime counter — NEVER resets"),
    maxRetries: z.number().nonnegative().default(3).describe("How many times THIS job record can be re-queued"),
    lastAttemptAt: coerceDate.describe("Timestamp of the last attempt"),
    failureHistory: z.array(AttemptFailure).default([]).describe("History of failed attempts")
});
export type AttemptMetadata = z.infer<typeof AttemptMetadata>;

export const RecoveryContext = z.object({
    reason: z.enum([ "RETRY_EXHAUSTED", "PERMANENT_ERROR", "MANUAL_RESET" ]),
    triggeredBy: z.enum([ "MONITOR", "DISPATCHER", "USER", "WORKER" ]),
    previousJobId: z.string().describe("The FATAL job this one replaces"),
});
export type RecoveryContext = z.infer<typeof RecoveryContext>;

export const RecoveryConfig = z.object({
    maxRetries: z.number().nonnegative().default(3).describe("Per-job-record retry ceiling"),
    maxTotalAttempts: z.number().nonnegative().default(10).describe("Lifetime ceiling across all successor jobs"),
    allowAutoRecovery: z.boolean().default(true).describe("true = auto-create successor; false = throw"),
    recoveryInstructions: z.string().nullish().describe("Instructions for manual recovery"),
});
export type RecoveryConfig = z.infer<typeof RecoveryConfig>;

// ============================================================================
// JOB RECORDS
// ============================================================================

// ============================================================================
// JOB ENTITY
// ============================================================================

export const Job = createSelectSchema(schema.jobs, {
    ...IdentityBase.shape,
    type: z.enum(JOB_TYPES),
    state: z.enum(JOB_STATES),
    assetKey: AssetKey,
    error: z.string(),
    uniqueKey: z.string(),
    payload: z.record(z.any(), z.any()).nullish(),
    result: z.record(z.any(), z.any()).nullish(),
    attempts: AttemptMetadata,
    recoveryContext: RecoveryContext.nullish(),
});
export type Job = z.infer<typeof Job>;

export const InsertJob = createInsertSchema(schema.jobs, {
    ...InsertIdentityBase.shape,
    type: z.enum(JOB_TYPES),
    state: z.enum(JOB_STATES).default(JOB_STATES[ 0 ]),
    assetKey: AssetKey,
    error: z.string().default(""),
    uniqueKey: z.string(),
    payload: z.record(z.any(), z.any()).nullish(),
    result: z.record(z.any(), z.any()).nullish(),
    attempts: AttemptMetadata.default(() => (AttemptMetadata.parse({}))),
    recoveryContext: RecoveryContext.nullish(),
});
export type InsertJob = z.infer<typeof InsertJob>;

export type JobPayload<T extends JobType> = [ Extract<AnyJob, { type: T; }>[ 'payload' ] ];

type JobBaseFields = Omit<Job, "type" | "payload" | "result">;

export type JobExpandCreativePrompt = JobBaseFields & { type: "EXPAND_CREATIVE_PROMPT"; payload: any; result: any; };
export type JobGenerateStoryboard = JobBaseFields & { type: "GENERATE_STORYBOARD"; payload: any; result: any; };
export type JobProcessAudioToScenes = JobBaseFields & { type: "PROCESS_AUDIO_TO_SCENES"; payload: any; result: any; };
export type JobEnhanceStoryboard = JobBaseFields & { type: "ENHANCE_STORYBOARD"; payload: any; result: any; };
export type JobSemanticAnalysis = JobBaseFields & { type: "SEMANTIC_ANALYSIS"; payload: any; result: any; };
export type JobGenerateCharacterAssets = JobBaseFields & { type: "GENERATE_CHARACTER_ASSETS"; payload: any; result: any; };
export type JobGenerateLocationAssets = JobBaseFields & { type: "GENERATE_LOCATION_ASSETS"; payload: any; result: any; };
export type JobGenerateSceneFrames = JobBaseFields & {
    type: "GENERATE_SCENE_FRAMES"; payload: {
        sceneIds?: string[];
        assetKeys: ("scene_start_frame" | "scene_end_frame")[];
        promptModifications?: string[];
    }; result: any;
};
export type JobGenerateSceneVideo = JobBaseFields & {
    type: "GENERATE_SCENE_VIDEO";
    payload: { sceneId: string; overridePrompt: string; renderInProgress?: boolean; };
    result: any;
};
export type JobRenderVideo = JobBaseFields & {
    type: "RENDER_VIDEO";
    payload: { videoPaths: string[]; audioGcsUri?: string; };
    result: any;
};

export type AnyJob =
    | JobExpandCreativePrompt
    | JobGenerateStoryboard
    | JobProcessAudioToScenes
    | JobEnhanceStoryboard
    | JobSemanticAnalysis
    | JobGenerateCharacterAssets
    | JobGenerateLocationAssets
    | JobGenerateSceneFrames
    | JobGenerateSceneVideo
    | JobRenderVideo;

// ============================================================================
// GENERATIVE AI RESULT TYPES
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

export type GenerativeResultExpandCreativePrompt = GenerativeResultEnvelope<{
    expandedPrompt: string;
}>;

export type GenerativeResultGenerateStoryboard = GenerativeResultEnvelope<{
    storyboardAttributes: StoryboardAttributes;
}>;

export type GenerativeResultProcessAudioToScenes = GenerativeResultEnvelope<{
    analysis: AudioAnalysis;
}>;

export type GenerativeResultEnhanceStoryboard = GenerativeResultEnvelope<{
    storyboardAttributes: StoryboardAttributes;
}>;

export type GenerativeResultSemanticAnalysis = GenerativeResultEnvelope<{
    dynamicRules: string[];
}>;

export type GenerativeResultGenerateCharacterAssets = GenerativeResultEnvelope<{
    characters: Character[];
}>;

export type GenerativeResultGenerateLocationAssets = GenerativeResultEnvelope<{
    locations: Location[];
}>;

export type GenerativeResultGenerateSceneFrames = GenerativeResultEnvelope<{
    updatedScenes: Scene[];
}>;

export type GenerativeResultGenerateSceneVideo = GenerativeResultEnvelope<SceneGenerationResult>;

export type GenerativeResultStitchVideo = GenerativeResultEnvelope<{
    renderedVideo: string;
}>;

export type GenerativeResultFrameRender = GenerativeResultEnvelope<{
    scene: Scene;
    image: string;
}>;

// ============================================================================
// JOB EVENTS
// ============================================================================

export type JobEvent =
    | { type: "JOB_DISPATCHED"; jobId: string; projectId: string; }
    | { type: "JOB_STARTED"; jobId: string; }
    | { type: "JOB_COMPLETED"; jobId: string; projectId: string; }
    | { type: "JOB_FAILED"; jobId: string; error: string; }
    | { type: "JOB_CANCELLED"; jobId: string; };
