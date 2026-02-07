import { GenerateContentParameters, GenerateImagesParameters, GenerateVideosParameters, HarmBlockMethod, HarmBlockThreshold, HarmCategory, Modality, Part, GenerateImagesConfig } from "@google/genai";
import { imageModelName, textModelName, videoModelName } from "./models.js";

export const buildGenerateContentParams = (params: { model?: string; contents: GenerateContentParameters[ 'contents' ]; } & Partial<GenerateContentParameters>): GenerateContentParameters => ({
    ...params,
    model: params.model || textModelName,
    config: {
        candidateCount: 1,
        responseMimeType: "application/json",
        responseModalities: [ Modality.TEXT ],
        safetySettings: [
            {
                category: HarmCategory.HARM_CATEGORY_UNSPECIFIED,
                threshold: HarmBlockThreshold.OFF,
                method: HarmBlockMethod.HARM_BLOCK_METHOD_UNSPECIFIED,
            }
        ],
        ...params.config
    }
});
export const buildGenerateImagesParams = (params: { model?: string; prompt: GenerateImagesParameters[ 'prompt' ]; config?: Partial<GenerateImagesConfig>; } & Partial<GenerateImagesParameters>): GenerateImagesParameters => ({
    ...params,
    model: params.model || imageModelName,
    config: {
        ...params.config,
    },
});
export const buildGenerateVideosParams = (params: {model?: string; prompt: string} & Omit<GenerateVideosParameters, 'model'>): {prompt: string} & GenerateVideosParameters => ({
    ...params,
    model: params.model || videoModelName,
    config: {
        ...params.config
    },
});
