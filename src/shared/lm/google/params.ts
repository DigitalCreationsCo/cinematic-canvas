import { HarmBlockMethod, HarmBlockThreshold, HarmCategory, Modality } from "@google/genai";
import { ITextModelProvider, IVideoModelProvider, GenerateContentParameters } from "../provider.js";

export const buildGenerateContentParams = (input: { model: string; contents: GenerateContentParameters[ 'contents' ]; } & Partial<GenerateContentParameters>): GenerateContentParameters => {
    const out = {
        ...input,
        model: input.model,
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
            ...input.config
        }
    };
    return out;
};
export const buildGenerateImagesParams = (input: { model: string; } & Omit<Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ], 'model'>): Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ] => {
    const out: Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ] = {
        ...input,
        model: input.model,
        config: {
            ...input.config,
        },
    };
    return out;
};
export const buildGenerateVideosParams = (input: { model: string; } & Omit<Parameters<IVideoModelProvider[ 'generateVideos' ]>[ 0 ], 'model'>): Parameters<IVideoModelProvider[ 'generateVideos' ]>[ 0 ] => {
    const out = {
        ...input,
        model: input.model,
        config: {
            ...input.config
        },
    };
    return out;
};

function prepareBatchInputs(requests: Parameters<ITextModelProvider[ 'generateBatchContent' ]>[ 0 ][ 'requests' ]) {
    const jsonL = requests.map(req => {
        // Bug fix: Cannot store struct 'request.config.abortSignal' with no fields at [1:1]
        // Destructure to separate config from the rest of the request
        const { config, ...rest } = req;
        // Exclude abortSignal from config
        // Cast to any to catch abortSignal even if it's not in the strict type definition
        const { abortSignal, ...cleanConfig } = (config || {}) as any;

        return JSON.stringify({
            request: {
                ...rest,
                config: cleanConfig
            }
        });
    }).join("\n");
    return jsonL;
}

export function buildBatchParams(params: Parameters<ITextModelProvider[ 'generateBatchContent' ]>[ 0 ]) {
    const jsonL = prepareBatchInputs(params.requests);
    return {
        ...params,
        requests: jsonL,
    };
}