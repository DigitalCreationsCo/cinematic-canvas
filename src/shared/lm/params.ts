import {
    GenerateContentParameters, GenerateImagesParameters, GenerateVideosParameters, GenerateImagesConfig,
    TextModelProviderName,
    VideoModelProviderName
} from "./provider.js";

import {
    buildGenerateContentParams as buildGoogleGenerateContentParams,
    buildGenerateImagesParams as buildGoogleGenerateImagesParams,
    buildGenerateVideosParams as buildGoogleGenerateVideosParams
} from "./google/params.js";

import {
    buildGenerateVideosParams as buildLtxGenerateVideosParams
} from "./ltx/params.js";

export const buildGenerateContentParams = (params: { model?: string; contents: GenerateContentParameters[ 'contents' ]; } & Partial<GenerateContentParameters>, provider: TextModelProviderName): GenerateContentParameters => {
    switch (provider) {
        case "google":
        default:
            return buildGoogleGenerateContentParams(params);
    }
};

export const buildGenerateImagesParams = (params: { model?: string; prompt: GenerateImagesParameters[ 'prompt' ]; config?: Partial<GenerateImagesConfig>; } & Partial<GenerateImagesParameters>, provider: TextModelProviderName): GenerateImagesParameters => {
    switch (provider) {
        case "google":
        default:
            return buildGoogleGenerateImagesParams(params);
    }
};

export const buildGenerateVideosParams = (params: { model?: string; } & Omit<GenerateVideosParameters, 'model'>, provider: VideoModelProviderName): GenerateVideosParameters => {
    switch (provider) {
        case "ltx":
            return buildLtxGenerateVideosParams(params);
        case "google":
        default:
            return buildGoogleGenerateVideosParams(params);
    }
};
