/**
 * Test fixtures for pubsub testing
 * Provides type-safe factories for creating test Project and Job payloads
 */

import { v7 as uuidv7 } from "uuid";
import type {
    Project,
    JobType,
    JobState,
    InsertJob,
    Scene,
    Character,
    Location,
    ProjectMetadata,
    PipelineEvent,
    JobEvent,
    Job,
} from "../../src/shared/types/index.js";
import {
    AssetRegistry,
    WorkflowMetrics,
} from "../../src/shared/types/index.js";
import { JobControlPlane } from "../../src/shared/services/job-control-plane.js";
import { PoolManager } from "../../src/shared/services/pool-manager.js";
import { initializeDatabase, getPool } from "../../src/shared/db/index.js";

initializeDatabase(getPool());
const poolManager = new PoolManager({ enableMetrics: false });
export const jobControlPlane = new JobControlPlane(poolManager, async () => {}); // use external dispatcher

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

export const createTestScene = (overrides?: Partial<Scene>): Scene => {
    const projectId = overrides?.projectId ?? uuidv7();
    const timestamp = new Date();
    const sceneIndex = overrides?.sceneIndex ?? 0;

    return {
        // IdentityBase
        id: overrides?.id ?? uuidv7(),
        createdAt: overrides?.createdAt ?? timestamp,
        updatedAt: overrides?.updatedAt ?? timestamp,
        // ProjectRef
        projectId,
        // SceneAttributes
        sceneIndex,
        lighting: overrides?.lighting ?? {
            quality: {
                hardness: "Soft",
                colorTemperature: "Neutral",
                intensity: "Medium",
            },
            motivatedSources: {
                primaryLight: "Sun through window",
                fillLight: "Ambient skylight",
                practicalLights: "",
                accentLight: "",
                lightBeams: "None",
            },
            direction: {
                keyLightPosition: "Front-left 45°",
                shadowDirection: "Falling right",
                contrastRatio: "Medium(1:4)",
            },
            atmosphere: {
                haze: "None",
            },
        },
        // Cinematography
        shotType: overrides?.shotType ?? "Medium Close-Up",
        cameraAngle: overrides?.cameraAngle ?? "Eye Level",
        cameraMovement: overrides?.cameraMovement ?? "Static",
        transitionType: overrides?.transitionType ?? "none",
        composition: overrides?.composition ?? {
            "Subject Placement": "Center",
            "Focal Point": "Center",
            "Depth Layers": "Midground",
            "Leading Lines": "None",
            "Headroom": "Standard",
            "Look Room": "None",
        },
        // AudioSegmentAttributes
        startTime: overrides?.startTime ?? sceneIndex * 5,
        endTime: overrides?.endTime ?? (sceneIndex + 1) * 5,
        duration: overrides?.duration ?? 5,
        type: overrides?.type ?? "lyrical",
        lyrics: overrides?.lyrics ?? "",
        musicalDescription: overrides?.musicalDescription ?? "Ambient background music",
        musicChange: overrides?.musicChange ?? "None",
        intensity: overrides?.intensity ?? "medium",
        mood: overrides?.mood ?? "neutral",
        tempo: overrides?.tempo ?? "moderate",
        audioEvidence: overrides?.audioEvidence ?? "Soft instrumental music",
        transientImpact: overrides?.transientImpact ?? "soft",
        // DirectorScene
        name: overrides?.name ?? `Scene ${sceneIndex + 1}`,
        description: overrides?.description ?? "A test scene for debugging",
        audioSync: overrides?.audioSync ?? "Mood Sync",
        // ScriptSupervisorScene
        characterReferenceIds: overrides?.characterReferenceIds ?? [],
        locationReferenceId: overrides?.locationReferenceId ?? "loc_test",
        continuityNotes: overrides?.continuityNotes ?? [],
        // ScriptSupervisorScene (additional fields from .pick())
        characterIds: overrides?.characterIds ?? [],
        locationId: overrides?.locationId ?? null,
        // SceneStatus
        status: overrides?.status ?? "pending",
        progressMessage: overrides?.progressMessage ?? "",
        // AssetRegistry
        assets: overrides?.assets ?? AssetRegistry.parse({}),
    } as Scene;
};

