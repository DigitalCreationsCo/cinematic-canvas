import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { EntityUnion, EntityType, InsertEntitiesInput } from "#shared/types/index.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { mapDomainEntityToInsertEntity } from "#shared/utils/entity.utils.js";



type ToolResultItem =
    | { success: true; entity: EntityUnion }
    | { success: false; error: string };

function serialiseResults(
    raw: Awaited<ReturnType<typeof run>>
): string {
    const items: ToolResultItem[] = raw.map((r) =>
        r.success
            ? { success: true, entity: r.entity.entity }
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
    entities: InsertEntitiesInput,
    context: InsertEntitiesToolDeps["context"]
) {

    try {
        const toInsertEntities: InsertEntitiesInput = entities.map((entity: Extract<InsertEntitiesInput[number], { entityType: EntityType }>) => ({ ...entity, data: mapDomainEntityToInsertEntity(context.projectId, entity as any) }));
        const insertedEntities = await context.projectRepository.createEntities(
            context.projectId,
            toInsertEntities
        );

        return Promise.all(
            insertedEntities.map(async (res) => {
                return { success: true as const, entity: res };
            })
        );
    } catch (e) {
        return entities.map((s) => ({ success: false as const, entity: s, error: e as Error }));
    }
}

export interface InsertEntitiesToolDeps {
    context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
}

class InsertEntitiesTool extends StructuredTool<typeof InsertEntitiesInput> {

    name = "insert_entities";
    description = "Saves entity attributes objects into the respective database table.";
    schema = InsertEntitiesInput;

    private readonly context: InsertEntitiesToolDeps["context"];

    constructor(deps: InsertEntitiesToolDeps, params?: ToolParams) {
        super(params);
        this.context = deps.context;
    }

    protected async _call(
        input: InsertEntitiesInput,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {
        const { traceId } = this.context;
        console.log(`${traceId}: InsertEntitiesTool invoked. count: ${input.length}`);

        const inserted = await run(input, this.context);
        const output = serialiseResults(inserted);
        console.log(`${traceId}: InsertEntitiesTool complete. ${output}`);
        return output;
    }

    async run(input: InsertEntitiesInput) {
        try {
            const result = await run(input, this.context);
            return result.map((r) => {
                if (r.success) {
                    return r.entity;
                }
                throw r.error;
            });
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
}

export function createInsertEntitiesTool(
    deps: InsertEntitiesToolDeps,
    params?: ToolParams
): InsertEntitiesTool {
    return new InsertEntitiesTool(deps, params);
}