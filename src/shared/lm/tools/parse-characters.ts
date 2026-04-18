// src/shared/tools/generation-tools.ts
// Stateless LLM utility class. All DB I/O and orchestration live in WorkerService.

import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "../text-model-controller.js";
import {
    CharacterAttributes,
} from "../../types/index.js";
import { getModelCompatibleSchema } from "../../utils/utils.js";
import { z } from "zod";

const CharacterParseResult = z.object({
    characters: z.array(
        z.object({ name: z.string() }).passthrough()
    ),
});

/**
 * Parses plain text and returns one partial CharacterAttributes object per
 * distinct character found. Returns an empty array when none are identified.
 */
export async function parseCharactersFromText(
    text: string,
    context: ToolContext<TextModelController>
): Promise<Array<Partial<CharacterAttributes>>> {

    const prompt = `You are an expert creative writer.
Analyze the following text and extract ALL distinct characters mentioned.
For each character, extract their name and any attributes directly inferable from context.
Return an empty array if no clear characters are present.

Text: "${text}"

Respond ONLY with valid JSON matching the schema.`;

    const responseJsonSchema = getModelCompatibleSchema(CharacterParseResult);
    const result = await context.provider.generateContent({
        model: context.provider.textModel,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
            responseJsonSchema: responseJsonSchema,
        },
    });

    const raw = result.text?.replace(/```json\n?|\n?```/g, "") ?? '{"characters":[]}';
    const { characters } = CharacterParseResult.parse(JSON.parse(raw));
    return characters as Partial<CharacterAttributes>[];
}


