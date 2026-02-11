import { FileData, Modality, Part, ThinkingLevel } from "@google/genai";
import { GCPStorageManager, GcsObjectPathParams } from "../services/storage-manager.js";
import { ReferenceImage, TextModelController } from "../lm/text-model-controller.js";
import { QualityCheckAgent } from "./quality-check-agent.js";
import { Character, Location, QualityEvaluationResult, RecordMetricsCallback, Scene } from "../types/index.js";
import { RAIError } from "../utils/errors.js";
import { composeFrameGenerationPromptMeta, composeGenerationRules } from "../prompts/prompt-composer.js";
import { cleanJsonOutput } from "../utils/utils.js";
import { AssetVersionManager } from "../services/asset-version-manager.js";
import { QualityRetryHandler } from "../utils/quality-retry-handler.js";
import { IncrementAttemptHook, SaveAssetsCallback, UpdateScenesCallback } from "../types/index.js";
import { GenerativeResultEnvelope, GenerativeResultFrameRender } from "../types/job.types.js";
import { QualityGenerationSession } from "../utils/quality-session.js";
import { aspectRatios, imageMimeType } from "../config.js";

type FrameImageObjectParams = Extract<GcsObjectPathParams, ({ type: "scene_start_frame"; } | { type: "scene_end_frame"; })>;

export class FrameCompositionAgent {
    private lm: TextModelController;
    private imageModel: TextModelController;
    private qualityAgent: QualityCheckAgent;
    private assetManager: AssetVersionManager;
    private storageManager: GCPStorageManager;
    private options?: { signal?: AbortSignal; };

    constructor(
        lm: TextModelController,
        imageModel: TextModelController,
        qualityAgent: QualityCheckAgent,
        storageManager: GCPStorageManager,
        assetManager: AssetVersionManager,
        options?: { signal?: AbortSignal; }
    ) {
        this.lm = lm;
        this.imageModel = imageModel;
        this.qualityAgent = qualityAgent;
        this.storageManager = storageManager;
        this.assetManager = assetManager;
        this.options = options;
    }

    async generateFrameGenerationPrompt(
        framePosition: "start" | "end",
        scene: Scene,
        characters: Character[],
        locations: Location[],
        previousScene?: Scene,
        generationRules?: string[]
    ): Promise<string> {

        let generateFramePromptInstructions = composeFrameGenerationPromptMeta(scene,
            framePosition,
            characters,
            locations,
            previousScene,
            generationRules
        );

        const _generateFrameGenerationPrompt = async () => {
            console.log({ sceneId: scene.id, framePosition }, `📝 Generating frame prompt`);
            console.log(`   Meta-Prompt Instructions:\n${generateFramePromptInstructions.substring(0, 100)}...`);

            const response = await this.lm.generateContent({
                contents: generateFramePromptInstructions,
                config: {
                    abortSignal: this.options?.signal,
                    thinkingConfig: {
                        thinkingLevel: ThinkingLevel.HIGH
                    }
                }
            });

            const content = response.text;

            if (!content) {
                console.warn({ sceneId: scene.id, framePosition }, "⚠️ Generate frame prompt was not generated. Using fallback prompt");
                return generateFramePromptInstructions;
            }

            const cleanedContent = cleanJsonOutput(content);
            console.log({ prompt: cleanedContent.slice(0, 100) + "..." }, `Generated frame prompt`);
            return cleanedContent;
        };

        let frameGenerationPrompt = await _generateFrameGenerationPrompt();

        frameGenerationPrompt += composeGenerationRules(generationRules);
        return frameGenerationPrompt;
    }

    // async prepareReferenceImages(
    //     scene: Scene,
    //     framePosition: "start" | "end",
    //     sceneCharacters: Character[],
    //     sceneLocations: Location[],
    //     previousFrame: ReferenceImage | undefined,
    //     referenceImages: ReferenceImage[],
    // ): Promise<ReferenceImage[]> {

    //     const sceneCharacterImages = sceneCharacters.flatMap(c => {
    //         const assets = getAllBestAssets(c.assets);
    //         return assets[ 'character_image' ]?.data ? [ assets[ 'character_image' ].data ] : [];
    //     });
    //     const sceneLocationImages = [ sceneLocation ].flatMap(l => {
    //         const assets = getAllBestAssets(l.assets);
    //         return assets[ 'location_image' ]?.data ? [ assets[ 'location_image' ].data ] : [];
    //     });

    //     const previousAssets = getAllBestAssets(previousSceneAssets);
    //     const previousFrame = frameType === 'start' ?
    //         previousAssets[ "scene_end_frame" ]?.data
    //         : previousAssets[ "scene_start_frame" ]?.data;

