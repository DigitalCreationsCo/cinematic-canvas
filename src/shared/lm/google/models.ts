export const textModelNames = process.env.TEXT_MODEL_NAMES || "gemini-2.5-pro";
export const qualityCheckModelNames = process.env.QUALITY_EVALUATION_MODEL_NAMES || "gemini-2.5-pro";
export const imageModelNames = process.env.IMAGE_MODEL_NAMES || "gemini-2.5-flash-image";
export const videoModelNames = process.env.VIDEO_MODEL_NAMES || "veo-2.0-generate-exp";

export const modelsUnsupportedFeatures: Record<string, string[]> = {
  "gemini-2.5-*": ["mediaResolution"], // Matches any 2.5 version
  // "gemini-*-flash": [ "someOtherFeature" ], // Matches any flash model
};
