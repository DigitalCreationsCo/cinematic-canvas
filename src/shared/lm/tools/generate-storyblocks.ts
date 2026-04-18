import { NarrativeEngine, configureLabEngine } from "narrative-engine";
import { NarrativeProvider } from "#shared/narrative/narrative-provider.js";
import { db, DbTransaction } from "#shared/db/index.js";
import { createStoryBlockInstructions } from "#shared/prompts/storyblock.prompt.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { NarrativeBlockParseResult } from "#shared/narrative/narrative.types.js";
import { getModelCompatibleSchema } from "#shared/utils/utils.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { HumanMessage } from "@langchain/core/messages";

const narrativeEngine = new NarrativeEngine(new NarrativeProvider(db));

const TIMEOUT_CONTEXT_MS = 8000;
async function generateContext(channelId: string, inputQuery: string): Promise<string> {
    const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error("Context generation timeout (>3000ms)")), TIMEOUT_CONTEXT_MS);
    });
    return Promise.race([narrativeEngine.generateContext(channelId, inputQuery), timeoutPromise]);
}

/**
 * Generates a single story block in a single request.
 * @param projectId 
 * @param db 
 * @param context 
 * @returns 
 */
export async function generateStoryBlocks(
    projectId: string,
    db: DbTransaction,
    context: ToolContext<TextModelController>
) {

    const previousBlock = ""
    const narrativeContext = await generateContext(projectId, previousBlock);

    const prompt = createStoryBlockInstructions({
        previousBlock: previousBlock,
        ragContext: narrativeContext,
        isResolving: false,
    });

    const responseJsonSchema = getModelCompatibleSchema(NarrativeBlockParseResult);
    const response = await context.provider.generateContent({
        messages: [new HumanMessage({ content: prompt })],
        config: {
            responseJsonSchema: responseJsonSchema
        }
    });
    if (!response.text) {
        throw new Error("Failed to generate story block: No text returned.");
    }

    const result = JSON.parse(response.text) as NarrativeBlockParseResult;
    return;
}

/**
 * Generates multiple story blocks in a single request.
 * @param projectId 
 * @param db 
 * @param context 
 * @returns 
 */
export async function generateStoryBlocksBulk(
    projectId: string,
    db: DbTransaction,
    context: ToolContext<TextModelController>
) {

    const previousBlock = ""
    const narrativeContext = await generateContext(projectId, previousBlock);

    const prompt = createStoryBlockInstructions({
        previousBlock: previousBlock,
        ragContext: narrativeContext,
        isResolving: false,
    });

    const responseJsonSchema = getModelCompatibleSchema(NarrativeBlockParseResult);
    const response = await context.provider.generateContent({
        messages: [new HumanMessage({ content: prompt })],
        config: {
            responseJsonSchema: responseJsonSchema
        }
    });
    if (!response.text) {
        throw new Error("Failed to generate story block: No text returned.");
    }

    const result = JSON.parse(response.text) as NarrativeBlockParseResult;
    return;
}