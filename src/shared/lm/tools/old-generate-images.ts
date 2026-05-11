// #shared/lm/tools/generate-images.ts
import { getExecutionMode, imageMimeType } from "#shared/config.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { GenerateBatchImagesParameters, Modality, ReferenceImageInputs, UserMessage } from "#shared/lm/provider.js";
import { toMessagesFromReferenceImages } from "#shared/lm/params.js";
import { GcsObjectPathParams } from "#shared/types/storage.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateImageRequest {
    /** Correlation ID — matches the id in the returned result. */
    id: string;
    prompt: string;
    referenceImages?: ReferenceImageInputs;
    /** e.g. aspectRatios.widescreen.aspectRatio */
    aspectRatio: string;
    /**
     * The first version number to assign to the first generated image.
     * Subsequent images within the same request receive startingVersion + i.
     * The caller is responsible for pre-fetching a contiguous version slot.
     */
    startingVersion: number;
    /**
     * Number of images to generate for this request.
     * Each image becomes its own versioned asset.
     * Defaults to 3.
     */
    count?: number;
    /**
     * Factory that produces a storage path for each generated image given its
     * version number. Called once per image inside the tool.
     */
    buildPath: (version: number) => GcsObjectPathParams;
}

export type GenerateImageOutput = {
    uri: string;
    version: number;
};

export type GenerateImageResult =
    | {
        success: true;
        id: string;
        outputs: GenerateImageOutput[];
        metadata: { model: string; prompt: string };
    }
    | {
        success: false;
        id: string;
        outputs?: never;
        error: Error;
    };

// ─────────────────────────────────────────────────────────────────────────────
// Entry point — reads EXECUTION_MODE from config and dispatches accordingly
// ─────────────────────────────────────────────────────────────────────────────

