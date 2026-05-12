import { StructuredTool } from "@langchain/core/tools";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { IncrementAttemptHook } from "#shared/types/pipeline.types.js";
import { Dispatcher } from "#shared/services/dispatcher.js";
import { JobControlPlane } from "#shared/services/job-control-plane.js";

import { createDispatchCharactersInputTool } from "#shared/lm/tools/dispatch/dispatch-generate-characters.tool.js";
import { createDispatchPropsInputTool } from "#shared/lm/tools/dispatch/dispatch-generate-props.tool.js";
import { createDispatchLocationsInputTool } from "#shared/lm/tools/dispatch/dispatch-generate-locations.tool.js";
import { createDispatchScenesInputTool } from "#shared/lm/tools/dispatch/dispatch-generate-scenes.tool.js";

export { createGenerateCharactersPipelineTool } from "./characters/characters-pipeline.tool.js";
export { createGenerateCharacterAttributesTool } from "./characters/generate-characters-attributes.tool.js";
export { createGenerateCharacterImagesTool } from "./characters/generate-characters-images.tool.js";
export { createInsertCharactersTool } from "./characters/insert-characters.tool.js";

export { createGenerateLocationsPipelineTool } from "./locations/locations-pipeline.tool.js";
export { createGenerateLocationAttributesTool } from "./locations/generate-locations-attributes.tool.js";
export { createGenerateLocationImagesTool } from "./locations/generate-locations-images.tool.js";
export { createInsertLocationsTool } from "./locations/insert-locations.tool.js";

export { createGeneratePropsPipelineTool } from "./props/props-pipeline.tool.js";
export { createGeneratePropAttributesTool } from "./props/generate-props-attributes.tool.js";
export { createGeneratePropImagesTool } from "./props/generate-props-images.tool.js";
export { createInsertPropsTool } from "./props/insert-props.tool.js";

export { createGenerateScenesPipelineTool } from "./scenes/scenes-pipeline.tool.js";
export { createGenerateSceneAttributesTool } from "./scenes/generate-scenes-attributes.tool.js";
export { createGenerateSceneFramesTool } from "./scenes/generate-scene-frames.tool.js";
export { createInsertScenesTool } from "./scenes/insert-scenes.tool.js";

export { createParseEntitiesTool } from "./parse-entities.tool.js";
export { createGenerateImagesTool } from "./generate-images.tool.js";
export { createGenerateStoryBlocksTool } from "./generate-storyblocks.js";

export const createAssistantTools = ({
  context,
}: {
  context: ToolContext<TextModelController> & {
    projectRepository: ProjectRepository;
    incrementAttempt: IncrementAttemptHook;
    jobControlPlane: JobControlPlane;
    dispatcher: Dispatcher;
  };
}): StructuredTool[] => {
  return [
    createDispatchCharactersInputTool({ context }),
    createDispatchLocationsInputTool({ context }),
    createDispatchPropsInputTool({ context }),
    createDispatchScenesInputTool({ context }),
  ];
};
