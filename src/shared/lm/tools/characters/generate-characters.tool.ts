import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { CharacterAttributes } from "#shared/types/character.types.js";
import { CharacterBase } from "#shared/types/workflow.types.js";
import { UploadResult } from "#shared/types/base.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

const GenerateCharactersInput = z.array(CharacterBase.partial().extend({
    id: z.uuid(),
    images: z.array(UploadResult).optional()
}));
export type GenerateCharactersInput = z.input<typeof GenerateCharactersInput>;

export type GenerateCharactersResultSuccess = { success: true; id: string; output: CharacterAttributes; metadata?: { model: string; prompt: string } };
export type GenerateCharactersResult =
    | GenerateCharactersResultSuccess
    | { success: false; id: string; error: Error };

type ToolResultItem =
    | { success: true; character: CharacterAttributes }
    | { success: false; error: string };

function serialiseResults(raw: { success: boolean; data?: CharacterAttributes; error?: Error }[]): string {
    const items: ToolResultItem[] = raw.map((r) =>
        r.success
            ? { success: true, character: r.data as CharacterAttributes }
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
    inputs: GenerateCharactersInput,
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository }
): Promise<GenerateCharactersResult[]> {
    const entityType = "character";
    const results = await generateEntityAttributes({
        schema: CharacterAttributes,
        entities: inputs.map(input => ({
            data: input,
            entityType,
            images: input.images,
        })),
        entityDescription: "character profile",
    }, context);

    return results.map((result) => {
        if (!result.success) {
            return { success: false, id: result.id, error: result.error };
        }
        return { success: true, id: result.id, output: result.data };
    });
}

export interface GenerateCharactersToolDeps {
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
}

class GenerateCharactersTool extends StructuredTool<typeof GenerateCharactersInput> {
    name = "generate_characters";
    description = "Generates character attributes using LLM with property preservation.";
    schema = GenerateCharactersInput;

    private readonly context: GenerateCharactersToolDeps["context"];

    constructor(deps: GenerateCharactersToolDeps, params?: ToolParams) {
        super(params);
        this.context = deps.context;
    }

    async _call(
        input: GenerateCharactersInput,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {
        const { traceId } = this.context;
        console.log(`${traceId}: GenerateCharactersTool invoked. count: ${input.length}`);
        const generated = await run(input, this.context);
        const output = serialiseResults(generated);
        console.log(`${traceId}: GenerateCharactersTool complete.`);
        return output;
    }

    async run(input: GenerateCharactersInput) {
        try {
            return await run(input, this.context);
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
}

export function createGenerateCharactersTool(
    deps: GenerateCharactersToolDeps,
    params?: ToolParams
): GenerateCharactersTool {
    return new GenerateCharactersTool(deps, params);
}