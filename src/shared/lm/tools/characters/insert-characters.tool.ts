import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { CharacterBase, CharacterWithAssets } from "#shared/types/workflow.types.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { mapDomainCharacterToInsertCharacter } from "#shared/entity/character-mappers.js";
import { TagRegistryService } from "#shared/services/tag-registry.js";

// ---------------------------------------------------------------------------
// Input schema — what the orchestrator LLM sends when invoking this tool
// ---------------------------------------------------------------------------

const InsertCharactersInput = z.object({ characters: z.array(CharacterBase) });
export type InsertCharactersInput = z.input<typeof InsertCharactersInput>;

// ---------------------------------------------------------------------------
// Serialised output shape — what the LLM reads back from the tool result
// ---------------------------------------------------------------------------

export type InsertToolResultItem =
  | { success: true; character: CharacterWithAssets }
  | { success: false; error: string };

function serialiseResults(raw: Awaited<ReturnType<typeof run>>): string {
  const items: InsertToolResultItem[] = raw.map((r) =>
    r.success
      ? {
          success: true,
          character: r.character,
        }
      : { success: false, error: r.error?.message ?? "unknown" },
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

async function run(charactersData: InsertCharactersInput["characters"], context: InsertCharactersToolDeps["context"]) {
  try {
    const toInsertCharacters = charactersData.map(mapDomainCharacterToInsertCharacter);

    const insertedCharacters = await context.projectRepository.createCharacters(
      toInsertCharacters[0].projectId,
      toInsertCharacters,
    );

    await context.saveAssets?.(
      { characterIds: charactersData.map((c) => c.id), projectId: context.projectId },
      ["description"],
      "text",
      charactersData.map((c) => c.description),
      [{ model: context.provider.textModel }],
      /* setBest */ true,
    );

    for (let i = 0; i < insertedCharacters.length; i++) {
      const entity = insertedCharacters[i];
      if (!entity.name) throw new Error("Entity name is required for handle registration.");

      await context.tagRegistry
        .registerHandle({
          handle: `@${entity.name.replace(/[^a-zA-Z0-9_]/g, "")}`,
          entityId: entity.id,
          entityType: "character",
          projectId: context.projectId,
        })
        .catch((err) => {
          console.warn({ entityId: entity.id, error: err }, "[Worker] Failed to register entity handle.");
        });
    }

    return Promise.all(
      insertedCharacters.map(async (res) => {
        return { success: true as const, character: res };
      }),
    );
  } catch (e) {
    return charactersData.map((c) => ({ success: false as const, error: e as Error }));
  }
}

// ---------------------------------------------------------------------------
// LangChain StructuredTool
// ---------------------------------------------------------------------------

export interface InsertCharactersToolDeps {
  context: ToolContext<TextModelController> & {
    projectRepository: ProjectRepository;
    tagRegistry: TagRegistryService;
  };
}

class InsertCharactersTool extends StructuredTool<typeof InsertCharactersInput> {
  name = "insert_characters";
  description = "Saves character attributes objects into database records.";
  schema = InsertCharactersInput;

  // Injected dependencies — not exposed to the LLM
  private readonly context: InsertCharactersToolDeps["context"];

  constructor(deps: InsertCharactersToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
  }

  /**
   * Called by LangChain after it parses and validates the LLM's tool-call arguments
   * against `schema`. Return value is stringified and injected as a ToolMessage.
   */
  async _call({ characters }: InsertCharactersInput, _runManager?: CallbackManagerForToolRun): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: InsertCharactersTool invoked. count: ${characters.length}`);

    const inserted = await run(characters, this.context);
    const output = serialiseResults(inserted);
    console.log(`${traceId}: InsertCharactersTool complete. ${output}`);
    return output;
  }

  async run({ characters }: InsertCharactersInput) {
    try {
      const result = await run(characters, this.context);
      return result.map((r) => {
        if (r.success) {
          return r.character;
        }
        throw r.error;
      });
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}

export type { InsertCharactersTool };
// ---------------------------------------------------------------------------
// Factory — preferred way to instantiate so callers don't touch the class directly
// ---------------------------------------------------------------------------

export function createInsertCharactersTool(deps: InsertCharactersToolDeps, params?: ToolParams): InsertCharactersTool {
  return new InsertCharactersTool(deps, params);
}
