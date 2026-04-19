import { TextModelController, UserMessage } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { LocationAttributes } from "#shared/types/index.js";
import { getModelCompatibleSchema } from "#shared/utils/utils.js";
import { z } from "zod";

const LocationParseResult = z.object({
    locations: z.array(LocationAttributes),
});

/**
 * Parses plain text and returns a partial LocationAttributes object, or null
 * if no clear location is described.
 */
export async function parseLocationsFromText(
    text: string,
    context: ToolContext<TextModelController>
): Promise<Array<LocationAttributes>> {

    const prompt = `You are an expert creative writer.
Analyze the following text and extract location information.
Return null for the location field if no clear location is described.

Text: "${text}"

Respond ONLY with valid JSON matching the schema.`;

    const responseJsonSchema = getModelCompatibleSchema(LocationParseResult);
    const result = await context.provider.generateContent({
        model: context.provider.textModel,
        messages: [new UserMessage({ content: prompt })],
        config: {
            responseJsonSchema: responseJsonSchema,
        },
    });

    const raw = result.text?.replace(/```json\n?|\n?```/g, "") ?? '{"location":null}';
    const { locations } = LocationParseResult.parse(JSON.parse(raw));
    return locations;
}