export const createTestCharacter = (overrides?: Partial<Character>): Character => {
    const projectId = overrides?.projectId ?? uuidv7();
    const timestamp = new Date();

    return {
        // IdentityBase
        id: overrides?.id ?? uuidv7(),
        createdAt: overrides?.createdAt ?? timestamp,
        updatedAt: overrides?.updatedAt ?? timestamp,
        // ProjectRef
        projectId,
        // CharacterAttributes
        referenceId: overrides?.referenceId ?? `char-${Math.random().toString(36).slice(2, 8)}`,
        name: overrides?.name ?? "Test Character",
        aliases: overrides?.aliases ?? [],
        physicalTraits: overrides?.physicalTraits ?? {
            age: "30s",
            hair: "short dark hair",
            clothing: ["casual t-shirt", "jeans"],
            accessories: [],
            distinctiveFeatures: [],
            build: "average",
            ethnicity: "",
            appearanceNotes: [],
        },
        state: overrides?.state ?? {
            emotionalState: "calm",
            emotionalHistory: [],
            injuries: [],
            dirtLevel: "clean",
            exhaustionLevel: "fresh",
        },
        // AssetRegistry
        assets: overrides?.assets ?? AssetRegistry.parse({}),
    } as Character;
};

export const createTestLocation = (overrides?: Partial<Location>): Location => {
    const projectId = overrides?.projectId ?? uuidv7();
    const timestamp = new Date();

    return {
        // IdentityBase
        id: overrides?.id ?? uuidv7(),
        createdAt: overrides?.createdAt ?? timestamp,
        updatedAt: overrides?.updatedAt ?? timestamp,
        // ProjectRef
        projectId,
        // LocationAttributes
        referenceId: overrides?.referenceId ?? `loc-${Math.random().toString(36).slice(2, 8)}`,
        name: overrides?.name ?? "Test Location",
        type: overrides?.type ?? "interior",
        lightingConditions: overrides?.lightingConditions ?? {
            quality: {
                hardness: "Soft",
                colorTemperature: "Neutral",
                intensity: "Medium",
            },
            motivatedSources: {
                primaryLight: "Overhead ceiling lights",
                fillLight: "Ambient reflection",
                practicalLights: "",
                accentLight: "",
                lightBeams: "None",
            },
            direction: {
                keyLightPosition: "Overhead",
                shadowDirection: "Below",
                contrastRatio: "Low(1:2)",
            },
            atmosphere: {
                haze: "None",
            },
        },
        mood: overrides?.mood ?? "Serene",
        timeOfDay: overrides?.timeOfDay ?? "Day",
        weather: overrides?.weather ?? "Clear",
        colorPalette: overrides?.colorPalette ?? [],
        architecture: overrides?.architecture ?? [],
        naturalElements: overrides?.naturalElements ?? [],
        manMadeObjects: overrides?.manMadeObjects ?? [],
        groundSurface: overrides?.groundSurface ?? "Hardwood floor",
        skyOrCeiling: overrides?.skyOrCeiling ?? "White ceiling",
        state: overrides?.state ?? {
            lastUsed: "",
            mood: "Serene",
            timeOfDay: "Day",
            weather: "Clear",
            timeHistory: [],
            weatherHistory: [],
            precipitation: "none",
            visibility: "clear",
            lighting: {
                quality: {
                    hardness: "Soft",
                    colorTemperature: "Neutral",
                    intensity: "Medium",
                },
                motivatedSources: {
                    primaryLight: "Overhead",
                    fillLight: "Ambient",
                    practicalLights: "",
                    accentLight: "",
                    lightBeams: "None",
                },
                direction: {
                    keyLightPosition: "Overhead",
                    shadowDirection: "Below",
                    contrastRatio: "Low(1:2)",
                },
                atmosphere: {
                    haze: "None",
                },
            },
            lightingHistory: [],
            groundCondition: {
                wetness: "dry",
                debris: [],
                damage: [],
            },
            atmosphericEffects: [],
            season: "unspecified",
            temperatureIndicators: [],
        },
        // AssetRegistry
        assets: overrides?.assets ?? AssetRegistry.parse({}),
    } as Location;
};

