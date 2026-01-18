//shared/job.types.ts
import { AssetKey, AudioAnalysis, Character, Location, Project, QualityEvaluationResult, Scene, SceneGenerationResult, Storyboard } from "./workflow.types";



export type JobType =
    | "EXPAND_CREATIVE_PROMPT"
    | "GENERATE_STORYBOARD"
    | "PROCESS_AUDIO_TO_SCENES"
    | "ENHANCE_STORYBOARD"
    | "SEMANTIC_ANALYSIS"
    | "GENERATE_CHARACTER_ASSETS"
    | "GENERATE_LOCATION_ASSETS"
    | "GENERATE_SCENE_FRAMES"
    | "GENERATE_SCENE_VIDEO"
    | "RENDER_VIDEO"
    | "FRAME_RENDER";

export type JobState =
    | "CREATED"
    | "RUNNING"
    | "COMPLETED"
    | "FAILED"
    | "FATAL"
    | "CANCELLED";

export type JobRecord =
    | JobRecordExpandCreativePrompt
    | JobRecordGenerateStoryboard
    | JobRecordProcessAudioToScenes
    | JobRecordEnhanceStoryboard
    | JobRecordSemanticAnalysis
    | JobRecordGenerateCharacterAssets
    | JobRecordGenerateLocationAssets
    | JobRecordGenerateSceneFrames
    | JobRecordGenerateSceneVideo
    | JobRecordStitchVideo
    | JobRecordFrameRender;

type JobRecordBase<T extends JobType, R, P = undefined> = R extends undefined ? {
    id: string;
    projectId: string;
    type: T;
    state: JobState;
    error?: string;
    uniqueKey?: string;
    assetKey: AssetKey;
    attempt: number;
    maxRetries: number;
    createdAt: Date;
    updatedAt: Date;
    payload: P;
} : {
    id: string;
    projectId: string;
    type: T;
    state: JobState;
    result: R;
    error?: string;
    uniqueKey?: string;
    assetKey: AssetKey;
    attempt: number;
    maxRetries: number;
    createdAt: Date;
    updatedAt: Date;
    payload: P;
};

export type JobRecordExpandCreativePrompt = JobRecordBase<
    "EXPAND_CREATIVE_PROMPT",
    {
        expandedPrompt: string;
    },
    {
        title: string;
        initialPrompt: string;
    }
>;

export type JobRecordGenerateStoryboard = JobRecordBase<
    "GENERATE_STORYBOARD",
    {
        storyboard: {
            metadata: Project[ 'metadata' ],
            characters: Character[],
            locations: Location[],
            scenes: Scene[],
        };
    },
    {
        title: string;
        enhancedPrompt: string;
    }
>;

export type JobRecordProcessAudioToScenes = JobRecordBase<
    "PROCESS_AUDIO_TO_SCENES",
    {
        analysis: AudioAnalysis;
    },
    {
        audioPublicUri: string;
        enhancedPrompt: string;
    }
>;

export type JobRecordEnhanceStoryboard = JobRecordBase<
    "ENHANCE_STORYBOARD",
    {
        storyboard: Storyboard;
    },
    {
        storyboard: Storyboard;
        enhancedPrompt: string;
    }
>;

export type JobRecordSemanticAnalysis = JobRecordBase<
    "SEMANTIC_ANALYSIS",
    {
        dynamicRules: string[];
    }
>;

export type JobRecordGenerateCharacterAssets = JobRecordBase<
    "GENERATE_CHARACTER_ASSETS",
    {
        characters: Character[];
    },
    {
        characters: Character[];
        generationRules: string[];
    }
>;

export type JobRecordGenerateLocationAssets = JobRecordBase<
    "GENERATE_LOCATION_ASSETS",
    {
        locations: Location[];
    },
    {
        locations: Location[];
        generationRules: string[];
    }
>;

export type JobRecordGenerateSceneFrames = JobRecordBase<
    "GENERATE_SCENE_FRAMES",
    {
        updatedScenes: Scene[];
    },
    {
        sceneId: string;
        sceneIndex: number;
    }
>;

export type JobRecordGenerateSceneVideo = JobRecordBase<
    "GENERATE_SCENE_VIDEO",
    SceneGenerationResult,
    {
        sceneId: string;
        sceneIndex: number;
        version: number;
        overridePrompt: boolean;
    }
>;

export type JobRecordStitchVideo = JobRecordBase<
    "RENDER_VIDEO",
    {
        renderedVideo: string;
    },
    {
        videoPaths: string[];
        audioGcsUri?: string;
    }
>;

export type JobRecordFrameRender = JobRecordBase<
    "FRAME_RENDER",
    {
        scene: Scene;
        image: string;
    },
    {
        scene: Scene;
        prompt: string;
        framePosition: "start" | "end";
        sceneCharacters: Character[];
        sceneLocations: Location[];
        previousFrame?: string;
        referenceImages: string[];
    }
>;


export type JobEvent =
    | { type: "JOB_DISPATCHED"; jobId: string; }
    | { type: "JOB_STARTED"; jobId: string; }
    | { type: "JOB_COMPLETED"; jobId: string; }
    | { type: "JOB_FAILED"; jobId: string; error: string; }
    | { type: "JOB_CANCELLED"; jobId: string; };

export type GenerativeResultEnvelope<T> = {
    data: T;
    metadata: {
        model: string;
        evaluation?: QualityEvaluationResult;
        attempts: number;
        acceptedAttempt: number;
        warning?: string;
    };
};