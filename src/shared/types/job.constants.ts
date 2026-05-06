// shared/types/job.constants.ts
// Extracted to break circular dependency with schema.types.ts
import { z } from "zod";
import { coerceDate } from "#shared/types/base.types.js";

// ============================================================================
// JOB CONSTANTS
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
    "GENERATE_CHARACTERS",
    "GENERATE_CHARACTER_IMAGES",
    "GENERATE_LOCATIONS",
    "GENERATE_LOCATION_IMAGES",
    "GENERATE_ENTITIES",
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

// ============================================================================
// JOB SCHEMAS (moved here to break circular dependency)
// ============================================================================

export const AttemptMetadata = z.object({
    currentAttempt: z.number().nonnegative().default(1).describe("Current attempt number (1-indexed)"),
    totalAttempts: z.number().nonnegative().default(1).describe("Monotonic lifetime counter — NEVER resets"),
    maxRetries: z.number().nonnegative().default(3).describe("How many times THIS job record can be re-queued"),
    lastAttemptAt: coerceDate.describe("Timestamp of the last attempt"),
    failureHistory: z.array(z.object({
        attempt: z.number(),
        totalAttempts: z.number(),
        error: z.string(),
        timestamp: coerceDate,
        strategy: z.enum(RETRY_STRATEGIES),
    })).default([]).describe("History of failed attempts")
});
export type AttemptMetadata = z.infer<typeof AttemptMetadata>;

export const RecoveryContext = z.object({
    reason: z.enum(["RETRY_EXHAUSTED", "PERMANENT_ERROR", "MANUAL_RESET"]),
    triggeredBy: z.enum(["MONITOR", "DISPATCHER", "USER", "WORKER"]),
    previousJobId: z.string().describe("The FATAL job this one replaces"),
});
export type RecoveryContext = z.infer<typeof RecoveryContext>;
