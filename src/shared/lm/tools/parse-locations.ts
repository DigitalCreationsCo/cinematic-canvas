import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { LocationAttributes } from "#shared/types/index.js";
import { getModelCompatibleSchema } from "#shared/utils/utils.js";
import { z } from "zod";

const LocationParseResult = z.object({
    location: z.object({ name: z.string() }).passthrough().nullable(),
});

/**
 * Parses plain text and returns a partial LocationAttributes object, or null
 * if no clear location is described.
 */
export async function parseLocationFromText(
    text: string,
    context: ToolContext<TextModelController>
): Promise<Partial<LocationAttributes> | null> {

    const prompt = `You are an expert creative writer.
Analyze the following text and extract location information.
Return null for the location field if no clear location is described.

Text: "${text}"

Respond ONLY with valid JSON matching the schema.`;

    const result = await context.provider.generateContent({
        model: context.provider.textModel,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
            responseMimeType: "application/json",
            responseSchema: getModelCompatibleSchema(LocationParseResult),
        },
    });

    const raw = result.text?.replace(/```json\n?|\n?```/g, "") ?? '{"location":null}';
    const { location } = LocationParseResult.parse(JSON.parse(raw));
    return location as Partial<LocationAttributes> | null;
}