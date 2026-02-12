import type {
    BatchJob as GoogleBatchJob,
    GetBatchJobConfig as GoogleGetBatchJobConfig,
    CreateBatchJobConfig as GoogleCreateBatchJobConfig,
    GenerateContentConfig as GoogleGenerateContentConfig,
    GenerateContentResponse as GoogleGenerateContentResponse,
    GenerateImagesConfig as GoogleGenerateImagesConfig,
    EditImageResponse as GoogleEditImageResponse,
    GenerateVideosConfig as GoogleGenerateVideosConfig,
    GenerateVideosResponse as GoogleGenerateVideosResponse,
    CountTokensResponse as GoogleCountTokensResponse,
    ContentListUnion as GoogleContentListUnion,
    Operation as GoogleOperation,
    Image as GoogleImage,
    Video as GoogleVideo,
    SafetySetting as GoogleSafetySetting,
    PersonGeneration as GooglePersonGeneration,
    HttpOptions,
    CountTokensConfig as GoogleCountTokensConfig,
    EditImageParameters,
    SubjectReferenceType,
} from "./google/provider.js";

import { LTXGenerateVideoParameters } from "./ltx/provider.js";

export interface ITextModelProvider {
    generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
    generateBatchContent(params: GenerateBatchContentParameters): Promise<BatchJob>;
    generateImages(params: GenerateImagesParameters): Promise<GenerateImagesResponse>;
    generateBatchImages(params: GenerateBatchContentParameters): Promise<BatchJob>;
    countTokens(params: CountTokensParameters): Promise<CountTokensResponse>;
    getBatchJob(params: GetBatchJobParameters): Promise<BatchJob>;
}

export interface IVideoModelProvider {
    generateVideos(params: GenerateVideosParameters): Promise<GenerateVideosResponse>;
    getVideosOperation(params: any): Promise<GenerateVideosResponse>;
}

export type BatchJob = GoogleBatchJob;
export type GetBatchJobConfig = GoogleGetBatchJobConfig;
export type CreateBatchJobConfig = GoogleCreateBatchJobConfig;
export type ContentsType = GoogleContentListUnion;

export type GenerateContentConfig = GoogleGenerateContentConfig;
export type GenerateContentResponse = GoogleGenerateContentResponse;

export type ReferenceImage = {
    referenceImage: Image;
    maskImageConfig?: any;
    configuration: {
        subjectType: ("SUBJECT_TYPE_DEFAULT" | "SUBJECT_TYPE_PERSON" | "SUBJECT_TYPE_ANIMAL" | "SUBJECT_TYPE_PRODUCT");
        subjectDescription: string;
    }
};
export type GenerateImagesConfig = {
    /** * Number of images to generate. 
     * Maps to `candidateCount` for Gemini and `numberOfImages` for Imagen.
     */
    numberOfImages?: number;

    /** * Aspect ratio of the generated images (e.g., "1:1", "16:9").
     */
    aspectRatio?: string;

    /** * The size/resolution of the generated image (e.g., "1024x1024", "1K").
     * Note: Enum values differ between models; implementation should validate or strict-type this.
     */
    imageSize?: string;

    /** * MIME type of the generated image (e.g., "image/jpeg", "image/png").
     */
    outputMimeType?: string;

    /** * Compression quality for JPEG images. 
     */
    outputCompressionQuality?: number;

    /** * Controls the generation of people. 
     * Supported values: "ALLOW_ALL", "ALLOW_ADULT", "ALLOW_NONE".
     */
    personGeneration?: GooglePersonGeneration;

    /** * Random seed for generation to ensure determinism.
     */
    seed?: number;

    /** * Description of what to exclude from the image.
     * Implementation note: Native support in Imagen. For Gemini, this may need to be 
     * appended to the main prompt programmatically if the model version supports it.
     */
    negativePrompt?: string;

    /** * Controls how much the model adheres to the text prompt (Imagen specific).
     */
    guidanceScale?: number;

    /** * Cloud Storage URI used to store the generated images (Imagen specific).
     */
    outputGcsUri?: string;

    /** * Add invisible watermark to the generated images (Imagen specific).
     */
    addWatermark?: boolean;

    /** * Safety settings to block unsafe content (Gemini specific).
     * Implementation note: This should be lifted from config and passed to the 
     * root `safetySettings` param when calling `generateContent`.
     */
    safetySettings?: GoogleSafetySetting[];

    /**
     * User specified labels to track billing usage.
     */
    labels?: Record<string, string>;

    /**
     * Abort signal to cancel the request client-side.
     */
    abortSignal?: AbortSignal;

    /**
     * HTTP options override.
     */
    httpOptions?: HttpOptions;
};
export type GenerateImagesResponse = GoogleEditImageResponse;

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
    referenceImages?: ReferenceImage[];
    config: GenerateImagesConfig;
};
export interface GenerateVideosParameters {
    model: string;
    prompt: string;
    image?: any;
    video?: any;
    config?: GenerateVideosConfig;
};
export interface GetBatchJobParameters {
    name: string;
    config?: GetBatchJobConfig;
}
export interface CountTokensParameters {
    model: string;
    contents: ContentsType;
    config?: GoogleCountTokensConfig;
}