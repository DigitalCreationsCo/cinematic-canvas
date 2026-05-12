import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { Dispatcher } from "#shared/services/dispatcher.js";
import { JobControlPlane } from "#shared/services/job-control-plane.js";
import { CharacterCondensed } from "#shared/types/storyboard.types.js";
import { generateId } from "#shared/utils/id.js";

interface DispatchGeneratePropsToolDeps {
  context: ToolContext<TextModelController> & {
    dispatcher: Dispatcher;
    jobControlPlane: JobControlPlane;
  };
}

const DispatchPropsInput = z.object({
  props: z.array(CharacterCondensed),
});
type DispatchPropsInput = z.infer<typeof DispatchPropsInput>;

class DispatchGeneratePropsTool extends StructuredTool<typeof DispatchPropsInput> {
  name = "generate_props";
  description = "Dispatches a background job to generate prop attributes and images.";
  schema = DispatchPropsInput;

  private readonly context: DispatchGeneratePropsToolDeps["context"];

  constructor(deps: DispatchGeneratePropsToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
  }

  async _call(input: DispatchPropsInput) {
    const { projectId, worldId } = this.context;

    const entities = input.props.map((prop) => {
      const id = generateId();
      return {
        entityType: "prop" as const,
        data: { ...prop, id },
        images: [],
      };
    });

    await this.context.dispatcher.ensureJob({
      workflowId: undefined,
      nodeName: "DispatchGeneratePropsTool",
      jobType: "GENERATE_ENTITIES",
      assetKey: "image_file" as const,
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
          entityType: "prop",
          entity: data,
        })),
      });
    }

    return JSON.stringify({
      summary: `Dispatched ${entities.length} props(s) for generation.`,
    });
  }
}

export function createDispatchPropsInputTool(
  deps: DispatchGeneratePropsToolDeps,
  params?: ToolParams,
): DispatchGeneratePropsTool {
  return new DispatchGeneratePropsTool(deps, params);
}
