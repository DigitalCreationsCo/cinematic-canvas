import { videoModelName } from "./models.js";
import { GenerateVideosParameters } from "../provider.js";

export const buildGenerateVideosParams = (params: {model?: string; prompt: string} & Omit<GenerateVideosParameters, 'model'>): {prompt: string} & GenerateVideosParameters => ({
    ...params,
    model: params.model || videoModelName,
    config: {
        ...params.config
    },
});