export async function generateImages(
    requests: GenerateImageRequest[],
    context: ToolContext<TextModelController>
): Promise<GenerateImageResult[]> {
    if (requests.length === 0) return [];

    const { traceId } = context;
    const executionMode = getExecutionMode();
    console.log(`[${traceId}] generateImages: mode=${executionMode} requests=${requests.length}`);

    switch (executionMode) {
        case "BATCH":
            return generateImagesBatch(requests, context);
        case "PARALLEL":
            return generateImagesParallel(requests, context);
        case "SEQUENTIAL":
        default:
            return generateImagesSequential(requests, context);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode implementations
// ─────────────────────────────────────────────────────────────────────────────

async function generateImagesSequential(
    requests: GenerateImageRequest[],
    context: ToolContext<TextModelController>
): Promise<GenerateImageResult[]> {
    const { traceId } = context;
    const results: GenerateImageResult[] = [];

    for (const req of requests) {
        const count = req.count ?? 3;
        console.log(`[${traceId}] Sequential: generating ${count} image(s) for ${req.id}`);

        try {
            const response = await context.provider.generateImages({
                prompt: req.prompt,
                ...(req.referenceImages && { referenceImages: req.referenceImages }),
                config: {
                    numberOfImages: count,
                    aspectRatio: req.aspectRatio,
                    outputMimeType: imageMimeType,
                    abortSignal: context.options?.signal,
                },
            });

            const outputs = await uploadAll(response.generatedImages ?? [], req, context);
            results.push({
                success: true,
                id: req.id,
                outputs,
                metadata: { model: context.provider.imageModel, prompt: req.prompt },
            });
        } catch (e) {
            console.error(`[${traceId}] Sequential: failed for ${req.id}:`, e);
            results.push({ success: false, id: req.id, error: e as Error });
        }
    }

    return results;
}

async function generateImagesParallel(
    requests: GenerateImageRequest[],
    context: ToolContext<TextModelController>
): Promise<GenerateImageResult[]> {
    const { traceId } = context;
    console.log(`[${traceId}] Parallel: generating for ${requests.length} request(s)`);

    return Promise.all(
        requests.map(async (req): Promise<GenerateImageResult> => {
            const count = req.count ?? 3;
            try {
                const response = await context.provider.generateImages({
                    prompt: req.prompt,
                    ...(req.referenceImages && { referenceImages: req.referenceImages }),
                    config: {
                        numberOfImages: count,
                        aspectRatio: req.aspectRatio,
                        outputMimeType: imageMimeType,
                        abortSignal: context.options?.signal,
                    },
                });

                const outputs = await uploadAll(response.generatedImages ?? [], req, context);
                return {
                    success: true,
                    id: req.id,
                    outputs,
                    metadata: { model: context.provider.imageModel, prompt: req.prompt },
                };
            } catch (e) {
                console.error(`[${traceId}] Parallel: failed for ${req.id}:`, e);
                return { success: false, id: req.id, error: e as Error };
            }
        })
    );
}

async function generateImagesBatch(
    requests: GenerateImageRequest[],
    context: ToolContext<TextModelController>
): Promise<GenerateImageResult[]> {
    const { projectId, traceId } = context;
    console.log(`[${traceId}] Batch: submitting ${requests.length} request(s). Project: ${projectId}`);

    const batchRequests: GenerateBatchImagesParameters["requests"] = requests.map((req) => {
        const textPart = new UserMessage({ content: req.prompt });
        const messages = req.referenceImages
            ? toMessagesFromReferenceImages(req.referenceImages).concat([textPart])
            : [textPart];

        return {
            messages,
            metadata: { custom_id: req.id, version: req.startingVersion },
            config: {
                candidateCount: req.count ?? 3,
                responseModalities: [Modality.IMAGE],
                imageConfig: {
                    aspectRatio: req.aspectRatio,
                    outputMimeType: imageMimeType,
                },
                abortSignal: context.options?.signal,
            },
        };
    });

    try {
        const batchResults = await context.provider.generateBatchImages({
            projectId,
            model: context.provider.imageModel,
            requests: batchRequests,
            config: {
                abortSignal: context.options?.signal,
                dest: {
                    gcsUri: context.storageManager.getObjectPath({
                        type: "batch-data",
                        projectId,
                        uniqueId: Date.now().toString(),
                    }),
                },
                displayName: `generateImages_${traceId}`,
            },
        });

        // candidateCount > 1 means multiple result entries share the same customId.
        // Group them so we can assign version slots per-candidate.
        const grouped = new Map<string, typeof batchResults>();
        for (const res of batchResults) {
            if (!grouped.has(res.customId)) grouped.set(res.customId, []);
            grouped.get(res.customId)!.push(res);
        }

        return Promise.all(
            requests.map(async (req): Promise<GenerateImageResult> => {
                const group = grouped.get(req.id) ?? [];

                if (group.length === 0) {
                    return {
                        success: false,
                        id: req.id,
                        error: new Error(`No batch results returned for request ${req.id}`),
                    };
                }

                try {
                    const outputs: GenerateImageOutput[] = [];

                    for (let i = 0; i < group.length; i++) {
                        const res = group[i];
                        if (res.status !== "SUCCESS" || !res.imageBytes) {
                            console.error(`[${traceId}] Batch: candidate ${i} failed for ${req.id}:`, res.error);
                            continue;
                        }

                        const version = req.startingVersion + i;
                        const pathParams = req.buildPath(version);
                        const path = context.storageManager.getObjectPath(pathParams);
                        const uri = await context.storageManager.uploadBuffer(
                            Buffer.from(res.imageBytes, "base64"),
                            path,
                            imageMimeType
                        );
                        outputs.push({ uri, version });
                    }

                    if (outputs.length === 0) {
                        return {
                            success: false,
                            id: req.id,
                            error: new Error(`All batch candidates failed for request ${req.id}`),
                        };
                    }

                    return {
                        success: true,
                        id: req.id,
                        outputs,
                        metadata: { model: context.provider.imageModel, prompt: req.prompt },
                    };
                } catch (e) {
                    console.error(`[${traceId}] Batch: upload failure for ${req.id}:`, e);
                    return { success: false, id: req.id, error: e as Error };
                }
            })
        );
    } catch (e) {
        console.error(`[${traceId}] Batch: fatal submission failure:`, e);
        return requests.map((r) => ({ success: false, id: r.id, error: e as Error }));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper
// ─────────────────────────────────────────────────────────────────────────────

async function uploadAll(
    generatedImages: { image?: { imageBytes?: string } }[],
    req: GenerateImageRequest,
    context: ToolContext<TextModelController>
): Promise<GenerateImageOutput[]> {
    const { traceId } = context;
    const outputs: GenerateImageOutput[] = [];

    for (let i = 0; i < generatedImages.length; i++) {
        const imageBytes = generatedImages[i].image?.imageBytes;
        if (!imageBytes) {
            console.warn(`[${traceId}] Missing imageBytes at index ${i} for request ${req.id} — skipping.`);
            continue;
        }

        const version = req.startingVersion + i;
        const pathParams = req.buildPath(version);
        const path = context.storageManager.getObjectPath(pathParams);
        const uri = await context.storageManager.uploadBuffer(
            Buffer.from(imageBytes, "base64"),
            path,
            imageMimeType
        );
        outputs.push({ uri, version });
    }

    return outputs;
}