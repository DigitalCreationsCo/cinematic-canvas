import {
    GenerateContentParameters, GenerateImagesParameters, GenerateVideosParameters, GenerateImagesConfig,
    TextModelProviderName,
    VideoModelProviderName,
    ReferenceImage, ReferenceImageInputs
} from "./provider.js";

import {
    buildGenerateContentParams as buildGoogleGenerateContentParams,
    buildGenerateImagesParams as buildGoogleGenerateImagesParams,
    buildGenerateVideosParams as buildGoogleGenerateVideosParams
} from "./google/params.js";

import { HumanMessage } from '@langchain/core/messages';
import type { MessageContentComplex } from '@langchain/core/messages';
import mime from 'mime-types';
import { imageMimeType } from '../config.js';
import {
    buildGenerateVideosParams as buildLtxGenerateVideosParams
} from "./ltx/params.js";


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


/**
 * Converts ReferenceImageInputs to a LangChain HumanMessage[] for use in
 * text/chat model calls that need to see reference images as context.
 *
 * Each reference image becomes one HumanMessage with two content blocks:
 *   - { type: 'text' }      → the filename, so the model can refer to it by name
 *   - { type: 'image_url' } → the GCS URI, passed as gs:// which the
 *                             message-converter maps to a fileData part
 *
 * ── What this is NOT for ─────────────────────────────────────────────────────
 * Do NOT use this for generateBatchImages or generateImages. Those paths require
 * imageConfig and referenceType metadata (mask region, subject type, etc.) that
 * has no LangChain content block equivalent. Use toContentsGoogleFromReferenceImages
 * from google/utils.ts for those paths.
 */
export function toMessagesFromReferenceImages(
    referenceImages: ReferenceImageInputs
): HumanMessage[] {
    return Object.values(referenceImages)
        .flat()
        .filter(u => u?.referenceImage?.gcsUri)
        .map(u => {
            const gcsUri = u!.referenceImage!.gcsUri!;
            const fileName = gcsUri.split('/').at(-1) ?? gcsUri;
            const mimeType = mime.lookup(fileName) || imageMimeType;

            return new HumanMessage({
                content: [
                    {
                        type: 'text',
                        text: fileName,
                    },
                    {
                        type: 'image_url',
                        image_url: { url: gcsUri },
                        // mimeType is carried as additional_kwargs on the message,
                        // not in the content block — LangChain's image_url type has
                        // no mimeType field. The message-converter reads url and
                        // infers fileData from the gs:// prefix.
                    },
                ],
                additional_kwargs: { mimeType },
            });
        });
}