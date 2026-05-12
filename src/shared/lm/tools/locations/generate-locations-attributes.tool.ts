import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { LocationAttributes } from "#shared/types/location.types.js";
import { LocationBase } from "#shared/types/workflow.types.js";
import { UploadResult } from "#shared/types/base.types.js";

const LocationBasePartialWithIdAndImages = LocationBase.partial().extend({
  id: z.string(),
  images: z.array(UploadResult).optional(),
});
const GenerateLocationsInput = z.object({
  locations: z.array(LocationBasePartialWithIdAndImages),
});
export type GenerateLocationsInput = z.infer<typeof GenerateLocationsInput>;

// ============================================================================
// RESULT TYPES — same pattern as GenerateCharactersResult
// ============================================================================

export type GenerateLocationsResultSuccess = {
  success: true;
  id: string;
  output: LocationAttributes;
  metadata?: { model: string; prompt: string };
};

export type GenerateLocationsResult = GenerateLocationsResultSuccess | { success: false; id: string; error: Error };

// ============================================================================
// SERIALISER — used by _call (LangChain string interface only)
// ============================================================================

type ToolResultItem = { success: true; location: LocationAttributes } | { success: false; error: string };

function serialiseResults(raw: { success: boolean; data?: LocationAttributes; error?: Error }[]): string {
  const items: ToolResultItem[] = raw.map((r) =>
    r.success
      ? { success: true, location: r.data as LocationAttributes }
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
  inputs: GenerateLocationsInput["locations"],
  context: ToolContext<TextModelController>,
): Promise<GenerateLocationsResult[]> {
  const { traceId } = context;

  // ── Step 1: Generate location attributes ──────────────────────────────────
  console.log(`${traceId}: Generating attributes for ${inputs.length} location(s)`);

  const rawResults = await generateEntityAttributes(
    {
      schema: LocationAttributes,
      entities: inputs.map((input) => ({
        data: input,
        entityType: "location",
        images: input.images,
      })),
      entityDescription: "location profile",
    },
    context,
  );

  const attributeResults: GenerateLocationsResult[] = rawResults.map((result) =>
    result.success
      ? { success: true, id: result.id, output: result.data }
      : { success: false, id: result.id, error: result.error },
  );

  // All subsequent steps operate only on items that succeeded here
  const successes = attributeResults.filter((r): r is GenerateLocationsResultSuccess => r.success);

  if (successes.length === 0) {
    console.warn(`${traceId}: No location attributes succeeded — skipping insert, asset save, and image generation`);
    return attributeResults;
  }

  return attributeResults;
}

// ============================================================================
// DEPS
// ============================================================================

export interface GenerateLocationAttributesToolDeps {
  context: ToolContext<TextModelController>;
}

// ============================================================================
// TOOL CLASS
// ============================================================================

class GenerateLocationAttributesTool extends StructuredTool<typeof GenerateLocationsInput> {
  name = "generate_locations";
  description = "Generates location attributes and images using LLM with property preservation.";
  schema = GenerateLocationsInput;

  private readonly context: GenerateLocationAttributesToolDeps["context"];

  constructor(deps: GenerateLocationAttributesToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
  }

  /** LangChain tool interface — returns serialised JSON string. */
  async _call({ locations }: GenerateLocationsInput, _runManager?: CallbackManagerForToolRun): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: GenerateLocationAttributesTool invoked. count: ${locations.length}`);

    const generated = await run(locations, this.context);

    const adapted = generated.map((r) =>
      r.success ? { success: true, data: r.output } : { success: false, error: r.error },
    );

    const output = serialiseResults(adapted);
    console.log(`${traceId}: GenerateLocationAttributesTool complete.`);
    return output;
  }

  /**
   * Programmatic interface for direct tool-to-tool calls.
   */
  async run({ locations }: GenerateLocationsInput): Promise<GenerateLocationsResult[]> {
    try {
      return await run(locations, this.context);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}

export type { GenerateLocationAttributesTool };

export function createGenerateLocationAttributesTool(
  deps: GenerateLocationAttributesToolDeps,
  params?: ToolParams,
): GenerateLocationAttributesTool {
  return new GenerateLocationAttributesTool(deps, params);
}
