import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { Dispatcher } from "#shared/services/dispatcher.js";
import { JobControlPlane } from "#shared/services/job-control-plane.js";
import { CharacterCondensed } from "#shared/types/storyboard.types.js";
import { generateId } from "#shared/utils/id.js";

interface DispatchGenerateLocationsToolDeps {
  context: ToolContext<TextModelController> & {
    dispatcher: Dispatcher;
    jobControlPlane: JobControlPlane;
  };
}

const DispatchLocationsInput = z.object({
  locations: z.array(CharacterCondensed),
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
    const { projectId, worldId } = this.context;

    const entities = input.locations.map((loc) => {
      const id = generateId();
      return {
        entityType: "location" as const,
        data: { ...loc, id },
        images: [],
      };
    });

    // 1. Prepare logical jobs for the Dispatcher
    // const jobs = entities.map((char) => ({
    //   type: "GENERATE_CHARACTERS" as const,
    //   uniqueKey: this.context.jobControlPlane.uniqueKey(projectId, `char-${char.id}`),
    //   payload: char, // Passes the initial name/description to the worker
    //   teamId,
    //   userId,
    //   worldId,
    //   assetKey: "character_image" as const,
    // }));

    // 2. Ensure jobs in DB and queue (Handles stubbing + idempotency)
    // await this.context.dispatcher.ensureBatchJobs("dispatch_generate_characters", undefined, jobs);
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

    // 2. Ensure jobs in DB and queue (Handles stubbing + idempotency)
    // await this.context.dispatcher.ensureBatchJobs("dispatch_generate_locations", undefined, jobs);

    // 3. Emit optimistic ENTITY_CREATED for the UI
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
