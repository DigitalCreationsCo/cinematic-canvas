import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { aspectRatios, getExecutionMode, imageMimeType } from "#shared/config.js";
import { IncrementAttemptHook } from "#shared/types/pipeline.types.js";
import { CharacterWithAssets } from "#shared/types/workflow.types.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { executeWithRetry } from "#shared/utils/execute-with-retry.js";
import { Modality } from "@google/genai";
import { buildCharacterImagePrompt } from "#shared/prompts/character-reference-image.prompt.js";
import { GenerateBatchImagesParameters, UserMessage } from "#shared/lm/provider.js";
import { extractGeneratedResponse } from "#shared/lm/parts-extractor.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { IdentityBase } from "#shared/types/base.types.js";
import { CharacterAttributes } from "#shared/types/character.types.js";

// ============================================================================
// INPUT
// ============================================================================

const CharacterBaseWithIdAndVersion = CharacterAttributes.extend({ id: IdentityBase.shape.id, version: z.number() });
type CharacterBaseWithIdAndVersion = CharacterAttributes & {
  id: string;
  version: number;
};

const GenerateCharacterImagesInput = z.object({
  characters: z.array(CharacterBaseWithIdAndVersion),
  generationRules: z.array(z.string()),
  attempt: z.number(),
});

export type GenerateCharacterImagesInput = z.infer<typeof GenerateCharacterImagesInput>;

// ============================================================================
// OUTPUT
//
// `entity` is populated whenever projectRepository is available (i.e. when
// called internally from generateCharacters). External callers that don't need
// entity data can continue to rely on `output` (the image URL) as before.
// ============================================================================

export type GenerateCharacterImagesResultSuccess = {
  success: true;
  id: string;
  /** GCS URI / public URL of the generated image */
  output: string;
  entity?: CharacterWithAssets;
  metadata: { model: string; prompt: string };
  /** Full updated character entity — present when projectRepository is injected */
};

export type GenerateCharacterImagesResult =
  | GenerateCharacterImagesResultSuccess
  | { success: false; id: string; error: Error };

// ============================================================================
// INTERNAL CONTEXT TYPE
// Requires projectRepository and publishPipelineEvent so the tool can
// persist image assets and emit ENTITY_UPDATED autonomously.
// ============================================================================

type GenerateCharacterImagesContext = ToolContext<TextModelController> & {
  incrementAttempt: IncrementAttemptHook;
  /** Required to fetch the updated entity after asset persistence */
  projectRepository: ProjectRepository;
};

type ToolResultItem =
  | { success: true; id: string; output: string; metadata: { model: string; prompt: string } }
  | { success: false; id: string; error: string };

function serialiseResults(results: GenerateCharacterImagesResult[]): string {
  const items: ToolResultItem[] = results.map((r) =>
    r.success
      ? { success: true, id: r.id, output: r.output, metadata: r.metadata }
      : { success: false, id: r.id, error: r.error?.message ?? "unknown" },
  );

  const succeeded = items.filter((i) => i.success).length;
  const failed = items.filter((i) => !i.success).length;

  return JSON.stringify({
    summary: { total: items.length, succeeded: succeeded, failed },
    results: items,
  });
}

// ============================================================================
// ASSET PERSISTENCE HELPER
// Called immediately after each successful image upload, inside every
// execution-mode branch, so assets are saved atomically per character.
// ============================================================================

async function persistImageAsset(
  char: CharacterBaseWithIdAndVersion,
  gcsUri: string,
  prompt: string,
  context: GenerateCharacterImagesContext,
): Promise<void> {
  if (!context.saveAssets) return;

  await context.saveAssets(
    { characterIds: [char.id], projectId: context.projectId },
    ["character_image"],
    "image",
    [gcsUri],
    [{ model: context.provider.imageModel, prompt }],
    /* setBest */ true,
  );
}

// ============================================================================
// FINALISE — fetch updated entities for successes, emit ENTITY_UPDATED
// Called at the tail of every execution mode branch so the post-generation
// logic is centralised and not repeated three times.
// ============================================================================

async function finaliseResults(
  imageResults: GenerateCharacterImagesResult[],
  _characters: CharacterBaseWithIdAndVersion[],
  context: GenerateCharacterImagesContext,
): Promise<GenerateCharacterImagesResult[]> {
  const successes = imageResults.filter((r): r is GenerateCharacterImagesResultSuccess => r.success);

  if (successes.length === 0) return imageResults;

  // Fetch the updated entities from DB (assets registry is now populated with the new image)
  const updatedEntities = await context.projectRepository.getEntities(
    successes.map((r) => ({ entityId: r.id, entityType: "character" as const, entity: {} })),
  );

  // Build a lookup so we can attach entity data to each success result
  const entityById = new Map(updatedEntities.map(({ entity }) => [entity.id, entity]));

  // Enrich success results with the full entity
  const enrichedResults: GenerateCharacterImagesResult[] = imageResults.map((r) => {
    if (!r.success) return r;
    const entity = entityById.get(r.id)! as CharacterWithAssets;
    return { ...r, entity };
  });

  // Emit ENTITY_UPDATED for all successfully processed characters
  if (context.publishPipelineEvent) {
    await context.publishPipelineEvent({
      type: "ENTITY_UPDATED",
      worldId: context.worldId,
      payload: updatedEntities.map(({ entity, entityType }) => ({
        id: entity.id,
        entityType,
        entity,
      })),
    });
  }

  return enrichedResults;
}

