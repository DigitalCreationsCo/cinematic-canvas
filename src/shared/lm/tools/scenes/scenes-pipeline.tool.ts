import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { SceneAttributes } from "#shared/types/scene.types.js";
import { SceneBase, SceneWithAssets } from "#shared/types/workflow.types.js";
import { UploadResult } from "#shared/types/base.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import {
  GenerateSceneAttributesTool,
  GenerateScenesResultSuccess,
} from "#shared/lm/tools/scenes/generate-scenes-attributes.tool.js";
import { GenerateSceneFramesTool } from "#shared/lm/tools/scenes/generate-scene-frames.tool.js";

// ============================================================================
// SCHEMA
// ============================================================================

const SceneSeedSchema = z.object({
  partial: SceneBase.partial().extend({
    id: z.uuid(),
  }),
  images: z.array(UploadResult).optional(),
});

const GenerateScenesPipelineInput = z.object({
  scenes: z.array(SceneSeedSchema),
  generationRules: z.array(z.string()),
  attempt: z.number(),
});

export type GenerateScenesPipelineInput = z.input<typeof GenerateScenesPipelineInput>;

type InsertedSceneRef = { id: string; title: string };

export type GenerateScenesPipelineResultSuccess = {
  success: true;
  id: string;
  scene: SceneWithAssets;
};

export type GenerateScenesPipelineResult =
  | GenerateScenesPipelineResultSuccess
  | { success: false; id: string; error: Error };

function serialiseResults(results: GenerateScenesPipelineResult[]): string {
  const items = results.map((r) =>
    r.success
      ? { success: true, id: r.id, scene: r.scene }
      : { success: false, id: r.id, error: (r.error as Error)?.message ?? "unknown" },
  );

  return JSON.stringify({
    summary: {
      total: items.length,
      succeeded: items.filter((i) => i.success).length,
      failed: items.filter((i) => !i.success).length,
    },
    results: items,
  });
}

// ============================================================================
// CORE RUN FUNCTION
// ============================================================================

async function run(
  inputs: GenerateScenesPipelineInput["scenes"],
  generationRules: string[],
  attempt: number,
  context: GenerateScenesPipelineDeps["context"],
  attributesTool: GenerateSceneAttributesTool,
  imagesTool: GenerateSceneFramesTool,
  insertScenes: GenerateScenesPipelineDeps["insertScenes"],
): Promise<GenerateScenesPipelineResult[]> {
  const { projectId, traceId } = context;

  console.log(`${traceId}: [Pipeline] Generating attributes for ${inputs.length} scene(s)`);

  const attributeResults = await attributesTool.run({ scenes: inputs });
  const successes = attributeResults.filter((r): r is GenerateScenesResultSuccess => r.success);

  if (successes.length === 0) {
    return attributeResults.map((r) => ({
      success: false,
      id: r.id,
      error: r.success ? new Error("unreachable") : r.error,
    }));
  }

  let insertedRefs: InsertedSceneRef[];
  try {
    insertedRefs = await insertScenes(successes.map((r) => ({ ...r.output, projectId })));
  } catch (e) {
    throw e;
  }

  let insertedEntities: SceneWithAssets[] = [];
  if (context.publishPipelineEvent && insertedRefs.length > 0) {
    try {
      const fetched = await context.projectRepository.getEntities(
        insertedRefs.map((ref) => ({ entityId: ref.id, entityType: "scene" as const, entity: {} })),
      );
      insertedEntities = fetched.map(({ entity }) => entity as SceneWithAssets);

      await context.publishPipelineEvent({
        type: "ENTITY_CREATED",
        worldId: context.worldId,
        payload: fetched.map(({ entity }) => ({
          entityId: entity.id,
          entityType: "scene" as "scene",
          entity: entity as SceneWithAssets,
        })),
      });
    } catch (e) {
      console.error(`${traceId}: [Pipeline] ENTITY_CREATED failed`, e);
    }
  }

  const enrichedById = new Map<string, SceneWithAssets>();
  try {
    const frameResults = await imagesTool.run({
      scenes: insertedRefs.map((ref) => ({
        id: ref.id,
        name: ref.title,
        version: (successes.find((s) => s.id === ref.id)?.output as any)?.version ?? attempt,
      })),
      generationRules,
      attempt,
    });

    for (const result of frameResults) {
      if (result.success && result.entity) enrichedById.set(result.id, result.entity);
    }
  } catch (e) {
    console.error(`${traceId}: [Pipeline] frameTool failure`, e);
  }

  const insertedById = new Map(insertedEntities.map((e) => [e.id, e]));
  return attributeResults.map((r) => {
    if (!r.success) return r;
    const scene = enrichedById.get(r.id) ?? insertedById.get(r.id);
    if (!scene) return { success: false, id: r.id, error: new Error("Missing after insert") };
    return { success: true, id: r.id, scene };
  });
}

// ============================================================================
// TOOL CLASS
// ============================================================================

export interface GenerateScenesPipelineDeps {
  context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
  attributesTool: GenerateSceneAttributesTool;
  imagesTool: GenerateSceneFramesTool;
  insertScenes: (scenes: Array<SceneAttributes & { projectId: string }>) => Promise<InsertedSceneRef[]>;
}

class GenerateScenesPipelineTool extends StructuredTool<typeof GenerateScenesPipelineInput> {
  name = "generate_scenes_pipeline";
  description = "Full scene creation pipeline: generates cinematography attributes, persists, and creates keyframes.";
  schema = GenerateScenesPipelineInput;

  constructor(
    private readonly deps: GenerateScenesPipelineDeps,
    params?: ToolParams,
  ) {
    super(params);
  }

  async _call(input: GenerateScenesPipelineInput): Promise<string> {
    const results = await run(
      input.scenes,
      input.generationRules,
      input.attempt,
      this.deps.context,
      this.deps.attributesTool,
      this.deps.imagesTool,
      this.deps.insertScenes,
    );
    return serialiseResults(results);
  }

  async run(input: GenerateScenesPipelineInput): Promise<GenerateScenesPipelineResult[]> {
    return run(
      input.scenes,
      input.generationRules,
      input.attempt,
      this.deps.context,
      this.deps.attributesTool,
      this.deps.imagesTool,
      this.deps.insertScenes,
    );
  }
}

export type { GenerateScenesPipelineTool };
export function createGenerateScenesPipelineTool(
  deps: GenerateScenesPipelineDeps,
  params?: ToolParams,
): GenerateScenesPipelineTool {
  return new GenerateScenesPipelineTool(deps, params);
}
