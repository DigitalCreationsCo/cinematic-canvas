import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { LocationAttributes, UploadResult } from "#shared/types/index.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

const GenerateLocationsInput = z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    images: z.array(z.object({
        gcsUri: z.string(),
        mimeType: z.string(),
    })).optional(),
}));

export type GenerateLocationsInput = z.input<typeof GenerateLocationsInput>;

type ToolResultItem =
    | { success: true; location: LocationAttributes }
    | { success: false; error: string };

function serialiseResults(raw: { success: boolean; data?: LocationAttributes; error?: Error }[]): string {
    const items: ToolResultItem[] = raw.map((r) =>
        r.success
            ? { success: true, location: r.data as LocationAttributes }
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
    inputs: { data: Partial<LocationAttributes> & { id: string }; images?: UploadResult[] }[],
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository }
): Promise<{ success: boolean; data?: LocationAttributes; error?: Error }[]> {
    const entityType = "location";
    const results = await generateEntityAttributes({
        schema: LocationAttributes,
        entities: inputs.map(input => ({
            data: input.data,
            entityType,
            images: input.images,
        })),
        entityDescription: "location profile",
    }, context);

    return results.map((result) => {
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return { success: true, data: result.data as LocationAttributes };
    });
}

export interface GenerateLocationsToolDeps {
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
}

class GenerateLocationsTool extends StructuredTool<typeof GenerateLocationsInput> {
    name = "generate_locations";
    description = "Generates location attributes using LLM with property preservation.";
    schema = GenerateLocationsInput;

    private readonly context: GenerateLocationsToolDeps["context"];

    constructor(deps: GenerateLocationsToolDeps, params?: ToolParams) {
        super(params);
        this.context = deps.context;
    }

    async _call(
        input: GenerateLocationsInput,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {
        const { traceId } = this.context;
        console.log(`${traceId}: GenerateLocationsTool invoked. count: ${input.length}`);

        const inputs = input.map(l => ({ data: l, images: l.images as any }));
        const generated = await run(inputs, this.context);
        const output = serialiseResults(generated);
        console.log(`${traceId}: GenerateLocationsTool complete.`);
        return output;
    }

    async run(input: GenerateLocationsInput) {
        try {
            const inputs = input.map(l => ({ data: l, images: l.images as any }));
            return await run(inputs, this.context);
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
}

export function createGenerateLocationsTool(
    deps: GenerateLocationsToolDeps,
    params?: ToolParams
): GenerateLocationsTool {
    return new GenerateLocationsTool(deps, params);
}