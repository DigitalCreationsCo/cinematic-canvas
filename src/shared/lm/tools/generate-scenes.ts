import { generateAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "../text-model-controller.js";
import {
    CharacterAttributes,
    LocationAttributes,
    SceneAttributes,
} from "../../types/index.js";
import { z } from "zod";

/**
 * Produces a complete SceneAttributes object from a partial.
 * Supply context (character names, location name) so the LLM can ground
 * cinematic details in the actual cast and setting.
 * Entity-relationship fields (characterReferenceIds, locationReferenceId,
 * characterIds, locationId) are NOT generated — they must be set by the caller.
 */
export async function generateSceneAttributes({
    partial,
    context,
    imageGcsUri,
    mimeType,
    traceId
}: {
    partial: Partial<SceneAttributes>,
    context?: { characters?: (Partial<CharacterAttributes> & { referenceId: string })[]; location?: (Partial<LocationAttributes> & { referenceId: string }) },
    imageGcsUri?: string,
    mimeType?: string,
    traceId: string
},
    toolContext: ToolContext<TextModelController>
): Promise<SceneAttributes> {

    const contextHint = context
        ? `\nScene context — Characters: ${JSON.stringify(context.characters?.join("\n")) || "unknown"}; Location: ${JSON.stringify(context.location) || "unknown"}`
        : "";
    return generateAttributes({
        schema: SceneAttributes,
        partial,
        entityDescription: `scene specification${contextHint}`,
        imageGcsUri,
        mimeType
    },
        toolContext
    );
}