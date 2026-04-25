import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { LocationAttributes, LocationBase, UploadResult } from "#shared/types/index.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

const GenerateLocationsInput = z.array(LocationBase.partial().extend({
    id: z.string(),
    images: z.array(UploadResult).optional(),
}));
export type GenerateLocationsInput = z.input<typeof GenerateLocationsInput>;

export type GenerateLocationsResultSuccess = { success: true; id: string; output: LocationAttributes; metadata?: { model: string; prompt: string } };
export type GenerateLocationsResult =
    | GenerateLocationsResultSuccess
    | { success: false; id: string; error: Error };

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
    inputs: GenerateLocationsInput,
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository }
): Promise<GenerateLocationsResult[]> {
    const entityType = "location";
    const results = await generateEntityAttributes({
        schema: LocationAttributes,
        entities: inputs.map(input => ({
            data: input,
            entityType,
            images: input.images,
        })),
        entityDescription: "location profile",
    }, context);

    return results.map((result) => {
        if (!result.success) {
            return { success: false, id: result.id, error: result.error };
        }
        return { success: true, id: result.id, output: result.data };
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
        const generated = await run(input, this.context);
        const output = serialiseResults(generated);
        console.log(`${traceId}: GenerateLocationsTool complete.`);
        return output;
    }

    async run(input: GenerateLocationsInput) {
        try {
            return await run(input, this.context);
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