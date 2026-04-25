import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { SceneWithAssets, InsertScene } from "#shared/types/index.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { mapDomainSceneToInsertScene } from "#shared/entity/scene-mappers.js";

// ---------------------------------------------------------------------------
// Input schema — what the orchestrator LLM sends when invoking this tool
// ---------------------------------------------------------------------------

const InsertScenesInput = z.object({ scenes: z.array(InsertScene) });
export type InsertScenesInput = z.infer<typeof InsertScenesInput>;

// ---------------------------------------------------------------------------
// Serialised output shape — what the LLM reads back from the tool result
// ---------------------------------------------------------------------------

type ToolResultItem =
    | { success: true; scene: SceneWithAssets }
    | { success: false; error: string };

function serialiseResults(
    raw: Awaited<ReturnType<typeof run>>
): string {
    const items: ToolResultItem[] = raw.map((r) =>
        r.success
            ? { success: true, scene: r.scene }
            : { success: false, error: r.error?.message ?? "unknown" }
    );

    const succeeded = items.filter((i) => i.success).length;
    const failed = items.filter((i) => !i.success).length;

    return JSON.stringify({
        summary: { total: items.length, succeeded, failed },
        results: items,
    });
}

// ---------------------------------------------------------------------------
// Execution strategies (extracted from original function, now dependency-injected)
// ---------------------------------------------------------------------------

async function run(
    scenesData: InsertScene[],
    context: InsertScenesToolDeps["context"]
) {
    try {
        const toInsertScenes = scenesData.map(mapDomainSceneToInsertScene);
        const insertedScenes = await context.projectRepository.createScenes(
            toInsertScenes[0].projectId,
            toInsertScenes
        );

        return Promise.all(
            insertedScenes.map(async (res) => {
                return { success: true as const, scene: res };
            })
        );
    } catch (e) {
        return scenesData.map((s) => ({ success: false as const, scene: s, error: e as Error }));
    }
}

// ---------------------------------------------------------------------------
// LangChain StructuredTool
// ---------------------------------------------------------------------------

export interface InsertScenesToolDeps {
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
}

class InsertScenesTool extends StructuredTool<typeof InsertScenesInput> {

    name = "insert_scenes";
    description = "Saves scene attributes objects into database records.";
    schema = InsertScenesInput;

    private readonly context: InsertScenesToolDeps["context"];

    constructor(deps: InsertScenesToolDeps, params?: ToolParams) {
        super(params);
        this.context = deps.context;
    }

    async _call(
        input: InsertScenesInput,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {
        const { scenes } = input;
        const { traceId } = this.context;
        console.log(`${traceId}: InsertScenesTool invoked. count: ${scenes.length}`);

        const inserted = await run(scenes, this.context);
        const output = serialiseResults(inserted);
        console.log(`${traceId}: InsertScenesTool complete. ${output}`);
        return output;
    }

    async run(input: InsertScene[]) {
        try {
            const result = await run(input, this.context);
            return result.map((r) => {
                if (r.success) {
                    return r.scene;
                }
                throw r.error;
            });
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
}

// ---------------------------------------------------------------------------
// Factory — preferred way to instantiate so callers don't touch the class directly
// ---------------------------------------------------------------------------

export function createInsertScenesTool(
    deps: InsertScenesToolDeps,
    params?: ToolParams
): InsertScenesTool {
    return new InsertScenesTool(deps, params);
}