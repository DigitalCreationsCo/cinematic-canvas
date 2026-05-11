// #shared/lm/tools/generate-scene-frames.ts
import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { aspectRatios } from "#shared/config.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { ReferenceImageInputs } from "#shared/lm/provider.js";
import { GcsObjectPathParams } from "#shared/types/storage.types.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { generateImages, GenerateImageRequest } from "#shared/lm/tools/old-generate-images.js";
import { SceneWithAssets } from "#shared/types/workflow.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface SceneFrameGenerationRequest {
  /** Unique identifier — typically `${scene.id}_${assetKey}`. */
  id: string;
  projectId: string;
  sceneId: string;
  framePosition: "start" | "end";
  /** Fully enhanced, post-processed prompt. Compiled by the caller. */
  prompt: string;
  /** Pre-compiled by the caller (character subjects + location base + continuity ref). */
  referenceImages: ReferenceImageInputs;
  /**
   * Starting version number for this frame's assets.
   * Pre-fetched by the caller via AssetVersionManager.
   * Multiple generated images receive startingVersion, startingVersion+1, etc.
   */
  version: number;
  /** Number of images to generate. Defaults to generateImages default (3). */
  count?: number;
}

export type SceneFrameGenerationSuccess = {
  success: true;
  id: string;
  sceneId: string;
  framePosition: "start" | "end";
  outputs: { uri: string; version: number }[];
  metadata: { model: string; prompt: string };
  /** Full updated scene entity — present when projectRepository is available */
  entity?: SceneWithAssets;
};

export type SceneFrameGenerationResult =
  | SceneFrameGenerationSuccess
  | {
      success: false;
      id: string;
      sceneId: string;
      framePosition: "start" | "end";
      error: Error;
    };

