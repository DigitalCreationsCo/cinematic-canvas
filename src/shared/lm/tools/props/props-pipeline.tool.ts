import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { serialiseResults, ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { PropWithAssets, PropAttributes, PropBase } from "#shared/types/workflow.types.js";
import { UploadResult } from "#shared/types/base.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import {
  GeneratePropAttributesTool,
  GeneratePropsResultSuccess,
} from "#shared/lm/tools/props/generate-props-attributes.tool.js";
import { GeneratePropImagesTool } from "#shared/lm/tools/props/generate-props-images.tool.js";

// ============================================================================
// SCHEMA
// ============================================================================

const PropSeedSchema = PropBase.partial().extend({
  id: z.uuid(),
  images: z.array(UploadResult).optional(),
});

const GeneratePropsPipelineInput = z.object({
  props: z.array(PropSeedSchema),
  generationRules: z.array(z.string()),
  attempt: z.number(),
});

export type GeneratePropsPipelineInput = z.input<typeof GeneratePropsPipelineInput>;

type InsertedPropRef = { id: string; name: string };

export type GeneratePropsPipelineResultSuccess = {
  success: true;
  id: string;
  entity: PropWithAssets;
};

export type GeneratePropsPipelineResult =
  | GeneratePropsPipelineResultSuccess
  | { success: false; id: string; error: Error };

export interface GeneratePropsPipelineDeps {
  context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
  attributesTool: GeneratePropAttributesTool;
  imagesTool: GeneratePropImagesTool;
  insertProps: (props: Array<PropAttributes & { projectId: string }>) => Promise<PropWithAssets[]>;
}

class GeneratePropsPipelineTool extends StructuredTool<typeof GeneratePropsPipelineInput> {
  name = "generate_props_pipeline";
  description = "Full prop creation pipeline: generates attributes, persists, and creates visual assets.";
  schema = GeneratePropsPipelineInput;

  constructor(
    private readonly deps: GeneratePropsPipelineDeps,
    params?: ToolParams,
  ) {
    super(params);
  }

  async _call({ props, generationRules = [], attempt = 1 }: GeneratePropsPipelineInput): Promise<string> {
    const results = await this.run({
      props,
      generationRules,
      attempt,
    });
    return serialiseResults(results);
  }

  async run({
    props,
    generationRules,
    attempt,
  }: GeneratePropsPipelineInput): Promise<GeneratePropsPipelineResult[]> {
    const { attributesTool, imagesTool, insertProps, context } = this.deps;
    const { projectId, traceId } = context;

    console.log(`${traceId}: [Pipeline] Generating attributes for ${props.length} prop(s)`);

    const attributeResults = await attributesTool.run(props);
    const successes = attributeResults.filter((r): r is GeneratePropsResultSuccess => r.success);

    if (successes.length === 0) {
      return attributeResults.map((r) => ({
        success: false,
        id: r.id,
        error: r.success ? new Error("unreachable") : r.error,
      }));
    }

    let insertResults: PropWithAssets[] = [];
    try {

      insertResults = await insertProps(successes.map(({ attributes, id }) => ({ ...attributes, id, projectId })));

    } catch (e) {
      throw e;
    }

    let insertedEntities: PropWithAssets[] = [];
    if (context.publishPipelineEvent && insertResults.length > 0) {
      try {

        const fetched = await context.projectRepository.getEntities(
          insertResults.map((ref) => ({ entityId: ref.id, entityType: "prop" as const, entity: ref })),
        );

        insertedEntities = fetched.map(({ entity }) => entity as PropWithAssets);

        await context.publishPipelineEvent({
          type: "ENTITY_CREATED",
          worldId: context.worldId,
          payload: fetched.map(({ entity, entityType }) => ({
            entityId: entity.id,
            entityType: "prop" as "prop",
            entity: entity as PropWithAssets,
          })),
        });
      } catch (e) {
        console.error(`${traceId}: [Pipeline] ENTITY_CREATED publish failed`, e);
      }
    }

    const enrichedById = new Map<string, PropWithAssets>();

    try {
      const imageResults = await imagesTool.run({
        props: insertResults.map((ref) => {
          const { attributes } = successes.find((s) => s.id === ref.id)!;
          return {
            ...attributes,
            id: ref.id,
            version: 1,
          };
        }),
        generationRules,
        attempt,
      });

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
      console.error(`${traceId}: [Pipeline] imagesTool failure`, e);
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

export type { GeneratePropsPipelineTool };

export function createGeneratePropsPipelineTool(
  deps: GeneratePropsPipelineDeps,
  params?: ToolParams,
): GeneratePropsPipelineTool {
  return new GeneratePropsPipelineTool(deps, params);
}
