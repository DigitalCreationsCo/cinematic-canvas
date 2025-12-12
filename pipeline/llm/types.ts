import {
    GenerateContentParameters,
    GenerateContentResponse,
    GenerateImagesParameters,
    GenerateImagesResponse,
    GenerateVideosParameters,
    GenerateVideosResponse,
    Operation,
} from '@google/genai';

export type LlmProviderName = "google";

export interface LlmProvider {
    generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
    generateImages(params: GenerateImagesParameters): Promise<GenerateImagesResponse>;
    generateVideos(params: GenerateVideosParameters): Promise<Operation<GenerateVideosResponse>>;
    getVideosOperation(params: { operation: Operation<GenerateVideosResponse>; }): Promise<Operation<GenerateVideosResponse>>;
}
