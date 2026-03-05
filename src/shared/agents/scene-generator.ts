import { PersonGeneration, Video, Image, VideoGenerationReferenceType, Operation, GenerateVideosResponse } from "@google/genai";
import { GCPStorageManager } from "../services/storage-manager.js";
import { Character, Location, QualityEvaluationResult, Scene, SceneGenerationResult } from "../types/index.js";
import { RecordMetricsCallback, IncrementAttemptHook, SaveAssetsCallback, UpdateScenesCallback } from "../types/index.js";
import { RAIError } from "../utils/errors.js";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import { formatTime, roundToValidDuration } from "../utils/utils.js";
import { retryLlmCall } from "../utils/lm-retry.js";
import { VideoModelController } from "../lm/video-model-controller.js";
import { QualityCheckAgent } from "./quality-check-agent.js";
import { getAllBestAssets } from "../utils/assets-utils.js";
import { AssetVersionManager } from "../services/asset-version-manager.js";
import { GenerativeResultEnvelope, GenerativeResultGenerateSceneVideo, JobGenerateSceneVideo } from "../types/job.types.js";
import { ReferenceImage } from "../lm/provider.js";



export class SceneGeneratorAgent {
    private videoModel: VideoModelController;
    private storageManager: GCPStorageManager;
    private qualityAgent: QualityCheckAgent;
    private options?: { signal?: AbortSignal; };

    constructor(
        videoModel: VideoModelController,
        qualityAgent: QualityCheckAgent,
        storageManager: GCPStorageManager,
        assetManager: AssetVersionManager,
        options?: { signal?: AbortSignal; },
    ) {
        this.videoModel = videoModel;
        this.qualityAgent = qualityAgent;
        this.storageManager = storageManager;

        this.options = options;
    }

    /**
   * Generate scene with integrated quality control and retry logic.
   * All quality checking is contained within this method.
   */
    async generateSceneWithQualityCheck({
        scene,
        enhancedPrompt,
        sceneCharacters,
        sceneLocation,
        previousScene,
        version,
        characterReferenceImages,
        locationReferenceImages,
        startFrame,
        endFrame,
        generateAudio = false,
        saveAssets,
        sendUpdateScenes,
        incrementAttempt,
        saveMetric,
        generationRules,
        uniqueId
    }: {
        scene: Scene,
        enhancedPrompt: string,
        sceneCharacters: Character[],
        sceneLocation: Location,
        previousScene: Scene | undefined,
        version: number,
            characterReferenceImages: ReferenceImage[],
            locationReferenceImages: ReferenceImage[],
            startFrame?: ReferenceImage,
            endFrame?: ReferenceImage,
        generateAudio: boolean,
        saveAssets: SaveAssetsCallback,
            sendUpdateScenes: UpdateScenesCallback,
            incrementAttempt: IncrementAttemptHook,
            saveMetric: RecordMetricsCallback,
        generationRules?: string[],
            uniqueId?: string,
    }): Promise<GenerativeResultGenerateSceneVideo> {
        const start = Date.now();
        console.log({ sceneId: scene.id, projectId: scene.projectId, duration: scene.duration }, `Scene generation started...`);

        try {
            if (!this.qualityAgent.qualityConfig.enabled || !this.qualityAgent) {
                const generatedWithoutQualityCheck = await this.generateSceneWithSafetyRetry(
                    scene,
                    enhancedPrompt,
                    version,
                    characterReferenceImages,
                    locationReferenceImages,
                    startFrame,
                    endFrame,
                    previousScene,
                    generateAudio,
                    generationRules,
                    sendUpdateScenes,
                    incrementAttempt,
                    saveMetric,
                    uniqueId
                );

                const setBestVersion = true;
                saveAssets(
                    { projectId: scene.projectId, sceneIds: [ scene.id ] },
                    [ 'scene_video' ],
                    'video',
                    [ generatedWithoutQualityCheck.videoUrl ],
                    [ { model: this.videoModel.model } ],
                    setBestVersion,
                );

                const durationMs = Date.now() - start;
                console.log({ sceneId: scene.id, projectId: scene.projectId, durationMs, model: this.videoModel.model }, `Scene generation completed (no quality check).`);

                sendUpdateScenes([ scene.id ], [ {
                    id: scene.id,
                    sceneIndex: scene.sceneIndex,
                    projectId: scene.projectId,
                    status: "complete" as const,
                    progressMessage: ""
                } ]);

                return {
                    data: generatedWithoutQualityCheck,
                    metadata: {
                        model: this.videoModel.model,
                        attempts: version,
                        acceptedAttempt: version
                    }
                };
            }

            const generationResultWithEvaluation = await this.generateWithQualityRetry(
                scene,
                enhancedPrompt,
                sceneCharacters,
                sceneLocation,
                previousScene,
                version,
                characterReferenceImages,
                locationReferenceImages,
                startFrame,
                endFrame,
                generateAudio,
                saveAssets,
                sendUpdateScenes,
                incrementAttempt,
                saveMetric,
                generationRules,
                uniqueId,
            );

            const durationMs = Date.now() - start;
            console.log({ sceneId: scene.id, projectId: scene.projectId, durationMs, model: this.videoModel.model }, `Scene generation completed (with quality check).`);

            return generationResultWithEvaluation;

        } catch (error: any) {
            console.error({ sceneId: scene.id, error }, "Scene generation failed");
            sendUpdateScenes([ scene.id ], [ {
                id: scene.id,
                projectId: scene.projectId,
                sceneIndex: scene.sceneIndex,
                status: "error" as const,
                progressMessage: `Generation failed: ${error.message || "Unknown error"}`
            } ]);
            throw error;
        }
    }

