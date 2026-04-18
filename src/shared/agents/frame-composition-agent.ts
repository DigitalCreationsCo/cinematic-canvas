import { GCPStorageManager } from "../services/storage-manager.js";
import { TextModelController } from "../lm/text-model-controller.js";
import { QualityCheckAgent } from "./quality-check-agent.js";
import { AssetKey, Character, Location, Scene } from "../types/index.js";
import { composeGenerationRules } from "../prompts/prompt-utils.js";
import { cleanJsonOutput } from "../utils/utils.js";
import { AssetVersionManager } from "../services/asset-version-manager.js";
import { QualityRetryHandler, BatchItemResult } from "../utils/quality-retry-handler.js";
import { IncrementAttemptHook, SaveAssetsCallback, UpdateEntitiesCallback, GcsObjectPathParams } from "../types/index.js";
import { GenerativeResultFrameRender } from "../types/job.types.js";
import { aspectRatios, imageMimeType } from "../config.js";
import { GenerateBatchImagesParameters, Modality, ReferenceImageInputs, SystemMessage, UserMessage } from "../lm/provider.js";
import { toContentsFromReferenceImages } from "../lm/utils.js";
import { composeFrameGenerationPromptMeta } from "../prompts/scene-frame.prompt.js";
import { continuitySystemPrompt } from "../prompts/must-review/continuity.prompt.js";
import { AgentOptions } from "#shared/agents/agent.options.js";
import { ThinkingLevel } from "#shared/lm/google/provider.js";



type FrameImageObjectParams = Extract<GcsObjectPathParams, ({ type: "scene_start_frame"; } | { type: "scene_end_frame"; })>;

export type FramePromptRequest = {
    framePosition: "start" | "end";
    scene: Scene;
    characters: Character[];
    locations: Location[];
    previousScene?: Scene;
    generationRules?: string[];
    metadata: { custom_id: string; assetKey: AssetKey; version: number; };
};

export interface FrameCompositionItem extends FramePromptRequest {
    id: string; // Use scene.id or custom_id
    prompt: string;
    referenceImages: ReferenceImageInputs;
    uniqueId?: string;
}

