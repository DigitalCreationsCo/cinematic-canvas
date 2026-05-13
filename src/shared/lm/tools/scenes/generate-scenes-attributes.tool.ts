import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { SceneAttributes } from "#shared/types/scene.types.js";
import { GenerateSceneInputVerbose } from "#shared/types/workflow.types.js";

const GenerateScenesInput = z.object({
  scenes: z.array(GenerateSceneInputVerbose),
});
type GenerateScenesInput = z.input<typeof GenerateScenesInput>;

type GenerateSceneItem = z.input<typeof GenerateSceneInputVerbose>;

export type GenerateScenesResultSuccess = {
  success: true;
  id: string;
  attributes: SceneAttributes;
  metadata?: { model: string; prompt: string };
};

export type GenerateScenesResult = GenerateScenesResultSuccess | { success: false; id: string; error: Error };

// ============================================================================
// SERIALISER — used by _call (LangChain string interface only)
// ============================================================================

type ToolResultItem = { success: true; attributes: SceneAttributes } | { success: false; error: string };

function serialiseResults(raw: ({ success: true; attributes: SceneAttributes; } | { success: false; data?: undefined; error?: Error })[]): string {
  const items: ToolResultItem[] = raw.map((r) =>
    r.success
      ? { success: true, attributes: r.attributes }
      : { success: false, error: r.error?.message ?? "unknown" },
  );

  const succeeded = items.filter((i) => i.success).length;
  const failed = items.filter((i) => !i.success).length;

  return JSON.stringify({
    summary: { total: items.length, succeeded, failed },
    results: items,
  });
}

export interface GenerateSceneAttributesToolDeps {
  context: ToolContext<TextModelController>;
}

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

    const generated = await this.run(scenes);
    const output = serialiseResults(generated);
    console.log(`${traceId}: GenerateSceneAttributesTool complete.`);
    return output;
  }

  /**
   * Programmatic interface for direct tool-to-tool calls.
   */
  async run(inputs: GenerateSceneItem[]): Promise<GenerateScenesResult[]> {
    const { projectId, traceId } = this.context;

    // ── Step 1: Generate scene attributes ───────────────────────────────────
    console.log(`${traceId}: Generating attributes for ${inputs.length} scene(s)`);

    const rawResults = await generateEntityAttributes(
      {
        schema: SceneAttributes,
        entities: inputs.map((entity) => ({
          entity,
          entityType: "scene",
          images: entity.images,
        })),
        entityDescription: "scene specification",
      },
      this.context,
    );

    const attributeResults: GenerateScenesResult[] = rawResults.map(({ entity, id, success, error }) =>
      success ? { success: true, id, attributes: entity } : { success: false, id, error },
    );

    const successes = attributeResults.filter((r): r is GenerateScenesResultSuccess => r.success);
    if (successes.length === 0) {
      console.warn(`${traceId}: No scene attributes succeeded — skipping insert, asset save, and image generation`);
      return attributeResults;
    }

    return attributeResults;
  }
}

export type { GenerateSceneAttributesTool };

export function createGenerateSceneAttributesTool(
  deps: GenerateSceneAttributesToolDeps,
  params?: ToolParams,
): GenerateSceneAttributesTool {
  return new GenerateSceneAttributesTool(deps, params);
}
