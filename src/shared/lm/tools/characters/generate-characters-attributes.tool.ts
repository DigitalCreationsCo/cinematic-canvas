import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { CharacterAttributes } from "#shared/types/character.types.js";
import { CharacterBase } from "#shared/types/workflow.types.js";
import { UploadResult } from "#shared/types/base.types.js";

// INPUT
const CharacterBasePartialWithIdAndImages = CharacterBase.partial().extend({
  id: z.uuid(),
  images: z.array(UploadResult).optional(),
});

const GenerateCharactersInput = z.object({
  characters: z.array(CharacterBasePartialWithIdAndImages),
});
export type GenerateCharactersInput = z.input<typeof GenerateCharactersInput>;

type CharacterGenerateItem = z.input<typeof CharacterBasePartialWithIdAndImages>;

// OUTPUT
export type GenerateCharactersResultSuccess = {
  success: true;
  id: string;
  attributes: CharacterAttributes;
  metadata?: { model: string; prompt: string };
};

export type GenerateCharactersResult = GenerateCharactersResultSuccess | { success: false; id: string; error: Error };

// ============================================================================
// SERIALISER — used by _call (LangChain string interface only)
// ============================================================================

type ToolResultItem = { success: true; attributes: CharacterAttributes } | { success: false; error: string };

function serialiseResults(
  raw: ({ success: true; attributes: CharacterAttributes } | { success: false; error: Error })[],
): string {
  const items: ToolResultItem[] = raw.map((r) =>
    r.success ? { success: true, attributes: r.attributes } : { success: false, error: r.error?.message ?? "unknown" },
  );

  const succeeded = items.filter((i) => i.success).length;
  const failed = items.filter((i) => !i.success).length;

  return JSON.stringify({
    summary: { total: items.length, succeeded, failed },
    results: items,
  });
}

// ============================================================================
// DEPS
// ============================================================================

export interface GenerateCharacterAttributesToolDeps {
  context: ToolContext<TextModelController>;
}

// ============================================================================
// TOOL CLASS
// ============================================================================

class GenerateCharacterAttributesTool extends StructuredTool<typeof GenerateCharactersInput> {
  name = "generate_characters";
  description = "Generates character attributes and images using LLM with property preservation.";
  schema = GenerateCharactersInput;

  private readonly context: GenerateCharacterAttributesToolDeps["context"];

  constructor(deps: GenerateCharacterAttributesToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
  }

  /** LangChain tool interface — returns serialised JSON string. */
  async _call({ characters }: GenerateCharactersInput, _runManager?: CallbackManagerForToolRun): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: GenerateCharacterAttributesTool invoked. count: ${characters.length}`);

    const generated = await this.run(characters);

    const output = serialiseResults(generated);
    console.log(`${traceId}: GenerateCharacterAttributesTool complete.`);
    return output;
  }

  /**
   * Programmatic interface for direct tool-to-tool calls.
   * Returns GenerateCharactersResult[] — same type as before.
   */
  async run(
    inputs: CharacterGenerateItem[],
  ): Promise<GenerateCharactersResult[]> {
    const { traceId } = this.context;

    console.log(`${traceId}: Generating attributes for ${inputs.length} character(s)`);

    const rawResults = await generateEntityAttributes(
      {
        schema: CharacterAttributes,
        entities: inputs.map((entity) => ({
          entity,
          entityType: "character",
          images: entity.images,
        })),
        entityDescription: "character profile",
      },
      this.context,
    );

    const attributeResults: GenerateCharactersResult[] = rawResults.map(({ entity, id, success, error }) => {
      if (success) {
        return { success: true, id, attributes: entity };
      }
      return { success: false, id, error };
    });

    // All subsequent steps operate only on items that succeeded here.
    const successes = attributeResults.filter((r): r is GenerateCharactersResultSuccess => r.success);

    if (successes.length === 0) {
      console.warn(`${traceId}: No character attributes succeeded — skipping insert, asset save, and image generation`);
      return attributeResults;
    }

    // Return the attribute-level results. The caller can inspect these to
    // determine which characters were fully processed.
    return attributeResults;
  }
}

export type { GenerateCharacterAttributesTool };

export function createGenerateCharacterAttributesTool(
  deps: GenerateCharacterAttributesToolDeps,
  params?: ToolParams,
): GenerateCharacterAttributesTool {
  return new GenerateCharacterAttributesTool(deps, params);
}
