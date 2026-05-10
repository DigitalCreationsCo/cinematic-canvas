import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { SceneAttributes } from "#shared/types/scene.types.js";
import { GenerateSceneInputVerbose } from "#shared/types/workflow.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

const GenerateScenesInput = z.object({ scenes: z.array(GenerateSceneInputVerbose) });
type GenerateScenesInput = z.input<typeof GenerateScenesInput>;

export type GenerateScenesResultSuccess = { success: true; id: string; output: SceneAttributes; metadata?: { model: string; prompt: string } };
export type GenerateScenesResult =
    | GenerateScenesResultSuccess
    | { success: false; id: string; error: Error };

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
    inputs: GenerateSceneInputVerbose[],
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository }
): Promise<GenerateScenesResult[]> {
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
            return { success: false, id: result.id, error: result.error };
        }
        return { success: true, id: result.id, output: result.data };
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
        { scenes }: GenerateScenesInput,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {
        const { traceId } = this.context;
        console.log(`${traceId}: GenerateScenesTool invoked. count: ${scenes.length}`);

        const generated = await run(scenes, this.context);
        const output = serialiseResults(generated);
        console.log(`${traceId}: GenerateScenesTool complete.`);
        return output;
    }

    async run({ scenes }: GenerateScenesInput) {
        try {
            return await run(scenes, this.context);
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