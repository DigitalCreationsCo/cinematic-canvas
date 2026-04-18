import { filterDefined, ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "../text-model-controller.js";
import {
    CharacterAttributes,
    LocationAttributes,
    SceneAttributes,
} from "../../types/index.js";
import { getModelCompatibleSchema } from "../../utils/utils.js";
import { z } from "zod";

interface GenerateAttributesParams<T> {
    schema: z.ZodType<T>,
    partial: Partial<T>,
    entityDescription: string,
    imageGcsUri?: string,
    mimeType?: string
}

/**
 * Unified attribute generation for any entity type.
 * The LLM fills ALL fields; then caller-supplied values overwrite the
 * generated ones — so user input is always preserved verbatim.
 */
export async function generateAttributes<T>({
    schema,
    partial,
    entityDescription,
    imageGcsUri,
    mimeType
}: GenerateAttributesParams<T>,
    context: ToolContext<TextModelController>
): Promise<T> {
    const alreadyFilled = Object.keys(
        filterDefined(partial as Record<string, unknown>)
    );

    const prompt = `You are an expert creative writer and world builder.
Complete the following ${entityDescription} by populating ONLY missing or empty fields.
DO NOT change these already-filled fields: ${alreadyFilled.length ? alreadyFilled.join(", ") : "(none — fill everything)"}.

Current (partial) data:
${JSON.stringify(partial, null, 2)}

Return ONLY valid JSON with ALL fields populated.
Preserve filled fields exactly. Fill missing fields with rich, specific, internally consistent creative content.`;

    const parts: any[] = [{ text: prompt }];
    if (imageGcsUri && mimeType) {
        parts.push({ fileData: { mimeType, fileUri: imageGcsUri } });
    }

    const responseJsonSchema = getModelCompatibleSchema(schema);
    const result = await context.provider.generateContent({
        model: context.provider.textModel,
        contents: [{ role: "user", parts }],
        config: {
            responseJsonSchema: responseJsonSchema
        },
    });

    if (!result.text) throw new Error(`LLM returned no content for ${entityDescription}`);

    const generated = JSON.parse(result.text.replace(/```json\n?|\n?```/g, ""));

    // Caller-provided values always win over LLM output.
    const merged = { ...generated, ...filterDefined(partial as Record<string, unknown>) };
    return schema.parse(merged);
}