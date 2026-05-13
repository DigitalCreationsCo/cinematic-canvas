import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { Dispatcher } from "#shared/services/dispatcher.js";
import { CharacterCondensed } from "#shared/types/storyboard.types.js";
import { generateId } from "#shared/utils/id.js";

interface DispatchGenerateCharactersToolDeps {
  context: ToolContext<TextModelController> & {
    dispatcher: Dispatcher;
    teamId: string;
    userId: string;
  };
}

const DispatchCharactersInput = z.object({
  characters: z.array(CharacterCondensed.omit({ id: true })),
});
type DispatchCharactersInput = z.infer<typeof DispatchCharactersInput>;

class DispatchGenerateCharactersTool extends StructuredTool<typeof DispatchCharactersInput> {
  name = "generate_characters";
  description = "Takes required info from the user and dispatches a job to generate characters and images.";
  schema = DispatchCharactersInput;

  private readonly context: DispatchGenerateCharactersToolDeps["context"];

  constructor(deps: DispatchGenerateCharactersToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
  }

  async _call(input: DispatchCharactersInput) {
    const { projectId, worldId, teamId, userId } = this.context;

    const entities = input.characters.map((char) => {
      const id = generateId();
      return {
        entityType: "character" as const,
        data: { ...char, id },
        images: [],
      };
    });

    await this.context.dispatcher.ensureJob({
      workflowId: undefined,
      nodeName: "DispatchGenerateCharactersTool",
      jobType: "GENERATE_ENTITIES",
      assetKey: "character_image" as const,
      entityId: entities[0].data.id,
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
          entityType: "character",
          entity: data,
        })),
      });
    }

    return JSON.stringify({
      summary: `Dispatched ${entities.length} character(s) for generation.`,
    });
  }
}

export function createDispatchCharactersInputTool(
  deps: DispatchGenerateCharactersToolDeps,
  params?: ToolParams,
): DispatchGenerateCharactersTool {
  return new DispatchGenerateCharactersTool(deps, params);
}
