import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController, UserMessage } from "#shared/lm/text-model-controller.js";
import { LocationAttributes } from "#shared/types/index.js";
import { getModelCompatibleSchema } from "#shared/utils/utils.js";

const ParseLocationsInput = z.string();

export type ParseLocationsInput = z.input<typeof ParseLocationsInput>;

const LocationParseResult = z.object({
    locations: z.array(LocationAttributes),
});

type ToolResultItem =
    | { success: true; locations: LocationAttributes[] }
    | { success: false; error: string };

function serialiseResults(raw: LocationAttributes[]): string {
    const items: ToolResultItem[] = [{
        success: true,
        locations: raw,
    }];

    return JSON.stringify({
        summary: { total: raw.length, succeeded: 1, failed: 0 },
        results: items,
    });
}

async function run(
    text: string,
    context: ToolContext<TextModelController>
): Promise<LocationAttributes[]> {
    const prompt = `You are an expert creative writer.
Analyze the following text and extract location information.
Return null for the location field if no clear location is described.

Text: "${text}"

Respond ONLY with valid JSON matching the schema.`;

    const responseJsonSchema = getModelCompatibleSchema(LocationParseResult);
    const result = await context.provider.generateContent({
        model: context.provider.textModel,
        messages: [new UserMessage({ content: prompt })],
        config: { responseJsonSchema },
    });

    const raw = result.text?.replace(/```json\n?|\n?```/g, "") ?? '{"locations":[]}';
    const { locations } = LocationParseResult.parse(JSON.parse(raw));
    return locations;
}

export interface ParseLocationsToolDeps {
    context: ToolContext<TextModelController>;
}

class ParseLocationsTool extends StructuredTool<typeof ParseLocationsInput> {
    name = "parse_locations";
    description = "Parses plain text and extracts location attributes.";
    schema = ParseLocationsInput;

    private readonly context: ParseLocationsToolDeps["context"];

    constructor(deps: ParseLocationsToolDeps, params?: ToolParams) {
        super(params);
        this.context = deps.context;
    }

    async _call(
        input: ParseLocationsInput,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {
        const { traceId } = this.context;
        console.log(`${traceId}: ParseLocationsTool invoked.`);

        const parsed = await run(input, this.context);
        const output = serialiseResults(parsed);
        console.log(`${traceId}: ParseLocationsTool complete.`);
        return output;
    }

    async run(input: ParseLocationsInput) {
        try {
            return await run(input, this.context);
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
}

export function createParseLocationsTool(
    deps: ParseLocationsToolDeps,
    params?: ToolParams
): ParseLocationsTool {
    return new ParseLocationsTool(deps, params);
}