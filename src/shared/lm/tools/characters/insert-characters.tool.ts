import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { CharacterWithAssets, InsertCharacter } from "#shared/types/index.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { mapDomainCharacterToInsertCharacter } from "#shared/entity/character-mappers.js";

// ---------------------------------------------------------------------------
// Input schema — what the orchestrator LLM sends when invoking this tool
// ---------------------------------------------------------------------------

const InsertCharactersInput = z.array(InsertCharacter);
export type InsertCharactersInput = z.infer<typeof InsertCharactersInput>;

// ---------------------------------------------------------------------------
// Serialised output shape — what the LLM reads back from the tool result
// ---------------------------------------------------------------------------

type ToolResultItem =
    | { success: true; character: CharacterWithAssets; }
    | { success: false; error: string };

function serialiseResults(
    raw: Awaited<ReturnType<typeof run>>
): string {
    const items: ToolResultItem[] = raw.map((r) =>
        r.success
            ? {
                success: true,
                character: r.character,
            }
            : { success: false, error: r.error?.message ?? "unknown" }
    );

    const succeeded = items.filter((i) => i.success).length;
    const failed = items.filter((i) => !i.success).length;

    // Return structured JSON — the orchestrator LLM can reason over this directly.
    return JSON.stringify({
        summary: { total: items.length, succeeded, failed },
        results: items,
    });
}

// ---------------------------------------------------------------------------
// Execution strategies (extracted from original function, now dependency-injected)
// ---------------------------------------------------------------------------

async function run(
    charactersData: (InsertCharacter)[],
    context: InsertCharactersToolDeps['context']
) {

    try {
        const toInsertCharacters = charactersData.map(mapDomainCharacterToInsertCharacter);
        const insertedCharacters = await context.projectRepository.createCharacters(
            toInsertCharacters[0].projectId,
            toInsertCharacters
        );

        return Promise.all(
            insertedCharacters.map(async (res) => {
                return { success: true as const, character: res };
            })
        );
    } catch (e) {
        return charactersData.map((c) => ({ success: false as const, character: c, error: e as Error }));
    }
}

// ---------------------------------------------------------------------------
// LangChain StructuredTool
// ---------------------------------------------------------------------------

export interface InsertCharactersToolDeps {
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
}

class InsertCharactersTool extends StructuredTool<typeof InsertCharactersInput> {

    name = "insert_characters";
    description = "Saves character attributes objects into database records.";
    schema = InsertCharactersInput;

    // Injected dependencies — not exposed to the LLM
    private readonly context: InsertCharactersToolDeps['context'];

    constructor(deps: InsertCharactersToolDeps, params?: ToolParams) {
        super(params);
        this.context = deps.context;
    }

    /**
     * Called by LangChain after it parses and validates the LLM's tool-call arguments
     * against `schema`. Return value is stringified and injected as a ToolMessage.
     */
    async _call(
        input: InsertCharactersInput,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {

        const { traceId } = this.context;
        console.log(`${traceId}: InsertCharactersTool invoked. count: ${input.length}`);

        const inserted = await run(input, this.context);
        const output = serialiseResults(inserted);
        console.log(`${traceId}: InsertCharactersTool complete. ${output}`);
        return output;
    }
}

// ---------------------------------------------------------------------------
// Factory — preferred way to instantiate so callers don't touch the class directly
// ---------------------------------------------------------------------------

export function createInsertCharactersTool(
    deps: InsertCharactersToolDeps,
    params?: ToolParams
): InsertCharactersTool {
    return new InsertCharactersTool(deps, params);
}