import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { CharacterAttributes } from "#shared/types/character.types.js";
import { CharacterBase, CharacterWithAssets } from "#shared/types/workflow.types.js";
import { UploadResult } from "#shared/types/base.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import {
  GenerateCharacterAttributesTool,
  GenerateCharactersResultSuccess,
} from "#shared/lm/tools/characters/generate-characters-attributes.tool.js";
import { GenerateCharacterImagesTool } from "#shared/lm/tools/characters/generate-characters-images.tool.js";

// ============================================================================
// SCHEMA
// ============================================================================

const CharacterSeedSchema = CharacterBase.partial().extend({
  id: z.uuid(),
  images: z.array(UploadResult).optional(),
});

const GenerateCharactersPipelineInput = z.object({
  characters: z.array(CharacterSeedSchema),
  /** Forwarded verbatim to GenerateCharacterAttributesTool and GenerateCharacterImagesTool */
  generationRules: z.array(z.string()),
  /** Forwarded verbatim to GenerateCharacterImagesTool */
  attempt: z.number(),
});

export type GenerateCharactersPipelineInput = z.input<typeof GenerateCharactersPipelineInput>;

// ============================================================================
// INTERNAL TYPES
// ============================================================================

type InsertedCharacterRef = { id: string; name: string };

// ============================================================================
// RESULT TYPES
// ============================================================================

export type GenerateCharactersPipelineResultSuccess = {
  success: true;
  id: string;
  character: CharacterWithAssets;
};

export type GenerateCharactersPipelineResult =
  | GenerateCharactersPipelineResultSuccess
  | { success: false; id: string; error: Error };

// ============================================================================
// SERIALISER — used by _call (LangChain string interface only)
// ============================================================================

function serialiseResults(results: GenerateCharactersPipelineResult[]): string {
  const items = results.map((r) =>
    r.success
      ? { success: true, id: r.id, character: r.character }
      : { success: false, id: r.id, error: (r.error as Error)?.message ?? "unknown" },
  );

  return JSON.stringify({
    summary: {
      total: items.length,
      succeeded: items.filter((i) => i.success).length,
      failed: items.filter((i) => !i.success).length,
    },
    results: items,
  });
}

// ============================================================================
// CORE RUN FUNCTION
//
// Pipeline per invocation:
//   1. Generate character attributes via injected attributesTool
//   2. Insert into DB via injected insertCharacters callback
//   3. Fetch full entities and emit ENTITY_CREATED
//   4. Generate images via injected imagesTool
//      → imagesTool saves image assets inline and emits ENTITY_UPDATED internally
// ============================================================================

async function run(
  inputs: GenerateCharactersPipelineInput["characters"],
  generationRules: string[],
  attempt: number,
  context: GenerateCharactersPipelineDeps["context"],
  attributesTool: GenerateCharacterAttributesTool,
  imagesTool: GenerateCharacterImagesTool,
  insertCharacters: GenerateCharactersPipelineDeps["insertCharacters"],
): Promise<GenerateCharactersPipelineResult[]> {
  const { projectId, traceId } = context;

  // ── Step 1: Generate character attributes ──────────────────────────────────
  console.log(`${traceId}: [Pipeline] Generating attributes for ${inputs.length} character(s)`);

  const attributeResults = await attributesTool.run({ characters: inputs });

  const successes = attributeResults.filter((r): r is GenerateCharactersResultSuccess => r.success);

  if (successes.length === 0) {
    console.warn(`${traceId}: [Pipeline] No attributes succeeded — skipping insert and image generation`);
    return attributeResults.map((r) => ({
      success: false as const,
      id: r.id,
      error: r.success ? new Error("unreachable") : r.error,
    }));
  }

  // ── Step 2: Insert successful characters into DB ───────────────────────────
  let insertedRefs: InsertedCharacterRef[];
  try {
    insertedRefs = await insertCharacters(successes.map((r) => ({ ...r.output, projectId })));
    console.log(`${traceId}: [Pipeline] Inserted ${insertedRefs.length} character(s) into DB`);
  } catch (e) {
    console.error(`${traceId}: [Pipeline] Insert failed — aborting image generation`, e);
    throw e;
  }

  // ── Step 3: Fetch full entities and emit ENTITY_CREATED ───────────────────
  let insertedEntities: CharacterWithAssets[] = [];
  if (context.publishPipelineEvent && insertedRefs.length > 0) {
    try {
      const fetched = await context.projectRepository.getEntities(
        insertedRefs.map((ref) => ({
          entityId: ref.id,
          entityType: "character" as const,
          entity: {},
        })),
      );

      insertedEntities = fetched.map(({ entity }) => entity as CharacterWithAssets);

      await context.publishPipelineEvent({
        type: "ENTITY_CREATED",
        worldId: context.worldId,
        payload: fetched.map(({ entity, entityType }) => ({
          entityId: entity.id,
          entityType: entityType as "character",
          entity: entity as CharacterWithAssets,
        })),
      });

      console.log(`${traceId}: [Pipeline] ENTITY_CREATED emitted for ${insertedEntities.length} character(s)`);
    } catch (e) {
      console.error(`${traceId}: [Pipeline] ENTITY_CREATED publish failed (non-fatal)`, e);
    }
  }

  // ── Step 4: Generate images for successful characters ─────────────────────
  // imagesTool handles BATCH / PARALLEL / SEQUENTIAL internally.
  // It also saves image assets inline and emits ENTITY_UPDATED — no extra
  // plumbing needed here.
  const imageInput = {
    characters: insertedRefs.map((ref) => {
      const attrResult = successes.find((s) => s.id === ref.id);
      return {
        id: ref.id,
        name: ref.name,
        version: (attrResult?.output as any)?.version ?? attempt,
      };
    }),
    generationRules,
    attempt,
  };

  // Build a lookup of image-enriched entities to fold back into the results.
  const enrichedById = new Map<string, CharacterWithAssets>();

  try {
    const imageResults = await imagesTool.run(imageInput);

    for (const result of imageResults) {
      if (result.success && result.entity) {
        enrichedById.set(result.id, result.entity);
      }
    }

    const imageFailures = imageResults.filter((r) => !r.success);
    if (imageFailures.length > 0) {
      console.error(
        `${traceId}: [Pipeline] Image generation failed for ${imageFailures.length} character(s)`,
        imageFailures,
      );
    }

    console.log(
      `${traceId}: [Pipeline] Image generation complete. ` +
        `succeeded=${imageResults.filter((r) => r.success).length} ` +
        `failed=${imageFailures.length}`,
    );
  } catch (e) {
    // Image generation failure is non-fatal — characters are already inserted
    // and ENTITY_CREATED was emitted. Callers can schedule a retry via
    // GENERATE_CHARACTER_IMAGES command.
    console.error(`${traceId}: [Pipeline] imagesTool.run() threw — image generation skipped`, e);
  }

  // ── Assemble final results ─────────────────────────────────────────────────
  // Precedence: image-enriched entity → post-insert fetched entity → attribute failure.
  const insertedById = new Map(insertedEntities.map((e) => [e.id, e]));

  return attributeResults.map((r) => {
    if (!r.success) return r;
    const character = enrichedById.get(r.id) ?? insertedById.get(r.id);
    if (!character) return { success: false as const, id: r.id, error: new Error("Entity missing after insert") };
    return { success: true as const, id: r.id, character };
  });
}

