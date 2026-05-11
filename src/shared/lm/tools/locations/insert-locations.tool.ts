import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { LocationWithAssets } from "#shared/types/workflow.types.js";
import { InsertLocation } from "#shared/types/schema.types.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { mapDomainLocationToInsertLocation } from "#shared/entity/location-mappers.js";

const InsertLocationsInput = z.object({ locations: z.array(InsertLocation) });
export type InsertLocationsInput = z.input<typeof InsertLocationsInput>;

type ToolResultItem = { success: true; location: LocationWithAssets } | { success: false; error: string };

function serialiseResults(raw: Awaited<ReturnType<typeof run>>): string {
  const items: ToolResultItem[] = raw.map((r) =>
    r.success ? { success: true, location: r.location } : { success: false, error: r.error?.message ?? "unknown" },
  );

  const succeeded = items.filter((i) => i.success).length;
  const failed = items.filter((i) => !i.success).length;

  return JSON.stringify({
    summary: { total: items.length, succeeded, failed },
    results: items,
  });
}

async function run(locationsData: InsertLocationsInput["locations"], context: InsertLocationsToolDeps["context"]) {
  try {
    const toInsertLocations = locationsData.map(mapDomainLocationToInsertLocation);
    const insertedLocations = await context.projectRepository.createLocations(
      toInsertLocations[0].projectId,
      toInsertLocations,
    );

    return Promise.all(
      insertedLocations.map(async (res) => {
        return { success: true as const, location: res };
      }),
    );
  } catch (e) {
    return locationsData.map((l) => ({ success: false as const, location: l, error: e as Error }));
  }
}

// ---------------------------------------------------------------------------
// StructuredTool
// ---------------------------------------------------------------------------

export interface InsertLocationsToolDeps {
  context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
}

class InsertLocationsTool extends StructuredTool<typeof InsertLocationsInput> {
  name = "insert_locations";
  description = "Saves location attributes objects into database records.";
  schema = InsertLocationsInput;

  private readonly context: InsertLocationsToolDeps["context"];

  constructor(deps: InsertLocationsToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
  }

  async _call({ locations }: InsertLocationsInput, _runManager?: CallbackManagerForToolRun): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: InsertLocationsTool invoked. count: ${locations.length}`);

    const inserted = await run(locations, this.context);
    const output = serialiseResults(inserted);
    console.log(`${traceId}: InsertLocationsTool complete. ${output}`);
    return output;
  }

  async run({ locations }: InsertLocationsInput) {
    try {
      const result = await run(locations, this.context);
      return result.map((r) => {
        if (r.success) {
          return r.location;
        }
        throw r.error;
      });
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory — preferred way to instantiate so callers don't touch the class directly
// ---------------------------------------------------------------------------

export function createInsertLocationsTool(deps: InsertLocationsToolDeps, params?: ToolParams): InsertLocationsTool {
  return new InsertLocationsTool(deps, params);
}
