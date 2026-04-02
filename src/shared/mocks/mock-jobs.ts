import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { AnyJob, AttemptMetadata, InsertJob, Job, JobPayload, JobState, JobType } from "../types/job.types.js";
import { AssetHistory, AssetKey, AssetVersion, Scope } from "../types/assets.types.js";
import { JobControlPlane } from "../services/job-control-plane.js";
import { createMockAttempts } from "./mock-attempts.js";
import { createMockCharacter } from "./entities/mock-character.js";
import { createMockLocation } from "./entities/mock-location.js";
import { generateId } from "#shared/utils/id.js";

// Valid asset keys for the system
const assetKeyMap: Record<JobType, AssetKey> = {
    EXPAND_CREATIVE_PROMPT: "enhanced_prompt",
    GENERATE_STORYBOARD: "storyboard",
    PROCESS_AUDIO_TO_SCENES: "audio_analysis",
    ENHANCE_STORYBOARD: "storyboard",
    SEMANTIC_ANALYSIS: "generation_rules",
    GENERATE_CHARACTER_ASSETS: "character_image",
    GENERATE_LOCATION_ASSETS: "location_image",
    GENERATE_SCENE_FRAMES: "scene_start_frame",
    GENERATE_SCENE_VIDEO: "scene_video",
    RENDER_VIDEO: "final_output",
    GENERATE_COMPOSITE: 'image_file',
};

export function createMockJob(overrides: Partial<InsertJob>): Job {
    const type = overrides.type || "GENERATE_SCENE_FRAMES" as JobType;
    const projectId = overrides?.projectId ?? generateId();
    const timestamp = new Date();

    const insertJob: InsertJob = {
        id: overrides?.id ?? generateId(),
        error: "",
        type,
        projectId,
        state: (overrides?.state ?? "PENDING") as JobState,
        assetKey: (overrides?.assetKey ?? assetKeyMap[type]) as any,
        uniqueKey: overrides?.uniqueKey ?? `test-${type}-${Date.now()}`,
        payload: createJobPayload(type, overrides.payload ?? {}),
        result: overrides?.result ?? null,
        attempts: createMockAttempts(),
        recoveryContext: overrides?.recoveryContext ?? null,
        createdAt: overrides?.createdAt ?? timestamp,
        updatedAt: overrides?.updatedAt ?? timestamp,
        ...overrides,
    };

    return Job.parse(insertJob);
}

export const createJobPayload = (type: JobType, overrides?: Partial<JobPayload<typeof type>>) => {
    const basePayloads: Record<JobType, JobPayload<typeof type>> = {
        EXPAND_CREATIVE_PROMPT: {},
        GENERATE_STORYBOARD: {},
        PROCESS_AUDIO_TO_SCENES: {},
        ENHANCE_STORYBOARD: {},
        SEMANTIC_ANALYSIS: {},
        GENERATE_CHARACTER_ASSETS: {
            characters: [createMockCharacter(overrides)],
        },
        GENERATE_LOCATION_ASSETS: {
            locations: [createMockLocation(overrides)],
        },
        GENERATE_SCENE_FRAMES: {
            sceneIds: [],
            assetKeys: ["scene_start_frame", "scene_end_frame"],
            promptModifications: [],
        },
        GENERATE_SCENE_VIDEO: {
            sceneId: generateId(),
            overridePrompt: "Generate with enhanced lighting",
        },
        GENERATE_COMPOSITE: {},
        RENDER_VIDEO: {
            videoPaths: [],
            audioGcsUri: null,
        },
    };

    return { ...basePayloads[type], ...overrides };
};