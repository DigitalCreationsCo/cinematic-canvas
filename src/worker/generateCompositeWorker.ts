import mime from "mime-types";
import { JobGenerateComposite } from "../shared/types/job.types.js";
import { TextModelController } from "../shared/lm/text-model-controller.js";
import { GCPStorageManager } from "../shared/services/storage-manager.js";
import { aspectRatios, imageMimeType } from "../shared/config.js";
import { VideoGenerationReferenceType } from "@google/genai";
import { ReferenceImage } from "../shared/lm/provider.js";
import { buildReferenceImageInputs } from "../shared/lm/utils.js";

export enum InputType {
  GCS_URI = 'GCS_URI',
  BASE64 = 'BASE64',
  LOCAL_PATH = 'LOCAL_PATH',
  UNKNOWN = 'UNKNOWN'
}

export const detectInputType = (input: string): InputType => {
  if (!input || typeof input !== 'string') return InputType.UNKNOWN;

  // Check for Google Cloud Storage URI
  if (input.startsWith('gs://')) {
    return InputType.GCS_URI;
  }

  // Check for Base64 (matches Data URI or raw Base64 strings)
  const base64Regex = /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/;
  const isDataUri = input.startsWith('data:');

  if (isDataUri) {
    const parts = input.split(',');
    if (parts.length > 1 && base64Regex.test(parts[1])) {
      return InputType.BASE64;
    }
  } else if (base64Regex.test(input) && input.length > 16) {
    // Length check prevents short normal strings from being misidentified
    return InputType.BASE64;
  }

  // Fallback to local path if it's a valid-looking string
  return InputType.LOCAL_PATH;
};

/**
 * Worker handler for the GENERATE_COMPOSITE pipeline job.
 * 
 * 1. Downloads all input base64/GCS references from the payload.
 * 2. Merges them into a single composition prompt or sends them to an image-to-image 
 *    model capable of handling multiple inputs via IPAdapter/ControlNet.
 * 3. Uploads the final composite to a GCS Path (`composite_image/` dir).
 * 4. Pushes the GCS location back to the job result database payload.
 */
export async function processGenerateCompositeJob(
  job: JobGenerateComposite,
  imageModel: TextModelController,
  storageManager: GCPStorageManager
): Promise<{ outputUrls: string[]; }> {
  console.log(`[GenerateCompositeWorker] Starting job for image ${job.payload.imageId}`);
  console.log(`[GenerateCompositeWorker] Provided ${job.payload.inputImages.length} inputs`);
  console.log(`[GenerateCompositeWorker] Prompt: "${job.payload.prompt}"`);

  try {
    const referenceImagesInputs: ReferenceImage[] = await Promise.all(job.payload.inputImages.map(async obj => ({
      referenceImage: detectInputType(obj.src) === InputType.BASE64 ? {
        imageBytes: obj.src,
        mimeType: mime.lookup(obj.src) || imageMimeType,
      } : detectInputType(obj.src) === InputType.GCS_URI ? {
        gcsUri: storageManager.getGcsUrl(obj.src),
        mimeType: mime.lookup(obj.src) || imageMimeType,
      } : {
        gcsUri: await storageManager.uploadFile(obj.src, storageManager.getObjectPath({
          type: "image_file",
          projectId: job.projectId,
          imageId: job.payload.imageId,
          version: 1
        })),
        mimeType: mime.lookup(obj.src) || imageMimeType,
      },
      referenceType: obj.type as any
    })));

    const result = await imageModel.generateImages({
      prompt: `Blend these images with focus on: ${job.payload.prompt}. Blend weights: ${job.payload.inputImages.map(img => img.weight).join(", ")}`,
      referenceImages: buildReferenceImageInputs(referenceImagesInputs),
      config: {
        numberOfImages: job.payload.numberOfOutputs || 1,
        aspectRatio: aspectRatios.widescreen.aspectRatio,
        outputMimeType: imageMimeType,
      }
    });

    if (!result.generatedImages?.length) {
      throw new Error("Image generation failed to return any composite images.");
    }

    const outputUrls: string[] = [];
    for (let i = 0; i < result.generatedImages.length; i++) {
      const generatedImageData = result.generatedImages[i].image?.imageBytes;
      if (!generatedImageData) continue;

      const imageBuffer = Buffer.from(generatedImageData, "base64");
      const objectPath = storageManager.getObjectPath({
        type: "image_file",
        projectId: job.projectId,
        imageId: job.payload.imageId,
        version: i + 1
      });

      const gcsUrl = await storageManager.uploadBuffer(imageBuffer, objectPath, imageMimeType);
      outputUrls.push(gcsUrl);
    }

    console.log(`[GenerateCompositeWorker] Uploaded ${outputUrls.length} composites successfully.`);
    return { outputUrls };

  } catch (error: any) {
    console.error(`[GenerateCompositeWorker] Failed: ${error.message}`);
    throw error;
  }
}
