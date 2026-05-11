import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { aspectRatios, getExecutionMode, imageMimeType } from "#shared/config.js";
import { IncrementAttemptHook } from "#shared/types/pipeline.types.js";
import { PropWithAssets } from "#shared/types/workflow.types.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { executeWithRetry } from "#shared/utils/execute-with-retry.js";
import { Modality } from "@google/genai";
import { buildPropImagePrompt } from "#shared/prompts/prop-reference-image.prompt.js";
import { GenerateBatchImagesParameters, UserMessage } from "#shared/lm/provider.js";
import { extractGeneratedResponse } from "#shared/lm/parts-extractor.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

// ============================================================================
// SCHEMA
// ============================================================================

const GeneratePropImagesInput = z.object({
  props: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      version: z.number(),
    }),
  ),
  generationRules: z.array(z.string()),
  attempt: z.number(),
});

export type GeneratePropImagesInput = z.input<typeof GeneratePropImagesInput>;

// ============================================================================
// RESULT TYPES
// `entity` is populated whenever projectRepository is available (i.e. when
// called internally from generateProps). External callers that don't need
// entity data can continue to rely on `output` (the image URL) as before.
// ============================================================================

export type GeneratePropImagesResultSuccess = {
  success: true;
  id: string;
  /** GCS URI / public URL of the generated image */
  output: string;
  metadata: { model: string; prompt: string };
  /** Full updated prop entity — present when projectRepository is injected */
  entity?: PropWithAssets;
};

export type GeneratePropImagesResult =
  | GeneratePropImagesResultSuccess
  | { success: false; id: string; error: Error };

// ============================================================================
// INTERNAL CONTEXT TYPE
// Requires projectRepository and publishPipelineEvent so the tool can
// persist image assets and emit ENTITY_UPDATED autonomously.
// ============================================================================

type GeneratePropImagesContext = ToolContext<TextModelController> & {
  incrementAttempt: IncrementAttemptHook;
  /** Required to fetch the updated entity after asset persistence */
  projectRepository: ProjectRepository;
};

// ============================================================================
// SERIALISER — used by _call for the LangChain string interface
// ============================================================================

type ToolResultItem =
  | { success: true; id: string; output: string; metadata: { model: string; prompt: string } }
  | { success: false; id: string; error: string };

