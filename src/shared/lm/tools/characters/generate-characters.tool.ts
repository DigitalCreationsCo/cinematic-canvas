import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { CharacterAttributes, UploadResult } from "#shared/types/index.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

const GenerateCharactersInput = z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    role: z.string().optional(),
    description: z.string().optional(),
    images: z.array(z.object({
        gcsUri: z.string(),
        mimeType: z.string(),
    })).optional(),
}));

export type GenerateCharactersInput = z.input<typeof GenerateCharactersInput>;

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
    inputs: { data: Partial<CharacterAttributes> & { id: string }; images?: UploadResult[] }[],
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository }
): Promise<{ success: boolean; data?: CharacterAttributes; error?: Error }[]> {
    const entityType = "character";
    const results = await generateEntityAttributes({
        schema: CharacterAttributes,
        entities: inputs.map(input => ({
            data: input.data,
            entityType,
            images: input.images,
        })),
        entityDescription: "character profile",
    }, context);

    return results.map((result) => {
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return { success: true, data: result.data as CharacterAttributes };
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

        const inputs = input.map(c => ({ data: c, images: c.images as any }));
        const generated = await run(inputs, this.context);
        const output = serialiseResults(generated);
        console.log(`${traceId}: GenerateCharactersTool complete.`);
        return output;
    }

    async run(input: GenerateCharactersInput) {
        try {
            const inputs = input.map(c => ({ data: c, images: c.images as any }));
            return await run(inputs, this.context);
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