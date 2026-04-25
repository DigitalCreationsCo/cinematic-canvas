import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController, UserMessage } from "#shared/lm/text-model-controller.js";
import { CharacterAttributes } from "#shared/types/index.js";
import { getModelCompatibleSchema } from "#shared/utils/utils.js";

const ParseCharactersInput = z.string();

export type ParseCharactersInput = z.input<typeof ParseCharactersInput>;

const CharacterParseResult = z.object({
    characters: z.array(CharacterAttributes),
});

type ToolResultItem =
    | { success: true; characters: CharacterAttributes[] }
    | { success: false; error: string };

function serialiseResults(raw: CharacterAttributes[]): string {
    const items: ToolResultItem[] = [{
        success: true,
        characters: raw,
    }];

    return JSON.stringify({
        summary: { total: raw.length, succeeded: 1, failed: 0 },
        results: items,
    });
}

async function run(
    text: string,
    context: ToolContext<TextModelController>
): Promise<CharacterAttributes[]> {
    const prompt = `You are an expert creative writer.
Analyze the following text and extract ALL distinct characters mentioned.
For each character, extract their name and any attributes directly inferable from context.
Return an empty array if no clear characters are present.

Text: "${text}"

Respond ONLY with valid JSON matching the schema.`;

    const responseJsonSchema = getModelCompatibleSchema(CharacterParseResult);
    const result = await context.provider.generateContent({
        model: context.provider.textModel,
        messages: [new UserMessage({ content: [{ type: 'text', text: prompt }] })],
        config: { responseJsonSchema },
    });

    const raw = result.text?.replace(/```json\n?|\n?```/g, "") ?? '{"characters":[]}';
    const { characters } = CharacterParseResult.parse(JSON.parse(raw));
    return characters;
}

export interface ParseCharactersToolDeps {
    context: ToolContext<TextModelController>;
}

class ParseCharactersTool extends StructuredTool<typeof ParseCharactersInput> {
    name = "parse_characters";
    description = "Parses plain text and extracts character attributes.";
    schema = ParseCharactersInput;

    private readonly context: ParseCharactersToolDeps["context"];

    constructor(deps: ParseCharactersToolDeps, params?: ToolParams) {
        super(params);
        this.context = deps.context;
    }

    async _call(
        input: ParseCharactersInput,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {
        const { traceId } = this.context;
        console.log(`${traceId}: ParseCharactersTool invoked.`);

        const parsed = await run(input, this.context);
        const output = serialiseResults(parsed);
        console.log(`${traceId}: ParseCharactersTool complete.`);
        return output;
    }

    async run(input: ParseCharactersInput) {
        try {
            return await run(input, this.context);
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
}

export function createParseCharactersTool(
    deps: ParseCharactersToolDeps,
    params?: ToolParams
): ParseCharactersTool {
    return new ParseCharactersTool(deps, params);
}