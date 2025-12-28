import { GenerateContentParameters, GenerateImagesParameters, GenerateVideosParameters, HarmBlockMethod, HarmBlockThreshold, HarmCategory, Modality, Part, GenerateImagesConfig } from "@google/genai";
import { imageModelName, textModelName, videoModelName } from "./models";

export const buildllmParams = (params: { contents: GenerateContentParameters[ 'contents' ]; } & Partial<GenerateContentParameters>): GenerateContentParameters => ({
    model: textModelName,
    ...params,
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
export const buildImageGenerationParams = (params: { prompt: GenerateImagesParameters[ 'prompt' ]; config?: Partial<GenerateImagesConfig>; } & Partial<GenerateImagesParameters>): GenerateImagesParameters => ({
    model: imageModelName,
    ...params,
    config: {
        ...params.config,
    },
});
export const buildVideoGenerationParams = (params: { prompt: GenerateVideosParameters[ 'prompt' ]; } & Partial<GenerateVideosParameters>): GenerateVideosParameters => ({
    model: videoModelName,
    ...params,
    config: {
        ...params.config
    },
});