export interface GenerateCharacterImagesToolDeps {
  context: ToolContext<TextModelController> & {
    incrementAttempt: IncrementAttemptHook;
    projectRepository: ProjectRepository;
  };
}

// ============================================================================
// TOOL CLASS
// _call() is the LangChain string interface — signature/return unchanged.
// run()   is the programmatic interface — input unchanged, return type gains
//         an optional `entity` field on success items.
// ============================================================================

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

  /** LangChain tool interface — returns serialised JSON string. Unchanged. */
  async _call(input: GenerateCharacterImagesInput, _runManager?: CallbackManagerForToolRun): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: GenerateCharacterImagesTool invoked. count: ${input.characters.length}`);

    const generated = await this.run(
      {
        characters: input.characters,
        generationRules: input.generationRules,
        attempt: input.attempt,
      },
    );

    const output = serialiseResults(generated);
    console.log(`${traceId}: GenerateCharacterImagesTool complete.`);
    return output;
  }

  /**
   * Programmatic interface for direct tool-to-tool calls.
   * Input:  GenerateCharacterImagesInput — unchanged; external callers are unaffected.
   * Output: GenerateCharacterImagesResult[] — success items now carry an optional
   *         `entity` field (the full CharacterWithAssets after image asset persistence).
   *         External callers that don't need entity data can ignore the new field.
   */
  async run(
    params: {
      characters: CharacterBaseWithIdAndVersion[];
      generationRules: string[];
      attempt: number;
    },
  ): Promise<GenerateCharacterImagesResult[]> {
    const context = this.context;
    const { projectId, traceId } = context;
    const executionMode = getExecutionMode();

    // ── BATCH ──────────────────────────────────────────────────────────────────
    if (executionMode === "BATCH") {
      console.log(`${traceId}: Batch execution. Generating ${params.characters.length} character images`);

      const contextMap = new Map<string, { character: any; version: number; prompt: string }>();
      const batchRequests: GenerateBatchImagesParameters["requests"] = [];

      for (const char of params.characters) {
        if (!contextMap.has(char.id)) {
          const prompt = buildCharacterImagePrompt(char, params.generationRules);
          contextMap.set(char.id, { character: char, version: char.version, prompt });
        }

        const ctx = contextMap.get(char.id)!;
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

      let batchApiResults: Awaited<ReturnType<typeof context.provider.generateBatchImages>>;
      try {
        batchApiResults = await context.provider.generateBatchImages({
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
      } catch (e) {
        // Entire batch failed — all characters are errors
        return params.characters.map((c) => ({ success: false as const, id: c.id, error: e as Error }));
      }

      // Upload & persist each result atomically
      const imageResults = await Promise.all(
        params.characters.map(async (char): Promise<GenerateCharacterImagesResult> => {
          const res = batchApiResults.find((r) => r.customId === char.id);

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

            // ── Inline asset persistence ──
            await persistImageAsset(char, src, ctx.prompt, context);

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

      return finaliseResults(imageResults, params.characters, context);

      // ── PARALLEL ───────────────────────────────────────────────────────────────
    } else if (executionMode === "PARALLEL") {
      console.log(`${traceId}: Parallel execution. Generating ${params.characters.length} character images`);

      const imageResults = await Promise.all(
        params.characters.map(async (char): Promise<GenerateCharacterImagesResult> => {
          try {
            const prompt = buildCharacterImagePrompt(char, params.generationRules);
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
                  this.incrementAttempt(error.message, "BACKOFF_RETRY");
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

            // ── Inline asset persistence ──
            await persistImageAsset(char, gcsUri, prompt, context);

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

      return finaliseResults(imageResults, params.characters, context);

      // ── SEQUENTIAL ─────────────────────────────────────────────────────────────
    } else {
      console.log(`${traceId}: Sequential execution. Generating ${params.characters.length} character images`);
      const imageResults: GenerateCharacterImagesResult[] = [];

      for (const char of params.characters) {
        try {
          const prompt = buildCharacterImagePrompt(char, params.generationRules);
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
                this.incrementAttempt(error.message, "BACKOFF_RETRY");
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

          // ── Inline asset persistence ──
          await persistImageAsset(char, gcsUri, prompt, context);

          imageResults.push({
            success: true,
            id: char.id,
            output: gcsUri,
            metadata: { prompt, model: context.provider.imageModel },
          });
        } catch (error) {
          imageResults.push({ success: false, id: char.id, error: error as Error });
        }
      }
      return finaliseResults(imageResults, params.characters, context);
    }
  }
}

export type { GenerateCharacterImagesTool };

export function createGenerateCharacterImagesTool(
  deps: GenerateCharacterImagesToolDeps,
  params?: ToolParams,
): GenerateCharacterImagesTool {
  return new GenerateCharacterImagesTool(deps, params);
}
