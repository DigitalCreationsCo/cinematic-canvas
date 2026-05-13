import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { serialiseResults, ToolContext } from "#shared/lm/tools/tools.utils.js";
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

const SceneBaseWithIdAndImages = SceneBase.partial().extend({
  id: z.uuid(),
  images: z.array(UploadResult).optional(),
});

const GenerateScenesPipelineInput = z.object({
  scenes: z.array(SceneBaseWithIdAndImages),
  generationRules: z.array(z.string()),
  attempt: z.number(),
});

export type GenerateScenesPipelineInput = z.input<typeof GenerateScenesPipelineInput>;

export type GenerateScenesPipelineResultSuccess = {
  success: true;
  id: string;
  entity: SceneWithAssets;
};

export type GenerateScenesPipelineResult =
  | GenerateScenesPipelineResultSuccess
  | { success: false; id: string; error: Error };


export interface GenerateScenesPipelineDeps {
  context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
  attributesTool: GenerateSceneAttributesTool;
  imagesTool: GenerateSceneFramesTool;
  insertScenes: (scenes: Array<SceneAttributes & { projectId: string }>) => Promise<SceneWithAssets[]>;
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

  async _call({ scenes, generationRules, attempt }: GenerateScenesPipelineInput): Promise<string> {
    const results = await this.run({ scenes, generationRules, attempt });

    return serialiseResults(results);
  }

  async run(
    { scenes, generationRules, attempt }: GenerateScenesPipelineInput,
  ): Promise<GenerateScenesPipelineResult[]> {
    const context = this.deps.context
    const attributesTool = this.deps.attributesTool
    const imagesTool = this.deps.imagesTool
    const insertScenes = this.deps.insertScenes
    const { projectId, traceId } = context;

    console.log(`${traceId}: [Pipeline] Generating attributes for ${scenes.length} scene(s)`);

    const attributeResults =
      await attributesTool.run(scenes);

    const attributesSuccesses = attributeResults.filter((r): r is GenerateScenesResultSuccess => r.success);

    if (attributesSuccesses.length === 0) {
      return attributeResults.map((r) => ({
        success: false,
        id: r.id,
        error: r.success ? new Error("unreachable") : r.error,
      }));
    }

    let insertResults: SceneWithAssets[] = [];
    try {
      insertResults =
        await insertScenes(attributesSuccesses.map(({ attributes, id }) => ({ ...attributes, id, projectId })));

      console.log(`${traceId}: [Pipeline] Inserted ${insertResults.length} scene(s) into DB`);
    } catch (e) {
      console.error(`${traceId}: [Pipeline] Insert failed — aborting image generation`, e);
      throw e;
    }

    let insertedEntities: SceneWithAssets[] = [];
    if (context.publishPipelineEvent && insertResults.length > 0) {
      try {

        const fetched = await context.projectRepository.getEntities(
          insertResults.map((ref) => ({ entityId: ref.id, entityType: "scene" as const, entity: ref })),
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

      const imageInput = {
        scenes: insertResults,
        generationRules,
        attempt,
      };

      const imageResults =
        await imagesTool.run(imageInput);

      for (const result of imageResults) {
        if (result.success && result.entity) enrichedById.set(result.id, result.entity);
      }

      const imageFailures = imageResults.filter((r) => !r.success);
      if (imageFailures.length > 0) {
        console.error(
          `${traceId}: [Pipeline] Image generation failed for ${imageFailures.length} character(s)`,
          imageFailures,
        );
      }

      console.log(
        `${traceId}: [Pipeline] Image generation complete. ` +
        `succeeded=${imageResults.filter((r) => r.success).length} ` +
        `failed=${imageFailures.length}`,
      );

    } catch (e) {
      console.error(`${traceId}: [Pipeline] frameTool failure`, e);
    }

    const insertedById = new Map(insertedEntities.map((e) => [e.id, e]));
    return attributeResults.map((r) => {
      if (!r.success) return r;
      const entity = enrichedById.get(r.id) ?? insertedById.get(r.id);
      if (!entity) return { success: false, id: r.id, error: new Error("Missing after insert") };
      return { success: true, id: r.id, entity };
    });
  }
}

export type { GenerateScenesPipelineTool };

export function createGenerateScenesPipelineTool(
  deps: GenerateScenesPipelineDeps,
  params?: ToolParams,
): GenerateScenesPipelineTool {
  return new GenerateScenesPipelineTool(deps, params);
}
