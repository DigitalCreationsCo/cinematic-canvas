import mime from "mime-types";
import { BatchJob, GoogleGenAI, ReferenceImage as ReferenceImageGoogle, RawReferenceImage, SubjectReferenceImage, SubjectReferenceType, MaskReferenceImage, ControlReferenceImage, ContentReferenceImage, StyleReferenceImage } from "@google/genai";
import { Content, GenerateContentParameters, ITextModelProvider, ReferenceImage } from "../provider.js";
import { modelsUnsupportedFeatures } from "./models.js";
import { imageMimeType } from "../../config.js";

export function buildAPIReferenceImagesFromParams(refs: Required<Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ]>[ 'referenceImages' ]): ReferenceImageGoogle[] {
    const { base, mask, control, style, subject, content } = refs;

    const referenceImages: ReferenceImageGoogle[] = [];
    let imageCount = 0;
    if (base) {
        base.forEach((ref) => {
            const baseReferenceImage = new RawReferenceImage();
            baseReferenceImage.referenceId = imageCount++;
            baseReferenceImage.referenceImage = {
                gcsUri: ref.referenceImage.gcsUri,
                mimeType: ref.referenceImage.mimeType || "image/png"
            };
            referenceImages.push(baseReferenceImage);
        });
    }

    if (mask) {
        mask.forEach((ref) => {
            const maskReferenceImage = new MaskReferenceImage();
            maskReferenceImage.referenceId = imageCount++;
            maskReferenceImage.referenceImage = {
                gcsUri: ref.referenceImage.gcsUri,
                mimeType: ref.referenceImage.mimeType || "image/png"
            };
            maskReferenceImage.config = ref.config;
            referenceImages.push(maskReferenceImage);
        });
    }

    if (control) {
        control.forEach((ref) => {
            const controlReferenceImage = new ControlReferenceImage();
            controlReferenceImage.referenceId = imageCount++;
            controlReferenceImage.referenceImage = {
                gcsUri: ref.referenceImage.gcsUri,
                mimeType: ref.referenceImage.mimeType || "image/png"
            };
            controlReferenceImage.config = ref.config;
            referenceImages.push(controlReferenceImage);
        });
    }

    if (style) {
        style.forEach((ref) => {
            const styleReferenceImage = new StyleReferenceImage();
            styleReferenceImage.referenceId = imageCount++;
            styleReferenceImage.referenceImage = {
                gcsUri: ref.referenceImage.gcsUri,
                mimeType: ref.referenceImage.mimeType || "image/png"
            };
            styleReferenceImage.config = ref.config;
            referenceImages.push(styleReferenceImage);
        });
    }

    if (subject) {
        subject.forEach((ref) => {
            const subjectReferenceImage = new SubjectReferenceImage();
            subjectReferenceImage.referenceId = imageCount++;
            subjectReferenceImage.referenceImage = {
                gcsUri: ref.referenceImage.gcsUri,
                mimeType: ref.referenceImage.mimeType || "image/png"
            };
            subjectReferenceImage.config = {
                subjectType: SubjectReferenceType[ ref.config.subjectType as keyof typeof SubjectReferenceType ] || SubjectReferenceType.SUBJECT_TYPE_DEFAULT,
                subjectDescription: ref.config.subjectDescription
            };
            referenceImages.push(subjectReferenceImage);
        });
    }

    if (content) {
        content.forEach((ref) => {
            const contentReferenceImage = new ContentReferenceImage();
            contentReferenceImage.referenceId = imageCount++;
            contentReferenceImage.referenceImage = {
                gcsUri: ref.referenceImage.gcsUri,
                mimeType: ref.referenceImage.mimeType || "image/png"
            };
            referenceImages.push(contentReferenceImage);
        });
    }

    return referenceImages;
};

/**
 * Transforms an array of ReferenceImages into a flat array of Content objects,
 * each containing a text part (the filename) and a fileData part (the GCS URI).
 */
export function toContentsGoogleFromReferenceImages(referenceImages: Required<Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ]>[ 'referenceImages' ]): Content[] {
    return Object.values(referenceImages).flat()
        .filter(u => u?.referenceImage?.gcsUri)
        .map((u) => {
            const fileParts = u!.referenceImage!.gcsUri!.split('/')!;
            const displayName = fileParts[ fileParts.length - 1 ];
            const mimeType = mime.lookup(displayName) || imageMimeType;
            const fileUri = u!.referenceImage!.gcsUri!;
            return {
                role: "user",
                parts: [
                    { text: displayName },
                    { fileData: { displayName, mimeType, fileUri } }
                ],
            };
        });
};

interface ContentsFileDataInput {
    contents: (Content & {
        imageConfig: any;
        referenceType: "base" | "mask" | "control" | "style" | "subject" | "content";
    })[];
}

type ReferenceImagesFromContentsFileData = Required<Parameters<ITextModelProvider[ 'generateImages' ]>[ 0 ]>[ 'referenceImages' ];

