
import mime from "mime-types";
import { BatchJob, GoogleGenAI, SubjectReferenceImage, SubjectReferenceType } from "@google/genai";
import { ContentsType, ITextModelProvider, ReferenceImage } from "../provider.js";

export function buildReferenceImageFromParams(refs: Required<Parameters<ITextModelProvider['generateImages']>[0]>['referenceImages']): any[] {
    return refs.map((ref, index) => {
        const subjectReferenceImage = new SubjectReferenceImage();
        subjectReferenceImage.referenceId = index;
        subjectReferenceImage.referenceImage = {
            gcsUri: ref.referenceImage.gcsUri,
            mimeType: ref.referenceImage.mimeType || "image/png"
        };
        subjectReferenceImage.config = {
            subjectType: SubjectReferenceType[ref.configuration.subjectType as keyof typeof SubjectReferenceType] || SubjectReferenceType.SUBJECT_TYPE_DEFAULT,
            subjectDescription: ref.configuration.subjectDescription
        };
        return subjectReferenceImage;
    })
};

export async function pollForBatchJob(
    lm: GoogleGenAI,
    batchJob: BatchJob,
    description: string
): Promise<BatchJob> {
    console.debug({ batchJob }, `Polling for batch job`);

    let currentJob = batchJob;
    const POLLING_INTERVAL = 8000;

    while (currentJob.state === "JOB_STATE_UNSPECIFIED" || currentJob.state === "JOB_STATE_PENDING" || currentJob.state === "JOB_STATE_RUNNING") {
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));

        currentJob = await lm.batches.get({ name: currentJob.name! });
        console.debug({ currentJob }, `Polling for batch job`);
    }

    if (currentJob.state === "JOB_STATE_FAILED" || currentJob.state === "JOB_STATE_CANCELLED") {
        throw new Error(`Batch job ${description} failed with state ${currentJob.state}: ${currentJob.error?.message}`);
    }

    return currentJob;
};

/**
 * Transforms an array of ReferenceImages into a flat array of text and fileData pairs.
 */
export function toContentsFileData(referenceImages: ((Required<Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ]>[ 'referenceImages' ][ number ]) | undefined)[]): ContentsType {
    return referenceImages
        .filter(u => u?.referenceImage?.gcsUri)
        .map((u) => {
            const fileParts = u!.referenceImage!.gcsUri!.split('/')!;
            const displayName = fileParts[ fileParts.length - 1 ];
            const mimeType = mime.lookup(displayName) || 'image/jpeg'; // Fallback to your imageMimeType

            return {
                displayName,
                mimeType,
                fileUri: u!.referenceImage!.gcsUri!,
            };
        })
        .flatMap(({ displayName, ...file }) => [
            {
                parts: [
                    { text: displayName },
                    { fileData: { displayName, ...file } }
                ]
            }
        ]);
};

/**
 * Reverses the flat content array back into an array of ReferenceImage objects.
 */
export function fromContentsFileData(contents: any[]): ReferenceImage[] {
    const referenceImages: ReferenceImage[] = [];

    // Iterate by 2 since the data is flattened into [text, fileData] pairs
    for (let i = 0; i < contents.length; i += 2) {
        const textEntry = contents[ i ];
        const fileEntry = contents[ i + 1 ];

        if (textEntry?.text && fileEntry?.fileData) {
            referenceImages.push({
                referenceImage: {
                    // Reconstruct the gcsUri from the fileData's fileUri
                    gcsUri: fileEntry.fileData.fileUri,
// Note: If your original ReferenceImage had other fields (name, boundingPolys), 
// they are lost in the original transformation and cannot be recovered.
                }
            } as ReferenceImage);
        }
    }

    return referenceImages;
};


// export function referenceImageFrom(entities: Scene[] | Character[] | Location[], assetKeys: AssetKey[], description: string[]): Promise<ReferenceImage[]> {
//     return Promise.all(entities
//         .filter((e, index) => getAllBestAssets(e.assets)[assetKeys[index]]?.data)
//         .map(async (e, index) => {
//             const assets = getAllBestAssets(e.assets);
//             const imageUri = assets[ assetKeys[ index ] ]?.data!;

//             const referenceImage = {
//                 referenceId: "",
//                 referenceType: "",
//                 referenceImage: {
//                     gcsUri: imageUri,
//                     mimeType: (await fetch(imageUri, { method: 'HEAD' })).headers.get('Content-Type') || imageMimeType,
//                 },
//                 configuration: {
//                     subjectType: "SUBJECT_TYPE_DEFAULT",
//                     subjectDescription: description[ index ]
//                 }
//             };
//             return referenceImage;
//         }));
// }
