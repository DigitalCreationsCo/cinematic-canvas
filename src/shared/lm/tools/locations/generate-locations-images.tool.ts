import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { aspectRatios, getExecutionMode, imageMimeType } from "#shared/config.js";
import { IncrementAttemptHook } from "#shared/types/pipeline.types.js";
import { LocationWithAssets } from "#shared/types/workflow.types.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { executeWithRetry } from "#shared/utils/execute-with-retry.js";
import { Modality } from "@google/genai";
import { buildLocationImagePrompt } from "#shared/prompts/location-reference-image.prompt.js";
import { GenerateBatchImagesParameters, UserMessage } from "#shared/lm/provider.js";
import { extractGeneratedResponse } from "#shared/lm/parts-extractor.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

const GenerateLocationImagesInput = z.object({
  locations: z.array(z.object({ id: z.string(), name: z.string(), version: z.number() })),
  generationRules: z.array(z.string()),
  attempt: z.number(),
});
export type GenerateLocationImagesInput = z.infer<typeof GenerateLocationImagesInput>;

export type GenerateLocationImagesResultSuccess = {
  success: true;
  id: string;
  output: string;
  metadata: { model: string; prompt: string };
  entity?: LocationWithAssets;
};

export type GenerateLocationImagesResult =
  | GenerateLocationImagesResultSuccess
  | { success: false; id: string; error: Error };

type GenerateLocationImagesContext = ToolContext<TextModelController> & {
  incrementAttempt: IncrementAttemptHook;
  projectRepository: ProjectRepository;
};

async function persistImageAsset(
  loc: { id: string; version: number },
  gcsUri: string,
  prompt: string,
  context: GenerateLocationImagesContext,
): Promise<void> {
  if (!context.saveAssets) return;
  await context.saveAssets(
    { entityType: "location", entityId: loc.id, projectId: context.projectId } as any,
    ["location_image"],
    "image",
    [gcsUri],
    [{ model: context.provider.imageModel, prompt }],
    true,
  );
}

async function finaliseResults(
  imageResults: GenerateLocationImagesResult[],
  context: GenerateLocationImagesContext,
): Promise<GenerateLocationImagesResult[]> {
  const successes = imageResults.flatMap((r) => (r.success ? [r] : []));
  if (successes.length === 0) return imageResults;

  const updatedEntities = await context.projectRepository.getEntities(
    successes.map((r) => ({ entityId: r.id, entityType: "location" as const, entity: {} })),
  );

  const entityById = new Map(
    updatedEntities.map(({ entity }) => [(entity as LocationWithAssets).id, entity as LocationWithAssets]),
  );

  const enrichedResults: GenerateLocationImagesResult[] = imageResults.map((r) => {
    if (!r.success) return r;
    return { ...r, entity: entityById.get(r.id) };
  });

  if (context.publishPipelineEvent) {
    await context.publishPipelineEvent({
      type: "ENTITY_UPDATED",
      worldId: context.worldId,
      payload: updatedEntities.map(({ entity }) => ({
        id: (entity as LocationWithAssets).id,
        entityType: "location",
        entity: entity as LocationWithAssets,
      })),
    });
  }
  return enrichedResults;
}

