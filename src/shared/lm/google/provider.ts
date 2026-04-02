import { Storage } from "@google-cloud/storage";
import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse, GenerateImagesParameters, GenerateImagesResponse, CountTokensParameters, CountTokensResponse, GenerateVideosParameters, GenerateVideosResponse, Operation, OperationGetParameters, GenerateVideosOperation, BatchJob, GetBatchJobConfig, Part, EditImageResponse, Modality, } from "@google/genai";
import path from "path";

import { BatchResultItem, Content, IVideoModelProvider } from "../provider.js";
import { ITextModelProvider } from "../provider.js";
import { buildBatchParams, buildGenerateContentParams, buildGenerateImagesParams, buildGenerateVideosParams } from "./params.js";
import { buildAPIReferenceImagesFromParams, toReferenceImagesFromContentsFileData, toContentsGoogleFromReferenceImages, pollForBatchJob } from "./utils.js";
import { extractGeneratedResponse } from "../parts-extractor.js";
import { GCPStorageManager } from "../../services/storage-manager.js";

// How long to wait after a batch job reports success before reading GCS output files.
// Vertex AI transitions to JOB_STATE_SUCCEEDED before output objects are fully
// committed to GCS, so we must give the storage backend time to settle.
const GCS_POST_SUCCESS_SETTLE_MS = 20_000;
const IS_BATCH_MODE = process.env.EXECUTION_MODE === "PARALLEL" && process.env.ENABLE_BATCH === "true";
export class GoogleProvider implements ITextModelProvider, IVideoModelProvider {
    public lm: GoogleGenAI;
    private sm: GCPStorageManager;

    constructor() {
        const projectId = process.env.GOOGLE_CLOUD_PROJECT || "your-project-id";
        this.lm = new GoogleGenAI({
            vertexai: true,
            project: projectId,
            location: "global"
        });
        this.sm = new GCPStorageManager(projectId);
    }

    async generateContent(params: { model: string; } & Parameters<ITextModelProvider[ 'generateContent' ]>[ 0 ]): Promise<GenerateContentResponse> {
        console.log({ params, provider: 'google' }, `Generating content`);
        return this.lm.models.generateContent(buildGenerateContentParams(params));
    }

