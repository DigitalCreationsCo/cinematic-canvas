/**
 * lm/utils.ts  — shared model-layer utilities
 *
 * Only provider-agnostic helpers live here.
 *
 * ── What moved ───────────────────────────────────────────────────────────────
 * `toContentsGoogleFromReferenceImages` previously lived here but returned Google
 * Content[] — a provider-specific type. It has been relocated to
 * `google/utils.ts` where it belongs alongside the other Google Content
 * builders (`toContentsGoogleFromReferenceImages`, etc.).
 *
 * If you need it in a shared agent, import from `../lm/google/utils.js`
 * or, better, depend on the provider-agnostic ReferenceImageInputs type and
 * let the Google provider layer handle the conversion.
 */

import { ReferenceImage, ReferenceImageInputs } from "./provider.js";

/**
 * Builds a typed ReferenceImageInputs map from a flat array of ReferenceImages.
 * Provider-agnostic: operates on the shared ReferenceImage type, not on any
 * Google Content or LangChain message type.
 *
 * @example
 * const referenceImages = buildReferenceImageInputs([
 *   characterRef,           // referenceType: 'subject'
 *   locationRef,            // referenceType: 'base'
 *   previousSceneEndFrame,  // referenceType: 'base'
 * ]);
 * // → { subject: [characterRef], base: [locationRef, previousSceneEndFrame] }
 */
export function buildReferenceImageInputs(
    refs: (ReferenceImage | undefined)[]
): ReferenceImageInputs {
    const referenceImages: Partial<ReferenceImageInputs> = {};

    for (const ref of refs) {
        if (!ref) continue;

        const type = ref.referenceType;

        // Ensure the bucket exists
        if (!referenceImages[type]) {
            referenceImages[type] = [] as any;
        }

        // We cast to 'any[]' here because we have already 
        // logically guaranteed the type safety via the 'type' key
        (referenceImages[type] as ReferenceImage[]).push(ref);
    }

    return referenceImages as ReferenceImageInputs;
}