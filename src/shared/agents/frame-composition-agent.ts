import { FileData, Modality, Part, ThinkingLevel } from "@google/genai";
import { GCPStorageManager, GcsObjectPathParams } from "../services/storage-manager.js";
import { TextModelController } from "../llm/text-model-controller.js";
import { buildllmParams } from "../llm/google/google-llm-params.js";
import { imageModelName, qualityCheckModelName, textModelName } from "../llm/google/models.js";
import { QualityCheckAgent } from "./quality-check-agent.js";
import { Character, Location, QualityEvaluationResult, Scene } from "../types/index.js";
import { retryLlmCall } from "../utils/llm-retry.js";
import { RAIError } from "../utils/errors.js";
import { GraphInterrupt } from "@langchain/langgraph";
import { composeFrameGenerationPromptMeta, composeGenerationRules } from "../prompts/prompt-composer.js";
import { cleanJsonOutput } from "../utils/utils.js";
import { AssetVersionManager } from "../services/asset-version-manager.js";
import { QualityRetryHandler } from "../utils/quality-retry-handler.js";
import { IncrementAttemptHook, SaveAssetsCallback, UpdateScenesCallback } from "../types/index.js";
import { GenerativeResultEnvelope, GenerativeResultFrameRender, JobFrameRender } from "../types/job.types.js";
import { QualityGenerationSession } from "../utils/quality-session.js";

type FrameImageObjectParams = Extract<GcsObjectPathParams, ({ type: "scene_start_frame"; } | { type: "scene_end_frame"; })>;

export class FrameCompositionAgent {
    private llm: TextModelController;
    private imageModel: TextModelController;
    private qualityAgent: QualityCheckAgent;
    private assetManager: AssetVersionManager;
    private storageManager: GCPStorageManager;
    private options?: { signal?: AbortSignal; };

    constructor(
        llm: TextModelController,
        imageModel: TextModelController,
        qualityAgent: QualityCheckAgent,
        storageManager: GCPStorageManager,
        assetManager: AssetVersionManager,
        options?: { signal?: AbortSignal; }
    ) {
        this.llm = llm;
        this.imageModel = imageModel;
        this.qualityAgent = qualityAgent;
        this.storageManager = storageManager;
        this.assetManager = assetManager;
        this.options = options;
    }

    async prepareImageInputs(urls: string[]): Promise<FileData[]> {
        return Promise.all(
            urls.map(async (u) => {
                const mimeType = await this.storageManager.getObjectMimeType(u);
                if (!mimeType) {
                    throw new Error(`Could not determine mime type for ${u}`);
                }
                const fileParts = u.split('/');
                const displayName = fileParts[ fileParts.length - 1 ];
                return {
                    displayName,
                    mimeType,
                    fileUri: u,
                };
            })
        );
    }

