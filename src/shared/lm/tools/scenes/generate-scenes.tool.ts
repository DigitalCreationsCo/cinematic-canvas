import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { SceneAttributes, CharacterAttributes, LocationAttributes, UploadResult } from "#shared/types/index.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

const GenerateScenesInput = z.array(z.object({
    partial: SceneAttributes.partial().extend({
        id: z.string(),
    }),
    characters: z.array(CharacterAttributes),
    location: LocationAttributes,
    images: z.array(UploadResult).optional(),
}));

export type GenerateScenesInput = z.input<typeof GenerateScenesInput>;

type ToolResultItem =
    | { success: true; scene: SceneAttributes }
    | { success: false; error: string };

function serialiseResults(raw: { success: boolean; data?: SceneAttributes; error?: Error }[]): string {
    const items: ToolResultItem[] = raw.map((r) =>
        r.success
            ? { success: true, scene: r.data as SceneAttributes }
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
    inputs: GenerateScenesInput,
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository }
): Promise<{ success: boolean; data?: SceneAttributes; error?: Error }[]> {
    const entityType = "scene";
    const results = await generateEntityAttributes({
        schema: SceneAttributes,
        entities: inputs.map(input => ({
            data: input.partial,
            entityType,
            images: input.images,
        })),
        entityDescription: "scene specification",
    }, context);

    return results.map((result) => {
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return { success: true, data: result.data as SceneAttributes };
    });
}

export interface GenerateScenesToolDeps {
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
}

class GenerateScenesTool extends StructuredTool<typeof GenerateScenesInput> {
    name = "generate_scenes";
    description = "Generates scene attributes using LLM with property preservation.";
    schema = GenerateScenesInput;

    private readonly context: GenerateScenesToolDeps["context"];

    constructor(deps: GenerateScenesToolDeps, params?: ToolParams) {
        super(params);
        this.context = deps.context;
    }

    async _call(
        input: GenerateScenesInput,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {
        const { traceId } = this.context;
        console.log(`${traceId}: GenerateScenesTool invoked. count: ${input.length}`);

        const generated = await run(input, this.context);
        const output = serialiseResults(generated);
        console.log(`${traceId}: GenerateScenesTool complete.`);
        return output;
    }

    async run(input: GenerateScenesInput) {
        try {
            return await run(input, this.context);
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
}

export function createGenerateScenesTool(
    deps: GenerateScenesToolDeps,
    params?: ToolParams
): GenerateScenesTool {
    return new GenerateScenesTool(deps, params);
}