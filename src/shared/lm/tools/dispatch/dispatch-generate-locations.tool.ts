import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { Dispatcher } from "#shared/services/dispatcher.js";
import { LocationCondensed } from "#shared/types/storyboard.types.js";
import { generateId } from "#shared/utils/id.js";

interface DispatchGenerateLocationsToolDeps {
  context: ToolContext<TextModelController> & {
    dispatcher: Dispatcher;
    teamId: string;
    userId: string;
  };
}

const DispatchLocationsInput = z.object({
  locations: z.array(LocationCondensed.omit({ id: true })),
});
type DispatchLocationsInput = z.infer<typeof DispatchLocationsInput>;

class DispatchGenerateLocationsTool extends StructuredTool<typeof DispatchLocationsInput> {
  name = "generate_locations";
  description = "Dispatches a background job to generate location attributes and images.";
  schema = DispatchLocationsInput;

  private readonly context: DispatchGenerateLocationsToolDeps["context"];

  constructor(deps: DispatchGenerateLocationsToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
  }

  async _call(input: DispatchLocationsInput) {
    const { projectId, worldId, teamId, userId } = this.context;

    const entities = input.locations.map((loc) => {
      const id = generateId();
      return {
        entityType: "location" as const,
        data: { ...loc, id },
        images: [],
      };
    });

    await this.context.dispatcher.ensureJob({
      workflowId: undefined,
      nodeName: "DispatchGenerateCharactersTool",
      jobType: "GENERATE_ENTITIES",
      assetKey: "location_image" as const,
      entityId: projectId,
      teamId,
      userId,
      payload: entities,
    });

    if (this.context.publishPipelineEvent) {
      await this.context.publishPipelineEvent({
        type: "ENTITY_CREATED",
        worldId,
        payload: entities.map(({ data }) => ({
          entityId: data.id,
          entityType: "location",
          entity: data,
        })),
      });
    }

    return JSON.stringify({
      summary: `Dispatched ${entities.length} location(s) for generation.`,
    });
  }
}

export function createDispatchLocationsInputTool(
  deps: DispatchGenerateLocationsToolDeps,
  params?: ToolParams,
): DispatchGenerateLocationsTool {
  return new DispatchGenerateLocationsTool(deps, params);
}
