import { StructuredTool } from "@langchain/core/tools";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { IncrementAttemptHook } from "#shared/types/pipeline.types.js";

import { createParseCharactersTool } from "./characters/parse-characters.tool.js";
import { createParseLocationsTool } from "./locations/parse-locations.tool.js";
import { createGenerateLocationImagesTool } from "./locations/generate-location-images.tool.js";
import { createGenerateCharacterImagesTool } from "./characters/generate-character-images.tool.js";
import { createGenerateCharactersTool } from "./characters/generate-characters.tool.js";
import { createGenerateLocationsTool } from "./locations/generate-locations.tool.js";
import { createGeneratePropsTool } from "./props/generate-props.tool.js";
import { createGenerateScenesTool } from "./scenes/generate-scenes.tool.js";
import { createInsertCharactersTool } from "./characters/insert-characters.tool.js";
import { createInsertLocationsTool } from "./locations/insert-locations.tool.js";
import { createInsertPropsTool } from "./props/insert-props.tool.js";
import { createInsertScenesTool } from "./scenes/insert-scenes.tool.js";

export const createAssistantTools = ({ context }: {
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository; incrementAttempt: IncrementAttemptHook }
}): StructuredTool[] => ([
    createParseCharactersTool({ context }),
    createGenerateCharactersTool({ context }),
    createGenerateCharacterImagesTool({ context: context }),
    createInsertCharactersTool({ context }),
    createParseLocationsTool({ context }),
    createGenerateLocationsTool({ context }),
    createGenerateLocationImagesTool({ context }),
    createInsertLocationsTool({ context }),
    createGeneratePropsTool({ context }),
    createInsertPropsTool({ context }),
    createGenerateScenesTool({ context }),
    createInsertScenesTool({ context }),
]);

export { createParseCharactersTool } from "./characters/parse-characters.tool.js";
export { createParseLocationsTool } from "./locations/parse-locations.tool.js";
export { createInsertCharactersTool } from "./characters/insert-characters.tool.js";
export { createInsertLocationsTool } from "./locations/insert-locations.tool.js";
export { createInsertPropsTool } from "./props/insert-props.tool.js";
export { createGenerateStoryBlocksTool } from "./generate-storyblocks.js";
export { createGenerateCharactersTool } from "./characters/generate-characters.tool.js";
export { createGenerateLocationsTool } from "./locations/generate-locations.tool.js";
export { createGeneratePropsTool } from "./props/generate-props.tool.js";
export { createGenerateScenesTool } from "./scenes/generate-scenes.tool.js";
export { createGenerateCharacterImagesTool } from "./characters/generate-character-images.tool.js";
export { createGenerateLocationImagesTool } from "./locations/generate-location-images.tool.js";
export { createGenerateImagesTool } from "./generate-images.tool.js";