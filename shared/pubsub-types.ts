import { GraphState } from "./pipeline-types";

// Generic wrapper for all Pub/Sub messages
export interface PubSubMessage<T extends string, P> {
    type: T;
    projectId: string;
    payload: P;
    timestamp: string;
}

// ===== COMMANDS (Client -> Server -> Pipeline) =====

export type Command =
    | StartPipelineCommand
    | RequestFullStateCommand
    | RetrySceneCommand
    | StopPipelineCommand;

export type StartPipelineCommand = PubSubMessage<
    "START_PIPELINE",
    {
        audioUrl: string;
        creativePrompt: string;
    }
>;

export type RequestFullStateCommand = PubSubMessage<
    "REQUEST_FULL_STATE",
    Record<string, never> // No payload needed
>;

export type RetrySceneCommand = PubSubMessage<
    "RETRY_SCENE",
    {
        sceneId: string;
    }
>;

export type StopPipelineCommand = PubSubMessage<
    "STOP_PIPELINE",
    Record<string, never> // No payload needed
>;


// ===== EVENTS (Pipeline -> Server -> Client) =====

export type PipelineEvent =
    | WorkflowStartedEvent
    | FullStateEvent
    | SceneCompletedEvent
    | WorkflowCompletedEvent
    | WorkflowFailedEvent;


export type WorkflowStartedEvent = PubSubMessage<
    "WORKFLOW_STARTED",
    {
        initialState: GraphState;
    }
>;

export type FullStateEvent = PubSubMessage<
    "FULL_STATE",
    {
        state: GraphState;
    }
>;

export type SceneCompletedEvent = PubSubMessage<
    "SCENE_COMPLETED",
    {
        sceneId: string;
        // Include any relevant data about the completed scene
    }
>;

export type WorkflowCompletedEvent = PubSubMessage<
    "WORKFLOW_COMPLETED",
    {
        finalState: GraphState;
        videoUrl: string;
    }
>;

export type WorkflowFailedEvent = PubSubMessage<
    "WORKFLOW_FAILED",
    {
        error: string;
    }
>;
