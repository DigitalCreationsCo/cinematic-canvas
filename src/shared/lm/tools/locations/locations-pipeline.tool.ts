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
import { SaveAssetsCallback } from "#shared/types/pipeline.types.js";

// ============================================================================
// INPUT
// ============================================================================

const LocationBaseWithIdAndImages = LocationBase.partial().extend({
  id: z.uuid(),
  images: z.array(UploadResult).optional(),
});

const GenerateLocationsPipelineInput = z.object({
  locations: z.array(LocationBaseWithIdAndImages),
  generationRules: z.array(z.string()),
  attempt: z.number(),
});

export type GenerateLocationsPipelineInput = z.input<typeof GenerateLocationsPipelineInput>;

// ============================================================================
// OUTPUT
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



// ============================================================================
// TOOL CLASS
// ============================================================================

export interface GenerateLocationsPipelineDeps {
  context: ToolContext<TextModelController> & {
    projectRepository: ProjectRepository;
    saveAssets: SaveAssetsCallback;
  };
  attributesTool: GenerateLocationAttributesTool;
  imagesTool: GenerateLocationImagesTool;
  insertLocations: (locations: Array<z.input<typeof LocationBase>>) => Promise<LocationWithAssets[]>;
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
    const results = await this.run(input);
    return serialiseResults(results);
  }

  async run(
    { locations, generationRules, attempt }: GenerateLocationsPipelineInput,
  ): Promise<GenerateLocationsPipelineResult[]> {
    const { context, attributesTool, imagesTool, insertLocations } = this.deps;
    const { projectId, traceId } = context;

    console.log(`${traceId}: [Pipeline] Generating attributes for ${locations.length} location(s)`);

    const attributeResults =
      await attributesTool.run(locations);

    const successes = attributeResults.filter((r): r is GenerateLocationsResultSuccess => r.success);

    if (successes.length === 0) {
      console.warn(`${traceId}: [Pipeline] No attributes succeeded — skipping insert and image generation`);
      return attributeResults.map((r) => ({
        success: false as const,
        id: r.id,
        error: r.success ? new Error("unreachable") : r.error,
      }));
    }

    let insertResults: LocationWithAssets[];
    try {
      insertResults = await insertLocations(successes.map(({ attributes, id }) => ({ ...attributes, id, projectId })));
      console.log(`${traceId}: [Pipeline] Inserted ${insertResults.length} location(s) into DB`);
    } catch (e) {
      console.error(`${traceId}: [Pipeline] Insert failed — aborting image generation`, e);
      throw e;
    }

    let insertedEntities: LocationWithAssets[] = [];
    if (context.publishPipelineEvent && insertResults.length > 0) {
      try {
        const fetched = await context.projectRepository.getEntities(
          insertResults.map((ref) => ({
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
      locations: insertResults.map((ref) => {
        const { attributes } = successes.find((s) => s.id === ref.id)!;
        return {
          ...attributes,
          id: ref.id,
          version: 1
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
}

export function createGenerateLocationsPipelineTool(
  deps: GenerateLocationsPipelineDeps,
  params?: ToolParams,
): GenerateLocationsPipelineTool {
  return new GenerateLocationsPipelineTool(deps, params);
}