    //     const assetKey = frameType === 'start' ? "scene_start_frame" : "scene_end_frame";
    //     const jobPayload: JobFrameRender[ 'payload' ] = {
    //         sceneId:,
    //         prompt: promptModification,
    //         framePosition: frameType,
    //         sceneCharacters,
    //         sceneLocations: [ sceneLocation ],
    //         previousFrame,
    //         referenceImages: [
    //             ...sceneCharacterImages,
    //             ...sceneLocationImages,
    //         ],
    //     };
    // }

    /**
     * Generate start or end frame image. Prompt, image, and evaluation assets are implicitly saved using handler.
     *
    * This method uses QualityRetryHandler which handles ALL retry types in one place:
     * - Quality issues (prompt corrections)
     * - Safety violations (prompt sanitization)
     * - Rate limits (exponential backoff)
     * - Transient errors (exponential backoff)
     * 
     * The generate callback is a SIMPLE, NON-RETRYING call to prevent multiplicative retries.
     */
    async generateImage(
        scene: Scene,
        prompt: string,
        framePosition: "start" | "end",
        sceneCharacters: Character[],
        sceneLocations: Location[],
        previousFrame: ReferenceImage | undefined,
        referenceImages: ReferenceImage[],
        saveAssets: SaveAssetsCallback,
        updateScene: UpdateScenesCallback,
        incrementAttempt: IncrementAttemptHook,
        recordMetrics: RecordMetricsCallback,
        uniqueId?: string,
    ): Promise<GenerativeResultFrameRender> {
                // ======================================================================
        // FAST PATH: Quality checking disabled
        // ======================================================================

        if (!this.qualityAgent.qualityConfig.enabled && !!this.qualityAgent.evaluateFrameQuality) {
            const [ version ] = await this.assetManager.getNextVersionNumber(
                { projectId: scene.projectId, sceneIds: [ scene.id ] },
                [ framePosition === "start" ? "scene_start_frame" : "scene_end_frame" ],
            );
            const imageWithoutQualityCheck = await this.executeGenerateImage(
                scene,
                prompt,
                framePosition,
                { type: framePosition === "start" ? "scene_start_frame" : "scene_end_frame", sceneId: scene.id, version, uniqueId },
                1,
                previousFrame,
                referenceImages,
                updateScene
            );

            const publicImageWithoutQualityCheck = this.storageManager.getPublicUrl(imageWithoutQualityCheck);

            saveAssets(
                { projectId: scene.projectId, sceneIds: [ scene.id ] },
                [ framePosition === "start" ? "scene_start_frame" : "scene_end_frame" ],
                'image',
                [ publicImageWithoutQualityCheck ],
                [ {
                    model: this.lm.imageModel,
                } ]
            );

            saveAssets(
                { projectId: scene.projectId, sceneIds: [ scene.id ] },
                [ framePosition === "start" ? "start_frame_prompt" : "end_frame_prompt" ],
                'text',
                [ prompt ],
                [ { model: this.lm.textModel } ],
                true
            );

            return {
                data: { scene, image: imageWithoutQualityCheck },
                metadata: {
                    attempts: 1,
                    acceptedAttempt: 1,
                    model: this.lm.textModel
                }
            };
        }

        const { data, metadata } = await this.generateImageWithQualityRetry(scene, prompt, framePosition, sceneCharacters, sceneLocations, previousFrame, referenceImages, saveAssets, updateScene, incrementAttempt, uniqueId);

        if (metadata.evaluation) {
            console.log(`   📊 Final: ${(metadata.evaluation.score * 100).toFixed(1)}% after ${metadata.attempts} attempt(s)`);
        }

        if (metadata.evaluation?.ruleSuggestion) {
            console.log(`\n📚 GENERATION RULE ADDED`);
            console.log(`   "${metadata.evaluation.ruleSuggestion}"`);
        }

        return { data: { ...data, scene }, metadata };
    }

