import * as googleModels from "./google/models.js";
import * as ltxModels from "./ltx/models.js";
import { TextModelProviderName, VideoModelProviderName } from "./provider.js";

export const getProviderTextModelName = (provider: TextModelProviderName) => {
    switch (provider) {
        case "google":
        default:
            return googleModels.textModelName;
    }
};
export const getProviderImageModelName = (provider: TextModelProviderName) => {
    switch (provider) {
        case "google":
        default:
            return googleModels.imageModelName;
    }
};
export const getProviderQualityCheckModelName = (provider: TextModelProviderName) => {
    switch (provider) {
        case "google":
        default:
            return googleModels.qualityCheckModelName;
    }
};

export const getProviderVideoModelName = (provider: VideoModelProviderName) => {
    switch (provider) {
        case "ltx":
            return ltxModels.videoModelName;
        case "google":
        default:
            return googleModels.videoModelName;
    }
};