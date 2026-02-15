import {
    GoogleGenAI,
    GenerateContentParameters,
    GenerateContentResponse,
    GenerateImagesParameters,
    GenerateImagesResponse,
    CountTokensParameters,
    CountTokensResponse,
    GenerateVideosParameters,
    GenerateVideosResponse,
    Operation,
    OperationGetParameters,
    GenerateVideosOperation,
    BatchJob,
    GetBatchJobConfig,
    Part,
    EditImageResponse,
    Modality,
} from "@google/genai";

import { IVideoModelProvider } from "../provider.js";
import { ITextModelProvider } from "../provider.js";
import { buildGenerateContentParams, buildGenerateImagesParams, buildGenerateVideosParams } from "./params.js";
import { toContentsImageInputs } from "../utils.js";
import { buildReferenceImageFromParams } from "./utils.js";

export class GoogleProvider implements ITextModelProvider, IVideoModelProvider {
    public lm: GoogleGenAI;

    constructor() {
        const projectId = process.env.GOOGLE_CLOUD_PROJECT || "your-project-id";
        this.lm = new GoogleGenAI({
            vertexai: true,
            project: projectId,
            location: "global"
        });
    }

    async generateContent(params: { model: string; } & Parameters<ITextModelProvider[ 'generateContent' ]>[ 0 ]): Promise<GenerateContentResponse> {
        return this.lm.models.generateContent(buildGenerateContentParams(params));
    }

    async generateImages(
        { prompt, ...params }: { model: string; } & Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ]
    ): Promise<EditImageResponse> {

        if (params.model.includes("gemini")) {
            const { referenceImages, config, model } = params;
            let contents: Part[] = [ { text: prompt } ];

            if (referenceImages && referenceImages.length > 0) {
                const fileDataInputs = await toContentsImageInputs(referenceImages);
                const referenceInputs: Part[] = fileDataInputs.flatMap(({ displayName, ...file }) => [
                    { text: displayName },
                    { fileData: file }
                ]);
                contents = [ ...referenceInputs, ...contents ];
            }
 
            const { numberOfImages, aspectRatio, outputMimeType, ...restConfig } = config;
            const result = await this.lm.models.generateContent({
                contents,
                model,
                config: {
                    ...restConfig,
                    candidateCount: numberOfImages,
                    responseModalities: [ Modality.IMAGE ],
                    imageConfig: {
                        aspectRatio,
                        outputMimeType
                    }
                }
            });

            // FIX: Explicitly map the 'GenerateContentResponse' to 'EditImageResponse'
            // This ensures the return type matches the interface exactly.
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

        if (params.referenceImages && params.referenceImages.length) {
            const referenceImages = buildReferenceImageFromParams(params.referenceImages);
            return this.lm.models.editImage({ 
                ...params,
                config: {
                    ...params.config,
                    addWatermark: false,
                },
                prompt, 
                referenceImages: referenceImages
             });
        }

        return this.lm.models.generateImages({ 
            ...params,
            config: {
                ...params.config,
                addWatermark: false,
            },
            prompt, 
        });
    }

    async generateBatchContent(params: { model: string; } & Parameters<ITextModelProvider[ 'generateBatchContent' ]>[ 0 ]): Promise<BatchJob> {
        if (!params.model.includes("gemini")) {
            throw new Error("Batch generation is only supported for Gemini models");
        }

        return this.lm.batches.create({
            model: params.model,
            config: params.config,
            src: params.requests
        });
    }

    async generateBatchImages(params: { model: string; } & Parameters<ITextModelProvider[ 'generateBatchImages' ]>[ 0 ]): Promise<BatchJob> {
        if (!params.model.includes("gemini")) {
            throw new Error("Batch generation is only supported for Gemini models");
        }

        return this.lm.batches.create({
            model: params.model,
            config: params.config,
            src: params.requests
        });
    }

    async countTokens(params: Parameters<ITextModelProvider[ 'countTokens' ]>[ 0 ]): Promise<CountTokensResponse> {
        return this.lm.models.countTokens(params);
    }

    async generateVideos(params: Parameters<IVideoModelProvider[ 'generateVideos' ]>[ 0 ]): Promise<Operation<GenerateVideosResponse>> {
        return this.lm.models.generateVideos(buildGenerateVideosParams(params));
    }

    async getVideosOperation(params: Parameters<IVideoModelProvider[ 'getVideosOperation' ]>[ 0 ]): Promise<Operation<GenerateVideosResponse>> {
        return this.lm.operations.getVideosOperation(params);
    }

    async getBatchJob(params: Parameters<ITextModelProvider[ 'getBatchJob' ]>[ 0 ]): Promise<BatchJob> {
        return this.lm.batches.get(params);
    }
}

export type * from "@google/genai";