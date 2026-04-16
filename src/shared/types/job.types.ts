// shared/types/job.types.ts
// ─────────────────────────────────────────────────────────────────────────────
// CHANGES: JobEvent union extended with userId, teamId, and metadata.
//   - userId / teamId enable per-user PubSub attribute filtering and
//     correct SSE routing without an extra DB lookup on every event.
//   - metadata carries jobType + workflowId so the client can display
//     rich info without a round-trip, and the server can bulk-cancel
//     pipeline-owned jobs (matching workflowId) when STOP_PIPELINE fires.
//
// Only the JobEvent types are shown here; all other exports are unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { AssetKey } from "./assets.types.js";
import { AudioAnalysis } from "./audio.types.js";
import { Character, CharacterWithAssets, Location, LocationWithAssets, Scene, SceneWithAssets } from "./workflow.types.js";
import { QualityEvaluationResult } from "./quality.types.js";
import { IdentityBase, InsertIdentityBase, ProjectRef, TeamRef, UserRef, WorldRef, WorkflowRef, coerceDate } from "./base.types.js";
import { StoryboardAttributes, SceneGenerationResult } from "./workflow.types.js";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import * as schema from "../db/schema.js"
import { ReferenceType } from "../lm/provider.js";

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
export type JobState = (typeof JOB_STATES)[number];

/** Terminal states where no further transitions are expected. */
export const TERMINAL_JOB_STATES: ReadonlySet<JobState> = new Set([
    "COMPLETED",
    "FAILED",
    "FATAL",
    "CANCELLED",
]);

/** Active (non-terminal) states. */
export const ACTIVE_JOB_STATES: readonly JobState[] = ["PENDING", "RUNNING"];


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
    "GENERATE_COMPOSITE",
    "CREATE_SCENE_WITH_ENTITIES",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const RETRY_STRATEGIES = [
    "BACKOFF_RETRY",        // Failed job, retry with exponential backoff
    "STALE_RECOVERY",       // Re-queue same job record
    "SUCCESSOR_RECOVERY"    // Create a new job record
] as const;
export type RetryStrategy = (typeof RETRY_STRATEGIES)[number];

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
    reason: z.enum(["RETRY_EXHAUSTED", "PERMANENT_ERROR", "MANUAL_RESET"]),
    triggeredBy: z.enum(["MONITOR", "DISPATCHER", "USER", "WORKER"]),
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

export const Job = createSelectSchema(schema.jobs, {
    ...IdentityBase.shape,
    worldId: WorldRef.shape.worldId,
    workflowId: WorkflowRef.shape.workflowId,
    projectId: ProjectRef.shape.projectId,
    teamId: TeamRef.shape.teamId,
    userId: UserRef.shape.userId,
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
    worldId: WorldRef.shape.worldId,
    workflowId: WorkflowRef.shape.workflowId,
    projectId: ProjectRef.shape.projectId,
    teamId: TeamRef.shape.teamId,
    userId: UserRef.shape.userId,
    type: z.enum(JOB_TYPES),
    state: z.enum(JOB_STATES).default(JOB_STATES[0]),
    assetKey: AssetKey,
    error: z.string().default(""),
    uniqueKey: z.string(),
    payload: z.record(z.any(), z.any()).nullish(),
    result: z.record(z.any(), z.any()).nullish(),
    attempts: AttemptMetadata.default(() => (AttemptMetadata.parse({}))),
    recoveryContext: RecoveryContext.nullish(),
});
export type InsertJob = z.infer<typeof InsertJob>;

export type JobPayload<T = JobType> = Extract<AnyJob, { type: T; }>['payload'];

type JobBaseFields = Omit<Job, "type" | "payload" | "result">;

export type JobExpandCreativePrompt = JobBaseFields & { type: "EXPAND_CREATIVE_PROMPT"; payload: undefined; result: GenerativeResultExpandCreativePrompt['data']; };
export type JobGenerateStoryboard = JobBaseFields & { type: "GENERATE_STORYBOARD"; payload: undefined; result: GenerativeResultGenerateStoryboard['data']; };
export type JobProcessAudioToScenes = JobBaseFields & { type: "PROCESS_AUDIO_TO_SCENES"; payload: undefined; result: GenerativeResultProcessAudioToScenes['data']; };
export type JobEnhanceStoryboard = JobBaseFields & { type: "ENHANCE_STORYBOARD"; payload: undefined; result: GenerativeResultEnhanceStoryboard['data']; };
export type JobSemanticAnalysis = JobBaseFields & { type: "SEMANTIC_ANALYSIS"; payload: undefined; result: GenerativeResultSemanticAnalysis['data']; };