function serialiseResults(results: GeneratePropImagesResult[]): string {
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
// execution-mode branch, so assets are saved atomically per prop.
// ============================================================================

async function persistImageAsset(
  prop: { id: string; version: number },
  gcsUri: string,
  prompt: string,
  context: GeneratePropImagesContext,
): Promise<void> {
  if (!context.saveAssets) return;

  await context.saveAssets(
    // Scope — entity-scoped to this prop
    { entityType: "prop", entityId: prop.id, projectId: context.projectId } as any,
    ["prop_image"],
    "image",
    [gcsUri],
    [{ model: context.provider.imageModel, prompt }],
    /* setBest */ true,
  );
}

// ============================================================================
// CORE RUN FUNCTION — handles all execution modes
// ============================================================================

async function run(
  params: {
    props: { id: string; name: string; version: number }[];
    generationRules: string[];
    attempt: number;
    incrementAttempt: IncrementAttemptHook;
  },
  context: GeneratePropImagesContext,
): Promise<GeneratePropImagesResult[]> {
  const { projectId, traceId } = context;
  const executionMode = getExecutionMode();

  // ── BATCH ──────────────────────────────────────────────────────────────────
  if (executionMode === "BATCH") {
    console.log(`${traceId}: Batch execution. Generating ${params.props.length} prop images`);

    const contextMap = new Map<string, { prop: any; version: number; prompt: string }>();
    const batchRequests: GenerateBatchImagesParameters["requests"] = [];

    for (const prop of params.props) {
      if (!contextMap.has(prop.id)) {
        const prompt = buildPropImagePrompt(prop as any, params.generationRules);
        contextMap.set(prop.id, { prop, version: prop.version, prompt });
      }

      const ctx = contextMap.get(prop.id)!;
      batchRequests.push({
        messages: [new UserMessage({ content: ctx.prompt })],
        metadata: { custom_id: prop.id, version: ctx.version, assetKey: "prop_image" },
        config: {
          abortSignal: context.options?.signal,
          candidateCount: 1,
          responseModalities: [Modality.IMAGE],
          imageConfig: { ...aspectRatios.widescreen, outputMimeType: imageMimeType },
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
          displayName: `generate_prop_images_attempt_${params.attempt}`,
        },
      });
    } catch (e) {
      // Entire batch failed — all props are errors
      return params.props.map((p) => ({ success: false as const, id: p.id, error: e as Error }));
    }

    // Upload & persist each result atomically
    const imageResults = await Promise.all(
      params.props.map(async (prop): Promise<GeneratePropImagesResult> => {
        const res = batchApiResults.find((r) => r.customId === prop.id);

        if (!res) {
          return { success: false as const, id: prop.id, error: new Error("Result missing from batch response") };
        }
        if (res.status !== "SUCCESS") {
          return { success: false as const, id: prop.id, error: res.error || new Error("Batch generation failed") };
        }

        try {
          const ctx = contextMap.get(prop.id)!;
          const imageBuffer = Buffer.from(res.imageBytes!, "base64");
          const outputPath = context.storageManager.getObjectPath({
            projectId,
            propId: prop.id,
            type: "prop_image",
            version: ctx.version,
          });
          const src = await context.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);

          // ── Inline asset persistence ──
          await persistImageAsset(prop, src, ctx.prompt, context);

          return {
            success: true as const,
            id: prop.id,
            output: src,
            metadata: { prompt: ctx.prompt, model: context.provider.imageModel },
          };
        } catch (e) {
          return { success: false as const, id: prop.id, error: e as Error };
        }
      }),
    );

    return finaliseResults(imageResults, params.props, context);

    // ── PARALLEL ───────────────────────────────────────────────────────────────
  } else if (executionMode === "PARALLEL") {
    console.log(`${traceId}: Parallel execution. Generating ${params.props.length} prop images`);

    const imageResults = await Promise.all(
      params.props.map(async (prop): Promise<GeneratePropImagesResult> => {
        try {
          const prompt = buildPropImagePrompt(prop as any, params.generationRules);
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
                    aspectRatio: aspectRatios.widescreen.aspectRatio,
                    outputMimeType: imageMimeType,
                  },
                }),
              { prompt },
              { attempt: prop.version, maxRetries: context.safetyRetries + prop.version, projectId },
              async (error, attempt, p) => {
                params.incrementAttempt(error.message, "BACKOFF_RETRY");
                return { attempt, params: p };
              },
            ),
            "google",
          );

          const imageBuffer = Buffer.from(imageData, "base64");
          const imagePath = context.storageManager.getObjectPath({
            type: "prop_image",
            projectId,
            propId: prop.id,
            version: prop.version,
          });
          const gcsUri = await context.storageManager.uploadBuffer(imageBuffer, imagePath, imageMimeType);

          // ── Inline asset persistence ──
          await persistImageAsset(prop, gcsUri, prompt, context);

          return {
            success: true as const,
            id: prop.id,
            output: gcsUri,
            metadata: { prompt, model: context.provider.imageModel },
          };
        } catch (error) {
          return { success: false as const, id: prop.id, error: error as Error };
        }
      }),
    );

    return finaliseResults(imageResults, params.props, context);

    // ── SEQUENTIAL ─────────────────────────────────────────────────────────────
  } else {
    console.log(`${traceId}: Sequential execution. Generating ${params.props.length} prop images`);
    const imageResults: GeneratePropImagesResult[] = [];

    for (const prop of params.props) {
      try {
        const prompt = buildPropImagePrompt(prop as any, params.generationRules);
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
                  aspectRatio: aspectRatios.widescreen.aspectRatio,
                  outputMimeType: imageMimeType,
                },
              }),
            { prompt },
            { attempt: prop.version, maxRetries: context.safetyRetries + prop.version, projectId },
            async (error, attempt, p) => {
              params.incrementAttempt(error.message, "BACKOFF_RETRY");
              return { attempt, params: p };
            },
          ),
          "google",
        );

        const imageBuffer = Buffer.from(imageData, "base64");
        const imagePath = context.storageManager.getObjectPath({
          type: "prop_image",
          projectId,
          propId: prop.id,
          version: prop.version,
        });
        const gcsUri = await context.storageManager.uploadBuffer(imageBuffer, imagePath, imageMimeType);

        // ── Inline asset persistence ──
        await persistImageAsset(prop, gcsUri, prompt, context);

        imageResults.push({
          success: true,
          id: prop.id,
          output: gcsUri,
          metadata: { prompt, model: context.provider.imageModel },
        });
      } catch (error) {
        imageResults.push({ success: false, id: prop.id, error: error as Error });
      }
    }

    return finaliseResults(imageResults, params.props, context);
  }
}

