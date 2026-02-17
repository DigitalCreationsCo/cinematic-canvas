import mime from "mime-types";
import { BatchJob, GoogleGenAI, SubjectReferenceImage, SubjectReferenceType } from "@google/genai";
import { ContentsType, ITextModelProvider, ReferenceImage } from "../provider.js";

export function buildReferenceImageFromParams(refs: Required<Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ]>[ 'referenceImages' ]): any[] {
    return refs.map((ref, index) => {
        const subjectReferenceImage = new SubjectReferenceImage();
        subjectReferenceImage.referenceId = index;
        subjectReferenceImage.referenceImage = {
            gcsUri: ref.referenceImage.gcsUri,
            mimeType: ref.referenceImage.mimeType || "image/png"
        };
        subjectReferenceImage.config = {
            subjectType: SubjectReferenceType[ ref.configuration.subjectType as keyof typeof SubjectReferenceType ] || SubjectReferenceType.SUBJECT_TYPE_DEFAULT,
            subjectDescription: ref.configuration.subjectDescription
        };
        return subjectReferenceImage;
    });
};

export async function pollForBatchJob(
    lm: GoogleGenAI,
    batchJob: BatchJob,
    description: string
): Promise<BatchJob> {
    console.debug({ batchJob }, `Polling for batch job`);

    let currentJob = batchJob;
    const POLLING_INTERVAL = 8000;

    // BUG FIX #5: Added JOB_STATE_CANCELLING to the polling loop guard.
    // Previously, a job in JOB_STATE_CANCELLING would exit the while loop and fall
    // through to the return statement, being silently treated as a success.
    // It must stay in the loop until it reaches a terminal state (SUCCEEDED,
    // FAILED, or CANCELLED), at which point the error check below handles it.
    while (
        currentJob.state === "JOB_STATE_UNSPECIFIED" ||
        currentJob.state === "JOB_STATE_PENDING" ||
        currentJob.state === "JOB_STATE_RUNNING" ||
        currentJob.state === "JOB_STATE_CANCELLING"
    ) {
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
 * Transforms an array of ReferenceImages into a flat array of Content objects,
 * each containing a text part (the filename) and a fileData part (the GCS URI).
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
 * Reverses toContentsFileData: reconstructs ReferenceImage objects from the Content
 * array produced by that function.
 *
 * BUG FIX #4: The previous implementation iterated with a stride of 2 and accessed
 * contents[i].text / contents[i+1].fileData, treating the array as a flat sequence of
 * alternating text-object / fileData-object pairs.  However, toContentsFileData emits
 * Content objects — each with a `parts` array containing BOTH the text part and the
 * fileData part:
 *
 *   [
 *     { parts: [{ text: "filename.png" }, { fileData: { fileUri: "gs://..." } }] },
 *     ...
 *   ]
 *
 * The stride-2 loop therefore read the wrong indices and `.text` / `.fileData` were
 * always undefined, so referenceImages was always empty.
 *
 * Fix: iterate over every Content object and find the parts by type within each one.
 */
export function fromContentsFileData(contents: any[]): ReferenceImage[] {
    const referenceImages: ReferenceImage[] = [];

    for (const content of contents) {
        const parts: any[] = content?.parts ?? [];

        const fileDataPart = parts.find((p: any) => p?.fileData?.fileUri);

        if (fileDataPart) {
            referenceImages.push({
                referenceImage: {
                    gcsUri: fileDataPart.fileData.fileUri,
                }
            } as ReferenceImage);
        }
    }

    return referenceImages;
};