export const createTestProjectMetadata = (overrides?: Partial<ProjectMetadata>): ProjectMetadata => ({
    title: overrides?.title ?? "Test Project",
    aspectRatio: overrides?.aspectRatio ?? "widescreen",
    targetDuration: overrides?.targetDuration ?? 60,
    stylePreset: overrides?.stylePreset ?? "cinematic",
    initialPrompt: overrides?.initialPrompt ?? "A test creative project",
    enhancedPrompt: overrides?.enhancedPrompt ?? "An elaborated creative vision for testing",
    hasAudio: overrides?.hasAudio ?? false,
    audioGcsUri: overrides?.audioGcsUri ?? null,
    audioPublicUri: overrides?.audioPublicUri ?? null,
    durationSeconds: overrides?.durationSeconds ?? null,
    tempoBpm: overrides?.tempoBpm ?? null,
    keySignature: overrides?.keySignature ?? null,
});

export const createTestProject = (overrides?: Partial<Project>): Project => {
    const projectId = overrides?.id ?? uuidv7();
    const timestamp = new Date();
    const scenes = overrides?.scenes ?? [
        createTestScene({ projectId, sceneIndex: 0, name: "Opening Scene" }),
        createTestScene({ projectId, sceneIndex: 1, name: "Middle Scene" }),
    ];
    const characters = overrides?.characters ?? [createTestCharacter({ projectId, name: "Protagonist" })];
    const locations = overrides?.locations ?? [createTestLocation({ projectId, name: "Main Location" })];

    // Create storyboard versions without assets
    const storyboardScenes = scenes.map(s => {
        const { assets, ...rest } = s;
        return rest;
    });
    const storyboardCharacters = characters.map(c => {
        const { assets, state, ...rest } = c;
        return rest;
    });
    const storyboardLocations = locations.map(l => {
        const { assets, state, ...rest } = l;
        return rest;
    });

    return {
        // IdentityBase
        id: projectId,
        createdAt: overrides?.createdAt ?? timestamp,
        updatedAt: overrides?.updatedAt ?? timestamp,
        // ProjectBase
        storyboard: overrides?.storyboard ?? {
            metadata: createTestProjectMetadata(),
            scenes: storyboardScenes,
            characters: storyboardCharacters,
            locations: storyboardLocations,
        },
        metadata: overrides?.metadata ?? createTestProjectMetadata(),
        audioAnalysis: overrides?.audioAnalysis ?? null,
        metrics: overrides?.metrics ?? WorkflowMetrics.parse({}),
        generationRules: overrides?.generationRules ?? [],
        generationRulesHistory: overrides?.generationRulesHistory ?? [],
        currentSceneIndex: overrides?.currentSceneIndex ?? 0,
        status: overrides?.status ?? "pending",
        forceRegenerateSceneIds: overrides?.forceRegenerateSceneIds ?? [],
        assets: overrides?.assets ?? AssetRegistry.parse({}),
        // Extended arrays
        scenes,
        characters,
        locations,
    };
};

// ============================================================================
// JOB PAYLOAD FACTORIES
// ============================================================================

export const createJobPayload = (type: JobType, overrides?: Record<string, unknown>) => {
    const basePayloads: Record<JobType, Record<string, unknown>> = {
        EXPAND_CREATIVE_PROMPT: {},
        GENERATE_STORYBOARD: {},
        PROCESS_AUDIO_TO_SCENES: {},
        ENHANCE_STORYBOARD: {},
        SEMANTIC_ANALYSIS: {},
        GENERATE_CHARACTER_ASSETS: {
            characters: [ createTestCharacter(overrides) ],
        },
        GENERATE_LOCATION_ASSETS: {
            locations: [ createTestLocation(overrides) ],
        },
        GENERATE_SCENE_FRAMES: {
            sceneIds: [],
            assetKeys: ["scene_start_frame", "scene_end_frame"],
            promptModifications: [],
        },
        GENERATE_SCENE_VIDEO: {
            sceneId: uuidv7(),
            overridePrompt: "Generate with enhanced lighting",
        },
        RENDER_VIDEO: {
            videoPaths: [],
            audioGcsUri: null,
        },
    };

    return { ...basePayloads[type], ...overrides };
};

