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
    generateContent(params: GenerateContentParameters, options?: { signal?: AbortSignal }): Promise<GenerateContentResponse>;
    generateImages(params: GenerateImagesParameters, options?: { signal?: AbortSignal }): Promise<GenerateImagesResponse>;
    generateVideos(params: GenerateVideosParameters, options?: { signal?: AbortSignal }): Promise<Operation<GenerateVideosResponse>>;
    getVideosOperation(params: { operation: Operation<GenerateVideosResponse>; }, options?: { signal?: AbortSignal }): Promise<Operation<GenerateVideosResponse>>;
}
