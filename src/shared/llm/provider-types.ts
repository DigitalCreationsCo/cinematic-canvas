import {
    BatchJob as GoogleBatchJob,
    GetBatchJobConfig as GoogleGetBatchJobConfig,
    CreateBatchJobConfig as GoogleCreateBatchJobConfig,
    GenerateContentConfig as GoogleGenerateContentConfig,
    GenerateContentResponse as GoogleGenerateContentResponse,
    GenerateImagesConfig as GoogleGenerateImagesConfig,
    GenerateImagesResponse as GoogleGenerateImagesResponse,
    GenerateVideosConfig as GoogleGenerateVideosConfig,
    GenerateVideosResponse as GoogleGenerateVideosResponse,
    CountTokensResponse as GoogleCountTokensResponse,
    ContentListUnion as GoogleContentListUnion,
    Operation as GoogleOperation,
    Image as GoogleImage,
    Video as GoogleVideo,
} from "./google/provider.js";

export type GenerateContentConfig = GoogleGenerateContentConfig;
export type BatchJob = GoogleBatchJob;
export type GetBatchJobConfig = GoogleGetBatchJobConfig;
export type CreateBatchJobConfig = GoogleCreateBatchJobConfig;
export type ContentsType = GoogleContentListUnion;
export type GenerateContentResponse = GoogleGenerateContentResponse;
export type GenerateImagesConfig = GoogleGenerateImagesConfig;
export type GenerateImagesResponse = GoogleGenerateImagesResponse;
export type GenerateVideosConfig = GoogleGenerateVideosConfig;
export type GenerateVideosResponse = GoogleOperation<GoogleGenerateVideosResponse>;
export type CountTokensResponse = GoogleCountTokensResponse;

export type Image = GoogleImage;
export type Video = GoogleVideo;

export type TextModelProviderName = 'google';
export type VideoModelProviderName = 'google' | 'ltx';

export interface GenerateContentParameters {
    model: string;
    contents: ContentsType;
    config?: GenerateContentConfig;
};
export interface GenerateBatchContentParameters {
    model: string;
    requests: {
        config?: GenerateContentConfig;
        contents: ContentsType;
        metadata?: Record<string, any>;
        model?: string;
    }[];
    config?: CreateBatchJobConfig;
};

export interface GenerateImagesParameters {
    model: string;
    prompt: string;
    config: GenerateImagesConfig;
};
export interface GenerateVideosParameters {
    prompt?: string;
    image?: any;
    video?: any;
    config?: GenerateVideosConfig;
};
export interface GetBatchJobParameters {
    name: string;
    config?: GetBatchJobConfig;
}

export interface ITextModelProvider {
    generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
    generateBatchContent(params: GenerateBatchContentParameters): Promise<BatchJob>;
    generateImages(params: GenerateImagesParameters): Promise<GenerateImagesResponse>;
    generateBatchImages(params: GenerateBatchContentParameters): Promise<BatchJob>;
    countTokens(params: any): Promise<CountTokensResponse>;
    getBatchJob(params: GetBatchJobParameters): Promise<BatchJob>;
}

export interface IVideoModelProvider {
    generateVideos(params: GenerateVideosParameters): Promise<GenerateVideosResponse>;
    getVideosOperation(params: any): Promise<GenerateVideosResponse>;
}
