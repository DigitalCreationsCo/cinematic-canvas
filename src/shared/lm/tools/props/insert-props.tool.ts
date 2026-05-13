import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { PropBase, PropWithAssets } from "#shared/types/workflow.types.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { mapDomainPropToInsertProp } from "#shared/entity/prop-mappers.js";
import { TagRegistryService } from "#shared/services/tag-registry.js";

const InsertPropsInput = z.object({ props: z.array(PropBase) });
export type InsertPropsInput = z.input<typeof InsertPropsInput>;

type ToolResultItem = { success: true; prop: PropWithAssets } | { success: false; error: string };

function serialiseResults(raw: Awaited<ReturnType<typeof run>>): string {
  const items: ToolResultItem[] = raw.map((r) =>
    r.success ? { success: true, prop: r.prop } : { success: false, error: r.error?.message ?? "unknown" },
  );

  const succeeded = items.filter((i) => i.success).length;
  const failed = items.filter((i) => !i.success).length;

  return JSON.stringify({
    summary: { total: items.length, succeeded, failed },
    results: items,
  });
}

async function run(propsData: InsertPropsInput["props"], context: InsertPropsToolDeps["context"]) {
  try {
    const toInsertProps = propsData.map(mapDomainPropToInsertProp);
    const insertedProps = await context.projectRepository.createProps(toInsertProps[0].projectId, toInsertProps);

    for (let i = 0; i < insertedProps.length; i++) {
      const entity = insertedProps[i];
      if (!entity.name) throw new Error("Entity name is required for handle registration.");

      await context.tagRegistry
        .registerHandle({
          handle: `@${entity.name.replace(/[^a-zA-Z0-9_]/g, "")}`,
          entityId: entity.id,
          entityType: "prop",
          projectId: context.projectId,
        })
        .catch((err) => {
          console.warn({ entityId: entity.id, error: err }, "[Worker] Failed to register entity handle.");
        });
    }

    return Promise.all(
      insertedProps.map(async (res) => {
        return { success: true as const, prop: res };
      }),
    );
  } catch (e) {
    return propsData.map((p) => ({ success: false as const, prop: p, error: e as Error }));
  }
}

export interface InsertPropsToolDeps {
  context: ToolContext<TextModelController> & {
    projectRepository: ProjectRepository;
    tagRegistry: TagRegistryService;
  };
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

  async _call({ props }: InsertPropsInput, _runManager?: CallbackManagerForToolRun): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: InsertPropsTool invoked. count: ${props.length}`);

    const inserted = await run(props, this.context);
    const output = serialiseResults(inserted);
    console.log(`${traceId}: InsertPropsTool complete. ${output}`);
    return output;
  }

  async run({ props }: InsertPropsInput) {
    try {
      const result = await run(props, this.context);
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

export function createInsertPropsTool(deps: InsertPropsToolDeps, params?: ToolParams): InsertPropsTool {
  return new InsertPropsTool(deps, params);
}
