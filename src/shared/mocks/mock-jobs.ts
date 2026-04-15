import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { AnyJob, AttemptMetadata, InsertJob, Job, JobPayload, JobState, JobType } from "../types/job.types.js";
import { AssetHistory, AssetKey, AssetVersion, Scope } from "../types/assets.types.js";
import { JobControlPlane } from "../services/job-control-plane.js";
import { createMockAttempts } from "./mock-attempts.js";
import { createMockCharacter } from "./entities/mock-character.js";
import { createMockLocation } from "./entities/mock-location.js";
import { generateId } from "#shared/utils/id.js";
import { createMockScene } from "#shared/mocks/entities/mock-scene.js";

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
    CREATE_SCENE_WITH_ENTITIES: "entity",
};

export function createMockJob(overrides: Partial<InsertJob>): Job {
    const type = overrides.type || "GENERATE_SCENE_FRAMES" as JobType;
    const projectId = overrides?.projectId ?? generateId();
    const teamId = overrides?.teamId ?? generateId();
    const userId = overrides?.userId ?? generateId();

    const timestamp = new Date();

    const insertJob: InsertJob = {
        id: overrides?.id ?? generateId(),
        error: "",
        type,
        projectId,
        teamId,
        userId,
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

export const createJobPayload = <T = JobType>(type: T, overrides?: Partial<JobPayload<T>>) => {
    let basePayload = undefined;
    switch (type) {
        case "EXPAND_CREATIVE_PROMPT":
            basePayload = undefined;
            break;
        case "GENERATE_STORYBOARD":
            basePayload = undefined;
            break;
        case "PROCESS_AUDIO_TO_SCENES":
            basePayload = undefined;
            break;
        case "ENHANCE_STORYBOARD":
            basePayload = undefined;
            break;
        case "SEMANTIC_ANALYSIS":
            basePayload = undefined;
            break;
        case "GENERATE_CHARACTER_ASSETS":
            basePayload = {
                characterIds: [generateId()],
            };
            break;
        case "GENERATE_LOCATION_ASSETS":
            basePayload = {
                locationIds: [generateId()],
            };
            break;
        case "GENERATE_SCENE_FRAMES":
            basePayload = {
                sceneIds: [],
                assetKeys: ["scene_start_frame", "scene_end_frame"],
                promptModifications: [],
            };
            break;
        case "GENERATE_SCENE_VIDEO":
            basePayload = {
                sceneId: generateId(),
                overridePrompt: "Generate with enhanced lighting",
            };
            break;
        case "RENDER_VIDEO":
            basePayload = {
                videoPaths: ['test-video-url'],
                audioGcsUri: 'test-audio-url',
            };
            break;
        case "GENERATE_COMPOSITE":
            basePayload = {
                imageId: generateId(),
                inputImages: [{
                    src: 'test-image-src',
                    entityId: generateId(),
                    assetKey: 'image_file',
                    version: 1,
                    weight: 1,
                    blendMode: 'normal',
                    type: 'subject',
                }, {
                    src: 'test-image-src',
                    entityId: generateId(),
                    assetKey: 'image_file',
                    version: 1,
                    weight: 1,
                    blendMode: 'normal',
                    type: 'style',
                }],
                prompt: "Test-prompt",
                negativePrompt: "Test-negative-prompt",
                numberOfOutputs: 2,
            };
            break;
        case "CREATE_SCENE_WITH_ENTITIES":
            basePayload = {
                userId: (overrides as any)?.userId ?? generateId(),
                /** Raw form fields from the scene creation modal.
                 *  characterReferenceIds: mix of "@handle" and plain-text descriptions.
                 *  locationReferenceId:   "@handle" or plain-text description. */
                sceneFields: createMockScene()
                /** GCS URIs for images the user already uploaded before dispatching the job. */
                // sceneImageGcsUri?: string;
                // sceneImageMimeType?: string;
                // startFrameGcsUri?: string;
                // startFrameMimeType?: string;
                // endFrameGcsUri?: string;
                // endFrameMimeType?: string;
            };
            break;
    };

    return { ...basePayload, ...overrides };
};