export const createTestJob = async (type: JobType, overrides?: Partial<InsertJob>): Promise<Job> => {
    const projectId = overrides?.projectId ?? uuidv7();
    const timestamp = new Date();

    // Valid asset keys for the system
    const assetKeyMap: Record<JobType, string> = {
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
    };

    const insertJob = {
        id: overrides?.id ?? uuidv7(),
        projectId,
        type,
        state: (overrides?.state ?? "PENDING") as JobState,
        assetKey: (overrides?.assetKey ?? assetKeyMap[type]) as any,
        uniqueKey: overrides?.uniqueKey ?? `test-${type}-${Date.now()}`,
        payload: overrides?.payload ?? createJobPayload(type, overrides?.payload ?? {}),
        result: overrides?.result ?? null,
        attempts: overrides?.attempts ?? {
            currentAttempt: 1,
            totalAttempts: 1,
            maxRetries: 3,
            lastAttemptAt: timestamp,
            failureHistory: [],
        },
        recoveryContext: overrides?.recoveryContext ?? null,
        createdAt: overrides?.createdAt ?? timestamp,
        updatedAt: overrides?.updatedAt ?? timestamp,
        error: overrides?.error ?? "",
    };

    return await jobControlPlane.createJob(insertJob);
};

// ============================================================================
// PUBLISHABLE EVENT FACTORIES
// ============================================================================

export type PublishableEvent = PipelineEvent | JobEvent;

export const createFullStateEvent = (project?: Project): PublishableEvent => ({
    type: "FULL_STATE",
    projectId: project?.id ?? "test-project-id",
    commandId: "test-command-id",
    timestamp: new Date().toISOString(),
    payload: {project: project ?? createTestProject()},
});

export const createJobEvent = (
    type: "JOB_DISPATCHED" | "JOB_STARTED" | "JOB_COMPLETED" | "JOB_FAILED" | "JOB_CANCELLED",
    jobId: string,
    projectId: string,
    error?: string
): PublishableEvent => {
    switch (type) {
        case "JOB_DISPATCHED":
            return { type, jobId, projectId };
        case "JOB_STARTED":
            return { type, jobId };
        case "JOB_COMPLETED":
            return { type, jobId, projectId };
        case "JOB_FAILED":
            return { type, jobId, error: error ?? "Test failure" };
        case "JOB_CANCELLED":
            return { type, jobId };
    }
};

// ============================================================================
// PREDEFINED SCENARIOS
// ============================================================================

