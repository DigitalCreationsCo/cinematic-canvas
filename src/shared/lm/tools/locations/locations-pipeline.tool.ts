import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { LocationAttributes } from "#shared/types/location.types.js";
import { LocationBase, LocationWithAssets } from "#shared/types/workflow.types.js";
import { UploadResult } from "#shared/types/base.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import {
  GenerateLocationAttributesTool,
  GenerateLocationsResultSuccess,
} from "#shared/lm/tools/locations/generate-locations-attributes.tool.js";
import { GenerateLocationImagesTool } from "#shared/lm/tools/locations/generate-locations-images.tool.js";

// ============================================================================
// SCHEMA
// ============================================================================

const LocationSeedSchema = LocationBase.partial().extend({
  id: z.uuid(),
  images: z.array(UploadResult).optional(),
});

const GenerateLocationsPipelineInput = z.object({
  locations: z.array(LocationSeedSchema),
  generationRules: z.array(z.string()),
  attempt: z.number(),
});

export type GenerateLocationsPipelineInput = z.input<typeof GenerateLocationsPipelineInput>;

// ============================================================================
// INTERNAL TYPES
// ============================================================================

type InsertedLocationRef = { id: string; name: string };

// ============================================================================
// RESULT TYPES
// ============================================================================

export type GenerateLocationsPipelineResultSuccess = {
  success: true;
  id: string;
  location: LocationWithAssets;
};

export type GenerateLocationsPipelineResult =
  | GenerateLocationsPipelineResultSuccess
  | { success: false; id: string; error: Error };

// ============================================================================
// SERIALISER
// ============================================================================

function serialiseResults(results: GenerateLocationsPipelineResult[]): string {
  const items = results.map((r) =>
    r.success
      ? { success: true, id: r.id, location: r.location }
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
  inputs: GenerateLocationsPipelineInput["locations"],
  generationRules: string[],
  attempt: number,
  context: GenerateLocationsPipelineDeps["context"],
  attributesTool: GenerateLocationAttributesTool,
  imagesTool: GenerateLocationImagesTool,
  insertLocations: GenerateLocationsPipelineDeps["insertLocations"],
): Promise<GenerateLocationsPipelineResult[]> {
  const { projectId, traceId } = context;

  console.log(`${traceId}: [Pipeline] Generating attributes for ${inputs.length} location(s)`);

  const attributeResults = await attributesTool.run({ locations: inputs, generationRules, attempt });

  const successes = attributeResults.filter((r): r is GenerateLocationsResultSuccess => r.success);

  if (successes.length === 0) {
    console.warn(`${traceId}: [Pipeline] No attributes succeeded — skipping insert and image generation`);
    return attributeResults.map((r) => ({
      success: false as const,
      id: r.id,
      error: r.success ? new Error("unreachable") : r.error,
    }));
  }

  let insertedRefs: InsertedLocationRef[];
  try {
    insertedRefs = await insertLocations(successes.map((r) => ({ ...r.output, projectId })));
    console.log(`${traceId}: [Pipeline] Inserted ${insertedRefs.length} location(s) into DB`);
  } catch (e) {
    console.error(`${traceId}: [Pipeline] Insert failed — aborting image generation`, e);
    throw e;
  }

  let insertedEntities: LocationWithAssets[] = [];
  if (context.publishPipelineEvent && insertedRefs.length > 0) {
    try {
      const fetched = await context.projectRepository.getEntities(
        insertedRefs.map((ref) => ({
          entityId: ref.id,
          entityType: "location" as const,
          entity: {},
        })),
      );

      insertedEntities = fetched.map(({ entity }) => entity as LocationWithAssets);

      await context.publishPipelineEvent({
        type: "ENTITY_CREATED",
        worldId: context.worldId,
        payload: fetched.map(({ entity, entityType }) => ({
          entityId: entity.id,
          entityType: entityType as "location",
          entity: entity as LocationWithAssets,
        })),
      });

      console.log(`${traceId}: [Pipeline] ENTITY_CREATED emitted for ${insertedEntities.length} location(s)`);
    } catch (e) {
      console.error(`${traceId}: [Pipeline] ENTITY_CREATED publish failed (non-fatal)`, e);
    }
  }

  const imageInput = {
    locations: insertedRefs.map((ref) => {
      const attrResult = successes.find((s) => s.id === ref.id);
      return {
        id: ref.id,
        name: ref.name,
        version: (attrResult?.output as any)?.version ?? attempt,
      };
    }),
    generationRules,
    attempt,
  };

  const enrichedById = new Map<string, LocationWithAssets>();

  try {
    const imageResults = await imagesTool.run(imageInput);

    for (const result of imageResults) {
      if (result.success && result.entity) {
        enrichedById.set(result.id, result.entity);
      }
    }

    const imageFailures = imageResults.filter((r) => !r.success);
    console.log(
      `${traceId}: [Pipeline] Image generation complete. succeeded=${imageResults.filter((r) => r.success).length} failed=${imageFailures.length}`,
    );
  } catch (e) {
    console.error(`${traceId}: [Pipeline] imagesTool.run() threw — image generation skipped`, e);
  }

  const insertedById = new Map(insertedEntities.map((e) => [e.id, e]));

  return attributeResults.map((r) => {
    if (!r.success) return r;
    const location = enrichedById.get(r.id) ?? insertedById.get(r.id);
    if (!location) return { success: false as const, id: r.id, error: new Error("Entity missing after insert") };
    return { success: true as const, id: r.id, location };
  });
}

// ============================================================================
// TOOL CLASS
// ============================================================================

export interface GenerateLocationsPipelineDeps {
  context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
  attributesTool: GenerateLocationAttributesTool;
  imagesTool: GenerateLocationImagesTool;
  insertLocations: (locations: Array<LocationAttributes & { projectId: string }>) => Promise<InsertedLocationRef[]>;
}

class GenerateLocationsPipelineTool extends StructuredTool<typeof GenerateLocationsPipelineInput> {
  name = "generate_locations_pipeline";
  description = "Full location creation pipeline: generates attributes, inserts into DB, and generates concept images.";
  schema = GenerateLocationsPipelineInput;

  constructor(
    private readonly deps: GenerateLocationsPipelineDeps,
    params?: ToolParams,
  ) {
    super(params);
  }

  async _call(input: GenerateLocationsPipelineInput, _runManager?: CallbackManagerForToolRun): Promise<string> {
    const { traceId } = this.deps.context;
    const results = await run(
      input.locations,
      input.generationRules,
      input.attempt,
      this.deps.context,
      this.deps.attributesTool,
      this.deps.imagesTool,
      this.deps.insertLocations,
    );
    return serialiseResults(results);
  }

  async run(input: GenerateLocationsPipelineInput): Promise<GenerateLocationsPipelineResult[]> {
    return run(
      input.locations,
      input.generationRules,
      input.attempt,
      this.deps.context,
      this.deps.attributesTool,
      this.deps.imagesTool,
      this.deps.insertLocations,
    );
  }
}

export function createGenerateLocationsPipelineTool(
  deps: GenerateLocationsPipelineDeps,
  params?: ToolParams,
): GenerateLocationsPipelineTool {
  return new GenerateLocationsPipelineTool(deps, params);
}
