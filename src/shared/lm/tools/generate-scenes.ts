import { generateAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "../text-model-controller.js";
import {
    CharacterAttributes,
    LocationAttributes,
    SceneAttributes,
} from "../../types/index.js";
import { z } from "zod";

interface GenerateSceneAttributesParameters {
    fields: Partial<SceneAttributes>,
    characters?: (Partial<CharacterAttributes> & { referenceId: string })[];
    location?: (Partial<LocationAttributes> & { referenceId: string });
    startFrameGcsUri?: string;
    startFrameMimeType?: string;
    endFrameGcsUri?: string;
    endFrameMimeType?: string;
};

/**
 * Produces a complete SceneAttributes object from a partial.
 * Supply context (character names, location name) so the LLM can ground
 * cinematic details in the actual cast and setting.
 * Entity-relationship fields (characterReferenceIds, locationReferenceId,
 * characterIds, locationId) are NOT generated — they must be set by the caller.
 */
export async function generateSceneAttributes({
    fields,
    characters,
    location,
    startFrameGcsUri,
    startFrameMimeType,
    endFrameGcsUri,
    endFrameMimeType,
}: GenerateSceneAttributesParameters,
    toolContext: ToolContext<TextModelController>
): Promise<SceneAttributes> {

    const contextHint = characters || location
        ? `\nScene context — Characters: ${JSON.stringify(characters?.map(c => c.name).join("\n")) || "unknown"}; Location: ${JSON.stringify(location?.name) || "unknown"}`
        : "";
    return generateAttributes({
        schema: SceneAttributes,
        partial: fields,
        entityDescription: `scene specification${contextHint}`,
        images: [
            ...(startFrameGcsUri && startFrameMimeType ? [{ gcsUri: startFrameGcsUri, mimeType: startFrameMimeType }] : []),
            ...(endFrameGcsUri && endFrameMimeType ? [{ gcsUri: endFrameGcsUri, mimeType: endFrameMimeType }] : [])
        ]
    },
        toolContext
    );
}