    /**
   * Quality-controlled generation with retry logic.
   * Handles all quality evaluation, prompt correction, and retry attempts.
   */
    private async generateWithQualityRetry(
        scene: Scene,
        enhancedPrompt: string,
        characters: Character[],
        location: Location,
        previousScene: Scene | undefined,
        version: number,
        characterReferenceImages: ReferenceImage[],
        locationReferenceImages: ReferenceImage[],
        startFrame?: ReferenceImage,
        endFrame?: ReferenceImage,
        generateAudio = false,
        saveAssets?: SaveAssetsCallback,
        updateScene?: UpdateScenesCallback,
        incrementAttempt?: IncrementAttemptHook,
        saveMetric?: RecordMetricsCallback,
        generationRules?: string[],
        uniqueId?: string,
    ): Promise<GenerativeResultEnvelope<SceneGenerationResult>> {

        const startTime = Date.now();
        console.log({ sceneId: scene.id, projectId: scene.projectId, duration: scene.duration }, `Quality-controlled scene generation started...`);
        const acceptanceThreshold = this.qualityAgent.qualityConfig.minorIssueThreshold;

        let bestScene: Scene | null = null;
        let bestVideoUrl: string | null = null;
        let bestEvaluation: QualityEvaluationResult | null = null;
        let bestScore = 0;
        let bestAttemptNumber = 0;
        let totalAttempts = 0;
        let numAttempts = 1;
        let attemptError = null;

        for (let lastestAttempt = version + numAttempts; numAttempts <= this.qualityAgent.qualityConfig.maxRetries; numAttempts++) {
            totalAttempts = numAttempts;
            let evaluation: QualityEvaluationResult | null = null;
            let generated: { scene: Scene; videoUrl: string; } | null = null;
            try {

                attemptError = null;

                generated = await this.generateSceneWithSafetyRetry(
                    scene,
                    enhancedPrompt,
                    lastestAttempt,
                    characterReferenceImages,
                    locationReferenceImages,
                    startFrame,
                    endFrame,
                    previousScene,
                    generateAudio,
                    generationRules,
                    updateScene,
                    incrementAttempt,
                    saveMetric,
                    uniqueId
                );

                evaluation = await this.qualityAgent.evaluateScene(
                    scene,
                    generated.videoUrl,
                    enhancedPrompt,
                    characters,
                    location,
                    lastestAttempt,
                    previousScene,
                    updateScene,
                    generationRules
                );

                saveAssets?.(
                    { projectId: scene.projectId, sceneIds: [ scene.id ] },
                    [ 'scene_video' ],
                    'video',
                    [ generated.videoUrl ],
                    [ {
                        model: this.videoModel.model,
                        prompt: enhancedPrompt,
                        evaluation,
                    } ],
                    true,
                );

                saveMetric?.([ {
                    entityId: scene.id,
                    assetKey: "scene_video",
                    attemptNumber: lastestAttempt,
                    finalScore: evaluation.score,
                    ruleAdded: evaluation.promptCorrections?.map(c => c.correctedPromptSection)!,
                    corrections: evaluation.promptCorrections || [],
                } ]);

                if (evaluation.score > bestScore) {
                    bestScore = evaluation.score;
                    bestScene = generated.scene;
                    bestVideoUrl = generated.videoUrl;
                    bestEvaluation = evaluation;
                }

                this.qualityAgent[ "logAttemptResult" ](numAttempts, evaluation.score, evaluation.grade);
                console.log({ sceneId: scene.id, projectId: scene.projectId, attemptNumber: numAttempts, score: evaluation.score, grade: evaluation.grade }, `Quality check attempt completed.`);

                if (evaluation.score >= acceptanceThreshold) {
                    console.log(`   ✅ Quality acceptable (${(evaluation.score * 100).toFixed(1)}%)`);

                    const durationMs = Date.now() - startTime;
                    console.log({ sceneId: scene.id, projectId: scene.projectId, durationMs, model: this.videoModel.model, attempts: totalAttempts, acceptedAttempt: lastestAttempt }, `Quality-controlled scene generation completed successfully.`);

                    updateScene?.([ scene.id ], [ {
                        id: scene.id,
                        sceneIndex: scene.sceneIndex,
                        projectId: scene.projectId,
                        status: "complete" as const,
                        progressMessage: ""
                    } ]);

                    return {
                        data: {
                            scene: generated.scene,
                            videoUrl: generated.videoUrl,
                            enhancedPrompt: enhancedPrompt,
                        },
                        metadata: {
                            model: this.videoModel.model,
                            attempts: totalAttempts,
                            evaluation,
                            acceptedAttempt: lastestAttempt
                        }
                    };
                }

                if (numAttempts >= this.qualityAgent.qualityConfig.maxRetries) {
                    break;
                }

                enhancedPrompt = await this.qualityAgent.applyQualityCorrections(
                    enhancedPrompt,
                    evaluation,
                    scene,
                    characters,
                    lastestAttempt,
                    updateScene,
                );

                await new Promise(resolve => setTimeout(resolve, 3000));

            } catch (error) {

                console.error(`   ✗ Attempt ${numAttempts} failed:`, error);
                attemptError = error;

                if (evaluation && generated) {
                    const score = this.qualityAgent[ "calculateOverallScore" ](evaluation.scores);
                    if (score > bestScore) {
                        bestScore = score;
                        bestScene = generated.scene;
                        bestVideoUrl = generated.videoUrl;
                        bestEvaluation = evaluation;
                        bestAttemptNumber = lastestAttempt;
                    }
                }
                if (numAttempts < this.qualityAgent.qualityConfig.maxRetries) {
                    console.log(`   Retrying scene generation...`);
                    // Optionally adjust the prompt or strategy before retrying
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait before retry
                }
            }
        }

        if (bestScene && bestVideoUrl && bestScore > 0) {
            const scorePercent = (bestScore * 100).toFixed(1);
            const thresholdPercent = (acceptanceThreshold * 100).toFixed(0);
            console.warn(`   ⚠️ Using best attempt: ${scorePercent}% (threshold: ${thresholdPercent}%)`);

            saveMetric?.(
                [ {
                    entityId: scene.id,
                    assetKey: "scene_video",
                    attemptNumber: bestAttemptNumber,
                    finalScore: bestScore,
                    ruleAdded: bestEvaluation?.promptCorrections?.map(c => c.correctedPromptSection) || [],
                    corrections: bestEvaluation?.promptCorrections || [],
                } ]);

            updateScene?.([ scene.id ], [ {
                id: scene.id,
                sceneIndex: scene.sceneIndex,
                projectId: scene.projectId,
                status: "complete" as const,
                progressMessage: `Completed with warnings (Quality: ${(bestScore * 100).toFixed(0)}%)`
            } ]);

            return {
                data: {
                    scene: bestScene,
                    videoUrl: bestVideoUrl,
                    enhancedPrompt: enhancedPrompt,
                },
                metadata: {
                    model: this.videoModel.model,
                    attempts: totalAttempts,
                    evaluation: bestEvaluation!,
                    warning: `Quality below threshold after ${totalAttempts} attempts`,
                    acceptedAttempt: bestAttemptNumber
                }
            };
        }

        throw attemptError ? attemptError : new Error(`Failed to generate acceptable scene after ${totalAttempts} attempts`);
    }

