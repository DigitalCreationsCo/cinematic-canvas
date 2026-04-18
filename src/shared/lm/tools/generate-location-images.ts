import { TextModelController } from "#shared/lm/text-model-controller.js";
import { generateImage } from "#shared/lm/tools/generate-image.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { LocationAttributes } from "#shared/types/index.js";

/** Generates a landscape-orientation location image. */
export async function generateLocationImage(
    attrs: Partial<LocationAttributes>,
    context: ToolContext<TextModelController>
): Promise<{ imageBytes: string; mimeType: string }> {

    const prompt = `Cinematic location visualization.
Name: ${attrs.name ?? "Unknown"}
${attrs.description ? `Description: ${attrs.description}` : ""}
High quality, film production ready. Landscape orientation.`;
    return generateImage({ prompt, aspectRatio: "16:9" }, context);
}