const delayExecutionMs = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class FrameCompositionAgent {
    private lm: TextModelController;
    private imageModel: TextModelController;
    private qualityAgent: QualityCheckAgent;
    private assetManager: AssetVersionManager;
    private storageManager: GCPStorageManager;
    private options?: AgentOptions;

    constructor(
        lm: TextModelController,
        imageModel: TextModelController,
        qualityAgent: QualityCheckAgent,
        storageManager: GCPStorageManager,
        assetManager: AssetVersionManager,
        options?: AgentOptions
    ) {
        this.lm = lm;
        this.imageModel = imageModel;
        this.qualityAgent = qualityAgent;
        this.storageManager = storageManager;
        this.assetManager = assetManager;
        this.options = options;
    }

    async generateFrameGenerationPrompts(
        requests: FramePromptRequest[]
    ): Promise<{ prompt: string; metadata: { custom_id: string; assetKey: AssetKey; status: string; version: number; }; }[]> {

        // 1. Prepare native batch requests for the LLM
        const batchRequests = requests.map(req => {
            const systemPrompt = continuitySystemPrompt();
            const instructions = composeFrameGenerationPromptMeta(
                req.scene,
                req.framePosition,
                req.characters,
                req.locations,
                req.previousScene,
                req.generationRules
            );

            return {
                messages: [
                    new SystemMessage({ content: systemPrompt }),
                    new UserMessage({ content: instructions })
                ],
                metadata: { ...req.metadata },
                config: {
                    abortSignal: this.options?.signal,
                    thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
                }
            };
        });

        const batchResults = await this.
            lm.generateBatchContent({
                projectId: requests[0].scene.projectId,
                model: this.lm.textModel,
                requests: batchRequests,
                config: {
                    abortSignal: this.options?.signal,
                }
            });

        // 3. Process results and apply post-processing (rules & cleaning)
        return batchResults.map((res, index) => {
            const originalReq = requests[index];
            let content = res.status === 'SUCCESS' ? cleanJsonOutput(res.text!) : null;

            if (!content) {
                console.warn({ sceneId: originalReq.scene.id }, "⚠️ Fallback to raw instructions");
                content = batchRequests[index].messages[1].content.toString();
            }

            // Apply shared post-processing logic
            const finalPrompt = content + composeGenerationRules(originalReq.generationRules);

            return {
                prompt: finalPrompt,
                metadata: {
                    assetKey: originalReq.metadata.assetKey,
                    version: res.version,
                    custom_id: res.customId,
                    status: res.status
                }
            };
        });
    }

    /**
     * Unified frame generation method supporting BATCH, PARALLEL, and SEQUENTIAL modes.
     * Delegates to QualityRetryHandler.executeBatch for retry logic.
     */
    async generateFrames(
        items: FrameCompositionItem[],
        saveAssets: SaveAssetsCallback,
        sendEntityUpdate: UpdateEntitiesCallback,
        incrementAttempt: IncrementAttemptHook,
        mode: 'SEQUENTIAL' | 'PARALLEL' | 'BATCH' = 'SEQUENTIAL'
    ): Promise<Map<string, GenerativeResultFrameRender | Error>> {

        if (!this.qualityAgent.qualityConfig.enabled) {
            const results: Map<string, GenerativeResultFrameRender | Error> = new Map();
            for (const item of items) {
                try {
                    const version = await this.resolveVersion(item, 1);
                    const image = await this.executeGenerateImage(
                        item.scene,
                        item.prompt,
                        item.framePosition,
                        {
                            type: item.framePosition === "start" ? "scene_start_frame" : "scene_end_frame",
                            projectId: item.scene.projectId,
                            sceneId: item.scene.id,
                            version,
                            uniqueId: item.uniqueId
                        },
                        1,
                        item.referenceImages,
                        sendEntityUpdate
                    );

                    const assetKey = item.metadata.assetKey;

                    saveAssets(
                        { projectId: item.scene.projectId, sceneIds: [item.scene.id] },
                        [assetKey],
                        'image',
                        [image],
                        [{ model: this.imageModel.imageModel, prompt: item.prompt, promptModel: this.lm.textModel }]
                    );

                    results.set(item.id, {
                        data: { scene: item.scene, image },
                        metadata: { attempts: 1, acceptedAttempt: 1, model: this.imageModel.imageModel, prompt: item.prompt }
                    });
                } catch (error) {
                    results.set(item.id, error as Error);
                }
            }
            return results;
        }

        const resultMap = await QualityRetryHandler.executeBatch(
            items,
            {
                qualityConfig: this.qualityAgent.qualityConfig,
                context: {
                    projectId: items[0]?.scene.projectId || "unknown",
                    assetKey: items[0]?.metadata.assetKey || "unknown",
                    sceneId: "batch",
                    sceneIndex: -1,
                    attempt: 1,
                    maxAttempts: this.qualityAgent.qualityConfig.maxRetries
                }
            },
            {
                generate: async (batchItems, attempt) => {
                    if (mode === 'BATCH') {
                        return this.generateBatchInternal(batchItems, attempt, sendEntityUpdate);
                    } else if (mode === 'PARALLEL') {
                        const delayStaggerBaseMs = 2000;
                        const promises = batchItems.map(async (itemCurrent, indexItem) => {
                            const delayStaggerCurrentMs = indexItem * delayStaggerBaseMs;
                            await delayExecutionMs(delayStaggerCurrentMs);

                            try {
                                return await this.generateSingleInternalWrapper(itemCurrent, attempt, sendEntityUpdate);
                            } catch (errorGeneration: any) {
                                console.error(
                                    { itemId: itemCurrent.id, error: errorGeneration.message },
                                    `[Cinema Engine] Uncaught error during staggered parallel execution.`
                                );
                                return { id: itemCurrent.id, error: errorGeneration };
                            }
                        });
                        return Promise.all(promises);
                    } else {
                        const results: BatchItemResult<GenerativeResultFrameRender>[] = [];
                        for (const item of batchItems) {
                            results.push(await this.generateSingleInternalWrapper(item, attempt, sendEntityUpdate));
                        }
                        return results;
                    }
                },
                evaluate: async (output, item, attempt) => {
                    const { image } = output.data;
                    sendEntityUpdate([{
                        id: item.scene.id,
                        entityType: "scene",
                        entity: { progressMessage: `Quality checking attempt ${attempt}...` }
                    }], false);
                    return this.qualityAgent.evaluateFrameQuality(image, item.scene, item.framePosition, item.characters, item.locations);
                },
                applyCorrections: async (item, evaluation, attempt) => {
                    const newPrompt = await this.qualityAgent.applyQualityCorrections(item.prompt, evaluation, item.scene, item.characters, attempt);
                    return { ...item, prompt: newPrompt };
                },
                sanitizePrompt: async (item, errorMsg) => {
                    const newPrompt = await this.qualityAgent.sanitizePrompt(item.prompt, errorMsg);
                    return { ...item, prompt: newPrompt };
                },
                calculateScore: (evaluation) => evaluation.score,
                onRetry: async (error, item, attempt, delay) => {
                    console.log(`🔄 Retry triggered for ${item.id}: ${error.type}`);
                    incrementAttempt(error.message, "BACKOFF_RETRY");
                }
            }
        );

        const finalMap = new Map<string, GenerativeResultFrameRender | Error>();
        const metrics: any[] = []; // Use VersionMetric type if imported, or any

        for (const [id, res] of resultMap.entries()) {
            if (res instanceof Error) {
                finalMap.set(id, res);
            } else {
                const combinedMetadata = {
                    ...res.output.metadata,
                    ...res.metadata
                };
                finalMap.set(id, {
                    data: res.output.data,
                    metadata: combinedMetadata
                });

                const item = items.find(i => i.id === id);
                if (item) {
                    const assetKey = item.metadata.assetKey;
                    const finalPrompt = combinedMetadata.prompt || item.prompt;

                    saveAssets(
                        { projectId: item.scene.projectId, sceneIds: [item.scene.id] },
                        [assetKey],
                        'image',
                        [res.output.data.image],
                        [{ ...combinedMetadata, prompt: finalPrompt, promptModel: this.lm.textModel }]
                    );

                    metrics.push({
                        entityId: item.scene.id,
                        assetKey: item.metadata.assetKey,
                        attemptNumber: res.metadata.acceptedAttempt,
                        finalScore: res.metadata.evaluation?.score ?? 0,
                        ruleAdded: res.metadata.evaluation?.ruleSuggestion ? [res.metadata.evaluation.ruleSuggestion] : [],
                        corrections: res.metadata.evaluation?.promptCorrections || []
                    });
                }
            }
        }

        return finalMap;
    }

    private async generateBatchInternal(
        items: FrameCompositionItem[],
        attempt: number,
        sendEntityUpdate: UpdateEntitiesCallback
    ): Promise<BatchItemResult<GenerativeResultFrameRender>[]> {
        const imageBatchRequests: GenerateBatchImagesParameters['requests'] = [];
        const itemMap = new Map<string, FrameCompositionItem>();

        for (const item of items) {
            const version = await this.resolveVersion(item, attempt);
            itemMap.set(item.id, item);

            const textPart = new UserMessage({ content: `Frame Description: ${item.prompt}` });

            imageBatchRequests.push({
                messages: toContentsFromReferenceImages(item.referenceImages).concat([textPart]),
                metadata: {
                    custom_id: item.id,
                    version: version,
                    assetKey: item.metadata.assetKey
                },
                config: {
                    candidateCount: 1,
                    responseModalities: [Modality.IMAGE],
                    imageConfig: { ...aspectRatios.widescreen, outputMimeType: imageMimeType }
                }
            });
        }

        const updates = items.map(item => ({
            id: item.scene.id,
            entityType: "scene" as const,
            entity: { status: "generating" as const, progressMessage: `Batch generating (attempt ${attempt})...` }
        }));
        sendEntityUpdate(updates);

        try {
            const results = await this.imageModel.generateBatchImages({
                projectId: items[0].scene.projectId,
                model: this.imageModel.imageModel,
                requests: imageBatchRequests,
                config: {
                    abortSignal: this.options?.signal,
                    displayName: `FrameBatch-Attempt${attempt}`
                }
            });

            return Promise.all(results.map(async res => {
                const item = itemMap.get(res.customId);
                if (!item) return { id: res.customId, error: new Error("Unknown result ID") };

                if (res.status !== "SUCCESS") {
                    return { id: item.id, error: res.error || new Error("Batch generation failed") };
                }

                try {
                    const imageBuffer = Buffer.from(res.imageBytes, "base64");
                    const outputPath = this.storageManager.getObjectPath({
                        projectId: item.scene.projectId,
                        sceneId: item.scene.id,
                        type: item.metadata.assetKey === "scene_start_frame" ? "scene_start_frame" : "scene_end_frame",
                        version: item.metadata.version
                    });

                    const image = await this.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);

                    return {
                        id: item.id,
                        output: {
                            data: { scene: item.scene, image },
                            metadata: {
                                attempts: 1,
                                acceptedAttempt: 1,
                                model: this.lm.imageModel,
                                prompt: item.prompt
                            }
                        }
                    };
                } catch (e) {
                    return { id: item.id, error: e };
                }
            }));

        } catch (e) {
            return items.map(item => ({ id: item.id, error: e }));
        }
    }

    private async generateSingleInternalWrapper(
        item: FrameCompositionItem,
        attempt: number,
        sendEntityUpdate: UpdateEntitiesCallback
    ): Promise<BatchItemResult<GenerativeResultFrameRender>> {
        try {
            const version = await this.resolveVersion(item, attempt);
            const image = await this.executeGenerateImage(
                item.scene,
                item.prompt,
                item.framePosition,
                {
                    type: item.framePosition === "start" ? "scene_start_frame" : "scene_end_frame",
                    projectId: item.scene.projectId,
                    sceneId: item.scene.id,
                    version: version,
                    uniqueId: item.uniqueId
                },
                attempt,
                item.referenceImages,
                sendEntityUpdate
            );

            return {
                id: item.id,
                output: {
                    data: { scene: item.scene, image },
                    metadata: { attempts: attempt, acceptedAttempt: attempt, model: this.lm.imageModel, prompt: item.prompt }
                }
            };
        } catch (e) {
            return { id: item.id, error: e };
        }
    }

    /**
     * Generate start or end frame image. Wrapper around generateFrames for single item.
     */
    async generateImage(
        scene: Scene,
        prompt: string,
        framePosition: "start" | "end",
        sceneCharacters: Character[],
        sceneLocations: Location[],
        referenceImages: ReferenceImageInputs,
        saveAssets: SaveAssetsCallback,
        sendEntityUpdate: UpdateEntitiesCallback,
        incrementAttempt: IncrementAttemptHook,
        uniqueId?: string,
    ): Promise<GenerativeResultFrameRender> {

        if (!this.qualityAgent.qualityConfig.enabled) {
            const [version] = await this.assetManager.getNextVersionNumber(
                { projectId: scene.projectId, sceneIds: [scene.id] },
                [framePosition === "start" ? "scene_start_frame" : "scene_end_frame"],
            );
            const imageWithoutQualityCheck = await this.executeGenerateImage(
                scene, prompt, framePosition,
                {
                    type: framePosition === "start" ? "scene_start_frame" : "scene_end_frame",
                    projectId: scene.projectId, sceneId: scene.id, version, uniqueId
                },
                1, referenceImages, sendEntityUpdate
            );

            saveAssets({ projectId: scene.projectId, sceneIds: [scene.id] }, [framePosition === "start" ? "scene_start_frame" : "scene_end_frame"], 'image', [imageWithoutQualityCheck], [{ model: this.lm.imageModel, prompt, promptModel: this.lm.textModel }], true);

            return { data: { scene, image: imageWithoutQualityCheck }, metadata: { attempts: 1, acceptedAttempt: 1, model: this.lm.textModel } };
        }

        const item: FrameCompositionItem = {
            id: uniqueId || scene.id,
            framePosition,
            scene,
            characters: sceneCharacters,
            locations: sceneLocations,
            metadata: {
                custom_id: scene.id,
                assetKey: framePosition === "start" ? "scene_start_frame" : "scene_end_frame",
                version: 0, // Will be resolved
            },
            prompt,
            referenceImages,
            uniqueId
        };

        const resultMap = await this.generateFrames(
            [item],
            saveAssets,
            sendEntityUpdate,
            incrementAttempt,
            'SEQUENTIAL'
        );

        const result = resultMap.get(item.id);
        if (result instanceof Error) throw result;
        if (!result) throw new Error("No result returned for item");

        // Log final rule suggestion if any
        if (result.metadata.evaluation?.ruleSuggestion) {
            console.log(`\n📚 GENERATION RULE ADDED: "${result.metadata.evaluation.ruleSuggestion}"`);
        }

        return result;
    }

    private async resolveVersion(item: FrameCompositionItem, attempt: number): Promise<number> {
        if (attempt === 1 && item.metadata.version > 0) {
            return item.metadata.version;
        }
        const [version] = await this.assetManager.getNextVersionNumber(
            { projectId: item.scene.projectId, sceneIds: [item.scene.id] },
            [item.metadata.assetKey === "scene_start_frame" ? "scene_start_frame" : "scene_end_frame"]
        );
        return version;
    }

    // Removed generateImageWithQualityRetry as it is replaced by generateFrames


    /**
     * DIRECT image generation call without any retry logic.
     * 
     * This is the lowest-level generation function that:
     * 1. Applies global cooldown
     * 2. Calls the image generation API once
     * 3. Uploads the result
     * 
     * All retry logic is handled by QualityRetryHandler, not here.
     */
    private async executeGenerateImage(
        scene: Scene,
        prompt: string,
        framePosition: "start" | "end",
        pathParams: FrameImageObjectParams,
        syncedAttempt: number,
        referenceImages: ReferenceImageInputs,
        sendEntityUpdate: UpdateEntitiesCallback,
    ) {
        console.log({ sceneId: scene.id, sceneIndex: scene.sceneIndex, framePosition, pathParams, attempt: syncedAttempt }, `Generating frame`);

        sendEntityUpdate([{ id: scene.id, entityType: 'scene', entity: { sceneIndex: scene.sceneIndex, status: "generating", progressMessage: `Generating ${pathParams.type.includes('start') ? 'start' : 'end'} frame image...` } }]);

        const result = await this.imageModel.generateImages({
            prompt: `Frame Description: ${prompt}`,
            referenceImages,
            config: {
                numberOfImages: 2,
                abortSignal: this.options?.signal,
                aspectRatio: aspectRatios.widescreen.aspectRatio,
                outputMimeType: imageMimeType,
            }
        });

        if (!result.generatedImages?.length) {
            throw new Error("Image generation failed to return any images.");
        }

        const generatedImageData = result.generatedImages[0].image?.imageBytes;
        if (!generatedImageData) {
            throw new Error("Generated image is missing inline data.");
        }

        const imageBuffer = Buffer.from(generatedImageData, "base64");
        const outputPath = this.storageManager.getObjectPath(pathParams);

        console.log(`{ outputPath }, Uploading frame`);
        const frame = await this.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);

        console.log({ publicUrl: this.storageManager.getPublicUrl(frame) }, ` ✓ Frame generated and uploaded`);

        sendEntityUpdate([{ id: scene.id, entityType: 'scene', entity: { sceneIndex: scene.sceneIndex, progressMessage: `Generated ${pathParams.type.includes('start') ? 'start' : 'end'} frame image` } }], false);

        return frame;
    }
}
