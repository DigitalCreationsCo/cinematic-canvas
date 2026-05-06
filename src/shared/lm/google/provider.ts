import {
  GoogleGenAI,
  Part,
  GenerateContentConfig,
  GenerateContentResponse,
  CountTokensParameters as GoogleCountTokensParameters,
  CountTokensResponse,
  GenerateVideosResponse,
  Operation,
  GenerateVideosOperation,
  BatchJob,
  EditImageResponse,
  Modality,
} from "@google/genai";
import path from "path";
import { IVideoModelProvider, ReferenceType } from "#shared/lm/provider.js";
import { ITextModelProvider } from "#shared/lm/provider.js";
import {
  buildBatchParams,
  buildCountTokensParams,
  buildGenerateContentParams,
  buildGenerateVideosParams,
} from "#shared/lm/google/params.js";
import {
  buildAPIReferenceImagesFromParams,
  toReferenceImagesFromContentsFileData,
  toContentsGoogleFromReferenceImages,
  pollForBatchJob,
} from "#shared/lm/google/utils.js";
import { extractGeneratedResponse } from "#shared/lm/parts-extractor.js";
import { GCPStorageManager } from "#shared/services/storage-manager.js";
import { convertMessagesToGoogle } from "#shared/lm/message-converter.js";
import { getExecutionMode } from "#shared/config.js";

// ─── Google-internal content type ────────────────────────────────────────────
//
// Content is the Google GenAI wire format — used internally by this provider
// only. The public ITextModelProvider interface speaks LangChain BaseMessage[].
// Image batch requests are the one exception: they carry Google-specific
// metadata (imageConfig, referenceType) that has no LangChain equivalent,
// so generateBatchImages keeps Content[] in its request schema.

export type Content = {
  role: string;
  parts: Part[];
  imageConfig?: any;
  referenceType?: ReferenceType;
};

export interface GoogleGenerateContentParameters {
  model: string;
  contents: Content[];
  config?: GenerateContentConfig;
}

export interface CountTokensParameters {
  model: string;
  contents: Content[];
  config?: GoogleCountTokensParameters["config"];
}

// ─── Constants ────────────────────────────────────────────────────────────────

// How long to wait after a batch job reports success before reading GCS output.
// Vertex AI transitions to JOB_STATE_SUCCEEDED before output objects are fully
// committed to GCS, so we must give the storage backend time to settle.
const GCS_POST_SUCCESS_SETTLE_MS = 20_000;

const IS_BATCH_MODE = getExecutionMode() === "BATCH";

// ─── GoogleProvider ───────────────────────────────────────────────────────────

export class GoogleProvider implements ITextModelProvider, IVideoModelProvider {
  public lm: GoogleGenAI;
  private sm: GCPStorageManager;