export const TestScenarios = {
    minimalProject: (): Project => createTestProject({
        scenes: [],
        characters: [],
        locations: [],
    }),

    richStoryboard: (): Project => {
        const projectId = uuidv7();
        const scenes = Array.from({ length: 5 }, (_, i) =>
            createTestScene({
                projectId,
                sceneIndex: i,
                name: `Scene ${i + 1}`,
                description: `Description for scene ${i + 1}`,
            })
        );
        const characters = [
            createTestCharacter({ projectId, name: "Protagonist", age: "30s" }),
            createTestCharacter({ projectId, name: "Antagonist", age: "40s" }),
            createTestCharacter({ projectId, name: "Sidekick", age: "20s" }),
        ];
        const locations = [
            createTestLocation({ projectId, name: "City Street", type: "urban" }),
            createTestLocation({ projectId, name: "Coffee Shop", type: "interior" }),
        ];

        return createTestProject({
            id: projectId,
            metadata: createTestProjectMetadata({
                title: "Rich Storyboard Test",
                initialPrompt: "A cinematic story about urban life",
            }),
            scenes,
            characters,
            locations,
        });
    },

    audioProject: (): Project => createTestProject({
        metadata: createTestProjectMetadata({
            hasAudio: true,
            audioGcsUri: "gs://test-bucket/audio/test.mp3",
            audioPublicUri: "https://storage.example.com/audio/test.mp3",
            duration: 180,
            tempo: 120,
            keySignature: "C major",
        }),
        audioAnalysis: {
            audioGcsUri: "gs://test-bucket/audio/test.mp3",
            audioPublicUri: "https://storage.example.com/audio/test.mp3",
            duration: 180,
            bpm: 120,
            keySignature: "C major",
            segments: [
                { startTime: 0, endTime: 30, duration: 30, type: "lyrical", lyrics: "", musicalDescription: "Intro", musicChange: "None", intensity: "low", mood: "calm", tempo: "moderate", audioEvidence: "Soft intro", transientImpact: "soft", transitionType: "none" },
                { startTime: 30, endTime: 90, duration: 60, type: "lyrical", lyrics: "", musicalDescription: "Build up", musicChange: "Tempo increase", intensity: "medium", mood: "tense", tempo: "moderate", audioEvidence: "Drums enter", transientImpact: "sharp", transitionType: "none" },
                { startTime: 90, endTime: 180, duration: 90, type: "climax", lyrics: "", musicalDescription: "Climax section", musicChange: "Full instrumentation", intensity: "high", mood: "intense", tempo: "fast", audioEvidence: "All instruments", transientImpact: "explosive", transitionType: "none" },
            ],
        },
    }),

    workflowChain: async (projectId?: string): Promise<Job[]> => {
        const pid = projectId ?? uuidv7();
        const timestamp = Date.now();
        return Promise.all([
            createTestJob("EXPAND_CREATIVE_PROMPT", {
                projectId: pid,
                uniqueKey: `expand-${timestamp}`,
            }),
            createTestJob("GENERATE_STORYBOARD", {
                projectId: pid,
                uniqueKey: `storyboard-${timestamp}`,
                state: "PENDING",
            }),
            createTestJob("PROCESS_AUDIO_TO_SCENES", {
                projectId: pid,
                uniqueKey: `storyboard-${timestamp}`,
                state: "PENDING",
            }),
            createTestJob("ENHANCE_STORYBOARD", {
                projectId: pid,
                uniqueKey: `storyboard-${timestamp}`,
                state: "PENDING",
            }),
            createTestJob("SEMANTIC_ANALYSIS", {
                projectId: pid,
                uniqueKey: `semantic-${timestamp}`,
            }),
            createTestJob("GENERATE_CHARACTER_ASSETS", {
                projectId: pid,
                uniqueKey: `char-assets-${timestamp}`,
            }),
            createTestJob("GENERATE_LOCATION_ASSETS", {
                projectId: pid,
                uniqueKey: `loc-assets-${timestamp}`,
            }),
            createTestJob("GENERATE_SCENE_FRAMES", {
                projectId: pid,
                uniqueKey: `frames-${timestamp}`,
                payload: { sceneIds: [], assetKeys: ["scene_start_frame", "scene_end_frame"] },
            }),
            createTestJob("GENERATE_SCENE_VIDEO", {
                projectId: pid,
                uniqueKey: `video-${timestamp}`,
                payload: { sceneId: uuidv7(), overridePrompt: "" },
            }),
            createTestJob("RENDER_VIDEO", {
                projectId: pid,
                uniqueKey: `render-${timestamp}`,
                payload: { videoPaths: [], audioGcsUri: null },
            }),
        ]);
    },

    batchStressTest: async (projectId?: string): Promise<Job[]> => {
        const pid = projectId ?? uuidv7();
        const timestamp = Date.now();
        return Promise.all([
            createTestJob("GENERATE_CHARACTER_ASSETS", {
                projectId: pid,
                uniqueKey: `batch-char-${timestamp}`,
                payload: { characters: [] } // Empty list implies ALL characters
            }),
            createTestJob("GENERATE_LOCATION_ASSETS", {
                projectId: pid,
                uniqueKey: `batch-loc-${timestamp}`,
                payload: { locations: [] } // Empty list implies ALL locations
            }),
            createTestJob("GENERATE_SCENE_FRAMES", {
                projectId: pid,
                uniqueKey: `batch-frames-${timestamp}`,
                payload: {
                    sceneIds: [], // Empty list implies ALL scenes
                    assetKeys: [ "scene_start_frame", "scene_end_frame" ]
                },
            }),
        ]);
    },
};
