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

function prepareBatchInputs(requests: Parameters<ITextModelProvider[ 'generateBatchContent' ]>[ 0 ][ 'requests' ]): string {
    const jsonL = requests.map(req => {
        const {
            config,
            metadata,
            ...rest
        } = req;

        // BUG FIX #3: Config must be included in each request item so the batch job
        // respects per-request settings (responseMimeType, safetySettings, etc.).
        // Only abortSignal is stripped — it is a client-side JS construct that the
        // Vertex AI API cannot serialise and will reject with "Cannot store struct
        // 'request.config.abortSignal' with no fields".
        const { abortSignal, ...cleanConfig } = (config || {}) as any;

        return JSON.stringify({
            request: {
                ...rest,
                // config: cleanConfig,
            }
        });
    }).join("\n");

    return jsonL;
}

export function buildBatchParams(params: Parameters<ITextModelProvider[ 'generateBatchContent' ]>[ 0 ]): { model: string; requests: string; } & Omit<Parameters<ITextModelProvider[ 'generateBatchContent' ]>[ 0 ], 'requests'> {
    const jsonL = prepareBatchInputs(params.requests);
    return {
        ...params,
        requests: jsonL,
    };
}