import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { PropWithAssets, InsertProp } from "#shared/types/index.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { mapDomainPropToInsertProp } from "#shared/entity/prop-mappers.js";

// ---------------------------------------------------------------------------
// Input schema — what the orchestrator LLM sends when invoking this tool
// ---------------------------------------------------------------------------

const InsertPropsInput = z.object({ props: z.array(InsertProp) });
export type InsertPropsInput = z.infer<typeof InsertPropsInput>;

// ---------------------------------------------------------------------------
// Serialised output shape — what the LLM reads back from the tool result
// ---------------------------------------------------------------------------

type ToolResultItem =
    | { success: true; prop: PropWithAssets }
    | { success: false; error: string };

function serialiseResults(
    raw: Awaited<ReturnType<typeof run>>
): string {
    const items: ToolResultItem[] = raw.map((r) =>
        r.success
            ? { success: true, prop: r.prop }
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
    propsData: InsertProp[],
    context: InsertPropsToolDeps["context"]
) {
    try {
        const toInsertProps = propsData.map(mapDomainPropToInsertProp);
        const insertedProps = await context.projectRepository.createProps(
            toInsertProps[0].projectId,
            toInsertProps
        );

        return Promise.all(
            insertedProps.map(async (res) => {
                return { success: true as const, prop: res };
            })
        );
    } catch (e) {
        return propsData.map((p) => ({ success: false as const, prop: p, error: e as Error }));
    }
}

// ---------------------------------------------------------------------------
// LangChain StructuredTool
// ---------------------------------------------------------------------------

export interface InsertPropsToolDeps {
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
}

class InsertPropsTool extends StructuredTool<typeof InsertPropsInput> {

    name = "insert_props";
    description = "Saves prop attributes objects into database records.";
    schema = InsertPropsInput;

    private readonly context: InsertPropsToolDeps["context"];

    constructor(deps: InsertPropsToolDeps, params?: ToolParams) {
        super(params);
        this.context = deps.context;
    }

    protected async _call(
        input: InsertPropsInput,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {
        const { props } = input;
        const { traceId } = this.context;
        console.log(`${traceId}: InsertPropsTool invoked. count: ${props.length}`);

        const inserted = await run(props, this.context);
        const output = serialiseResults(inserted);
        console.log(`${traceId}: InsertPropsTool complete. ${output}`);
        return output;
    }
}

// ---------------------------------------------------------------------------
// Factory — preferred way to instantiate so callers don't touch the class directly
// ---------------------------------------------------------------------------

export function createInsertPropsTool(
    deps: InsertPropsToolDeps,
    params?: ToolParams
): InsertPropsTool {
    return new InsertPropsTool(deps, params);
}