export type JobGenerateCharacterAssets = JobBaseFields & {
    type: "GENERATE_CHARACTER_ASSETS";
    payload: { characterIds: string[]; };
    result: GenerativeResultGenerateCharacterAssets['data'];
};

export type JobGenerateLocationAssets = JobBaseFields & {
    type: "GENERATE_LOCATION_ASSETS";
    payload: { locationIds: string[]; };
    result: GenerativeResultGenerateLocationAssets['data'];
};
export type JobCreateSceneWithEntities = JobBaseFields & {
    type: "CREATE_SCENE_WITH_ENTITIES";
    payload: {
        userId: string;
        sceneFields: {
            characterReferenceIds?: string[];
            locationReferenceId?: string;
            [key: string]: unknown;
        };
        sceneImageGcsUri?: string;
        sceneImageMimeType?: string;
        startFrameGcsUri?: string;
        startFrameMimeType?: string;
        endFrameGcsUri?: string;
        endFrameMimeType?: string;
    };
    result: GenerativeResultCreateSceneWithEntities['data'];
};
export type JobGenerateSceneFrames = JobBaseFields & {
    type: "GENERATE_SCENE_FRAMES"; payload: {
        sceneIds?: string[];
        assetKeys: ("scene_start_frame" | "scene_end_frame")[];
        promptModifications?: string[];
    }; result: GenerativeResultGenerateSceneFrames['data'];
};
export type JobGenerateSceneVideo = JobBaseFields & {
    type: "GENERATE_SCENE_VIDEO";
    payload: { sceneId: string; overridePrompt: string; renderInProgress?: boolean; };
    result: GenerativeResultGenerateSceneVideo['data'];
};
export type JobRenderVideo = JobBaseFields & {
    type: "RENDER_VIDEO";
    payload: { videoPaths: string[]; audioGcsUri?: string; };
    result: GenerativeResultRenderVideo['data'];
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
            blendMode: 'normal' | 'overlay' | 'multiply' | 'screen' | 'soft-light';
            type: ReferenceType;
        }[];
        prompt: string;
        negativePrompt?: string;
        numberOfOutputs: number;
    };
    result: GenerativeResultGenerateComposite['data'];
};

export type AnyJob =
    | JobExpandCreativePrompt
    | JobGenerateStoryboard
    | JobProcessAudioToScenes
    | JobEnhanceStoryboard
    | JobSemanticAnalysis
    | JobCreateSceneWithEntities
    | JobGenerateCharacterAssets
    | JobGenerateLocationAssets
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

export type GenerativeResultExpandCreativePrompt = GenerativeResultEnvelope<{ expandedPrompt: string; }>;
export type GenerativeResultGenerateStoryboard = GenerativeResultEnvelope<{ storyboardAttributes: StoryboardAttributes; }>;
export type GenerativeResultProcessAudioToScenes = GenerativeResultEnvelope<{ analysis: AudioAnalysis; }>;
export type GenerativeResultEnhanceStoryboard = GenerativeResultEnvelope<{ storyboardAttributes: StoryboardAttributes; }>;
export type GenerativeResultSemanticAnalysis = GenerativeResultEnvelope<{ dynamicRules: string[]; }>;
export type GenerativeResultGenerateCharacterAssets = GenerativeResultEnvelope<{ characters: CharacterWithAssets[]; }>;
export type GenerativeResultGenerateLocationAssets = GenerativeResultEnvelope<{ locations: LocationWithAssets[]; }>;
export type GenerativeResultGenerateSceneFrames = GenerativeResultEnvelope<{ updatedScenes: SceneWithAssets[]; deferredSceneIds: string[]; }>;
export type GenerativeResultGenerateSceneVideo = GenerativeResultEnvelope<SceneGenerationResult>;
export type GenerativeResultRenderVideo = GenerativeResultEnvelope<{ renderedVideo: string; }>;
export type GenerativeResultFrameRender = GenerativeResultEnvelope<{ scene: SceneWithAssets; image: string; }>;
export type GenerativeResultGenerateComposite = GenerativeResultEnvelope<{ outputImages: { data: string; version: number; }[]; }>;
export type GenerativeResultCreateSceneWithEntities = GenerativeResultEnvelope<{ scene: SceneWithAssets; newCharacters: CharacterWithAssets[]; newLocation: LocationWithAssets | null; }>;

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
export function buildJobEventMetadata(
    job: Pick<Job, "id" | "type" | "workflowId">
): JobEventMetadata {
    return {
        jobType: job.type,
        jobId: job.id,
        ...(job.workflowId ? { workflowId: job.workflowId } : {}),
    };
}