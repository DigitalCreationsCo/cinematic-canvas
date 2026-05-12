// src/shared/lm/tools/parse-entities.tool.ts
//
// Unified entity parser that extracts characters, locations, and props from
// a plain-text description in a single LLM call. Replaces the per-type
// parse-characters and parse-locations tools.
//
// Returns attributes grouped by entityType — compatible with the
// groupEntitiesByEntityPrimitiveType utility pattern so downstream code
// can iterate by type without remapping.

import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController, UserMessage } from "#shared/lm/text-model-controller.js";
import { CharacterAttributes } from "#shared/types/character.types.js";
import { LocationAttributes } from "#shared/types/location.types.js";
import { PropAttributes } from "#shared/types/workflow.types.js";
import { getModelCompatibleSchema } from "#shared/utils/utils.js";

// ── Input schema ────────────────────────────────────────────────────────────

const ParseEntitiesInput = z.object({ input: z.string() });
export type ParseEntitiesInput = z.input<typeof ParseEntitiesInput>;

// ── Output schema ────────────────────────────────────────────────────────────
// Mirrors the shape of groupEntitiesByEntityPrimitiveType's return so that
// downstream code can treat the result as a pre-grouped entity map.
// Each array is present (never undefined) — empty when no entities of that type
// were found.

const EntityParseResult = z.object({
  characters: z.array(CharacterAttributes),
  locations: z.array(LocationAttributes),
  props: z.array(PropAttributes),
});

type EntityParseResultType = z.infer<typeof EntityParseResult>;

// ── Serialisation helpers (StructuredTool contract) ──────────────────────────

type ToolResultItem =
  | { success: true; characters: CharacterAttributes[]; locations: LocationAttributes[]; props: PropAttributes[] }
  | { success: false; error: string };

function serialiseResults(raw: EntityParseResultType): string {
  const items: ToolResultItem[] = [
    {
      success: true,
      characters: raw.characters,
      locations: raw.locations,
      props: raw.props,
    },
  ];

  return JSON.stringify({
    summary: {
      total: raw.characters.length + raw.locations.length + raw.props.length,
      succeeded: 1,
      failed: 0,
    },
    results: items,
  });
}

// ── Core logic ───────────────────────────────────────────────────────────────

/**
 * Single LLM call that extracts all entity types from a text input.
 *
 * The prompt instructs the model to identify characters, locations, and props
 * present in the narrative description and return their attributes in a
 * structured JSON object. Each entity array is independent — empty arrays
 * are returned when no entities of a given type are found.
 */
async function run(text: string, context: ToolContext<TextModelController>): Promise<EntityParseResultType> {
  const prompt = `You are an expert creative writer and story analyst.

Analyze the following text and extract ALL of the following entities that are mentioned or clearly implied:

1. **Characters** — People, animals, or personified beings. For each, extract:
${CharacterAttributes.toJSONSchema({ target: "openapi-3.0" })}

2. **Locations** — Places, settings, or environments. For each, extract:
${LocationAttributes.toJSONSchema({ target: "openapi-3.0" })}

3. **Props** — Objects, items, or tools that are significant to the narrative. For each, extract:
${PropAttributes.toJSONSchema({ target: "openapi-3.0" })}

Rules:
- Only extract entities that are clearly mentioned or strongly implied in the text.
- Use empty arrays for entity types that are absent from the text.
- Be thorough — extract ALL entities of each type, not just the most prominent ones.
- referenceId values MUST be unique across all entities in the response.

Text: "${text}"

Respond ONLY with valid JSON matching the schema.`;

  const responseJsonSchema = getModelCompatibleSchema(EntityParseResult);
  const result = await context.provider.generateContent({
    model: context.provider.textModel,
    messages: [new UserMessage({ content: [{ type: "text", text: prompt }] })],
    config: { responseJsonSchema },
  });

  const raw = result.text?.replace(/```json\n?|\n?```/g, "") ?? '{"characters":[],"locations":[],"props":[]}';
  const parsed = EntityParseResult.parse(JSON.parse(raw));
  return parsed;
}

// ── Tool class ───────────────────────────────────────────────────────────────

export interface ParseEntitiesToolDeps {
  context: ToolContext<TextModelController>;
}

class ParseEntitiesTool extends StructuredTool<typeof ParseEntitiesInput> {
  name = "parse_entities";
  description = "Analyze text and extract all characters, locations, and props with their attributes.";
  schema = ParseEntitiesInput;

  private readonly context: ParseEntitiesToolDeps["context"];

  constructor(deps: ParseEntitiesToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
  }

  async _call({ input }: ParseEntitiesInput, _runManager?: CallbackManagerForToolRun): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: ParseEntitiesTool invoked.`);

    const parsed = await run(input, this.context);
    const output = serialiseResults(parsed);

    console.log(
      `${traceId}: ParseEntitiesTool complete. ` +
        `characters=${parsed.characters.length}, ` +
        `locations=${parsed.locations.length}, ` +
        `props=${parsed.props.length}`,
    );
    return output;
  }

  /** Convenience wrapper that returns structured data instead of serialised JSON. */
  async run({ input }: ParseEntitiesInput): Promise<EntityParseResultType> {
    try {
      return await run(input, this.context);
    } catch (e) {
      console.error({ error: e, tool: "ParseEntitiesTool" }, "ParseEntitiesTool run failed");
      throw e;
    }
  }
}

// ── Factory export ───────────────────────────────────────────────────────────

export function createParseEntitiesTool(deps: ParseEntitiesToolDeps, params?: ToolParams): ParseEntitiesTool {
  return new ParseEntitiesTool(deps, params);
}
