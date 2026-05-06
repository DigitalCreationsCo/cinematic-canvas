import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { aspectRatios, getExecutionMode, imageMimeType } from "#shared/config.js";
import { IncrementAttemptHook } from "#shared/types/pipeline.types.js";
import { Character } from "#shared/types/workflow.types.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { executeWithRetry } from "#shared/utils/execute-with-retry.js";
import { Modality } from "@google/genai";
import { buildCharacterImagePrompt } from "#shared/prompts/character-reference-image.prompt.js";
import { GenerateBatchImagesParameters, UserMessage } from "#shared/lm/provider.js";
import { extractGeneratedResponse } from "#shared/lm/parts-extractor.js";

const GenerateCharacterImagesInput = z.object({
  characters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      version: z.number(),
    }),
  ),
  generationRules: z.array(z.string()),
  attempt: z.number(),
});

export type GenerateCharacterImagesInput = z.input<typeof GenerateCharacterImagesInput>;

export type GenerateCharacterImagesResultSuccess = {
  success: true;
  id: string;
  output: string;
  metadata: { model: string; prompt: string };
};

export type GenerateCharacterImagesResult =
  | GenerateCharacterImagesResultSuccess
  | { success: false; id: string; error: Error };

type ToolResultItem =
  | { success: true; id: string; output: string; metadata: { model: string; prompt: string } }
  | { success: false; id: string; error: string };

function serialiseResults(
  raw: { success: boolean; id: string; output?: string; error?: Error; metadata?: any }[],
): string {
  const items: ToolResultItem[] = raw.map((r) =>
    r.success
      ? { success: true, id: r.id, output: r.output!, metadata: r.metadata! }
      : { success: false, id: r.id, error: r.error?.message ?? "unknown" },
  );

  const succeeded = items.filter((i) => i.success).length;
  const failed = items.filter((i) => !i.success).length;

  return JSON.stringify({
    summary: { total: items.length, succeeded, failed },
    results: items,
  });
}