// ============================================================================
// FINALISE — fetch updated entities for successes, emit ENTITY_UPDATED
// Called at the tail of every execution mode branch so the post-generation
// logic is centralised and not repeated three times.
// ============================================================================

async function finaliseResults(
  imageResults: GeneratePropImagesResult[],
  _props: { id: string; name: string; version: number }[],
  context: GeneratePropImagesContext,
): Promise<GeneratePropImagesResult[]> {
  const successes = imageResults.filter((r): r is GeneratePropImagesResultSuccess => r.success);

  if (successes.length === 0) return imageResults;

  // Fetch the updated entities from DB (assets registry is now populated with the new image)
  const updatedEntities = await context.projectRepository.getEntities(
    successes.map((r) => ({ entityId: r.id, entityType: "prop" as const, entity: {} })),
  );

  // Build a lookup so we can attach entity data to each success result
  const entityById = new Map(updatedEntities.map(({ entity }) => [(entity as any).id as string, entity]));

  // Enrich success results with the full entity
  const enrichedResults: GeneratePropImagesResult[] = imageResults.map((r) => {
    if (!r.success) return r;
    const entity = entityById.get(r.id) as PropWithAssets | undefined;
    return { ...r, entity };
  });

  // Emit ENTITY_UPDATED for all successfully processed props
  if (context.publishPipelineEvent) {
    await context.publishPipelineEvent({
      type: "ENTITY_UPDATED",
      worldId: context.worldId,
      payload: updatedEntities.map(({ entity, entityType }) => ({
        id: (entity as any).id,
        entityType,
        entity,
      })),
    });
  }

  return enrichedResults;
}

// ============================================================================
// DEPS
// ============================================================================

export interface GeneratePropImagesToolDeps {
  context: ToolContext<TextModelController> & {
    incrementAttempt: IncrementAttemptHook;
    /**
     * Required: used to fetch the updated prop entity after image assets
     * are saved, so the tool can return entity data and emit ENTITY_UPDATED.
     */
    projectRepository: ProjectRepository;
  };
}

// ============================================================================
// TOOL CLASS
// _call() is the LangChain string interface — signature/return unchanged.
// run()   is the programmatic interface — input unchanged, return type gains
//         an optional `entity` field on success items.
// ============================================================================

class GeneratePropImagesTool extends StructuredTool<typeof GeneratePropImagesInput> {
  name = "generate_prop_images";
  description = "Generates prop reference images.";
  schema = GeneratePropImagesInput;

  private readonly context: GeneratePropImagesToolDeps["context"];
  private readonly incrementAttempt: IncrementAttemptHook;

  constructor(deps: GeneratePropImagesToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
    this.incrementAttempt = deps.context.incrementAttempt;
  }

  /** LangChain tool interface — returns serialised JSON string. */
  async _call(input: GeneratePropImagesInput, _runManager?: CallbackManagerForToolRun): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: GeneratePropImagesTool invoked. count: ${input.props.length}`);

    const generated = await run(
      {
        props: input.props,
        generationRules: input.generationRules,
        attempt: input.attempt,
        incrementAttempt: this.incrementAttempt,
      },
      this.context,
    );

    const output = serialiseResults(generated);
    console.log(`${traceId}: GeneratePropImagesTool complete.`);
    return output;
  }

  /**
   * Programmatic interface for direct tool-to-tool calls.
   *
   * Input:  GeneratePropImagesInput — unchanged from external callers.
   * Output: GeneratePropImagesResult[] — success items now carry an optional
   *         `entity` field (the full PropWithAssets after image asset persistence).
   */
  async run(input: GeneratePropImagesInput): Promise<GeneratePropImagesResult[]> {
    try {
      return await run(
        {
          props: input.props,
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

export { GeneratePropImagesTool };

export function createGeneratePropImagesTool(
  deps: GeneratePropImagesToolDeps,
  params?: ToolParams,
): GeneratePropImagesTool {
  return new GeneratePropImagesTool(deps, params);
}
