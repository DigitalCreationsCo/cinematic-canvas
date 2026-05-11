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
import { createGeneratePropImagesTool } from "./props/generate-prop-images.tool.js";
import { createGeneratePropsTool } from "./props/generate-props.tool.js";
import { createGenerateSceneFramesTool } from "./scenes/generate-scene-frames.tool.js";
import { createGenerateScenesTool } from "./scenes/generate-scenes.tool.js";
import { createInsertCharactersTool } from "./characters/insert-characters.tool.js";
import { createInsertLocationsTool } from "./locations/insert-locations.tool.js";
import { createInsertPropsTool } from "./props/insert-props.tool.js";
import { createInsertScenesTool } from "./scenes/insert-scenes.tool.js";

export const createAssistantTools = ({
  context,
}: {
  context: ToolContext<TextModelController> & {
    projectRepository: ProjectRepository;
    incrementAttempt: IncrementAttemptHook;
  };
}): StructuredTool[] => {
  const parseCharacters = createParseCharactersTool({ context });
  const insertCharacters = createInsertCharactersTool({ context });
  const generateCharacterImages = createGenerateCharacterImagesTool({ context: context });
  const generateCharacters = createGenerateCharactersTool({
    context,
    imagesTool: generateCharacterImages,
    insertCharacters: (characters) => insertCharacters.run({ characters }),
  });

  const parseLocations = createParseLocationsTool({ context });
  const insertLocations = createInsertLocationsTool({ context });
  const generateLocationImages = createGenerateLocationImagesTool({ context });
  const generateLocations = createGenerateLocationsTool({
    context,
    imagesTool: generateLocationImages,
    insertLocations: (locations) => insertLocations.run({ locations }),
  });

  const insertProps = createInsertPropsTool({ context });
  const generatePropImages = createGeneratePropImagesTool({ context });
  const generateProps = createGeneratePropsTool({
    context,
    imagesTool: generatePropImages,
    insertProps: (props) => insertProps.run({ props }),
  });

  const generateSceneImages = createGenerateSceneFramesTool({ context });
  const insertScenes = createInsertScenesTool({ context });
  const generateScenes = createGenerateScenesTool({
    context,
    imagesTool: generateSceneImages,
    insertScenes: (scenes) => insertScenes.run({ scenes }),
  });

  return [
    parseCharacters,
    generateCharacterImages,
    generateCharacters,

    parseLocations,
    generateLocationImages,
    generateLocations,

    generatePropImages,
    generateProps,

    generateSceneImages,
    generateScenes,
  ];
};

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
export { createGeneratePropImagesTool } from "./props/generate-prop-images.tool.js";
export { createGenerateSceneFramesTool } from "./scenes/generate-scene-frames.tool.js";
export { createGenerateImagesTool } from "./generate-images.tool.js";
