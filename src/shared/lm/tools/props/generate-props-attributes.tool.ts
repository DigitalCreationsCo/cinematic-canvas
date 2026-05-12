import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { PropAttributes, PropBase } from "#shared/types/workflow.types.js";
import { UploadResult } from "#shared/types/base.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

const PropBasePartialWithIdAndImages = PropBase.partial().extend({
  id: z.string(),
  images: z.array(UploadResult).optional(),
});

const GeneratePropsInput = z.object({
  props: z.array(PropBasePartialWithIdAndImages),
});
export type GeneratePropsInput = z.infer<typeof GeneratePropsInput>;

export type GeneratePropsResultSuccess = {
  success: true;
  id: string;
  output: PropAttributes;
  metadata?: { model: string; prompt: string };
};

export type GeneratePropsResult = GeneratePropsResultSuccess | { success: false; id: string; error: Error };

type ToolResultItem = { success: true; prop: PropAttributes } | { success: false; error: string };

function serialiseResults(raw: { success: boolean; data?: PropAttributes; error?: Error }[]): string {
  const items: ToolResultItem[] = raw.map((r) =>
    r.success
      ? { success: true, prop: r.data as PropAttributes }
      : { success: false, error: r.error?.message ?? "unknown" },
  );

  const succeeded = items.filter((i) => i.success).length;
  const failed = items.filter((i) => !i.success).length;

  return JSON.stringify({
    summary: { total: items.length, succeeded, failed },
    results: items,
  });
}

async function run(
  inputs: GeneratePropsInput["props"],
  context: ToolContext<TextModelController>,
): Promise<GeneratePropsResult[]> {
  const { projectId, traceId } = context;

  // ── Step 1: Generate prop attributes ─────────────────────────────────────
  console.log(`${traceId}: Generating attributes for ${inputs.length} prop(s)`);

  const rawResults = await generateEntityAttributes(
    {
      schema: PropAttributes,
      entities: inputs.map((p) => ({
        data: p,
        entityType: "prop",
        images: p.images,
      })),
      entityDescription: "prop profile",
    },
    context,
  );

  const attributeResults: GeneratePropsResult[] = rawResults.map((result) =>
    result.success
      ? { success: true, id: result.id, output: result.data }
      : { success: false, id: result.id, error: result.error },
  );

  // All subsequent steps operate only on items that succeeded here
  const successes = attributeResults.filter((r): r is GeneratePropsResultSuccess => r.success);

  if (successes.length === 0) {
    console.warn(`${traceId}: No prop attributes succeeded — skipping insert, asset save, and image generation`);
    return attributeResults;
  }

  return attributeResults;
}

// ============================================================================
// DEPS
// ============================================================================

export interface GeneratePropAttributesToolDeps {
  context: ToolContext<TextModelController>;
}

// ============================================================================
// TOOL CLASS
// ============================================================================

class GeneratePropAttributesTool extends StructuredTool<typeof GeneratePropsInput> {
  name = "generate_props";
  description = "Generates prop attributes and images using LLM with property preservation.";
  schema = GeneratePropsInput;

  private readonly context: GeneratePropAttributesToolDeps["context"];

  constructor(deps: GeneratePropAttributesToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
  }

  /** LangChain tool interface — returns serialised JSON string. */
  async _call({ props }: GeneratePropsInput, _runManager?: CallbackManagerForToolRun): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: GeneratePropAttributesTool invoked. count: ${props.length}`);

    const generated = await run(props, this.context);

    const adapted = generated.map((r) =>
      r.success ? { success: true, data: r.output } : { success: false, error: r.error },
    );

    const output = serialiseResults(adapted);
    console.log(`${traceId}: GeneratePropAttributesTool complete.`);
    return output;
  }

  /**
   * Programmatic interface for direct tool-to-tool calls.
   */
  async run({ props }: GeneratePropsInput): Promise<GeneratePropsResult[]> {
    try {
      return await run(props, this.context);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}

export type { GeneratePropAttributesTool };

export function createGeneratePropAttributesTool(
  deps: GeneratePropAttributesToolDeps,
  params?: ToolParams,
): GeneratePropAttributesTool {
  return new GeneratePropAttributesTool(deps, params);
}
