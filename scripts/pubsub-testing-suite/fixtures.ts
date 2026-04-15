/**
 * Test fixtures for pubsub testing
 * Provides type-safe factories for creating test Project and Job payloads
 */

import { generateId } from "#shared/utils/id.js";
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
    PipelineCommand,
} from "../../src/shared/types/index.js";
import {
    createMockCharacter,
    createMockJob,
    createJobPayload,
    createMockLocation,
    createMockProject,
    createMockProjectMetadata,
    createMockStoryboard,
    createMockScene
} from "../../src/shared/mocks/";
import { JobControlPlane } from "../../src/shared/services/job-control-plane.js";
import { PoolManager } from "../../src/shared/services/pool-manager.js";
import { initializeDatabase, getPool } from "../../src/shared/db/index.js";

initializeDatabase(getPool());
const poolManager = new PoolManager({ enableMetrics: false });
export const jobControlPlane = new JobControlPlane(poolManager, async () => { });



export type PublishableEvent = PipelineEvent | JobEvent | PipelineCommand;
export type PublishableEventType = PipelineEvent['type'] | JobType | PipelineCommand['type'];

/**
 * COMPREHENSIVE JOB TYPE REGISTRY
 * Includes all current client commands and pipeline internal processes.
 */
export const PIPELINE_JOB_TYPES: PublishableEventType[] = [
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
    "START_PIPELINE",
    "STOP_PIPELINE",
    "RESUME_PIPELINE",
    "ENTITY_CREATED",
    "LOG",
    "LLM_INTERVENTION_NEEDED",
    "RESOLVE_INTERVENTION",
];

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

const createTestJob = async (type: JobType, overrides: Partial<InsertJob>): Promise<Job> => {
    const testJob = createMockJob({ type, ...overrides });
    return await jobControlPlane.createJob(testJob);
};

const teamId = "test-team-id";
const userId = "test-user-id";

const createFullStateEvent = (project?: Project): PipelineEvent => ({
    type: "FULL_STATE",
    projectId: project?.id ?? "test-project-id",
    teamId,
    userId,
    commandId: "test-command-id",
    timestamp: new Date().toISOString(),
    payload: { project: project ?? createMockProject() },
});

const createJobEvent = (
    state: "JOB_DISPATCHED" | "JOB_STARTED" | "JOB_COMPLETED" | "JOB_FAILED" | "JOB_CANCELLED",
    jobId: string,
    projectId: string,
    error?: string
): PublishableEvent => {
    switch (state) {
        case "JOB_DISPATCHED":
            return { state, type: "EXPAND_CREATIVE_PROMPT", jobId, projectId, teamId, userId, metadata: {} };
        case "JOB_STARTED":
            return { state, type: "EXPAND_CREATIVE_PROMPT", jobId, projectId, teamId, userId, metadata: {} };
        case "JOB_COMPLETED":
            return { state, type: "EXPAND_CREATIVE_PROMPT", jobId, projectId, teamId, userId, metadata: {} };
        case "JOB_FAILED":
            return { state, type: "EXPAND_CREATIVE_PROMPT", jobId, projectId, teamId, userId, error: error ?? "Test failure", metadata: {} };
        case "JOB_CANCELLED":
            return { state, type: "EXPAND_CREATIVE_PROMPT", jobId, projectId, teamId, userId, metadata: {} };
    }
};

// ============================================================================
// PREDEFINED SCENARIOS
// ============================================================================

const TestScenarios = {
    minimalProject: (): Project => createMockProject({
        scenes: [],
        characters: [],
        locations: [],
    }),

    /** Generates a project with deep nested dependencies for stress testing */
    fullProject: (projectId = generateId()): Project => {
        const scenes = Array.from({ length: 10 }, (_, i) => createMockScene({
            sceneIndex: i,
            id: `scene_${i}_${projectId}`
        }));
        const chars = Array.from({ length: 5 }, () => createMockCharacter());
        return createMockProject({ id: projectId, scenes, characters: chars });
    },

    /** Mimics a pipeline "Intervention Required" event */
    interventionEvent: (projectId: string, reason: string): PipelineEvent => ({
        type: "LLM_INTERVENTION_NEEDED",
        projectId,
        timestamp: new Date().toISOString(),
        teamId,
        userId,
        payload: {
            type: {} as any,
            error: reason,
            params: {
                prompt: 'test-prompt'
            },
            jobId: generateId(),
            nodeName: "GENERATE_STORYBOARD",
            functionName: "GENERATE_STORYBOARD",
            attemptCount: 1,
            jobType: "GENERATE_STORYBOARD",
        }
    }),

    enrichedStoryboard: (): Project => {
        const projectId = generateId();
        const scenes = Array.from({ length: 5 }, (_, i) =>
            createMockScene({
                projectId,
                sceneIndex: i,
                name: `Scene ${i + 1}`,
                assets: { description: `Description for scene ${i + 1}` },
            })
        );
        const characters = [
            createMockCharacter({ projectId, name: "Protagonist" }),
            createMockCharacter({ projectId, name: "Antagonist" }),
            createMockCharacter({ projectId, name: "Sidekick" }),
        ];
        const locations = [
            createMockLocation({ projectId, name: "City Street" }),
            createMockLocation({ projectId, name: "Coffee Shop", type: "interior" }),
        ];
        const metadata = createMockProjectMetadata({
            title: "Rich Storyboard Test",
            initialPrompt: "A cinematic story about urban life",
        });
        const storyboard = createMockStoryboard({
            metadata,
            scenes,
            characters,
            locations,
        });

        return createMockProject({
            id: projectId,
            metadata,
            storyboard,
        });
    },

    audioProject: (): Project => createMockProject({
        metadata: createMockProjectMetadata({
            hasAudio: true,
            audioGcsUri: "gs://test-bucket/audio/test.mp3",
            audioPublicUri: "https://storage.example.com/audio/test.mp3",
            duration: 180,
            bpm: 120,
            keySignature: "C major",
        }),
        audioAnalysis: {
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
        const pid = projectId ?? generateId();
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
                payload: { sceneId: generateId(), overridePrompt: "" },
            }),
            createTestJob("RENDER_VIDEO", {
                projectId: pid,
                uniqueKey: `render-${timestamp}`,
                payload: { videoPaths: [], audioGcsUri: null },
            }),
        ]);
    },

    batchStressTest: async (projectId?: string): Promise<Job[]> => {
        const pid = projectId ?? generateId();
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
                    assetKeys: ["scene_start_frame", "scene_end_frame"]
                },
            }),
        ]);
    },
};

export {
    TestScenarios,
    createMockCharacter as createTestCharacter,
    createTestJob,
    createJobEvent,
    createJobPayload,
    createMockLocation as createTestLocation,
    createMockProject as createTestProject,
    createMockProjectMetadata as createTestProjectMetadata,
    createMockStoryboard as createTestStoryboard,
    createMockScene as createTestScene,
    createFullStateEvent,
};