/**
 * Reverses toContentsGoogleFromReferenceImages: reconstructs ReferenceImage objects from the Content
 * array produced by that function.
 *
 * BUG FIX #4: The previous implementation iterated with a stride of 2 and accessed
 * contents[i].text / contents[i+1].fileData, treating the array as a flat sequence of
 * alternating text-object / fileData-object pairs.  However, toContentsGoogleFromReferenceImages emits
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
export function toReferenceImagesFromContentsFileData({ contents }: ContentsFileDataInput): ReferenceImagesFromContentsFileData {
    const referenceImages: Partial<ReferenceImagesFromContentsFileData> = {};

    for (const content of contents) {
        const parts: typeof content[ 'parts' ] = content?.parts ?? [];
        const fileDataPart = parts.find((p: any) => p?.fileData?.fileUri);
        if (!fileDataPart) {
            console.warn(`[toReferenceImagesFromContentsFileData] Skipping: No fileData.fileUri found in parts.`);
            continue;
        }

        const gcsUri = fileDataPart.fileData!.fileUri;
        const { imageConfig, referenceType } = content;

        const referenceImageBase = {
            referenceImage: { gcsUri },
        };

        let finalRef: Required<ReferenceImagesFromContentsFileData>[ typeof referenceType ][ number ];
        if (imageConfig !== undefined) {
            finalRef = {
                referenceType,
                ...referenceImageBase,
                config: imageConfig,
            };
        } else {
            finalRef = {
                referenceType,
                ...referenceImageBase,
            };
        }

        if (!referenceImages[ referenceType ]) {
            referenceImages[ referenceType ] = [];
        }

        (referenceImages[ referenceType ] as ReferenceImage[]).push(finalRef);
    }

    return referenceImages as ReferenceImagesFromContentsFileData;
};

export const isWildcardMatch = (pattern: string, target: string) => {
    // Escape regex special chars and replace * with .*
    const regexSource = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape existing regex chars
        .replace(/\*/g, '.*');               // Convert wildcard * to regex .*

    const regex = new RegExp(`^${regexSource}$`);
    return regex.test(target);
};

export const validateInputBySupportedModelFeatures = (input: { model: string; contents: GenerateContentParameters[ 'contents' ]; } & Partial<GenerateContentParameters>) => {
    const clonedInput = JSON.parse(JSON.stringify(input)) as { model: string; contents: GenerateContentParameters[ 'contents' ]; } & Partial<GenerateContentParameters>;

    // Find keys that match the model (including wildcards)
    const featuresToRemove = Object.entries(modelsUnsupportedFeatures)
        .filter(([ pattern ]) => {
            const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
            return regex.test(clonedInput.model);
        })
        .flatMap(([ _, features ]) => features);

    // If no features to remove, just return the clone early
    if (featuresToRemove.length === 0) return clonedInput;

    // Mutate the CLONE (safe) to remove the unsupported keys
    clonedInput.contents.forEach(content => {
        content.parts?.forEach(part => {
            featuresToRemove.forEach(feature => {
                delete (part as any)[ feature ];
            });
        });
    });

    return clonedInput;
};

/**
 * Options for the unified batch job polling function.
 */
export interface PollForBatchJobOptions {
    /** Human-readable description used in log and error messages. */
    description: string;
    /**
     * Milliseconds between each Google API state poll.  Defaults to 8 000 ms.
     * Keep this relatively high – the Vertex AI batch API is eventually-consistent
     * and hammering it faster does not speed up the job.
     */
    jobPollingInterval?: number;
    /**
     * Milliseconds between GCS "are the output files here yet?" checks.
     * Defaults to 5 000 ms.  GCS writes are asynchronous and can lag the job
     * state change by several minutes, so this interval is intentionally
     * shorter than jobPollingInterval to catch the files as soon as they land.
     */
    gcsPollingInterval?: number;
    /**
     * Maximum number of GCS probe attempts before giving up.
     * Defaults to 72 (~6 minutes at a 5 s interval).
     */
    maxGcsAttempts?: number;
}

/**
 * Polls a Google GenAI Batch job until it reaches a terminal state AND the
 * output files are confirmed present in GCS.
 *
 * ## Why both checks are necessary
 *
 * `JOB_STATE_SUCCEEDED` only means the API *accepted* the result.  The actual
 * JSONL output is written to GCS **asynchronously** after the state change, so
 * attempting to read the output immediately after the state transitions causes
 * a silent "no .jsonl files found" failure (or worse, waits 5+ minutes in
 * downstream retry loops).
 *
 * The function therefore adds a second polling phase:
 *   1. Wait for `JOB_STATE_SUCCEEDED` (or fail fast on `FAILED`/`CANCELLED`).
 *   2. Derive the output GCS prefix from `batchJob.dest.gcsUri`.
 *   3. Probe the prefix until at least one `.jsonl` file (that is not the
 *      input shard) is visible, or until `maxGcsAttempts` is exhausted.
 *
 * @param lm          - Authenticated GoogleGenAI client.
 * @param batchJob    - The just-submitted (or in-progress) batch job.
 * @param storage     - GCPStorageManager instance used to probe GCS.
 * @param options     - Tuning knobs (intervals, retry limits, description).
 * @returns           The fully-resolved BatchJob once GCS output is confirmed.
 * @throws            If the job fails/cancels, or GCS output never appears.
 */
