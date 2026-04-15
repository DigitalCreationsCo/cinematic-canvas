import mime from "mime-types";
import { GenerativeResultGenerateComposite, JobGenerateComposite } from "../shared/types/job.types.js";
import { TextModelController } from "../shared/lm/text-model-controller.js";
import { GCPStorageManager } from "../shared/services/storage-manager.js";
import { aspectRatios, imageMimeType } from "../shared/config.js";
import { ReferenceImage } from "../shared/lm/provider.js";
import { buildReferenceImageInputs } from "../shared/lm/utils.js";

// ============================================================================
// INPUT TYPE DETECTION
// ============================================================================

export enum InputType {
  GCS_URI = 'GCS_URI',
  BASE64 = 'BASE64',
  LOCAL_PATH = 'LOCAL_PATH',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Detects whether a string is a GCS URI, base64-encoded image data, or a
 * local file path.  Used so the composite worker can normalise all input
 * sources to a form the image model accepts.
 */
export const detectInputType = (input: string): InputType => {
  if (!input || typeof input !== 'string') return InputType.UNKNOWN;

  if (input.startsWith('gs://')) {
    return InputType.GCS_URI;
  }

  // Data URI (e.g. "data:image/png;base64,…") or raw base64 string
  const base64Regex = /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/;
  const isDataUri = input.startsWith('data:');

  if (isDataUri) {
    const parts = input.split(',');
    if (parts.length > 1 && base64Regex.test(parts[1])) {
      return InputType.BASE64;
    }
  } else if (base64Regex.test(input) && input.length > 16) {
    // Length guard prevents short plain strings from being misidentified
    return InputType.BASE64;
  }

  return InputType.LOCAL_PATH;
};

// ============================================================================
// COMPOSITE GENERATION WORKER
// ============================================================================

/**
 * Worker handler for the GENERATE_COMPOSITE pipeline job.
 *
 * Flow:
 *  1. Resolve every input image source to a form the image model understands
 *     (GCS URI → pass through, base64 → inline bytes, local path → upload to GCS).
 *  2. Build the weighted blend prompt and submit to the image model.
 *  3. Upload each generated output to GCS under the composite_image directory.
 *  4. Return the GCS URIs — the caller (worker-service.ts GENERATE_COMPOSITE
 *     case) is responsible for persisting them via createSaveAssetsCallback.
 *
 * @param job            The GENERATE_COMPOSITE job record (payload consumed directly)
 * @param imageModel     TextModelController used for image generation
 * @param storageManager GCPStorageManager for uploads / URI resolution
 * @returns outputImages   GCS URIs of every generated composite image
 */
export async function processGenerateCompositeJob(
  job: JobGenerateComposite,
  imageModel: TextModelController,
  storageManager: GCPStorageManager
): Promise<GenerativeResultGenerateComposite> {
  const { imageId, inputImages, prompt, negativePrompt, numberOfOutputs } = job.payload;

  console.log(`[GenerateCompositeWorker] Starting job for imageId=${imageId}, projectId=${job.projectId}`);
  console.log(`[GenerateCompositeWorker] ${inputImages.length} input(s), prompt="${prompt}"`);

  // ── Step 1: Resolve input image sources ─────────────────────────────────
  const referenceImagesInputs: ReferenceImage[] = await Promise.all(
    inputImages.map(async (obj) => {
      const inputType = detectInputType(obj.src);

      if (inputType === InputType.BASE64) {
        // Strip data URI header if present
        const rawBytes = obj.src.startsWith('data:')
          ? obj.src.split(',')[1]
          : obj.src;

        return {
          referenceImage: {
            imageBytes: rawBytes,
            mimeType: mime.lookup(obj.assetKey as string) || imageMimeType,
          },
          referenceType: obj.type as any,
        };
      }

      if (inputType === InputType.GCS_URI) {
        return {
          referenceImage: {
            gcsUri: storageManager.getGcsUrl(obj.src),
            mimeType: mime.lookup(obj.src) || imageMimeType,
          },
          referenceType: obj.type as any,
        };
      }

      // LOCAL_PATH / UNKNOWN — upload file to GCS first
      const objectPath = storageManager.getObjectPath({
        type: "image_file",
        projectId: job.projectId,
        imageId,
        version: 1,
      });
      const uploadedGcsUri = await storageManager.uploadFile(obj.src, objectPath);
      return {
        referenceImage: {
          gcsUri: uploadedGcsUri,
          mimeType: mime.lookup(obj.src) || imageMimeType,
        },
        referenceType: obj.type as any,
      };
    })
  );

  // ── Step 2: Generate composite images ────────────────────────────────────
  //
  // Build a prompt that communicates both the creative intent and the per-
  // input blend weights to the model.
  const blendWeightSummary = inputImages
    .map((img, i) => `input-${i + 1}: weight=${img.weight.toFixed(2)}, mode=${img.blendMode}`)
    .join('; ');

  const compositePrompt = [
    `Blend these reference images into a single coherent composition.`,
    `Creative direction: ${prompt}`,
    `Blend specification: ${blendWeightSummary}`,
    ...(negativePrompt ? [`Avoid: ${negativePrompt}`] : []),
  ].join(' ');

  const result = await imageModel.generateImages({
    prompt: compositePrompt,
    referenceImages: buildReferenceImageInputs(referenceImagesInputs),
    config: {
      numberOfImages: numberOfOutputs ?? 1,
      aspectRatio: aspectRatios.widescreen.aspectRatio,
      outputMimeType: imageMimeType,
    },
  });

  if (!result.generatedImages?.length) {
    throw new Error(
      `[GenerateCompositeWorker] Image generation returned no outputs for imageId=${imageId}`
    );
  }

  // ── Step 3: Upload outputs to GCS ────────────────────────────────────────
  const outputImages: GenerativeResultGenerateComposite['data']['outputImages'] = [];

  for (let i = 0; i < result.generatedImages.length; i++) {
    const generatedImageData = result.generatedImages[i].image?.imageBytes;
    if (!generatedImageData) {
      console.warn(`[GenerateCompositeWorker] Output image ${i + 1} has no bytes — skipping`);
      continue;
    }

    const version = i + 1;
    const imageBuffer = Buffer.from(generatedImageData, "base64");
    const objectPath = storageManager.getObjectPath({
      type: "image_file",
      projectId: job.projectId,
      imageId,
      version,
    });

    const gcsUri = await storageManager.uploadBuffer(imageBuffer, objectPath, imageMimeType);
    outputImages.push({ data: gcsUri, version });
    console.log(`[GenerateCompositeWorker] Uploaded output ${i + 1}/${result.generatedImages.length}: ${gcsUri}`);
  }

  if (!outputImages.length) {
    throw new Error(
      `[GenerateCompositeWorker] All generated images were empty for imageId=${imageId}`
    );
  }

  console.log(`[GenerateCompositeWorker] Completed: ${outputImages.length} composite(s) for imageId=${imageId}`);
  return { data: { outputImages }, metadata: { model: imageModel.textModel, attempts: 1, acceptedAttempt: 1 } };
}