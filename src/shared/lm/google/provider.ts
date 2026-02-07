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
} from "@google/genai";

import { IVideoModelProvider } from "../provider.js";
import { ITextModelProvider } from "../provider.js";
import { buildGenerateContentParams, buildGenerateImagesParams, buildGenerateVideosParams } from "./params.js";

export class GoogleProvider implements ITextModelProvider, IVideoModelProvider {
    public lm: GoogleGenAI;

    constructor() {
        const projectId = process.env.GCP_PROJECT_ID || "your-project-id";
        this.lm = new GoogleGenAI({
            vertexai: true,
            project: projectId,
            location: "global"
        });
    }

    async generateContent({ contents, config }: Parameters<ITextModelProvider[ 'generateContent' ]>[ 0 ]): Promise<GenerateContentResponse> {
        return this.lm.models.generateContent(buildGenerateContentParams({
            contents, config
        }));
    }

    async generateBatchContent(params: Parameters<ITextModelProvider[ 'generateBatchContent' ]>[ 0 ]): Promise<BatchJob> {
        return this.lm.batches.create({
            config: params.config,
            src: params.requests
        });
    }

    async generateImages(params: Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ]): Promise<GenerateImagesResponse> {
        return this.lm.models.generateImages(buildGenerateImagesParams(params));
    }

    async generateBatchImages(params: Parameters<ITextModelProvider[ 'generateBatchImages' ]>[ 0 ]): Promise<BatchJob> {
        return this.lm.batches.create({
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

export type {
    GenerateContentConfig,
    GenerateContentResponse,
    GenerateImagesConfig,
    GenerateImagesResponse,
    GenerateVideosConfig,
    GenerateVideosResponse,
    CountTokensResponse,
    BatchJob,
    GetBatchJobConfig,
    CreateBatchJobConfig,
    ContentListUnion,
    Operation,
    Image,
    Video,
} from "@google/genai";