    /**
     * Generate image with quality retry using the integrated QualityRetryHandler.
     * 
     * CRITICAL: The generate() callback is a SIMPLE, NON-RETRYING call.
     * All retry logic is handled by QualityRetryHandler to prevent multiplicative retries.
     */
    private async generateImageWithQualityRetry(
        scene: Scene,
        prompt: string,
        framePosition: "start" | "end",
        characters: Character[],
        locations: Location[],
        previousFrame: ReferenceImage | undefined,
        referenceImages: ReferenceImage[] = [],
        saveAssets: SaveAssetsCallback,
        sendUpdateScenes: UpdateScenesCallback,
        incrementAttempt: IncrementAttemptHook,
        uniqueId?: string
    ): Promise<GenerativeResultEnvelope<{ image: string; }>> {

        // 1. Initialize the Session (The Infrastructure Layer)
        const session = new QualityGenerationSession(
            scene,
            framePosition,
            this.assetManager,
            this.storageManager,
            saveAssets,
            incrementAttempt
        );

        const assetKey = framePosition === "start" ? "scene_start_frame" : "scene_end_frame";

        // 2. Execute the Logic (The Control Flow Layer)
        const result = await QualityRetryHandler.executeWithRetry<string>(
            prompt,
            {
                qualityConfig: this.qualityAgent.qualityConfig,
                context: {
                    assetKey,
                    sceneId: scene.id,
                    sceneIndex: scene.sceneIndex,
                    attempt: 1,
                    maxAttempts: this.qualityAgent.qualityConfig.maxRetries,
                    projectId: scene.projectId
                }
            },
            {
                // A. GENERATE: Single call - errors handled by error classifier + retry loop
                generate: async (currentPrompt, attempt) => {
                    // Get fresh version/attempt from session
                    const { version, attempt: syncedAttempt } = await session.prepareNextAttempt();

                    // Single generation call - NO nested retry here
                    // Safety/rate-limit errors are caught and handled by QualityRetryHandler
                    return this.executeGenerateImage(
                        scene,
                        currentPrompt,
                        framePosition,
                        { type: assetKey, sceneId: scene.id, version, uniqueId },
                        syncedAttempt,
                        previousFrame,
                        referenceImages,
                        sendUpdateScenes
                    );
                },

                // B. EVALUATE: (Pure Domain Logic)
                evaluate: async (image) => {
                    sendUpdateScenes([ scene.id ], [ { id: scene.id, projectId: scene.projectId, sceneIndex: scene.sceneIndex, progressMessage: `Quality checking...` } ], false);
                    return this.qualityAgent.evaluateFrameQuality(image, scene, framePosition, characters, locations);
                },

                // C. CORRECTIONS: (Pure Domain Logic)
                applyCorrections: async (p, evalResult, attempt) => {
                    return this.qualityAgent.applyQualityCorrections(p, evalResult, scene, characters, attempt);
                },

                calculateScore: (res) => res.score,

                // D. SAFETY HANDLING: Prompt sanitization via callback (not nested retry)
                sanitizePrompt: async (currentPrompt, errorMessage) => {
                    console.warn(`🛡️  Sanitizing prompt for safety retry`);
                    return this.qualityAgent.sanitizePrompt(currentPrompt, errorMessage);
                },

                onAttemptComplete: async ({ output, evaluation }) => {
                    if (output && evaluation) {
                        await session.saveArtifacts({ image: output, prompt, evaluation, models: { textModel: this.lm.textModel, imageModel: this.lm.imageModel } });
                    }
                },

                onRetry: async (error, attempt) => {
                    console.log(`🔄 Retry triggered: ${error.type} (attempt ${attempt})`);
                    await session.recordFailure(error.originalError);
                }
            }
        );
        return { data: { image: result.output }, metadata: result.metadata };
    }

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
        previousFrame: ReferenceImage | undefined,
        referenceImages: ReferenceImage[],
        sendUpdateScenes: UpdateScenesCallback,
    ) {
        console.log({ sceneId: scene.id, sceneIndex: scene.sceneIndex, framePosition, pathParams, attempt: syncedAttempt }, `Generating frame`);

        sendUpdateScenes([ scene.id ], [
            { id: scene.id, projectId: scene.projectId, sceneIndex: scene.sceneIndex, status: "generating", progressMessage: `Generating ${pathParams.type.includes('start') ? 'start' : 'end'} frame image...` }
        ]);

        const result = await this.imageModel.generateImages({
            prompt: `Frame Description: ${prompt}`,
            referenceImages: [ previousFrame, ...referenceImages ].filter((image) => image !== undefined),
            config: {
                abortSignal: this.options?.signal,
                aspectRatio: aspectRatios.widescreen.aspectRatio,
                outputMimeType: imageMimeType,
            }
        });

        if (!result.generatedImages?.length) {
            throw new Error("Image generation failed to return any images.");
        }

        const generatedImageData = result.generatedImages[ 0 ].image?.imageBytes;
        if (!generatedImageData) {
            throw new Error("Generated image is missing inline data.");
        }

        const imageBuffer = Buffer.from(generatedImageData, "base64");
        const outputPath = this.storageManager.getObjectPath(pathParams);

        console.log(`{ outputPath }, Uploading frame`);
        const frame = await this.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);

        console.log({ publicUrl: this.storageManager.getPublicUrl(frame) }, ` ✓ Frame generated and uploaded`);

        sendUpdateScenes([ scene.id ], [ { id: scene.id, projectId: scene.projectId, sceneIndex: scene.sceneIndex, status: "complete", progressMessage: `Generated ${pathParams.type.includes('start') ? 'start' : 'end'} frame image` } ], false);

        return frame;
    }
}
