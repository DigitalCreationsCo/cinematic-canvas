import mime from "mime-types";
import { Content, ITextModelProvider, ReferenceImage, ReferenceImageInputs } from "./provider.js";
import { imageMimeType } from "../config.js";

export function buildReferenceImageInputs(refs: (ReferenceImage | undefined)[]): ReferenceImageInputs {
    const referenceImages: Partial<ReferenceImageInputs> = {};
    refs.forEach((ref) => {
        if (!ref) return;
        if (!referenceImages[ ref.referenceType ]) {
            referenceImages[ ref.referenceType ] = [];
        }
        referenceImages[ ref.referenceType ]!.push(ref as any);
    });
    return referenceImages as ReferenceImageInputs;
}

/**
 * Transforms an array of ReferenceImages into a flat array of Content objects,
 * each containing a text part (the filename) and a fileData part (the GCS URI).
 */
export function toContentsFromReferenceImages(referenceImages: Required<Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ]>[ 'referenceImages' ]): Content[] {

    const contentsResultList: Content[] = [];

    if (!referenceImages) return contentsResultList;

    Object.entries(referenceImages)
        .forEach(([ referenceTypeKey, referenceImageSet ]: [ string, ReferenceImage[] ]) => {
            if (!referenceImageSet) return;

            referenceImageSet.flat().forEach((referenceItem) => {
                if (!referenceItem?.referenceImage?.gcsUri) return;

                const fileParts = referenceItem.referenceImage.gcsUri.split('/');
                const displayName = fileParts[ fileParts.length - 1 ];
                const mimeType = mime.lookup(displayName) || imageMimeType;
                const fileUri = referenceItem.referenceImage.gcsUri;

                contentsResultList.push({
                    role: "user",
                    parts: [
                        { text: displayName },
                        { fileData: { displayName, mimeType, fileUri } }
                    ],
                    imageConfig: (referenceItem as any).config ?? undefined,
                    referenceType: referenceTypeKey as any,
                });
            });
        });

    return contentsResultList;
};