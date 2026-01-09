import { ContentListUnion } from "@google/genai";

export type TextModelProviderName = 'google';
export type VideoModelProviderName = 'google' | 'ltx';

interface GenerateContentParameters {
    model: string;
    contents: ContentListUnion;
    config?: Record<string, any>;
};
interface GenerateImagesParameters {
    model: string;
    prompt: string;
    config: Record<string, any>;
};
interface GenerateVideosParameters {
    prompt?: string;
    image?: any;
    video?: any;
    config?: Record<string, any>;
};

export interface ITextModelProvider {
    generateContent(params: GenerateContentParameters): Promise<any>;
    generateImages(params: GenerateImagesParameters): Promise<any>;
    countTokens(params: any): Promise<any>;
}

export interface IVideoModelProvider {
    generateVideos(params: GenerateVideosParameters): Promise<any>;
    getVideosOperation(params: any): Promise<any>;
}
