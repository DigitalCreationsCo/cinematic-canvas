import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { Dispatcher } from "#shared/services/dispatcher.js";
import { jobPayloadSchemas } from "#shared/types/job.types.js";

interface DispatchGenerateScenesToolDeps {
  context: ToolContext<TextModelController> & {
    dispatcher: Dispatcher;
    teamId: string;
    userId: string;
  };
}

// sceneFields: CreateSceneWithEntitiesInput,
//   sceneIds: z.array(IdentityBase.shape.id),
const DispatchScenesInput = jobPayloadSchemas["CREATE_SCENES_WITH_ENTITIES"];
type DispatchScenesInput = z.infer<typeof DispatchScenesInput>;

class DispatchGenerateScenesTool extends StructuredTool<typeof DispatchScenesInput> {
  name = "generate_scenes";
  description = "Takes required info from the user and dispatches a job to generate scenes and images.";
  schema = DispatchScenesInput;

  private readonly context: DispatchGenerateScenesToolDeps["context"];

  constructor(deps: DispatchGenerateScenesToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
  }

  async _call(input: DispatchScenesInput) {
    const { projectId, worldId, teamId, userId } = this.context;

    await this.context.dispatcher.ensureJob({
      workflowId: undefined,
      nodeName: "DispatchGenerateScenesTool",
      jobType: "CREATE_SCENES_WITH_ENTITIES",
      assetKey: "scene_start_frame" as const,
      entityId: projectId,
      teamId,
      userId,
      payload: input,
    });

    if (this.context.publishPipelineEvent) {
      await this.context.publishPipelineEvent({
        type: "ENTITY_CREATED",
        worldId,
        payload: input.sceneIds.map((id) => ({
          entityId: id,
          entityType: "scene",
          entity: { id },
        })),
      });
    }

    return JSON.stringify({
      summary: `Dispatched ${input.sceneIds.length} scene(s) for generation.`,
    });
  }
}

export function createDispatchScenesInputTool(
  deps: DispatchGenerateScenesToolDeps,
  params?: ToolParams,
): DispatchGenerateScenesTool {
  return new DispatchGenerateScenesTool(deps, params);
}