interface GenerateSceneFramesParams {
  requests: SceneFrameGenerationRequest[];
  attempt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL CONTEXT TYPE
// Requires projectRepository and publishPipelineEvent so the function can
// fetch updated entities and emit ENTITY_UPDATED autonomously.
// ─────────────────────────────────────────────────────────────────────────────

type GenerateSceneFramesContext = ToolContext<TextModelController> & {
  /** Required to fetch the updated entity after asset persistence */
  projectRepository: ProjectRepository;
};

// ─────────────────────────────────────────────────────────────────────────────
// FINALISE — fetch updated entities for successes, emit ENTITY_UPDATED
// Called after saving assets so the post-generation logic is centralised.
// ─────────────────────────────────────────────────────────────────────────────

async function finaliseResults(
  results: SceneFrameGenerationResult[],
  context: GenerateSceneFramesContext,
): Promise<SceneFrameGenerationResult[]> {
  const successes = results.filter((r): r is SceneFrameGenerationSuccess => r.success);

  if (successes.length === 0) return results;

  // Build a unique set of scene IDs from the successes
  const sceneIds = [...new Set(successes.map((r) => r.sceneId))];

  // Fetch the updated entities from DB (assets registry is now populated with the new frames)
  const updatedEntities = await context.projectRepository.getEntities(
    sceneIds.map((id) => ({ entityId: id, entityType: "scene" as const, entity: {} })),
  );

  // Build a lookup so we can attach entity data to each success result
  const entityBySceneId = new Map(updatedEntities.map(({ entity }) => [(entity as any).id as string, entity]));

  // Enrich success results with the full entity
  const enrichedResults: SceneFrameGenerationResult[] = results.map((r) => {
    if (!r.success) return r;
    const entity = entityBySceneId.get(r.sceneId) as SceneWithAssets | undefined;
    return { ...r, entity };
  });

  // Emit ENTITY_UPDATED for all successfully processed scenes
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

// ─────────────────────────────────────────────────────────────────────────────
// Tool entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates start/end frame images for a batch of scene frame requests.
 *
 * Responsibilities:
 *  - Maps SceneFrameGenerationRequest → GenerateImageRequest (storage path factory, aspect ratio)
 *  - Emits sendEntityUpdate before and after generation (via ToolContext)
 *  - Calls saveAssets for each successful result (via ToolContext)
 *  - Delegates all provider interaction and mode dispatch to generateImages
 *  - Fetches updated entities and emits ENTITY_UPDATED after asset persistence
 *
 * Does NOT own:
 *  - Prompt generation (caller's responsibility)
 *  - Reference image compilation (caller's responsibility)
 *  - Version pre-fetching (caller's responsibility)
 *  - Quality retry logic (agent's responsibility)
 */
export async function generateSceneFrames(
  { requests, attempt }: GenerateSceneFramesParams,
  context: GenerateSceneFramesContext,
): Promise<SceneFrameGenerationResult[]> {
  const { traceId, projectId } = context;

  console.log(`[${traceId}] generateSceneFrames: attempt=${attempt} frames=${requests.length}`);

  context.sendEntityUpdate?.(
    requests.map((req) => ({
      id: req.sceneId,
      entityType: "scene" as const,
      entity: {
        status: "generating" as const,
        progressMessage: `Generating ${req.framePosition} frame (attempt ${attempt})...`,
      },
    })),
  );

  const imageRequests: GenerateImageRequest[] = requests.map((req) => ({
    id: req.id,
    prompt: `Frame Description: ${req.prompt}`,
    referenceImages: req.referenceImages,
    aspectRatio: aspectRatios.widescreen.aspectRatio,
    startingVersion: req.version,
    count: req.count,
    buildPath: (version: number): GcsObjectPathParams => ({
      type: req.framePosition === "start" ? "scene_start_frame" : "scene_end_frame",
      projectId: req.projectId,
      sceneId: req.sceneId,
      version,
    }),
  }));

  const imageResults = await generateImages(imageRequests, context);

  context.sendEntityUpdate?.(
    requests.map((req) => ({
      id: req.sceneId,
      entityType: "scene" as const,
      entity: {
        progressMessage: `Generated ${req.framePosition} frame`,
      },
    })),
    false,
  );

  const resultsMap = new Map(imageResults.map((res) => [res.id, res]));

  const results: SceneFrameGenerationResult[] = requests.map((req) => {
    const res = resultsMap.get(req.id);

    if (!res) {
      return {
        success: false,
        id: req.id,
        sceneId: req.sceneId,
        framePosition: req.framePosition,
        error: new Error(`No result returned for request ID: ${req.id}`),
      };
    }

    if (!res.success) {
      console.error(`[${traceId}] generateSceneFrames: failed for ${res.id}:`, res.error);
      return {
        success: false,
        id: res.id,
        sceneId: req.sceneId,
        framePosition: req.framePosition,
        error: res.error,
      };
    }

    const assetKey = req.framePosition === "start" ? "scene_start_frame" : "scene_end_frame";

    context.saveAssets?.(
      { projectId: req.projectId, sceneIds: [req.sceneId] },
      [assetKey],
      "image",
      res.outputs.map((o) => o.uri),
      res.outputs.map(() => ({ model: res.metadata.model, prompt: res.metadata.prompt })),
      true,
    );

    return {
      success: true,
      id: res.id,
      sceneId: req.sceneId,
      framePosition: req.framePosition,
      outputs: res.outputs,
      metadata: res.metadata,
    };
  });

  const successCount = results.filter((r) => r.success).length;
  console.log(`[${traceId}] generateSceneFrames: ${successCount}/${results.length} succeeded`);

  // Finalise: fetch entities, enrich results, emit ENTITY_UPDATED
  return finaliseResults(results, context);
}

// ============================================================================
// TOOL — wraps generateSceneFrames for use as the imagesTool in
// GenerateScenesTool.  Accepts the simple { scenes, generationRules, attempt }
// input shape and internally fetches scene entities, builds prompt text, and
// dispatches to the core generateSceneFrames function.
// ============================================================================

/** Tool-level prompt builder — uses scene metadata + generation rules. */
function buildSceneFramePrompt(
  sceneName: string,
  sceneDescription: string | undefined,
  framePosition: "start" | "end",
  generationRules: string[],
): string {
  const desc = sceneDescription ?? sceneName;
  const rules = generationRules.length > 0 ? `\nGeneration rules:\n${generationRules.join("\n")}` : "";

  if (framePosition === "start") {
    return `Scene: ${sceneName}\nDescription: ${desc}${rules}\n\nGenerate the establishing shot for the start of this scene.`;
  }
  return `Scene: ${sceneName}\nDescription: ${desc}${rules}\n\nGenerate the concluding shot for the end of this scene.`;
}

// ============================================================================
// DEPS
// ============================================================================

export interface GenerateSceneFramesToolDeps {
  context: ToolContext<TextModelController> & {
    /** Required for fetching scene entities from DB */
    projectRepository: ProjectRepository;
  };
}

// ============================================================================
// INPUT SCHEMA
// ============================================================================

const GenerateSceneFramesToolInput = z.object({
  scenes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      version: z.number(),
    }),
  ),
  generationRules: z.array(z.string()).default([]),
  attempt: z.number().default(1),
});

// ============================================================================
// TOOL CLASS
// _call() is the LangChain string interface.
// run()   is the programmatic interface — matches the { run: (input) => any[] }
//         contract expected by GenerateScenesTool.imagesTool.
// ============================================================================

export class GenerateSceneFramesTool extends StructuredTool<typeof GenerateSceneFramesToolInput> {
  name = "generate_scene_frames";
  description = "Generates scene start and end frame images based on scene attributes.";
  schema = GenerateSceneFramesToolInput;

  private readonly context: GenerateSceneFramesToolDeps["context"];

  constructor(deps: GenerateSceneFramesToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
  }

  /** LangChain tool interface — returns serialised JSON string. */
  async _call(
    input: z.infer<typeof GenerateSceneFramesToolInput>,
    _runManager?: CallbackManagerForToolRun,
  ): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: GenerateSceneFramesTool invoked. scenes: ${input.scenes.length}`);

    const results = await this.generateFrames(input);

    return JSON.stringify({
      summary: {
        total: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
      results: results.map((r) => ({
        success: r.success,
        id: r.id,
        sceneId: (r as any).sceneId,
        framePosition: (r as any).framePosition,
        ...(r.success
          ? { output: r.outputs?.[0]?.uri, metadata: r.metadata }
          : { error: r.error?.message }),
      })),
    });
  }

  /**
   * Programmatic interface for direct tool-to-tool calls.
   *
   * Input:  { scenes: [{id, name, version}], generationRules?, attempt? }
   * Output: SceneFrameGenerationResult[] (matching the existing function's shape)
   */
  async run(input: z.infer<typeof GenerateSceneFramesToolInput>): Promise<SceneFrameGenerationResult[]> {
    return this.generateFrames(input);
  }

  private async generateFrames(
    input: z.infer<typeof GenerateSceneFramesToolInput>,
  ): Promise<SceneFrameGenerationResult[]> {
    const { projectRepository, projectId } = this.context;

    // Fetch full scene entities from DB so we can build prompts from descriptions
    const sceneEntities = await projectRepository.getEntities(
      input.scenes.map((s) => ({ entityId: s.id, entityType: "scene" as const, entity: {} })),
    );

    // Build scene lookup by id
    const sceneById = new Map(sceneEntities.map(({ entity }) => [(entity as any).id, entity as SceneWithAssets]));

    // Build requests for start and end frames for each scene
    const requests: SceneFrameGenerationRequest[] = [];
    for (const { id, name, version } of input.scenes) {
      const scene = sceneById.get(id);
      const description = (scene as any)?.description ?? "";

      for (const framePosition of ["start", "end"] as const) {
        const prompt = buildSceneFramePrompt(name, description, framePosition, input.generationRules);
        requests.push({
          id: `${id}_${framePosition}`,
          projectId,
          sceneId: id,
          framePosition,
          prompt,
          referenceImages: { base: [], subject: [], style: [], control: [], content: [], mask: [] },
          version,
        });
      }
    }

    // Delegate to the core function which handles image generation, asset
    // persistence, entity enrichment, and ENTITY_UPDATED emission.
    return generateSceneFrames({ requests, attempt: input.attempt }, this.context);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createGenerateSceneFramesTool(
  deps: GenerateSceneFramesToolDeps,
  params?: ToolParams,
): GenerateSceneFramesTool {
  return new GenerateSceneFramesTool(deps, params);
}
