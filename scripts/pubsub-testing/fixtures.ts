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
} from "../../src/shared/types/index.js";
import {
    createMockCharacter,
    createMockJob,
    createMockLocation,
    createMockProject,
    createMockProjectMetadata,
    createMockScene
} from "#shared/mocks/";
import { JobControlPlane } from "../../src/shared/services/job-control-plane.js";
import { PoolManager } from "../../src/shared/services/pool-manager.js";
import { initializeDatabase, getPool } from "../../src/shared/db/index.js";

initializeDatabase(getPool());
const poolManager = new PoolManager({ enableMetrics: false });
export const jobControlPlane = new JobControlPlane(poolManager, async () => { }); // use external dispatcher

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

export const createTestJob = async (type: JobType, overrides: Partial<InsertJob>): Promise<Job> => {

    const testJob = createMockJob({ type, ...overrides });
    return await jobControlPlane.createJob(testJob);
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
    payload: { project: project ?? createMockProject() },
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
            return { type, jobId, projectId };
        case "JOB_COMPLETED":
            return { type, jobId, projectId };
        case "JOB_FAILED":
            return { type, jobId, projectId, error: error ?? "Test failure" };
        case "JOB_CANCELLED":
            return { type, jobId, projectId };
    }
};

// ============================================================================
// PREDEFINED SCENARIOS
// ============================================================================

export const TestScenarios = {
    minimalProject: (): Project => createMockProject({
        scenes: [],
        characters: [],
        locations: [],
    }),

    richStoryboard: (): Project => {
        const projectId = generateId();
        const scenes = Array.from({ length: 5 }, (_, i) =>
            createMockScene({
                projectId,
                sceneIndex: i,
                name: `Scene ${i + 1}`,
                description: `Description for scene ${i + 1}`,
            })
        );
        const characters = [
            createMockCharacter({ projectId, name: "Protagonist", age: "30s" }),
            createMockCharacter({ projectId, name: "Antagonist", age: "40s" }),
            createMockCharacter({ projectId, name: "Sidekick", age: "20s" }),
        ];
        const locations = [
            createMockLocation({ projectId, name: "City Street", type: "urban" }),
            createMockLocation({ projectId, name: "Coffee Shop", type: "interior" }),
        ];

        return createMockProject({
            id: projectId,
            metadata: createMockProjectMetadata({
                title: "Rich Storyboard Test",
                initialPrompt: "A cinematic story about urban life",
            }),
            scenes,
            characters,
            locations,
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
