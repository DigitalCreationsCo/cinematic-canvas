// #shared/lm/tools/generate-scene-frames.ts
import { aspectRatios } from "#shared/config.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { ReferenceImageInputs } from "#shared/lm/provider.js";
import { GcsObjectPathParams } from "#shared/types/storage.types.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { generateImages, GenerateImageRequest } from "#shared/lm/tools/generate-images.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface SceneFrameGenerationRequest {
    /** Unique identifier — typically `${scene.id}_${assetKey}`. */
    id: string;
    projectId: string;
    sceneId: string;
    framePosition: "start" | "end";
    /** Fully enhanced, post-processed prompt. Compiled by the caller. */
    prompt: string;
    /** Pre-compiled by the caller (character subjects + location base + continuity ref). */
    referenceImages: ReferenceImageInputs;
    /**
     * Starting version number for this frame's assets.
     * Pre-fetched by the caller via AssetVersionManager.
     * Multiple generated images receive startingVersion, startingVersion+1, etc.
     */
    version: number;
    /** Number of images to generate. Defaults to generateImages default (3). */
    count?: number;
}

export type SceneFrameGenerationSuccess = {
    success: true;
    id: string;
    sceneId: string;
    framePosition: "start" | "end";
    outputs: { uri: string; version: number }[];
    metadata: { model: string; prompt: string };
};

export type SceneFrameGenerationResult =
    | SceneFrameGenerationSuccess
    | {
        success: false;
        id: string;
        sceneId: string;
        framePosition: "start" | "end";
        error: Error;
    };

interface GenerateSceneFramesParams {
    requests: SceneFrameGenerationRequest[];
    attempt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates start/end frame images for a batch of scene frame requests.
 *
 * Responsibilities:
 *  - Maps SceneFrameGenerationRequest → GenerateImageRequest (storage path factory, aspect ratio)
 *  - Emits sendEntityUpdate before and after generation (via ToolContext)
 *  - Calls saveAssets for each successful result (via ToolContext)
 *  - Delegates all provider interaction and mode dispatch to generateImages
 *
 * Does NOT own:
 *  - Prompt generation (caller's responsibility)
 *  - Reference image compilation (caller's responsibility)
 *  - Version pre-fetching (caller's responsibility)
 *  - Quality retry logic (agent's responsibility)
 */
export async function generateSceneFrames(
    { requests, attempt }: GenerateSceneFramesParams,
    context: ToolContext<TextModelController>
): Promise<SceneFrameGenerationResult[]> {
    const { traceId, projectId } = context;

    console.log(`[${traceId}] generateSceneFrames: attempt=${attempt} frames=${requests.length}`);

    context.sendEntityUpdate?.(
        requests.map((req) => ({
            id: req.sceneId,
            entityType: "scene" as const,
            entity: {
                status: "generating" as const,
                progressMessage: `Generating ${req.framePosition} frame (attempt ${attempt})...`,
            },
        }))
    );

    const imageRequests: GenerateImageRequest[] = requests.map((req) => ({
        id: req.id,
        prompt: `Frame Description: ${req.prompt}`,
        referenceImages: req.referenceImages,
        aspectRatio: aspectRatios.widescreen.aspectRatio,
        startingVersion: req.version,
        count: req.count,
        buildPath: (version: number): GcsObjectPathParams => ({
            type: req.framePosition === "start" ? "scene_start_frame" : "scene_end_frame",
            projectId: req.projectId,
            sceneId: req.sceneId,
            version,
        }),
    }));

    const imageResults = await generateImages(imageRequests, context);

    context.sendEntityUpdate?.(
        requests.map((req) => ({
            id: req.sceneId,
            entityType: "scene" as const,
            entity: {
                progressMessage: `Generated ${req.framePosition} frame`,
            },
        })),
        false
    );

    const resultsMap = new Map(imageResults.map(res => [res.id, res]));

    const results: SceneFrameGenerationResult[] = requests.map((req) => {
        const res = resultsMap.get(req.id);

        if (!res) {
            return {
                success: false,
                id: req.id,
                sceneId: req.sceneId,
                framePosition: req.framePosition,
                error: new Error(`No result returned for request ID: ${req.id}`),
            };
        }

        if (!res.success) {
            console.error(`[${traceId}] generateSceneFrames: failed for ${res.id}:`, res.error);
            return {
                success: false,
                id: res.id,
                sceneId: req.sceneId,
                framePosition: req.framePosition,
                error: res.error,
            };
        }

        const assetKey = req.framePosition === "start" ? "scene_start_frame" : "scene_end_frame";

        context.saveAssets?.(
            { projectId: req.projectId, sceneIds: [req.sceneId] },
            [assetKey],
            "image",
            res.outputs.map((o) => o.uri),
            res.outputs.map(() => ({ model: res.metadata.model, prompt: res.metadata.prompt })),
            true
        );

        return {
            success: true,
            id: res.id,
            sceneId: req.sceneId,
            framePosition: req.framePosition,
            outputs: res.outputs,
            metadata: res.metadata,
        };
    });

    const successCount = results.filter((r) => r.success).length;
    console.log(`[${traceId}] generateSceneFrames: ${successCount}/${results.length} succeeded`);

    return results;
}