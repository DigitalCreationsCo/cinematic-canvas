import * as googleModels from "./google/models.js";
import * as ltxModels from "./ltx/models.js";
import { TextModelProviderName, VideoModelProviderName } from "./provider.js";

export const getProviderTextModelNames = (provider: TextModelProviderName): string[] => {
    switch (provider) {
        case "google":
        default:
            return getFallbackModels(googleModels.textModelNames);
    }
};

export const getProviderImageModelNames = (provider: TextModelProviderName): string[] => {
    switch (provider) {
        case "google":
        default:
            return getFallbackModels(googleModels.imageModelNames);
    }
};

export const getProviderQualityCheckModelNames = (provider: TextModelProviderName): string[] => {
    switch (provider) {
        case "google":
        default:
            return getFallbackModels(googleModels.qualityCheckModelNames);
    }
};

export const getProviderVideoModelNames = (provider: VideoModelProviderName): string[] => {
    switch (provider) {
        case "ltx":
            return getFallbackModels(ltxModels.videoModelNames);
        case "google":
        default:
            return getFallbackModels(googleModels.videoModelNames);
    }
};

// Helper function to parse comma-separated fallback models
const getFallbackModels = (modelsString: string,): string[] => {
    return modelsString.split(',').map(m => m.trim()).filter(m => m.length > 0);
};
