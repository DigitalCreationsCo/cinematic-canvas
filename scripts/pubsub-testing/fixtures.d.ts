/**
 * Test fixtures for pubsub testing
 * Provides type-safe factories for creating test Project and Job payloads
 */
import type { Project, JobType, InsertJob, Scene, Character, Location, ProjectMetadata, PipelineEvent, JobEvent, Job } from "../../src/shared/types/index.js";
import { JobControlPlane } from "../../src/shared/services/job-control-plane.js";
export declare const jobControlPlane: JobControlPlane;
export declare const createTestScene: (overrides?: Partial<Scene>) => Scene;
export declare const createTestCharacter: (overrides?: Partial<Character>) => Character;
export declare const createTestLocation: (overrides?: Partial<Location>) => Location;
export declare const createTestProjectMetadata: (overrides?: Partial<ProjectMetadata>) => ProjectMetadata;
export declare const createTestProject: (overrides?: Partial<Project>) => Project;
export declare const createJobPayload: (type: JobType, overrides?: Record<string, unknown>) => {
    [x: string]: unknown;
};
export declare const createTestJob: (type: JobType, overrides?: Partial<InsertJob>) => Promise<Job>;
export type PublishableEvent = PipelineEvent | JobEvent;
export declare const createFullStateEvent: (project?: Project) => PublishableEvent;
export declare const createJobEvent: (type: "JOB_DISPATCHED" | "JOB_STARTED" | "JOB_COMPLETED" | "JOB_FAILED" | "JOB_CANCELLED", jobId: string, projectId: string, error?: string) => PublishableEvent;
export declare const TestScenarios: {
    minimalProject: () => Project;
    richStoryboard: () => Project;
    audioProject: () => Project;
    workflowChain: (projectId?: string) => Promise<Job[]>;
    batchStressTest: (projectId?: string) => Promise<Job[]>;
};