async function run(
  params: {
    locations: { id: string; name: string; version: number }[];
    generationRules: string[];
    attempt: number;
    incrementAttempt: IncrementAttemptHook;
  },
  context: GenerateLocationImagesContext,
): Promise<GenerateLocationImagesResult[]> {
  const { projectId, traceId } = context;
  const executionMode = getExecutionMode();

  let imageResults: GenerateLocationImagesResult[] = [];

  if (executionMode === "BATCH") {
    const contextMap = new Map<string, { prompt: string; version: number }>();
    const batchRequests: GenerateBatchImagesParameters["requests"] = params.locations.map((loc) => {
      const prompt = buildLocationImagePrompt(loc as any, params.generationRules);
      contextMap.set(loc.id, { prompt, version: loc.version });
      return {
        messages: [new UserMessage({ content: prompt })],
        metadata: { custom_id: loc.id, version: loc.version, assetKey: "location_image" },
        config: {
          responseModalities: [Modality.IMAGE],
          imageConfig: { ...aspectRatios.widescreen, outputMimeType: imageMimeType },
        },
      };
    });

    try {
      const batchApiResults = await context.provider.generateBatchImages({
        projectId,
        model: context.provider.imageModel,
        requests: batchRequests,
        config: { displayName: `generate_location_images_attempt_${params.attempt}` },
      });

      imageResults = await Promise.all(
        params.locations.map(async (loc): Promise<GenerateLocationImagesResult> => {
          const res = batchApiResults.find((r) => r.customId === loc.id);
          if (!res || res.status !== "SUCCESS")
            return { success: false, id: loc.id, error: res?.error || new Error("Batch failed") };
          const ctx = contextMap.get(loc.id)!;
          const outputPath = context.storageManager.getObjectPath({
            projectId,
            locationId: loc.id,
            type: "location_image",
            version: ctx.version,
          });
          const src = await context.storageManager.uploadBuffer(
            Buffer.from(res.imageBytes!, "base64"),
            outputPath,
            imageMimeType,
          );
          await persistImageAsset(loc, src, ctx.prompt, context);
          return {
            success: true,
            id: loc.id,
            output: src,
            metadata: { prompt: ctx.prompt, model: context.provider.imageModel },
          };
        }),
      );
    } catch (e) {
      return params.locations.map((l) => ({ success: false, id: l.id, error: e as Error }));
    }
  } else {
    // Parallel/Sequential implementation calling generateImages and persistImageAsset per item...
    imageResults = await Promise.all(
      params.locations.map(async (loc) => {
        try {
          const prompt = buildLocationImagePrompt(loc as any, params.generationRules);
          const [imageData] = extractGeneratedResponse(
            "image",
            await executeWithRetry(
              (p) =>
                context.provider.generateImages({
                  prompt: p.prompt,
                  config: { aspectRatio: aspectRatios.widescreen.aspectRatio, outputMimeType: imageMimeType },
                }),
              { prompt },
              { attempt: loc.version, maxRetries: context.safetyRetries, projectId },
              async (err, att, p) => {
                params.incrementAttempt(err.message, "BACKOFF_RETRY");
                return { attempt: att, params: p };
              },
            ),
            "google",
          );
          const imagePath = context.storageManager.getObjectPath({
            type: "location_image",
            projectId,
            locationId: loc.id,
            version: loc.version,
          });
          const gcsUri = await context.storageManager.uploadBuffer(
            Buffer.from(imageData, "base64"),
            imagePath,
            imageMimeType,
          );
          await persistImageAsset(loc, gcsUri, prompt, context);
          return {
            success: true as const,
            id: loc.id,
            output: gcsUri,
            metadata: { prompt, model: context.provider.imageModel },
          };
        } catch (e) {
          return { success: false as const, id: loc.id, error: e as Error };
        }
      }),
    );
  }

  return finaliseResults(imageResults, context);
}

class GenerateLocationImagesTool extends StructuredTool<typeof GenerateLocationImagesInput> {
  name = "generate_location_images";
  description = "Generates location reference images.";
  schema = GenerateLocationImagesInput;
  constructor(
    private readonly deps: { context: GenerateLocationImagesContext },
    params?: ToolParams,
  ) {
    super(params);
  }
  async _call(input: GenerateLocationImagesInput): Promise<string> {
    const res = await this.run(input);
    return JSON.stringify(res);
  }
  async run(input: GenerateLocationImagesInput): Promise<GenerateLocationImagesResult[]> {
    return run({ ...input, incrementAttempt: this.deps.context.incrementAttempt }, this.deps.context);
  }
}

export interface GenerateLocationImagesToolDeps {
  context: GenerateLocationImagesContext;
}

export type { GenerateLocationImagesTool };

export function createGenerateLocationImagesTool(
  deps: GenerateLocationImagesToolDeps,
  params?: ToolParams,
): GenerateLocationImagesTool {
  return new GenerateLocationImagesTool(deps, params);
}
