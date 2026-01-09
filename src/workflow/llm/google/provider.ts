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
    GenerateVideosOperation
} from "@google/genai";

import { IVideoModelProvider } from "../provider-types";
import { ITextModelProvider } from "../provider-types";
import { buildllmParams } from "./google-llm-params";
import { videoModelName } from "./models";

export class GoogleProvider implements ITextModelProvider, IVideoModelProvider {
    public llm: GoogleGenAI;

    constructor() {
        const projectId = process.env.GCP_PROJECT_ID || "your-project-id";

        this.llm = new GoogleGenAI({
            vertexai: true,
            project: projectId,
            location: "global"
        });
    }

    async generateContent({ model, contents, config }: Parameters<ITextModelProvider[ 'generateContent' ]>[ 0 ]): Promise<GenerateContentResponse> {
        return this.llm.models.generateContent({
            model, contents, config
        });
    }

    async generateImages(params: Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ]): Promise<GenerateImagesResponse> {
        return this.llm.models.generateImages(params);
    }

    async countTokens(params: Parameters<ITextModelProvider[ 'countTokens' ]>[ 0 ]): Promise<CountTokensResponse> {
        return this.llm.models.countTokens(params);
    }

    async generateVideos(params: Parameters<IVideoModelProvider[ 'generateVideos' ]>[ 0 ]): Promise<Operation<GenerateVideosResponse>> {
        return this.llm.models.generateVideos({ model: videoModelName, ...params });
    }

    async getVideosOperation(params: Parameters<IVideoModelProvider[ 'getVideosOperation' ]>[ 0 ]): Promise<Operation<GenerateVideosResponse>> {
        return this.llm.operations.getVideosOperation(params);
    }
}