    /**
     * Generate start or end frame image. Prompt, image, and evaluation assets are implicitly saved using handler.
     */
    async generateImage(
        scene: Scene,
        prompt: string,
        framePosition: "start" | "end",
        sceneCharacters: Character[],
        sceneLocations: Location[],
        previousFrame: string | undefined,
        referenceImages: string[],
        saveAssets: SaveAssetsCallback,
        updateScene: UpdateScenesCallback,
        incrementAttempt: IncrementAttemptHook,
        uniqueId?: string
    ): Promise<GenerativeResultFrameRender> {
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
                    model: imageModelName,
                } ]
            );

            saveAssets(
                { projectId: scene.projectId, sceneIds: [ scene.id ] },
                [ framePosition === "start" ? "start_frame_prompt" : "end_frame_prompt" ],
                'text',
                [ prompt ],
                [ { model: textModelName } ],
                true
            );

            return {
                data: { scene, image: imageWithoutQualityCheck },
                metadata: {
                    attempts: 1,
                    acceptedAttempt: 1,
                    model: imageModelName
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

    private async generateImageWithQualityRetry(
        scene: Scene,
        prompt: string,
        framePosition: "start" | "end",
        characters: Character[],
        locations: Location[],
        previousFrame: string | undefined,
        referenceImages: string[] = [],
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
                    maxAttempts: 3,
                    projectId: scene.projectId
                }
            },
            {
                // A. GENERATE: Ask session for state, then execute
                generate: async (currentPrompt) => {
                    const { version, attempt } = await session.prepareNextAttempt();

                    return this.generateImageWithSafetyRetry(
                        scene,
                        currentPrompt,
                        framePosition,
                        {
                            type: assetKey,
                            sceneId: scene.id,
                            version,
                            uniqueId
                        },
                        attempt, // Use the synced attempt from session
                        previousFrame, referenceImages, sendUpdateScenes
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

                onAttemptComplete: async ({ output, evaluation }) => {
                    if (output && evaluation) {
                        await session.saveArtifacts(output, prompt, evaluation);
                    }
                },

                onRetry: async (error) => {
                    await session.recordFailure(error);
                }
            }
        );
        return { data: { image: result.output }, metadata: result.metadata };
    }

    /**
     * Internal: Generate scene with safety error retry.
     */
    private async generateImageWithSafetyRetry(
        scene: Scene,
        prompt: string,
        framePosition: "start" | "end",
        objectParams: FrameImageObjectParams,
        attempt: number,
        previousFrame: string | undefined,
        referenceImages: string[] = [],
        updateScene: UpdateScenesCallback,
    ) {

        const attemptLabel = attempt ? ` (Quality Attempt ${attempt})` : "";

        return await retryLlmCall(
            (params: { prompt: string; }) => this.executeGenerateImage(
                scene,
                params.prompt,
                framePosition,
                objectParams,
                previousFrame,
                referenceImages,
                updateScene,
            ),
            { prompt },
            {
                maxRetries: this.qualityAgent.qualityConfig.safetyRetries,
                initialDelay: 3000,
                backoffFactor: 2,
                attempt,
                projectId: scene.projectId
            },
            async (error: any, attempt: number, params) => {
                if (error instanceof RAIError) {
                    console.warn({ attempt }, `⚠️ Safety error. Sanitizing`);
                    params.prompt = await this.qualityAgent.sanitizePrompt(params.prompt, error.message);
                }
                return {
                    params,
                    attempt
                };
            }
        );
    }

    private async executeGenerateImage(
        scene: Scene,
        prompt: string,
        framePosition: "start" | "end",
        pathParams: FrameImageObjectParams,
        previousFrame: string | undefined,
        referenceImages: string[],
        sendUpdateScenes: UpdateScenesCallback,
    ) {
        console.log({ sceneId: scene.id, sceneIndex: scene.sceneIndex, framePosition, pathParams }, `Generating frame`);

        sendUpdateScenes([ scene.id ], [
            { id: scene.id, projectId: scene.projectId, sceneIndex: scene.sceneIndex, status: "generating", progressMessage: `Generating ${pathParams.type.includes('start') ? 'start' : 'end'} frame image...` }
        ]);

        let contents: Part[] = [ { text: `Frame Description: ${prompt}` } ];
        const validReferenceImageUrls = [ previousFrame, ...referenceImages ].map(obj => obj).filter((url): url is string => typeof url === 'string' && url.length > 0);

        if (validReferenceImageUrls.length > 0) {
            const fileDataInputs = await this.prepareImageInputs(validReferenceImageUrls);
            const referenceInputs: Part[] = [];
            fileDataInputs.map(({ displayName, ...file }) => {
                referenceInputs.push({ text: displayName });
                referenceInputs.push({ fileData: file });
            });
            contents = [ ...referenceInputs, ...contents ];
        }

        const outputMimeType = "image/png";
        const result = await this.imageModel.generateContent({
            model: imageModelName,
            contents: contents,
            config: {
                abortSignal: this.options?.signal,
                responseModalities: [ Modality.IMAGE ],
                imageConfig: {
                    outputMimeType: outputMimeType
                }
            }
        });

        if (!result.candidates || result.candidates?.[ 0 ]?.content?.parts?.length === 0) {
            throw new Error("Image generation failed to return any images.");
        }

        const generatedImageData = result.candidates[ 0 ].content?.parts?.[ 0 ]?.inlineData?.data;
        if (!generatedImageData) {
            throw new Error("Generated image is missing inline data.");
        }

        const imageBuffer = Buffer.from(generatedImageData, "base64");

        const outputPath = this.storageManager.getObjectPath(pathParams);

        console.log(`{ outputPath }, Uploading frame`);
        const frame = await this.storageManager.uploadBuffer(imageBuffer, outputPath, outputMimeType);

        console.log({ publicUrl: this.storageManager.getPublicUrl(frame) }, ` ✓ Frame generated and uploaded`);

        sendUpdateScenes([ scene.id ], [ { id: scene.id, projectId: scene.projectId, sceneIndex: scene.sceneIndex, status: "complete", progressMessage: `Generated ${pathParams.type.includes('start') ? 'start' : 'end'} frame image` } ], false);

        return frame;
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

            const response = await this.llm.generateContent(buildllmParams({
                contents: generateFramePromptInstructions,
                config: {
                    abortSignal: this.options?.signal,
                    thinkingConfig: {
                        thinkingLevel: ThinkingLevel.HIGH
                    }
                }
            }));

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
}
