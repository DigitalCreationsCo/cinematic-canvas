import { TextModelController } from "#shared/lm/text-model-controller.js";
import { generateImage } from "#shared/lm/tools/generate-image.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { CharacterAttributes } from "#shared/types/index.js";

/** Generates a portrait-orientation character image. */
export async function generateCharacterImages(
    attrs: Partial<CharacterAttributes>,
    context: ToolContext<TextModelController>
): Promise<{ imageBytes: string; mimeType: string }> {

    const prompt = `Cinematic character portrait.
Name: ${attrs.name ?? "Unknown"}
${attrs.description ? `Description: ${attrs.description}` : ""}
High quality, film production ready. Portrait orientation.`;
    return generateImage({ prompt, aspectRatio: "9:16" }, context);
}