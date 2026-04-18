import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController, Tool } from "../text-model-controller.js";
import {
    CharacterAttributes,
    LocationAttributes,
    SceneAttributes,
} from "../../types/index.js";
import { getModelCompatibleSchema } from "../../utils/utils.js";
import { z } from "zod";

export async function generateImage(
    params: {
        prompt: string,
        aspectRatio: "9:16" | "16:9"
    },
    context: ToolContext<TextModelController>
): Promise<{ imageBytes: string; mimeType: string }> {
    const result = await context.provider.generateImages({
        model: context.provider.imageModel,
        prompt: params.prompt,
        config: { numberOfImages: 1, aspectRatio: params.aspectRatio, imageSize: "1K", outputMimeType: "image/png" },
    });

    const image = result.generatedImages?.[0]?.image;
    if (!image?.imageBytes) throw new Error("Image generation returned no output");

    return { imageBytes: image.imageBytes, mimeType: image.mimeType ?? "image/png" };
}