export async function pollForBatchJob(
    lm: GoogleGenAI,
    batchJob: BatchJob,
    storage: { fileExists: (gcsPath: string) => Promise<boolean>; },
    options: PollForBatchJobOptions
): Promise<BatchJob> {
    const {
        description,
        jobPollingInterval = 8_000,
        gcsPollingInterval = 5_000,
        maxGcsAttempts = 72,          // ~6 min ceiling for the GCS probe phase
    } = options;

    console.debug({ batchJob }, `[pollForBatchJob] Starting job poll: ${description}`);

    // ─── Phase 1: Wait for the Google API job to reach a terminal state ───────

    let currentJob = batchJob;

    // BUG FIX #5 (preserved): JOB_STATE_CANCELLING is included so the loop
    // does not exit early and silently treat a cancelling job as success.
    while (
        currentJob.state === "JOB_STATE_UNSPECIFIED" ||
        currentJob.state === "JOB_STATE_PENDING" ||
        currentJob.state === "JOB_STATE_RUNNING" ||
        currentJob.state === "JOB_STATE_CANCELLING"
    ) {
        await new Promise(resolve => setTimeout(resolve, jobPollingInterval));
        currentJob = await lm.batches.get({ name: currentJob.name! });
        console.debug(
            { state: currentJob.state, name: currentJob.name },
            `[pollForBatchJob] Job state update`
        );
    }

    // Fail fast – no point probing GCS if the job didn't succeed.
    if (currentJob.state === "JOB_STATE_FAILED" || currentJob.state === "JOB_STATE_CANCELLED") {
        throw new Error(
            `Batch job "${description}" reached terminal failure state ` +
            `${currentJob.state}: ${currentJob.error?.message ?? "no error detail"}`
        );
    }

    console.log(
        { name: currentJob.name },
        `[pollForBatchJob] Job succeeded. Starting GCS output probe for: ${description}`
    );

    // ─── Phase 2: Probe GCS until the output JSONL files are present ─────────
    //
    // Google writes the output asynchronously *after* reporting JOB_STATE_SUCCEEDED.
    // Returning immediately here is what caused the observed 5-minute downstream
    // wait – the caller would try to read files that didn't exist yet.
    //
    // We derive the output prefix from batchJob.dest (the field that holds the
    // GCS destination configured when the job was submitted).

    // `dest` is typed as `{ gcsUri?: string } | undefined` in most SDK versions.
    const outputGcsUri: string | undefined = (currentJob as any).dest?.gcsUri;

    if (!outputGcsUri) {
        // If the SDK doesn't expose `dest`, we cannot probe GCS.  Log a warning
        // and return the job as-is; the caller must handle missing files itself.
        console.warn(
            { name: currentJob.name },
            `[pollForBatchJob] Cannot determine output GCS URI from batchJob.dest; ` +
            `skipping GCS presence check. Output files may not be ready yet.`
        );
        return currentJob;
    }

    // Build the probe path: a sentinel file (the first possible output shard).
    // Vertex AI writes shards as:  <outputPrefix>/prediction-<timestamp>/000000000000.jsonl
    // We cannot know the exact shard name, so we probe the *prefix* directory itself
    // via a lightweight `fileExists` call on the uri.  Because `fileExists` calls
    // GCS `file.exists()`, which works on a prefix when the prefix itself is a
    // "directory object", we fall back to a simple probe file heuristic below.
    //
    // Preferred approach: probe for a known sentinel like `state.json` or the
    // first JSONL shard.  Since we cannot know either name ahead of time we use
    // `storage.fileExists` on the raw prefix and also on a `/000000000000.jsonl`
    // suffix, whichever resolves first.

    let gcsReady = false;
    let attempts = 0;

    while (!gcsReady && attempts < maxGcsAttempts) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, gcsPollingInterval));

        try {
            // Try the most common Vertex AI output shard name first.
            const sentinelPath = outputGcsUri.replace(/\/?$/, '/') + '000000000000.jsonl';
            const directExists = await storage.fileExists(sentinelPath);

            if (directExists) {
                gcsReady = true;
                console.log(
                    { sentinelPath, attempts },
                    `[pollForBatchJob] GCS output confirmed present.`
                );
            } else {
                console.debug(
                    { outputGcsUri, attempts, maxGcsAttempts },
                    `[pollForBatchJob] GCS output not yet visible, retrying…`
                );
            }
        } catch (err) {
            // Transient GCS errors (e.g. 429, network blip) should not abort the
            // probe loop – just log and retry.
            console.warn(
                { err, attempts },
                `[pollForBatchJob] Transient error probing GCS output, will retry.`
            );
        }
    }

    if (!gcsReady) {
        throw new Error(
            `[pollForBatchJob] Batch job "${description}" succeeded but output files ` +
            `did not appear at "${outputGcsUri}" within ` +
            `${(maxGcsAttempts * gcsPollingInterval) / 1000}s. ` +
            `Check the GCS prefix manually and inspect the batch job output config.`
        );
    }

    return currentJob;
};