  constructor() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || "your-project-id";
    this.lm = new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location: "global",
    });
    this.sm = new GCPStorageManager(projectId);
  }

  // ── Text generation ───────────────────────────────────────────────────────

  async generateContent(
    params: { model: string } & Parameters<ITextModelProvider["generateContent"]>[0],
  ): Promise<GenerateContentResponse> {
    console.log({ params, provider: "google" }, `Generating content`);
    // buildGenerateContentParams converts BaseMessage[] → Google Content[]
    return this.lm.models.generateContent(buildGenerateContentParams(params));
  }

  // ── Image generation ──────────────────────────────────────────────────────

  async generateImages({
    prompt,
    ...params
  }: { model: string } & Parameters<ITextModelProvider["generateImages"]>[0]): Promise<EditImageResponse> {
    console.log({ params, provider: "google" }, `Generating images`);

    if (params.model.includes("gemini")) {
      const { referenceImages, config, model } = params;
      let contents: Content[] = [{ role: "user", parts: [{ text: prompt }] }];

      if (referenceImages && Object.values(referenceImages).flat().length > 0) {
        const imageInputs = toContentsGoogleFromReferenceImages(referenceImages);
        contents = [...imageInputs, ...contents];
      }

      const { numberOfImages, aspectRatio, outputMimeType, ...restConfig } = config;
      const result = await this.lm.models.generateContent({
        contents,
        model,
        config: {
          ...restConfig,
          candidateCount: 1,
          responseModalities: [Modality.IMAGE],
          imageConfig: { aspectRatio, outputMimeType },
        },
      });

      return {
        generatedImages: (result.candidates ?? []).flatMap((cand) =>
          (cand.content?.parts ?? [])
            .filter((part) => part.inlineData?.data && part.inlineData?.mimeType)
            .map((part) => ({
              image: {
                imageBytes: part.inlineData!.data!,
                mimeType: part.inlineData!.mimeType!,
              },
            })),
        ),
      };
    }

    const { referenceImages, ...restParams } = params;
    if (referenceImages && Object.values(referenceImages).flat().length > 0) {
      return this.lm.models.editImage({
        ...restParams,
        config: { ...restParams.config, addWatermark: false },
        model: "imagen-3.0-capability-001",
        prompt,
        referenceImages: buildAPIReferenceImagesFromParams(referenceImages),
      });
    }

    return this.lm.models.generateImages({
      ...restParams,
      config: { ...restParams.config, addWatermark: false },
      prompt,
    });
  }

  // ── Batch content (LangChain BaseMessage[] interface) ─────────────────────

  async generateBatchContent(
    params: { model: string } & Parameters<ITextModelProvider["generateBatchContent"]>[0],
  ): ReturnType<ITextModelProvider["generateBatchContent"]> {
    console.log({ params, provider: "google" }, `Generating batch content`);

    if (this.isGeminiModel(params.model) && IS_BATCH_MODE) {
      // buildBatchParams converts BaseMessage[] → Google Content[] per
      // request before serialising to JSONL for the native batch API.
      const batchJob = await this.executeNativeBatch(buildBatchParams(params));

      if (batchJob.error) {
        return params.requests.map((req) => ({
          customId: req.metadata.custom_id,
          version: req.metadata.version,
          assetKey: req.metadata.assetKey,
          status: "FAILED" as const,
          error: batchJob.error,
        }));
      }

      if (batchJob.dest?.inlinedResponses) {
        return (batchJob.dest.inlinedResponses ?? []).flatMap(({ response }, index) =>
          extractGeneratedResponse("text", response!, "google").map((text) => ({
            customId: params.requests[index].metadata.custom_id,
            version: params.requests[index].metadata.version,
            text,
            assetKey: params.requests[index].metadata.assetKey,
            status: "SUCCESS" as const,
          })),
        );
      }

      // BUG FIX #2 (race condition): Vertex AI marks a job JOB_STATE_SUCCEEDED
      // before all output objects are durably visible in GCS.
      await new Promise((resolve) =>
        setTimeout((success) => {
          console.debug("Awaiting job output object put");
          resolve(success);
        }, GCS_POST_SUCCESS_SETTLE_MS),
      );

      return this.sm.processTextBatchResult(params.projectId, batchJob.dest!.gcsUri!);
    }

    return this.executeSimulatedContentBatch(params);
  }

  // ── Batch images (Google Content[] interface) ─────────────────────────────
  //
  // Image batch requests carry Google-specific metadata (imageConfig,
  // referenceType) for image editing and reference composition. There is no
  // LangChain equivalent for these fields, so this method operates on Google
  // Content[] directly rather than LangChain BaseMessage[].

  async generateBatchImages(
    params: { model: string } & Parameters<ITextModelProvider["generateBatchImages"]>[0],
  ): ReturnType<ITextModelProvider["generateBatchImages"]> {
    console.log({ params, provider: "google" }, `Generating batch images`);

    if (this.isGeminiModel(params.model) && IS_BATCH_MODE) {
      const batchJob = await this.executeNativeBatch(buildBatchParams(params));

      if (batchJob.error) {
        return params.requests.map((req) => ({
          customId: req.metadata.custom_id,
          version: req.metadata.version,
          assetKey: req.metadata.assetKey,
          status: "FAILED" as const,
          error: batchJob.error,
        }));
      }

      if (batchJob.dest?.inlinedResponses) {
        return (batchJob.dest.inlinedResponses ?? []).flatMap(({ response }, index) =>
          extractGeneratedResponse("image", response!, "google").map((imageBytes) => ({
            customId: params.requests[index].metadata.custom_id,
            version: params.requests[index].metadata.version,
            assetKey: params.requests[index].metadata.assetKey,
            status: "SUCCESS" as const,
            imageBytes,
          })),
        );
      }

      await new Promise((resolve) => setTimeout(resolve, GCS_POST_SUCCESS_SETTLE_MS));
      return this.sm.processBatchImageResult(params.projectId, batchJob.dest!.gcsUri!);
    }

    return this.executeSimulatedImagesBatch(params);
  }

  // ── Video generation ──────────────────────────────────────────────────────

  async generateVideos(
    params: { model: string } & Parameters<IVideoModelProvider["generateVideos"]>[0],
  ): Promise<GenerateVideosOperation> {
    console.log({ params, provider: "google" }, `Generating videos`);
    return this.lm.models.generateVideos(buildGenerateVideosParams(params));
  }

  async getVideosOperation(
    params: Parameters<IVideoModelProvider["getVideosOperation"]>[0],
  ): Promise<Operation<GenerateVideosResponse>> {
    console.log({ params, provider: "google" }, `Getting videos operation`);
    return this.lm.operations.getVideosOperation(params);
  }

  // ── Token counting ────────────────────────────────────────────────────────

  async countTokens(params: Parameters<ITextModelProvider["countTokens"]>[0]): Promise<CountTokensResponse> {
    console.log({ params, provider: "google" }, `Counting tokens`);
    // buildCountTokensParams converts BaseMessage[] → Google Content[]
    return this.lm.models.countTokens(buildCountTokensParams(params));
  }

  // ── Batch job status ──────────────────────────────────────────────────────

  async getBatchJob(params: Parameters<ITextModelProvider["getBatchJob"]>[0]): Promise<BatchJob> {
    console.log({ params, provider: "google" }, `Getting batch job`);
    return this.lm.batches.get(params);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private isGeminiModel = (model: string) => model.includes("gemini");

  private async executeNativeBatch(
    params: { model: string; requests: string } & Omit<
      Parameters<ITextModelProvider["generateBatchContent"]>[0],
      "requests"
    >,
  ): Promise<BatchJob> {
    console.log({ params, provider: "google" }, `Executing native batch`);

    const uniqueId = Date.now().toString();
    const displayName = params.config?.displayName || `batch-${uniqueId}`;

    const inputPath = this.sm.getObjectPath({
      type: "batch-data",
      projectId: params.projectId,
      uniqueId,
    });

    const inputGcsUri = await this.sm.uploadJSONL(params.requests, inputPath);
    const { bucketName, fileName: inputFile } = this.sm.parseGcsUri(inputGcsUri);
    const batchDirectory = path.posix.dirname(inputFile);
    const destGcsUri = `gs://${bucketName}/${batchDirectory}/results`;

    console.debug({ inputGcsUri, destGcsUri, projectId: params.projectId }, "Initializing Vertex AI Batch Job");

    const batchJob = await this.lm.batches.create({
      model: params.model,
      src: { format: "jsonl", gcsUri: [inputGcsUri] },
      config: {
        ...params.config,
        // BUG FIX #1: dest must be set — without it batchJob.dest is
        // undefined and result processing throws immediately.
        dest: { format: "jsonl", gcsUri: destGcsUri },
        displayName,
      },
    });

    return pollForBatchJob(this.lm, batchJob, this.sm, { description: displayName });
  }

  /**
   * Simulated batch for content (text) generation.
   * Requests carry LangChain BaseMessage[] — passed directly to generateContent
   * which handles conversion via buildGenerateContentParams.
   */
  private async executeSimulatedContentBatch(
    params: { model: string } & Parameters<ITextModelProvider["generateBatchContent"]>[0],
  ): ReturnType<ITextModelProvider["generateBatchContent"]> {
    console.log(
      { paramsProvider: "google", countRequests: params.requests.length },
      `Executing staggered simulated content batch`,
    );

    const { model, requests } = params;
    const delayStaggerBaseMs = 1500;

    const results = await Promise.all(
      requests.map(async (reqCurrent, indexReq) => {
        await new Promise((resolve) => setTimeout(resolve, indexReq * delayStaggerBaseMs));
        try {
          // reqCurrent.messages is BaseMessage[] — generateContent
          // converts it internally via buildGenerateContentParams.
          const response = await this.generateContent({
            model,
            messages: reqCurrent.messages,
            config: reqCurrent.config,
          });

          return extractGeneratedResponse("text", response, "google").map((text) => ({
            customId: reqCurrent.metadata.custom_id,
            version: reqCurrent.metadata.version,
            assetKey: reqCurrent.metadata.assetKey,
            status: "SUCCESS" as const,
            text,
          }));
        } catch (error) {
          console.error(
            { customId: reqCurrent.metadata.custom_id, errorMsg: (error as Error).message },
            `Individual simulated content request failed.`,
          );
          return [
            {
              customId: reqCurrent.metadata.custom_id,
              version: reqCurrent.metadata.version,
              assetKey: reqCurrent.metadata.assetKey,
              status: "FAILED" as const,
              error,
            },
          ];
        }
      }),
    );

    return results.flat();
  }

  /**
   * Simulated batch polymorph for models that don't support batching for image generation.
   *
   * Image batch requests use Google Content[] (not LangChain BaseMessage[])
   * because they carry imageConfig and referenceType metadata for image
   * editing and reference composition that has no LangChain equivalent.
   *
   * Each request's contents are partitioned into:
   *   - imageContents  → reconstructed as ReferenceImages for the image API
   *   - textContents   → primary prompt text extracted from parts
   */
  private async executeSimulatedImagesBatch(
    params: { model: string } & Parameters<ITextModelProvider["generateBatchImages"]>[0],
  ): ReturnType<ITextModelProvider["generateBatchImages"]> {
    console.log(
      { paramsProvider: "google", countRequests: params.requests.length },
      `Executing staggered simulated image batch`,
    );

    const { model, requests } = params;
    const delayStaggerBaseMs = 1500;

    const results = await Promise.all(
      requests.map(async (req, indexReq) => {
        const reqToContents = convertMessagesToGoogle(req.messages);

        try {
          // Transform and partition message content[] into image-reference entries (have imageConfig)
          // and text prompt entries (have text parts, no imageConfig).
          const { imageContents, textContents } = reqToContents.contents.reduce(
            (acc, content) => {
              const hasImageConfig = !!content.imageConfig;
              const hasText = content.parts?.some((p) => p.text) && !hasImageConfig;

              if (hasImageConfig) {
                acc.imageContents.push(
                  content as Content & {
                    imageConfig: any;
                    referenceType: "base" | "mask" | "control" | "style" | "subject" | "content";
                  },
                );
              } else if (hasText) {
                acc.textContents.push(content);
              }
              return acc;
            },
            {
              imageContents: [] as (Content & {
                imageConfig: any;
                referenceType: "base" | "mask" | "control" | "style" | "subject" | "content";
              })[],
              textContents: [] as Content[],
            },
          );

          const primaryTextPart = textContents[0]?.parts?.find((p) => p.text);
          const prompt = primaryTextPart?.text ?? "";

          // Reconstruct ReferenceImages from the Content entries produced
          // by toContentsGoogleFromReferenceImages (BUG FIX #4 applies here).
          const referenceImages = toReferenceImagesFromContentsFileData({
            contents: imageContents,
          });

          const response = await this.generateImages({
            model,
            prompt,
            config: req.config!,
            referenceImages,
          });

          return extractGeneratedResponse("image", response, "google").map((imageBytes) => ({
            customId: req.metadata.custom_id,
            version: req.metadata.version,
            assetKey: req.metadata.assetKey,
            status: "SUCCESS" as const,
            imageBytes,
          }));
        } catch (error) {
          console.error(
            { customId: req.metadata.custom_id, errorMsg: (error as Error).message },
            `Individual simulated image request failed.`,
          );
          return [
            {
              customId: req.metadata.custom_id,
              version: req.metadata.version,
              assetKey: req.metadata.assetKey,
              status: "FAILED" as const,
              error,
            },
          ];
        }
      }),
    );

    return results.flat();
  }
}

export type * from "@google/genai";
export * from "@google/genai";