    async generateImages(
        { prompt, ...params }: { model: string; } & Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ]
    ): Promise<EditImageResponse> {
        console.log({ params, provider: 'google' }, `Generating images`);

        if (params.model.includes("gemini")) {
            const { referenceImages, config, model } = params;
            let contents: Content[] = [ { role: "user", parts: [ { text: prompt } ] } ];

            if (referenceImages && Object.values(referenceImages).flat().length > 0) {
                const imageInputs = toContentsGoogleFromReferenceImages(referenceImages);
                contents = [ ...imageInputs, ...contents ];
            }

            const { numberOfImages, aspectRatio, outputMimeType, ...restConfig } = config;

            const generateContentParams = {
                contents,
                model,
                config: {
                    ...restConfig,
                    candidateCount: 1, // Only one candidate is supported for audio or image response
                    responseModalities: [ Modality.IMAGE ],
                    imageConfig: {
                        aspectRatio,
                        outputMimeType
                    }
                }
            };
            const result = await this.lm.models.generateContent(generateContentParams);

            return {
                generatedImages: (result.candidates ?? []).flatMap(cand =>
                    (cand.content?.parts ?? [])
                        .filter(part => part.inlineData?.data && part.inlineData?.mimeType)
                        .map(part => ({
                            image: {
                                imageBytes: part.inlineData!.data!,
                                mimeType: part.inlineData!.mimeType!
                            }
                        }))
                )
            };
        }

        const { referenceImages, ...restParams } = params;
        if (referenceImages && Object.values(referenceImages).flat().length > 0) {
            const referenceImagesGoogle = buildAPIReferenceImagesFromParams(referenceImages);

            const editImageParams = {
                ...restParams,
                config: {
                    ...restParams.config,
                    addWatermark: false,
                },
                model: "imagen-3.0-capability-001", // supports image edit api
                prompt,
                referenceImages: referenceImagesGoogle
            };
            return this.lm.models.editImage(editImageParams);
        }

        const generateImagesParams = {
            ...restParams,
            config: {
                ...restParams.config,
                addWatermark: false,
            },
            prompt,
        };
        return this.lm.models.generateImages(generateImagesParams);
    }

    async generateBatchContent(params: { model: string; } & Parameters<ITextModelProvider[ 'generateBatchContent' ]>[ 0 ]): ReturnType<ITextModelProvider[ 'generateBatchContent' ]> {
        console.log({ params, provider: 'google' }, `Generating batch content`);

        if (this.isGeminiModel(params.model) && IS_BATCH_MODE) {
            const batchJob = await this.executeNativeBatch(buildBatchParams(params));
            if (batchJob.error) {
                return params.requests.map(req => ({
                    customId: req.metadata.custom_id,
                    version: req.metadata.version,
                    assetKey: req.metadata.assetKey,
                    status: 'FAILED' as const,
                    error: batchJob.error
                })
                );
            }

            let result: BatchResultItem[] = [];

            if (batchJob.dest?.inlinedResponses) {
                result = (batchJob.dest?.inlinedResponses ?? []).map(({ response }, index) => extractGeneratedResponse("text", response!, "google")
                    .map((text) => ({
                        customId: params.requests[ index ].metadata.custom_id,
                        version: params.requests[ index ].metadata.version,
                        text,
                        assetKey: params.requests[ index ].metadata.assetKey,
                        status: 'SUCCESS' as const,
                    })
                    )
                ).flat();
                return result;
            }

            // BUG FIX #2 (race condition): Vertex AI marks a job JOB_STATE_SUCCEEDED before
            // all output objects are durably visible in GCS. Waiting here bridges that gap
            // before we attempt to list and stream the result shards.
            await new Promise(resolve => setTimeout((success) => {
                console.debug('Awaiting job output object put');
                resolve(success);
            }, GCS_POST_SUCCESS_SETTLE_MS));

            return this.sm.processTextBatchResults(params.projectId, batchJob.dest!.gcsUri!);
        }

        return this.executeSimulatedContentBatch(params);
    }

    async generateBatchImages(params: { model: string; } & Parameters<ITextModelProvider[ 'generateBatchImages' ]>[ 0 ]): ReturnType<ITextModelProvider[ 'generateBatchImages' ]> {
        console.log({ params, provider: 'google' }, `Generating batch images`);

        if (this.isGeminiModel(params.model) && IS_BATCH_MODE) {
            const batchJob = await this.executeNativeBatch(buildBatchParams(params));
            if (batchJob.error) {
                return params.requests.map(req => ({
                    customId: req.metadata.custom_id,
                    version: req.metadata.version,
                    assetKey: req.metadata.assetKey,
                    status: 'FAILED' as const,
                    error: batchJob.error
                })
                );
            }
            if (batchJob.dest?.inlinedResponses) {
                return (batchJob.dest?.inlinedResponses ?? []).map(({ response }, index) => extractGeneratedResponse("image", response!, "google")
                    .map((imageBytes) => ({
                        customId: params.requests[ index ].metadata.custom_id,
                        version: params.requests[ index ].metadata.version,
                        imageBytes,
                        assetKey: params.requests[ index ].metadata.assetKey,
                        status: 'SUCCESS' as const,
                    })
                    )
                ).flat();
            }

            // BUG FIX #2 (race condition): same settle delay for image batch output.
            await new Promise(resolve => setTimeout(resolve, GCS_POST_SUCCESS_SETTLE_MS));

            return this.sm.processBatchImageResult(params.projectId, batchJob.dest?.gcsUri!);
        }

        return await this.executeSimulatedImagesBatch(params);
    }

    async countTokens(params: Parameters<ITextModelProvider[ 'countTokens' ]>[ 0 ]): Promise<CountTokensResponse> {
        console.log({ params, provider: 'google' }, `Counting tokens`);
        return this.lm.models.countTokens(params);
    }

    async generateVideos(params: Parameters<IVideoModelProvider[ 'generateVideos' ]>[ 0 ]): Promise<Operation<GenerateVideosResponse>> {
        console.log({ params, provider: 'google' }, `Generating videos`);
        return this.lm.models.generateVideos(buildGenerateVideosParams(params));
    }

    async getVideosOperation(params: Parameters<IVideoModelProvider[ 'getVideosOperation' ]>[ 0 ]): Promise<Operation<GenerateVideosResponse>> {
        console.log({ params, provider: 'google' }, `Getting videos operation`);
        return this.lm.operations.getVideosOperation(params);
    }

    async getBatchJob(params: Parameters<ITextModelProvider[ 'getBatchJob' ]>[ 0 ]): Promise<BatchJob> {
        console.log({ params, provider: 'google' }, `Getting batch job`);
        return this.lm.batches.get(params);
    }

    private isGeminiModel = (model: string) => model.includes("gemini");

    private async executeNativeBatch(params: { model: string; requests: string; } & Omit<Parameters<ITextModelProvider[ 'generateBatchContent' ]>[ 0 ], 'requests'>): Promise<BatchJob> {
        console.log({ params, provider: 'google' }, `Executing native batch`);

        const uniqueId = Date.now().toString();
        const displayName = params.config?.displayName || `batch-${uniqueId}`;

        const inputPath = this.sm.getObjectPath({
            type: 'batch-data',
            projectId: params.projectId,
            uniqueId: uniqueId // e.g. .../batches/1715623.jsonl
        });

        const inputGcsUri = await this.sm.uploadJSONL(params.requests, inputPath);

        // The input file is stored at: batches/<uniqueId>/input.jsonl
        // so dirname already resolves to the per-run directory: batches/<uniqueId>/
        const { bucketName, fileName: inputFile } = this.sm.parseGcsUri(inputGcsUri);
        const batchDirectory = path.posix.dirname(inputFile); // e.g. "019c6564.../batches/_1771316712314"

        const destGcsUri = `gs://${bucketName}/${batchDirectory}/results`;

        console.debug({
            inputGcsUri: inputGcsUri,
            destGcsUri: destGcsUri,
            projectId: params.projectId
        }, "Initializing Vertex AI Batch Job");

        const batchJob = await this.lm.batches.create({
            model: params.model,
            src: { format: 'jsonl', gcsUri: [ inputGcsUri ] },
            config: {
                ...params.config,
                // BUG FIX #1: dest was commented out, so Vertex AI had no output location.
                // Without this, batchJob.dest is undefined and processTextBatchResults /
                // processBatchImageResult are called with an undefined gcsUri, throwing
                // immediately without ever touching GCS.
                dest: { format: 'jsonl', gcsUri: destGcsUri },
                displayName,
            },
        });

        return await pollForBatchJob(this.lm, batchJob, this.sm, { description: displayName });
    }

    private async executeSimulatedContentBatch(params: { model: string; } & Parameters<ITextModelProvider[ 'generateBatchContent' ]>[ 0 ]): ReturnType<ITextModelProvider[ 'generateBatchContent' ]> {
        console.log({ paramsProvider: 'google', countRequests: params.requests.length }, `Executing staggered simulated batch`);

        const { model, requests, config, projectId } = params;
        const delayStaggerBaseMs = 1500;

        const results = await Promise.all(
            requests.map(async (reqCurrent, indexReq) => {
                const delayStaggerCurrentMs = indexReq * delayStaggerBaseMs;
                await new Promise(resolve => setTimeout(resolve, delayStaggerCurrentMs));

                try {

                        const response = await this.generateContent({
                            model,
                            contents: reqCurrent.contents,
                            config: reqCurrent.config,
                        });

                    return extractGeneratedResponse("text", response, "google").map(textOutput => ({
                        customId: reqCurrent.metadata.custom_id,
                        version: reqCurrent.metadata.version,
                        assetKey: reqCurrent.metadata.assetKey,
                            status: 'SUCCESS' as const,
                        text: textOutput
                        }));
                    } catch (error) {
                    console.error(
                        { customId: reqCurrent.metadata.custom_id, errorMsg: error.message },
                        `Individual simulated request failed.`
                    );
                        return [ {
                            customId: reqCurrent.metadata.custom_id,
                            version: reqCurrent.metadata.version,
                            assetKey: reqCurrent.metadata.assetKey,
                            status: 'FAILED' as const,
                            error
                        } ];
                    }
                })
        );

        return results.flat();
    }

    private async executeSimulatedImagesBatch(params: { model: string; } & Parameters<ITextModelProvider[ 'generateBatchImages' ]>[ 0 ]): ReturnType<ITextModelProvider[ 'generateBatchImages' ]> {
        console.log({ paramsProvider: 'google', countRequests: params.requests.length }, `Executing staggered simulated batch`);

        const { model, requests, config, projectId } = params;
        const delayStaggerBaseMs = 1500;

        const results = await Promise.all(
            requests.map(async (reqCurrent, indexReq) => {
                    try {
                        // Partitions contents into image-configured elements and the primary text prompt.
                        const { imageContents, textContents } = reqCurrent.contents.reduce((acc, content) => {

                            const hasImageConfig = !!content.imageConfig;
                            const hasText = content.parts?.some(part => part.text) && !hasImageConfig;

                            if (hasImageConfig) {
                                acc.imageContents.push(content as Required<typeof content>);
                            } else if (hasText) {
                                acc.textContents.push(content);
                            }

                            return acc;
                        }, {
                            imageContents: [] as (Content & {
                                imageConfig: any;
                                referenceType: "base" | "mask" | "control" | "style" | "subject" | "content";
                            })[],
                            textContents: [] as typeof reqCurrent.contents
                        });

                        // Extract primary prompt from the text set
                        const primaryTextPart = textContents[ 0 ]?.parts?.find(p => p.text);
                        const prompt = primaryTextPart?.text ?? "";

                        const referenceImages = toReferenceImagesFromContentsFileData({ contents: imageContents }); 
                        const response = await this.generateImages({
                            model,
                            prompt,
                            config: reqCurrent.config!,
                            referenceImages
                        });

                        return extractGeneratedResponse("image", response, "google").map(imageBytes => ({
                            customId: reqCurrent.metadata.custom_id,
                            version: reqCurrent.metadata.version,
                            assetKey: reqCurrent.metadata.assetKey,
                            status: 'SUCCESS' as const,
                            imageBytes
                        }));
                    } catch (error) {
                        console.error(
                            { customId: reqCurrent.metadata.custom_id, errorMsg: error.message },
                            `Individual simulated request failed.`
                        );
                        return [ {
                            customId: reqCurrent.metadata.custom_id,
                            version: reqCurrent.metadata.version,
                            assetKey: reqCurrent.metadata.assetKey,
                            status: 'FAILED' as const,
                            error
                        } ];
                    }
                })
        );

        return results.flat();
    }
}

export type * from "@google/genai";
export * from "@google/genai";