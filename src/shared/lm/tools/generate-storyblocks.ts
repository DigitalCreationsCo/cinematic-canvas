import { z } from "zod";
import { NarrativeEngine, configureLabEngine } from "narrative-engine";
import { NarrativeProvider } from "#shared/narrative/narrative-provider.js";
import { db, DbTransaction } from "#shared/db/index.js";
import { createStoryBlockInstructions } from "#shared/prompts/storyblock.prompt.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { BlockAttributes, BlockParseResult } from "#shared/narrative/narrative.types.js";
import { getModelCompatibleSchema } from "#shared/utils/utils.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";



const GenerateStoryBlocksInput = z.array(z.string());
export type GenerateStoryBlocksInput = z.input<typeof GenerateStoryBlocksInput>;


// initialize narrative engine with postgres provider
const TIMEOUT_CONTEXT_MS = 8000;
const provider = new NarrativeProvider(db);
const narrativeEngine = new NarrativeEngine(provider);

async function generateContext(projectId: string, inputQuery: string): Promise<string> {
    const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error("Context generation timeout (>3000ms)")), TIMEOUT_CONTEXT_MS);
    });
    return Promise.race([narrativeEngine.generateContext(projectId, inputQuery), timeoutPromise]);
}

type ToolResultItem =
    | { success: true; block: BlockAttributes; }
    | { success: false; error: string };

function serialiseResults(
    raw: Awaited<ReturnType<typeof run>>
): string {
    const items: ToolResultItem[] = raw.map((r) =>
        r.success
            ? {
                success: true,
                block: r.block,
            }
            : { success: false, error: r.error?.message ?? "unknown" }
    );

    const succeeded = items.filter((i) => i.success).length;
    const failed = items.filter((i) => !i.success).length;

    return JSON.stringify({
        summary: { total: items.length, succeeded, failed },
        results: items,
    });
}


async function run(
    inputQuery: GenerateStoryBlocksInput,
    context: GenerateStoryBlocksToolDeps['context']
): Promise<({ success: true, block: BlockAttributes } | { success: false, error: Error })[]> {

    try {
        const previousBlock = inputQuery.at(-1) ?? "";
        const narrativeContext = await generateContext(context.projectId, previousBlock);

        const prompt = createStoryBlockInstructions({
            previousBlock: previousBlock,
            ragContext: narrativeContext,
            isResolving: false,
        });

        const responseJsonSchema = getModelCompatibleSchema(BlockParseResult);
        const response = await context.provider.generateContent({
            messages: [
                new SystemMessage({ content: prompt }),
                new HumanMessage({ content: "Generate a series of storyblocks to create a cohesive narrative: " })],
            config: {
                responseJsonSchema: responseJsonSchema
            }
        });
        if (!response.text) {
            throw new Error("Failed to generate story block: No text returned.");
        }

        const results = JSON.parse(response.text) as BlockParseResult;
        return results.map((r) => ({ success: true, block: r }));
    } catch (e) {
        return [{ success: false, error: e as Error }];
    }
}


export interface GenerateStoryBlocksToolDeps {
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
}

/**
 * Generates multiple story blocks in a single request.
 * @param projectId 
 * @param db 
 * @param context 
 * @returns 
 */
class GenerateStoryBlocksTool extends StructuredTool<typeof GenerateStoryBlocksInput> {

    name = "generate_storyblocks";
    description = "Generates story blocks used for composing scenes and storyboards";
    schema = GenerateStoryBlocksInput;

    private readonly context: GenerateStoryBlocksToolDeps['context'];

    constructor(deps: GenerateStoryBlocksToolDeps, params?: ToolParams) {
        super(params);
        this.context = deps.context;
    }

    async _call(input: GenerateStoryBlocksInput, _runManager?: CallbackManagerForToolRun): Promise<string> {
        const { traceId } = this.context;
        console.log(`${traceId}: generateStoryBlocksTool invoked. count: ${input.length}`);

        const generated = await run(input, this.context);
        const output = serialiseResults(generated);
        console.log(`${traceId}: generateStoryBlocksTool complete. ${output}`);
        return output;
    }

    async run(input: GenerateStoryBlocksInput) {
        try {
            const result = await run(input, this.context);
            return result.map((r) => {
                if (r.success) {
                    return r.block;
                }
                throw r.error;
            });
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
}

export function createGenerateStoryBlocksTool(deps: GenerateStoryBlocksToolDeps, params?: ToolParams): GenerateStoryBlocksTool {
    return new GenerateStoryBlocksTool(deps, params);
}