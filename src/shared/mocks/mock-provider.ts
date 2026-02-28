import {
    ITextModelProvider,
    IVideoModelProvider,
    GenerateContentParameters,
    GenerateContentResponse,
    GenerateImagesParameters,
    GenerateImagesResponse,
    GenerateBatchContentParameters,
    GenerateBatchImagesParameters,
    BatchResultItem,
    BatchImageResultItem,
    CountTokensParameters,
    CountTokensResponse,
    BatchJob,
    GetBatchJobParameters,
    GenerateVideosParameters,
    GenerateVideosResponse,
    Video
} from "../lm/provider.js";

// Minimal mock implementation for Operation
interface MockOperation<T> {
    name: string;
    metadata?: any;
    done?: boolean;
    result?: T;
    error?: any;
    response?: any;
}

export class MockProvider implements ITextModelProvider, IVideoModelProvider {
    async generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> {
        console.log("[MockProvider] Generating content with params:", JSON.stringify(params, null, 2));
        return {
            candidates: [
                {
                    content: {
                        parts: [
                            { text: "This is a mock response from the test mode provider." }
                        ],
                        role: "model"
                    },
                    finishReason: "STOP",
                    avgLogprobs: 0
                }
            ],
            usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 10,
                totalTokenCount: 20
            }
        } as any;
    }

    async generateImages(params: GenerateImagesParameters): Promise<GenerateImagesResponse> {
        console.log("[MockProvider] Generating images with params:", JSON.stringify(params, null, 2));
        return {
            generatedImages: [
                {
                    image: {
                        imageBytes: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
                        mimeType: "image/png"
                    }
                }
            ]
        } as any;
    }

    async generateBatchContent(params: GenerateBatchContentParameters): Promise<BatchResultItem[]> {
        console.log("[MockProvider] Generating batch content with params:", JSON.stringify(params, null, 2));
        return params.requests.map((req) => ({
            customId: req.metadata.custom_id,
            version: req.metadata.version,
            assetKey: req.metadata.assetKey,
            status: 'SUCCESS',
            text: "This is a mock batch response from the test mode provider."
        }));
    }

    async generateBatchImages(params: GenerateBatchImagesParameters): Promise<BatchImageResultItem[]> {
        console.log("[MockProvider] Generating batch images with params:", JSON.stringify(params, null, 2));
        return params.requests.map((req) => ({
            customId: req.metadata.custom_id,
            version: req.metadata.version,
            assetKey: req.metadata.assetKey,
            status: 'SUCCESS',
            imageBytes: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        }));
    }

    async countTokens(params: CountTokensParameters): Promise<CountTokensResponse> {
         console.log("[MockProvider] Counting tokens with params:", JSON.stringify(params, null, 2));
         return {
             totalTokens: 100
         } as any;
    }

    async getBatchJob(params: GetBatchJobParameters): Promise<BatchJob> {
        console.log("[MockProvider] Getting batch job with params:", JSON.stringify(params, null, 2));
        return {
            state: "JOB_STATE_SUCCEEDED",
            name: params.name
        } as any;
    }

    async generateVideos(params: GenerateVideosParameters): Promise<any> { // Return type any to avoid complex Google types
        console.log("[MockProvider] Generating videos with params:", JSON.stringify(params, null, 2));
        return {
            name: "projects/mock-project/locations/us-central1/operations/mock-operation-id",
            metadata: {
                state: "SUCCEEDED"
            },
            done: true,
            response: {
                generatedVideos: [
                    {
                        video: {
                            uri: "gs://mock-bucket/mock-video.mp4",
                            videoBytes: "mock-video-bytes"
                        }
                    }
                ]
            }
        };
    }

    async getVideosOperation(params: any): Promise<any> {
        console.log("[MockProvider] Getting videos operation with params:", JSON.stringify(params, null, 2));
        return {
            name: params.name || "projects/mock-project/locations/us-central1/operations/mock-operation-id",
            metadata: {
                state: "SUCCEEDED"
            },
            done: true,
            response: {
                generatedVideos: [
                    {
                        video: {
                            uri: "gs://mock-bucket/mock-video.mp4",
                            videoBytes: "mock-video-bytes"
                        }
                    }
                ]
            }
        };
    }
}