    /**
   * Internal: Generate scene with safety error retry.
   */
    private async generateSceneWithSafetyRetry(
        scene: Scene,
        enhancedPrompt: string,
        version: number,
        characterReferenceImages: ReferenceImage[],
        locationReferenceImages: ReferenceImage[],
        startFrame?: ReferenceImage,
        endFrame?: ReferenceImage,
        previousScene?: Scene,
        generateAudio = false,
        generationRules?: string[],
        sendUpdateScenes?: UpdateScenesCallback,
        incrementAttempt?: IncrementAttemptHook,
        saveMetric?: RecordMetricsCallback,
        uniqueId?: string,
    ): Promise<SceneGenerationResult> {

        console.log(`\n🎬 Generating Scene ${scene.id}: ${formatTime(scene.duration)}`);
        console.log(`   Duration: ${scene.duration}s | Shot: ${scene.shotType}`);
        const attemptLabel = version ? ` (Quality Attempt ${version})` : "";
        let finalPrompt = enhancedPrompt;
        const maxRetries = this.qualityAgent.qualityConfig.safetyRetries + version;
        const generatedVideo = await retryLlmCall(
            (params: { prompt: string; }) => this.executeVideoGeneration({
                scene,
                prompt: params.prompt,
                duration: scene.duration,
                sceneId: scene.id,
                version,
                startFrame,
                endFrame,
                characterReferenceImages,
                locationReferenceImages,
                previousScene,
                generateAudio,
                sendUpdateScenes,
                incrementAttempt,
                uniqueId // Pass to execute
            }),
            {
                prompt: finalPrompt,
            },
            {
                attempt: version,
                maxRetries,
                initialDelay: 1000,
                backoffFactor: 2,
                projectId: scene.projectId
            },
            async (error, attempt, params): Promise<any> => {
                if (error instanceof RAIError) {
                    console.warn(`   ⚠️ Safety error ${attemptLabel}. Sanitizing...`);
                    const sanitizedPrompt = await this.qualityAgent.sanitizePrompt(params.prompt, error.message);
                    incrementAttempt?.(error.message, "BACKOFF_RETRY");
                    return {
                        attempt,
                        params: {
                            ...params,
                            prompt: sanitizedPrompt
                        },
                    };
                }
            }
        );

        return {
            scene,
            enhancedPrompt,
            videoUrl: generatedVideo
        };
    }

