import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { PropAttributes, UploadResult } from "#shared/types/index.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

const GeneratePropsInput = z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    images: z.array(z.object({
        gcsUri: z.string(),
        mimeType: z.string(),
    })).optional(),
}));

export type GeneratePropsInput = z.input<typeof GeneratePropsInput>;

type ToolResultItem =
    | { success: true; prop: PropAttributes }
    | { success: false; error: string };

function serialiseResults(raw: { success: boolean; data?: PropAttributes; error?: Error }[]): string {
    const items: ToolResultItem[] = raw.map((r) =>
        r.success
            ? { success: true, prop: r.data as PropAttributes }
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
    inputs: { data: Partial<PropAttributes> & { id: string }; images?: UploadResult[] }[],
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository }
): Promise<{ success: boolean; data?: PropAttributes; error?: Error }[]> {
    const entityType = "prop";
    const results = await generateEntityAttributes({
        schema: PropAttributes,
        entities: inputs.map(input => ({
            data: input.data,
            entityType,
            images: input.images,
        })),
        entityDescription: "prop profile",
    }, context);

    return results.map((result) => {
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return { success: true, data: result.data as PropAttributes };
    });
}

export interface GeneratePropsToolDeps {
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
}

class GeneratePropsTool extends StructuredTool<typeof GeneratePropsInput> {
    name = "generate_props";
    description = "Generates prop attributes using LLM with property preservation.";
    schema = GeneratePropsInput;

    private readonly context: GeneratePropsToolDeps["context"];

    constructor(deps: GeneratePropsToolDeps, params?: ToolParams) {
        super(params);
        this.context = deps.context;
    }

    async _call(
        input: GeneratePropsInput,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {
        const { traceId } = this.context;
        console.log(`${traceId}: GeneratePropsTool invoked. count: ${input.length}`);

        const inputs = input.map(p => ({ data: p, images: p.images as any }));
        const generated = await run(inputs, this.context);
        const output = serialiseResults(generated);
        console.log(`${traceId}: GeneratePropsTool complete.`);
        return output;
    }

    async run(input: GeneratePropsInput) {
        try {
            const inputs = input.map(p => ({ data: p, images: p.images as any }));
            return await run(inputs, this.context);
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
}

export function createGeneratePropsTool(
    deps: GeneratePropsToolDeps,
    params?: ToolParams
): GeneratePropsTool {
    return new GeneratePropsTool(deps, params);
}