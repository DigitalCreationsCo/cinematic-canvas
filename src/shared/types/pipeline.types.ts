// shared/types/pipeline.types.ts
import { Project, UpdateScene } from "./entities.types.js";
import { InterruptValueType, Scene } from "./workflow.types.js";
import { AssetStatus, AssetKey, AssetType, Scope, AssetVersion, AssetHistory, GuidanceLevel } from "./assets.types.js";
import { VersionMetric, WorkflowMetrics } from "./metrics.types.js";
import { z } from "zod";
import { RetryStrategy, Job } from "./job.types.js";

// ============================================================================
// PUBSUB MESSAGE BASE
// ============================================================================

export type PubSubMessage<T extends string, P = undefined> = P extends undefined ? {
    type: T;
    projectId: string;
    commandId?: string;
    timestamp: string;
} : {
    type: T;
    projectId: string;
    commandId?: string;
    timestamp: string;
    payload: P;
};

// ============================================================================
// COMMANDS (Client -> Server -> Pipeline)
// ============================================================================

export type PipelineCommand =
    | StartPipelineCommand
    | RequestFullStateCommand
    | ResumePipelineCommand
    | StopPipelineCommand
    | RegenerateSceneCommand
    | RegenerateFrameCommand
    | ResolveInterventionCommand
    | UpdateSceneAssetCommand;

export type StartPipelineCommand = {
    type: "START_PIPELINE";
    projectId: string;
    commandId?: string;
    timestamp: string;
    payload: {
        audioGcsUri?: string;
        audioPublicUri?: string;
        initialPrompt: string;
        title?: string;
        guidanceLevel?: GuidanceLevel;
        systemInstructions?: string;
        negativePrompt?: string;
        worldId?: string;
        teamId?: string; // Optional for backward compatibility with existing tests but required in prod
        userId?: string;
    };
};

export type RequestFullStateCommand = PubSubMessage<
    "REQUEST_FULL_STATE",
    (Record<string, never> | undefined)
>;

export type ResumePipelineCommand = PubSubMessage<
    "RESUME_PIPELINE",
    {
        resumeValue?: boolean;
    }
>;

export type StopPipelineCommand = PubSubMessage<
    "STOP_PIPELINE"
>;

export type RegenerateSceneCommand = PubSubMessage<
    "REGENERATE_SCENE",
    {
        sceneId: string;
        forceRegenerate: boolean;
        promptModification: string;
    }
>;

export type RegenerateFrameCommand = PubSubMessage<
    "GENERATE_SCENE_FRAMES",
    {
        sceneIds?: string[];
        assetKeys: ("scene_start_frame" | "scene_end_frame")[];
        promptModifications?: string[];
    }
>;

export type UpdateSceneAssetCommand = PubSubMessage<
    "UPDATE_SCENE_ASSET",
    {
        scene: Scene;
        assetKey: AssetKey;
        version: number | null; // null means delete/reject
    }
>;

export type ResolveInterventionCommand = PubSubMessage<
    "RESOLVE_INTERVENTION",
    {
        action: "skip";
        jobType?: string;
    } |
    {
        action: "abort";
        jobType?: string;
    } |
    {
        action: "retry";
        revisedParams: Record<string, any>;
        jobType: string;
    }
>;

// ============================================================================
// EVENTS (Pipeline -> Server -> Client)
// ============================================================================

export type PipelineEvent =
    | WorkflowStartedEvent
    | FullStateEvent
    | SceneStartedEvent
    | SceneUpdateEvent
    | SceneSkippedEvent
    | WorkflowCompletedEvent
    | WorkflowFailedEvent
    | LlmInterventionNeededEvent
    | InterventionResolvedEvent
    | LogEvent
    | NewAssetsBatchEvent;

export type LogEvent = PubSubMessage<
    "LOG",
    {
        level: "info" | "warn" | "error" | "success";
        message: string;
        sceneId?: string;
        [ key: string ]: any;
    }
>;

export type WorkflowStartedEvent = PubSubMessage<"WORKFLOW_STARTED", { project: Project; }>;

export type FullStateEvent = PubSubMessage<"FULL_STATE", { project: Project; }>;

export type SceneStartedEvent = PubSubMessage<"SCENE_STARTED", { scene: Scene; }>;

export type SceneUpdateEvent = PubSubMessage<"SCENE_UPDATE", { sceneIds: string[]; updates: (Partial<UpdateScene> & { id: string; projectId: string; sceneIndex: number; })[]; }>;

export type SceneSkippedEvent = PubSubMessage<"SCENE_SKIPPED", { sceneId: string; reason: string; videoUrl?: string; }>;

export type WorkflowCompletedEvent = PubSubMessage<"WORKFLOW_COMPLETED">;

export type WorkflowFailedEvent = PubSubMessage<"WORKFLOW_FAILED", { error: string; nodeName?: string; }>;

export type LlmInterventionNeededEvent = PubSubMessage<
    "LLM_INTERVENTION_NEEDED",
    {
        type: InterruptValueType;
        error: string;
        params?: Record<string, any>;
        functionName: string;
        nodeName: string;
        attemptCount?: number;
        jobType?: string;
    }
>;

export type InterventionResolvedEvent = PubSubMessage<
    "INTERVENTION_RESOLVED",
    {
        action: "retry" | "skip" | "abort";
        nodeName: string;
        jobType?: string;
    }
>;

/**
* Fired when worker services generate new project assets. Persists a new 
* version (or updates an existing key's history) for any entity.  This is a DELTA — it carries
* a list of multiple AssetHistory, not the full registry.  The client merges
* it into whatever is already cached.
*/
export type NewAssetsBatchEvent = PubSubMessage<
    "NEW_ASSETS_BATCH",
    {
        entityId: string;
        assetKey: AssetKey;
        history: AssetHistory;
    }[]
>;

// ============================================================================
// PIPELINE STATE & CALLBACKS
// ============================================================================

export interface PipelineMessage {
    id: string;
    type: "info" | "warn" | "error" | "success";
    message: string;
    timestamp: Date;
    sceneId?: string;
}

export type PipelineStatus =
    | "ready"
    | "analyzing" |
    "generating" |
    "evaluating" |
    "complete" |
    "error" |
    "paused";

export type StatusType = PipelineStatus | AssetStatus | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES" | "FAIL" | "ACCEPT" | "ACCEPT_WITH_NOTES" | "REGENERATE_MINOR" | "REGENERATE_MAJOR";

export type SaveAssetsCallbackArgs = [
    scope: Scope,
    assetKeys: AssetKey[],
    type: AssetType,
    dataList: string[],
    metadata: (Omit<AssetVersion[ 'metadata' ], 'jobId'>)[],
    setBest?: boolean | boolean[],
];
export type SaveAssetsCallback = (...args: SaveAssetsCallbackArgs) => Promise<void>;

export type UpdateScenesCallbackArgs = [
    sceneIds: string[],
    updates: (Partial<UpdateScene> & { id: string; projectId: string; sceneIndex: number; })[],
    saveToDb?: boolean,
];
export type UpdateScenesCallback = (...args: UpdateScenesCallbackArgs) => void;

export type RecordMetricsCallback = (
    attemptMetris: (Pick<VersionMetric, "entityId" | "assetKey" | "finalScore" | "ruleAdded" | "attemptNumber" | "corrections">)[]) => Promise<WorkflowMetrics | undefined>;

// Hook type for retry logic
export type IncrementAttemptHook = (
    error: string,
    strategy: RetryStrategy
) => Promise<Job>;
