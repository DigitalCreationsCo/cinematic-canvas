import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { PropWithAssets } from "#shared/types/workflow.types.js";
import { InsertProp } from "#shared/types/schema.types.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { mapDomainPropToInsertProp } from "#shared/entity/prop-mappers.js";


const InsertPropsInput = z.array(InsertProp);
export type InsertPropsInput = z.input<typeof InsertPropsInput>;

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


async function run(
    propsData: InsertPropsInput,
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

    async _call(
        input: InsertPropsInput,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {
        const { traceId } = this.context;
        console.log(`${traceId}: InsertPropsTool invoked. count: ${input.length}`);

        const inserted = await run(input, this.context);
        const output = serialiseResults(inserted);
        console.log(`${traceId}: InsertPropsTool complete. ${output}`);
        return output;
    }

    async run(input: InsertPropsInput) {
        try {
            const result = await run(input, this.context);
            return result.map((r) => {
                if (r.success) {
                    return r.prop;
                }
                throw r.error;
            });
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
}


export function createInsertPropsTool(
    deps: InsertPropsToolDeps,
    params?: ToolParams
): InsertPropsTool {
    return new InsertPropsTool(deps, params);
}