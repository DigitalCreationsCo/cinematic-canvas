import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { ToolContext } from "#shared/lm/tools/tools.utils.js";
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
  prop: PropWithAssets;
};

export type GeneratePropsPipelineResult =
  | GeneratePropsPipelineResultSuccess
  | { success: false; id: string; error: Error };

function serialiseResults(results: GeneratePropsPipelineResult[]): string {
  const items = results.map((r) =>
    r.success
      ? { success: true, id: r.id, prop: r.prop }
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
  inputs: GeneratePropsPipelineInput["props"],
  generationRules: string[],
  attempt: number,
  context: GeneratePropsPipelineDeps["context"],
  attributesTool: GeneratePropAttributesTool,
  imagesTool: GeneratePropImagesTool,
  insertProps: GeneratePropsPipelineDeps["insertProps"],
): Promise<GeneratePropsPipelineResult[]> {
  const { projectId, traceId } = context;

  console.log(`${traceId}: [Pipeline] Generating attributes for ${inputs.length} prop(s)`);

  const attributeResults = await attributesTool.run({ props: inputs });
  const successes = attributeResults.filter((r): r is GeneratePropsResultSuccess => r.success);

  if (successes.length === 0) {
    return attributeResults.map((r) => ({
      success: false,
      id: r.id,
      error: r.success ? new Error("unreachable") : r.error,
    }));
  }

  let insertedRefs: InsertedPropRef[];
  try {
    insertedRefs = await insertProps(successes.map((r) => ({ ...r.output, projectId })));
  } catch (e) {
    throw e;
  }

  let insertedEntities: PropWithAssets[] = [];
  if (context.publishPipelineEvent && insertedRefs.length > 0) {
    try {
      const fetched = await context.projectRepository.getEntities(
        insertedRefs.map((ref) => ({ entityId: ref.id, entityType: "prop" as const, entity: {} })),
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
      props: insertedRefs.map((ref) => ({
        id: ref.id,
        name: ref.name,
        version: (successes.find((s) => s.id === ref.id)?.output as any)?.version ?? attempt,
      })),
      generationRules,
      attempt,
    });

    for (const result of imageResults) {
      if (result.success && result.entity) enrichedById.set(result.id, result.entity);
    }
  } catch (e) {
    console.error(`${traceId}: [Pipeline] imagesTool failure`, e);
  }

  const insertedById = new Map(insertedEntities.map((e) => [e.id, e]));
  return attributeResults.map((r) => {
    if (!r.success) return r;
    const prop = enrichedById.get(r.id) ?? insertedById.get(r.id);
    if (!prop) return { success: false, id: r.id, error: new Error("Missing after insert") };
    return { success: true, id: r.id, prop };
  });
}

// ============================================================================
// TOOL CLASS
// ============================================================================

export interface GeneratePropsPipelineDeps {
  context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
  attributesTool: GeneratePropAttributesTool;
  imagesTool: GeneratePropImagesTool;
  insertProps: (props: Array<PropAttributes & { projectId: string }>) => Promise<InsertedPropRef[]>;
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

  async _call(input: GeneratePropsPipelineInput): Promise<string> {
    const results = await run(
      input.props,
      input.generationRules,
      input.attempt,
      this.deps.context,
      this.deps.attributesTool,
      this.deps.imagesTool,
      this.deps.insertProps,
    );
    return serialiseResults(results);
  }

  async run(input: GeneratePropsPipelineInput): Promise<GeneratePropsPipelineResult[]> {
    return run(
      input.props,
      input.generationRules,
      input.attempt,
      this.deps.context,
      this.deps.attributesTool,
      this.deps.imagesTool,
      this.deps.insertProps,
    );
  }
}

export function createGeneratePropsPipelineTool(
  deps: GeneratePropsPipelineDeps,
  params?: ToolParams,
): GeneratePropsPipelineTool {
  return new GeneratePropsPipelineTool(deps, params);
}
