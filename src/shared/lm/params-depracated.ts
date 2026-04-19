// import {
//     GenerateContentParameters, GenerateImagesParameters, GenerateVideosParameters, GenerateImagesConfig,
//     TextModelProviderName,
//     VideoModelProviderName,
//     ReferenceImage, ReferenceImageInputs
// } from "./provider.js";

// import {
//     buildGenerateContentParams as buildGoogleGenerateContentParams,
//     buildGenerateImagesParams as buildGoogleGenerateImagesParams,
//     buildGenerateVideosParams as buildGoogleGenerateVideosParams
// } from "./google/params.js";

// import {
//     buildGenerateVideosParams as buildLtxGenerateVideosParams
// } from "./ltx/params.js";


// /**
//  * Builds a typed ReferenceImageInputs map from a flat array of ReferenceImages.
//  * Provider-agnostic: operates on the shared ReferenceImage type, not on any
//  * Google Content or LangChain message type.
//  *
//  * @example
//  * const referenceImages = buildReferenceImageInputs([
//  *   characterRef,           // referenceType: 'subject'
//  *   locationRef,            // referenceType: 'base'
//  *   previousSceneEndFrame,  // referenceType: 'base'
//  * ]);
//  * // → { subject: [characterRef], base: [locationRef, previousSceneEndFrame] }
//  */
// export function buildReferenceImageInputs(
//     refs: (ReferenceImage | undefined)[]
// ): ReferenceImageInputs {
//     const referenceImages: Partial<ReferenceImageInputs> = {};

//     for (const ref of refs) {
//         if (!ref) continue;

//         const type = ref.referenceType;

//         // Ensure the bucket exists
//         if (!referenceImages[type]) {
//             referenceImages[type] = [] as any;
//         }

//         // We cast to 'any[]' here because we have already 
//         // logically guaranteed the type safety via the 'type' key
//         (referenceImages[type] as ReferenceImage[]).push(ref);
//     }

//     return referenceImages as ReferenceImageInputs;
// }

// export const buildGenerateContentParams = (params: { model: string; contents: GenerateContentParameters['messages']; } & Partial<GenerateContentParameters>, provider: TextModelProviderName): GenerateContentParameters => {
//     switch (provider) {
//         case "google":
//         default:
//             return buildGoogleGenerateContentParams(params);
//     }
// };

// export const buildGenerateImagesParams = (params: { model: string; prompt: GenerateImagesParameters['prompt']; } & GenerateImagesParameters, provider: TextModelProviderName): GenerateImagesParameters => {
//     const { referenceImages, ...rest } = params;
//     switch (provider) {
//         case "google":
//         default:
//             return buildGoogleGenerateImagesParams({ ...rest, referenceImages });
//     }
// };

// export const buildGenerateVideosParams = (params: { model: string; } & Omit<GenerateVideosParameters, 'model'>, provider: VideoModelProviderName): GenerateVideosParameters => {
//     switch (provider) {
//         case "ltx":
//             return buildLtxGenerateVideosParams(params);
//         case "google":
//         default:
//             return buildGoogleGenerateVideosParams(params);
//     }
// };