    private async executeVideoGeneration({
        scene,
        prompt,
        duration,
        sceneId,
        version,
        startFrame,
        endFrame,
        characterReferenceImages,
        locationReferenceImages,
        previousScene,
        generateAudio = false,
        sendUpdateScenes,
        incrementAttempt,
        uniqueId,
    }: {
        scene: Scene,
        prompt: string,
        duration: number,
        sceneId: string,
        version: number,
            startFrame?: ReferenceImage,
            endFrame?: ReferenceImage,
            characterReferenceImages: ReferenceImage[],
            locationReferenceImages: ReferenceImage[],
        previousScene?: Scene,
            generateAudio: boolean,
        sendUpdateScenes?: UpdateScenesCallback,
        incrementAttempt?: IncrementAttemptHook,
        uniqueId?: string,
        }): Promise<string> {

        console.log(`   Generating video with prompt: ${prompt.substring(0, 50)}...`);
        sendUpdateScenes?.([scene.id], [{ id: scene.id, projectId: scene.projectId, sceneIndex: scene.sceneIndex, status: "pending", progressMessage: "Initializing video generation..." }]);

        const outputMimeType = "video/mp4";
        const objectPath = this.storageManager.getObjectPath({ type: "scene_video", projectId: scene.projectId, sceneId: sceneId, version, uniqueId });

        let durationSeconds = roundToValidDuration(duration);

        const imageParam = startFrame?.referenceImage ? { image: startFrame.referenceImage } : undefined;

        // const previousSceneVideo = getAllBestAssets(previousScene?.assets)['scene_video']?.data;
        // const sourceParam: { video: Video; } | { image: Image; } | undefined = previousSceneVideo ? {
        //     video: {
        //         uri: previousSceneVideo,
        //         mimeType: await this.storageManager.getObjectMimeType(previousSceneVideo),
        //     }
        // } : imageParam;

        // const characterReferenceImages = characerterReferenceUrls ? await Promise.all(characerterReferenceUrls.filter(obj => !!obj).map(async obj => ({
        //     image: {
        //         gcsUri: this.storageManager.getGcsUrl(obj),
        //         mimeType: await this.storageManager.getObjectMimeType(obj) || "image/png",
        //     },
        //     referenceType: VideoGenerationReferenceType.ASSET
        // }))) : [];

        // const locationReferenceImages = locationReferenceUrls ? await Promise.all(locationReferenceUrls.filter(obj => !!obj).map(async obj => ({
        //     image: {
        //         gcsUri: this.storageManager.getGcsUrl(obj),
        //         mimeType: await this.storageManager.getObjectMimeType(obj) || "image/png",
        //     },
        //     referenceType: VideoGenerationReferenceType.ASSET
        // }))) : [];

        // veo2: 'last frame and reference images cannot be both set.'
        const allReferenceImages = [ ...characterReferenceImages, ...locationReferenceImages ];

        let operation: Operation<GenerateVideosResponse>;
        try {
            operation = await this.videoModel.generateVideos({
                prompt,
                ...imageParam,
                // ...sourceParam, // veo2: 'Video and reference images cannot be both set.'
                config: {
                    abortSignal: this.options?.signal,
                    lastFrame: endFrame?.referenceImage,
                    generateAudio,
                    resolution: "720p",
                    durationSeconds,
                    numberOfVideos: 1,
                    personGeneration: PersonGeneration.ALLOW_ALL,
                    negativePrompt: "children, celebrity, famous person, photorealistic representation of real person, distorted face, watermark, text, bad quality",
                }
            });
        } catch (error) {
            console.error("   Error generating video: ", error);
            throw error;
        }

        const startTime = Date.now();
        const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

        console.log(`   ... Operation started: ${operation.name}`);
        scene.progressMessage = "Video generation in progress (remote)...";
        scene.status = "generating";
        sendUpdateScenes?.([scene.id], [scene]);

        const SCENE_GEN_WAITTIME_MS = 10000;
        while (!operation.done) {
            if (Date.now() - startTime > TIMEOUT_MS) {
                throw new Error(`Video generation timed out after ${TIMEOUT_MS / 1000 / 60} minutes`);
            }

            console.log(`   ... waiting ${SCENE_GEN_WAITTIME_MS / 1000}s for video generation to complete`);
            
            // Heartbeat: Update the scene in the DB to prevent the job monitor from marking this as stale.
            // This updates the 'updated_at' timestamp on the job/scene records.
            await sendUpdateScenes?.([scene.id], [{
                id: scene.id,
                projectId: scene.projectId,
                sceneIndex: scene.sceneIndex,
                status: "generating",
                progressMessage: "Video generation in progress (remote)..."
            }]);

            await new Promise(resolve => setTimeout(resolve, SCENE_GEN_WAITTIME_MS));

            operation = await this.videoModel.getVideosOperation({ operation, config: { abortSignal: this.options?.signal } });
        }

        if (operation.error) {
            if ([ 'safety', 'violate', 'responsible' ].some(str => (operation.error?.message as string).includes(str))) {
                throw new RAIError(operation.error.message as string, prompt);
            }
            throw operation.error;
        }

        if (operation.response?.raiMediaFilteredCount && operation.response?.raiMediaFilteredCount > 0) {
            if (operation.response.raiMediaFilteredReasons && operation.response.raiMediaFilteredReasons.length > 0) {
                console.error("RAI Media Filtered: ", JSON.stringify(operation.response, null, 2));
                const raiErrors = operation.response.raiMediaFilteredReasons.reduce((acc, curr) => acc.concat(`${curr}. `), "");
                throw new RAIError(raiErrors, prompt);
            }
            throw new RAIError("Video generation violated AI usage guidelines", prompt);
        }
        const generatedVideos = operation.response?.generatedVideos;
        if (!generatedVideos || generatedVideos.length === 0 || !generatedVideos[ 0 ].video?.videoBytes) {
            console.log("Operation completed but no video data returned. operation: ", JSON.stringify(operation, null, 2));
            throw new Error("Operation completed but no video data returned.");
        }

        const videoBytesBase64 = generatedVideos[ 0 ].video.videoBytes;
        const videoBuffer = Buffer.from(videoBytesBase64, "base64");

        console.log(`   ... Uploading generated video to ${objectPath}`);
        const generatedVideo = await this.storageManager.uploadBuffer(videoBuffer, objectPath, outputMimeType);

        console.log(`   ✓ Video generated and uploaded: ${this.storageManager.getPublicUrl(generatedVideo)}`);


        scene.progressMessage = "Video generated";
        scene.status = "generating";
        sendUpdateScenes?.([scene.id], [scene]);

        return generatedVideo;
    }
}