// ============================================================================
// DEPS
// ============================================================================

export interface GenerateCharactersPipelineDeps {
  context: ToolContext<TextModelController> & {
    /** Required for fetching inserted entities to build ENTITY_CREATED payload */
    projectRepository: ProjectRepository;
  };
  /**
   * Attribute tool instance injected by the owning agent.
   * Used internally to generate attributes for each character seed.
   */
  attributesTool: GenerateCharacterAttributesTool;
  /**
   * Image tool instance injected by the owning agent.
   * Used internally to generate images for successfully inserted characters.
   * The same instance remains available externally for standalone
   * GENERATE_CHARACTER_IMAGES commands.
   */
  imagesTool: GenerateCharacterImagesTool;
  /**
   * Callback that persists generated character attributes to the database.
   * Typically wraps createInsertCharactersTool(...).run().
   *
   * @param characters - Array of fully-generated CharacterAttributes with projectId attached
   * @returns Minimal refs (id + name) for the persisted records
   */
  insertCharacters: (characters: Array<CharacterAttributes & { projectId: string }>) => Promise<InsertedCharacterRef[]>;
}

// ============================================================================
// TOOL CLASS
// ============================================================================

class GenerateCharactersPipelineTool extends StructuredTool<typeof GenerateCharactersPipelineInput> {
  name = "generate_characters_pipeline";
  description =
    "Full character creation pipeline: generates attributes via LLM, inserts into DB, and generates portrait images. Returns the persisted CharacterWithAssets records.";
  schema = GenerateCharactersPipelineInput;

  private readonly context: GenerateCharactersPipelineDeps["context"];
  private readonly attributesTool: GenerateCharacterAttributesTool;
  private readonly imagesTool: GenerateCharacterImagesTool;
  private readonly insertCharacters: GenerateCharactersPipelineDeps["insertCharacters"];

  constructor(deps: GenerateCharactersPipelineDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
    this.attributesTool = deps.attributesTool;
    this.imagesTool = deps.imagesTool;
    this.insertCharacters = deps.insertCharacters;
  }

  /** LangChain tool interface — returns serialised JSON string. */
  async _call(
    { characters, generationRules = [], attempt = 1 }: GenerateCharactersPipelineInput,
    _runManager?: CallbackManagerForToolRun,
  ): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: GenerateCharactersPipelineTool invoked. count: ${characters.length}`);

    const results = await run(
      characters,
      generationRules,
      attempt,
      this.context,
      this.attributesTool,
      this.imagesTool,
      this.insertCharacters,
    );

    const output = serialiseResults(results);
    console.log(`${traceId}: GenerateCharactersPipelineTool complete.`);
    return output;
  }

  /**
   * Programmatic interface for direct tool-to-tool calls.
   * Returns one result per input character — successes carry the full
   * CharacterWithAssets (image-enriched when available), failures carry
   * the originating id and error.
   */
  async run({
    characters,
    generationRules = [],
    attempt = 1,
  }: GenerateCharactersPipelineInput): Promise<GenerateCharactersPipelineResult[]> {
    try {
      return await run(
        characters,
        generationRules,
        attempt,
        this.context,
        this.attributesTool,
        this.imagesTool,
        this.insertCharacters,
      );
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}

export type { GenerateCharactersPipelineTool };

export function createGenerateCharactersPipelineTool(
  deps: GenerateCharactersPipelineDeps,
  params?: ToolParams,
): GenerateCharactersPipelineTool {
  return new GenerateCharactersPipelineTool(deps, params);
}