async function run(
  params: {
    characters: { id: string; name: string; version: number }[];
    generationRules: string[];
    attempt: number;
    incrementAttempt: IncrementAttemptHook;
  },
  context: ToolContext<TextModelController>,
): Promise<GenerateCharacterImagesResult[]> {
  const { projectId, traceId } = context;
  const executionMode = getExecutionMode();

  if (executionMode === "BATCH") {
    console.log(`${traceId}: Batch execution. Generating ${params.characters.length} character images`);

    const contextMap = new Map<string, { character: any; version: number; prompt: string }>();
    const batchRequests: GenerateBatchImagesParameters["requests"] = [];

    for (const char of params.characters) {
      let ctx = contextMap.get(char.id);
      if (!ctx) {
        const prompt = buildCharacterImagePrompt(char as any, params.generationRules);
        ctx = { character: char, version: char.version, prompt };
        contextMap.set(char.id, ctx);
      }

      batchRequests.push({
        messages: [new UserMessage({ content: ctx.prompt })],
        metadata: { custom_id: char.id, version: ctx.version, assetKey: "character_image" },
        config: {
          abortSignal: context.options?.signal,
          candidateCount: 1,
          responseModalities: [Modality.IMAGE],
          imageConfig: { ...aspectRatios.vertical, outputMimeType: imageMimeType },
        },
      });
    }

    if (batchRequests.length === 0) return [];

    try {
      const results = await context.provider.generateBatchImages({
        projectId,
        model: context.provider.imageModel,
        requests: batchRequests,
        config: {
          abortSignal: context.options?.signal,
          dest: {
            gcsUri: context.storageManager.getObjectPath({
              type: "batch-data",
              projectId,
              uniqueId: Date.now().toString(),
            }),
          },
          displayName: `generate_character_images_attempt_${params.attempt}`,
        },
      });

      return Promise.all(
        params.characters.map(async (char) => {
          const res = results.find((r) => r.customId === char.id);

          if (!res) {
            return { success: false as const, id: char.id, error: new Error("Result missing from batch response") };
          }

          if (res.status !== "SUCCESS") {
            return { success: false as const, id: char.id, error: res.error || new Error("Batch generation failed") };
          }

          try {
            const ctx = contextMap.get(char.id)!;
            const imageBuffer = Buffer.from(res.imageBytes!, "base64");
            const outputPath = context.storageManager.getObjectPath({
              projectId,
              characterId: char.id,
              type: "character_image",
              version: ctx.version,
            });
            const src = await context.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);
            return {
              success: true as const,
              id: char.id,
              output: src,
              metadata: { prompt: ctx.prompt, model: context.provider.imageModel },
            };
          } catch (e) {
            return { success: false as const, id: char.id, error: e as Error };
          }
        }),
      );
    } catch (e) {
      return params.characters.map((c) => ({ success: false as const, id: c.id, error: e as Error }));
    }
  } else if (executionMode === "PARALLEL") {
    console.log(`${traceId}: Parallel execution. Generating ${params.characters.length} character images`);

    return Promise.all(
      params.characters.map(async (char) => {
        try {
          const prompt = buildCharacterImagePrompt(char as any, params.generationRules);
          const [imageData] = extractGeneratedResponse(
            "image",
            await executeWithRetry(
              (p) =>
                context.provider.generateImages({
                  prompt: p.prompt,
                  config: {
                    abortSignal: context.options?.signal,
                    numberOfImages: 1,
                    seed: Math.floor(Math.random() * 1000000),
                    aspectRatio: aspectRatios.vertical.aspectRatio,
                    outputMimeType: imageMimeType,
                  },
                }),
              { prompt },
              { attempt: char.version, maxRetries: context.safetyRetries + char.version, projectId },
              async (error, attempt, p) => {
                params.incrementAttempt(error.message, "BACKOFF_RETRY");
                return { attempt, params: p };
              },
            ),
            "google",
          );

          const imageBuffer = Buffer.from(imageData, "base64");
          const imagePath = context.storageManager.getObjectPath({
            type: "character_image",
            projectId,
            characterId: char.id,
            version: char.version,
          });
          const gcsUri = await context.storageManager.uploadBuffer(imageBuffer, imagePath, imageMimeType);
          return {
            success: true as const,
            id: char.id,
            output: gcsUri,
            metadata: { prompt, model: context.provider.imageModel },
          };
        } catch (error) {
          return { success: false as const, id: char.id, error: error as Error };
        }
      }),
    );
  } else {
    console.log(`${traceId}: Sequential execution. Generating ${params.characters.length} character images`);
    const results: Awaited<ReturnType<typeof run>> = [];

    for (const char of params.characters) {
      try {
        const prompt = buildCharacterImagePrompt(char as any, params.generationRules);
        const [imageData] = extractGeneratedResponse(
          "image",
          await executeWithRetry(
            (p) =>
              context.provider.generateImages({
                prompt: p.prompt,
                config: {
                  abortSignal: context.options?.signal,
                  numberOfImages: 1,
                  seed: Math.floor(Math.random() * 1000000),
                  aspectRatio: aspectRatios.vertical.aspectRatio,
                  outputMimeType: imageMimeType,
                },
              }),
            { prompt },
            { attempt: char.version, maxRetries: context.safetyRetries + char.version, projectId },
            async (error, attempt, p) => {
              params.incrementAttempt(error.message, "BACKOFF_RETRY");
              return { attempt, params: p };
            },
          ),
          "google",
        );

        const imageBuffer = Buffer.from(imageData, "base64");
        const imagePath = context.storageManager.getObjectPath({
          type: "character_image",
          projectId,
          characterId: char.id,
          version: char.version,
        });
        const gcsUri = await context.storageManager.uploadBuffer(imageBuffer, imagePath, imageMimeType);
        results.push({
          success: true,
          id: char.id,
          output: gcsUri,
          metadata: { prompt, model: context.provider.imageModel },
        });
      } catch (error) {
        results.push({ success: false, id: char.id, error: error as Error });
      }
    }
    return results;
  }
}

export interface GenerateCharacterImagesToolDeps {
  context: ToolContext<TextModelController> & { incrementAttempt: IncrementAttemptHook };
}

class GenerateCharacterImagesTool extends StructuredTool<typeof GenerateCharacterImagesInput> {
  name = "generate_character_images";
  description = "Generates character portrait images.";
  schema = GenerateCharacterImagesInput;

  private readonly context: GenerateCharacterImagesToolDeps["context"];
  private readonly incrementAttempt: IncrementAttemptHook;

  constructor(deps: GenerateCharacterImagesToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
    this.incrementAttempt = deps.context.incrementAttempt;
  }

  async _call(input: GenerateCharacterImagesInput, _runManager?: CallbackManagerForToolRun): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: GenerateCharacterImagesTool invoked. count: ${input.characters.length}`);

    const generated = await run(
      {
        characters: input.characters,
        generationRules: input.generationRules,
        attempt: input.attempt,
        incrementAttempt: this.incrementAttempt,
      },
      this.context,
    );

    const output = serialiseResults(generated);
    console.log(`${traceId}: GenerateCharacterImagesTool complete.`);
    return output;
  }

  async run(input: GenerateCharacterImagesInput): Promise<GenerateCharacterImagesResult[]> {
    try {
      return await run(
        {
          characters: input.characters,
          generationRules: input.generationRules,
          attempt: input.attempt,
          incrementAttempt: this.incrementAttempt,
        },
        this.context,
      );
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}

export function createGenerateCharacterImagesTool(
  deps: GenerateCharacterImagesToolDeps,
  params?: ToolParams,
): GenerateCharacterImagesTool {
  return new GenerateCharacterImagesTool(deps, params);
}
