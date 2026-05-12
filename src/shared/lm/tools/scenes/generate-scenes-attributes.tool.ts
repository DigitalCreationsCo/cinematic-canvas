import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { SceneAttributes } from "#shared/types/scene.types.js";
import { GenerateSceneInputVerbose } from "#shared/types/workflow.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

const GenerateScenesInput = z.object({
  scenes: z.array(GenerateSceneInputVerbose),
});
type GenerateScenesInput = z.input<typeof GenerateScenesInput>;

export type GenerateScenesResultSuccess = {
  success: true;
  id: string;
  output: SceneAttributes;
  metadata?: { model: string; prompt: string };
};

export type GenerateScenesResult = GenerateScenesResultSuccess | { success: false; id: string; error: Error };

// ============================================================================
// SERIALISER — used by _call (LangChain string interface only)
// ============================================================================

type ToolResultItem = { success: true; scene: SceneAttributes } | { success: false; error: string };

function serialiseResults(raw: { success: boolean; data?: SceneAttributes; error?: Error }[]): string {
  const items: ToolResultItem[] = raw.map((r) =>
    r.success
      ? { success: true, scene: r.data as SceneAttributes }
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
  inputs: z.input<typeof GenerateSceneInputVerbose>[],
  context: ToolContext<TextModelController>,
): Promise<GeneratePropsResult[]> {
  const { projectId, traceId } = context;

  // ── Step 1: Generate scene attributes ───────────────────────────────────
  console.log(`${traceId}: Generating attributes for ${inputs.length} scene(s)`);

  const rawResults = await generateEntityAttributes(
    {
      schema: SceneAttributes,
      entities: inputs.map((input) => ({
        data: input.partial as any,
        entityType: "scene",
        images: input.images,
      })),
      entityDescription: "scene specification",
    },
    context,
  );

  const attributeResults: GenerateScenesResult[] = rawResults.map((result) =>
    result.success
      ? { success: true, id: result.id, output: result.data }
      : { success: false, id: result.id, error: result.error },
  );

  // All subsequent steps operate only on items that succeeded here
  const successes = attributeResults.filter((r): r is GenerateScenesResultSuccess => r.success);

  if (successes.length === 0) {
    console.warn(`${traceId}: No scene attributes succeeded — skipping insert, asset save, and image generation`);
    return attributeResults;
  }

  return attributeResults;
}

// ============================================================================
// DEPS
// ============================================================================

export interface GenerateSceneAttributesToolDeps {
  context: ToolContext<TextModelController>;
}

// ============================================================================
// TOOL CLASS
// ============================================================================

class GenerateSceneAttributesTool extends StructuredTool<typeof GenerateScenesInput> {
  name = "generate_scenes";
  description = "Generates scene attributes and images using LLM with property preservation.";
  schema = GenerateScenesInput;

  private readonly context: GenerateSceneAttributesToolDeps["context"];

  constructor(deps: GenerateSceneAttributesToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
  }

  /** LangChain tool interface — returns serialised JSON string. */
  async _call({ scenes }: GenerateScenesInput, _runManager?: CallbackManagerForToolRun): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: GenerateSceneAttributesTool invoked. count: ${scenes.length}`);

    const generated = await run(scenes, this.context);

    const adapted = generated.map((r) =>
      r.success ? { success: true, data: r.output } : { success: false, error: r.error },
    );

    const output = serialiseResults(adapted);
    console.log(`${traceId}: GenerateSceneAttributesTool complete.`);
    return output;
  }

  /**
   * Programmatic interface for direct tool-to-tool calls.
   */
  async run({ scenes }: GenerateScenesInput): Promise<GenerateScenesResult[]> {
    try {
      return await run(scenes, this.context);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}

export type { GenerateSceneAttributesTool };

export function createGenerateSceneAttributesTool(
  deps: GenerateSceneAttributesToolDeps,
  params?: ToolParams,
): GenerateSceneAttributesTool {
  return new GenerateSceneAttributesTool(deps, params);
}
