import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { CharacterAttributes } from "#shared/types/character.types.js";
import { CharacterBase } from "#shared/types/workflow.types.js";
import { UploadResult } from "#shared/types/base.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import {
  GenerateCharacterImagesTool,
  GenerateCharacterImagesInput,
} from "#shared/lm/tools/characters/generate-character-images.tool.js";

// ============================================================================
// SCHEMA
// generationRules and attempt are added so the tool can forward them to the
// image tool internally. Both are optional with sensible defaults so existing
// call-sites that don't supply them continue to compile without changes.
// ============================================================================

const GenerateCharactersInput = z.object({
  characters: z.array(
    CharacterBase.partial().extend({
      id: z.uuid(),
      images: z.array(UploadResult).optional(),
    }),
  ),
  /** Forwarded verbatim to GenerateCharacterImagesTool */
  generationRules: z.array(z.string()).default([]),
  /** Forwarded verbatim to GenerateCharacterImagesTool */
  attempt: z.number().default(1),
});

export type GenerateCharactersInput = z.input<typeof GenerateCharactersInput>;

// ============================================================================
// RESULT TYPES — unchanged so downstream consumers are unaffected
// ============================================================================

export type GenerateCharactersResultSuccess = {
  success: true;
  id: string;
  output: CharacterAttributes;
  metadata?: { model: string; prompt: string };
};

export type GenerateCharactersResult = GenerateCharactersResultSuccess | { success: false; id: string; error: Error };

// ============================================================================
// SERIALISER — used by _call (LangChain string interface only)
// ============================================================================

type ToolResultItem = { success: true; character: CharacterAttributes } | { success: false; error: string };

function serialiseResults(raw: { success: boolean; data?: CharacterAttributes; error?: Error }[]): string {
  const items: ToolResultItem[] = raw.map((r) =>
    r.success
      ? { success: true, character: r.data as CharacterAttributes }
      : { success: false, error: r.error?.message ?? "unknown" },
  );

  const succeeded = items.filter((i) => i.success).length;
  const failed = items.filter((i) => !i.success).length;

  return JSON.stringify({
    summary: { total: items.length, succeeded, failed },
    results: items,
  });
}

// ============================================================================
// INPUT TYPE (module-scoped)
// ============================================================================

const CharacterBasePartialWithIdAndImages = CharacterBase.partial().extend({
  id: z.uuid(),
  images: z.array(UploadResult).optional(),
});

type CharacterGenerateItem = z.input<typeof CharacterBasePartialWithIdAndImages>;

/**
 * Shape returned by insertCharacters after DB persistence.
 * Mirrors what createInsertCharactersTool.run() produces.
 */
type InsertedCharacterRef = { id: string; name: string };

// ============================================================================
// CORE RUN FUNCTION
//
// Full self-contained pipeline per invocation:
//   1. Generate character attributes (LLM)
//   2. Save description assets inline (for successful items only)
//   3. Insert into DB via the injected insertCharacters callback
//   4. Fetch full entities and emit ENTITY_CREATED
//   5. Generate images via the injected imagesTool (for successful items only)
//      → imagesTool saves image assets inline and emits ENTITY_UPDATED internally
// ============================================================================

async function run(
  inputs: CharacterGenerateItem[],
  generationRules: string[],
  attempt: number,
  context: ToolContext<TextModelController> & { projectRepository: ProjectRepository },
  imagesTool: GenerateCharacterImagesTool,
  insertCharacters: (characters: Array<CharacterAttributes & { projectId: string }>) => Promise<InsertedCharacterRef[]>,
): Promise<GenerateCharactersResult[]> {
  const { projectId, traceId } = context;

  // ── Step 1: Generate character attributes ──────────────────────────────────
  console.log(`${traceId}: Generating attributes for ${inputs.length} character(s)`);

  const rawResults = await generateEntityAttributes(
    {
      schema: CharacterAttributes,
      entities: inputs.map((input) => ({
        data: input,
        entityType: "character",
        images: input.images,
      })),
      entityDescription: "character profile",
    },
    context,
  );

  const attributeResults: GenerateCharactersResult[] = rawResults.map((result) =>
    result.success
      ? { success: true, id: result.id, output: result.data }
      : { success: false, id: result.id, error: result.error },
  );

  // All subsequent steps operate only on items that succeeded here.
  const successes = attributeResults.filter((r): r is GenerateCharactersResultSuccess => r.success);

  if (successes.length === 0) {
    console.warn(`${traceId}: No character attributes succeeded — skipping insert, asset save, and image generation`);
    return attributeResults;
  }

  // Insert successful characters into DB ───────────────────────────
  let insertedRefs: InsertedCharacterRef[];
  try {
    insertedRefs = await insertCharacters(successes.map((r) => ({ ...r.output, projectId })));
    console.log(`${traceId}: Inserted ${insertedRefs.length} character(s) into DB`);
  } catch (e) {
    console.error(`${traceId}: Insert failed — aborting image generation`, e);
    // Return attribute results as-is; insert failure is surfaced by re-throw
    throw e;
  }

  // Save description assets inline ────────────────────────────────
  // Each success result is persisted as a text asset ("character_description")
  if (context.saveAssets) {
    await context.saveAssets!(
      { characterIds: successes.map((r) => r.id), projectId },
      ["description"],
      "text",
      successes.map((r) => r.output.description),
      successes
        .map((r) => (r.metadata ? { model: r.metadata.model, prompt: r.metadata.prompt } : undefined))
        .filter((m) => !!m),
      /* setBest */ true,
    );
    console.log(`${traceId}: Description assets saved for ${successes.length} character(s)`);
  }

  // ── Step 4: Emit ENTITY_CREATED ───────────────────────────────────────────
  // Fetch the freshly-inserted entities so the event carries complete data.
  if (context.publishPipelineEvent && insertedRefs.length > 0) {
    try {
      const insertedEntities = await context.projectRepository.getEntities(
        insertedRefs.map((ref) => ({
          entityId: ref.id,
          entityType: "character" as const,
          entity: {},
        })),
      );

      await context.publishPipelineEvent({
        type: "ENTITY_CREATED",
        worldId: context.worldId,
        payload: insertedEntities.map(({ entity, entityType }) => ({
          entityId: (entity as any).id,
          entityType,
          entity,
        })),
      });

      console.log(`${traceId}: ENTITY_CREATED emitted for ${insertedEntities.length} character(s)`);
    } catch (e) {
      // Event emission failure must not abort image generation
      console.error(`${traceId}: ENTITY_CREATED publish failed (non-fatal)`, e);
    }
  }

  // ── Step 5: Generate images for successful characters ─────────────────────
  // imagesTool handles BATCH / PARALLEL / SEQUENTIAL internally.
  // It also saves image assets inline and emits ENTITY_UPDATED — no extra
  // plumbing needed here.
  //
  // We map insertedRefs (not successes) so we use the authoritative IDs from
  // the DB rather than the client-generated IDs (they should match, but this
  // makes the dependency explicit).
  const imageInput: GenerateCharacterImagesInput = {
    characters: insertedRefs.map((ref) => {
      // Re-attach version from the attribute result so image prompt stays consistent
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

  try {
    const imageResults = await imagesTool.run(imageInput);

    const imageFailures = imageResults.filter((r) => !r.success);
    if (imageFailures.length > 0) {
      console.error(`${traceId}: Image generation failed for ${imageFailures.length} character(s)`, imageFailures);
    }

    console.log(
      `${traceId}: Image generation complete. ` +
        `succeeded=${imageResults.filter((r) => r.success).length} ` +
        `failed=${imageFailures.length}`,
    );
  } catch (e) {
    // Image generation failure is non-fatal for the attribute pipeline —
    // characters are already inserted and ENTITY_CREATED was emitted.
    // Callers can schedule a retry via GENERATE_CHARACTER_IMAGES command.
    console.error(`${traceId}: imagesTool.run() threw — image generation skipped`, e);
  }

  // Return the attribute-level results. The caller can inspect these to
  // determine which characters were fully processed.
  return attributeResults;
}

// ============================================================================
// DEPS
// ============================================================================

export interface GenerateCharactersToolDeps {
  context: ToolContext<TextModelController> & {
    /** Required for fetching inserted entities to build ENTITY_CREATED payload */
    projectRepository: ProjectRepository;
  };
  /**
   * Image tool instance injected by the owning agent.
   * Used internally to generate images for successfully generated characters.
   * The same instance continues to be available externally through the agent
   * for standalone GENERATE_CHARACTER_IMAGES commands.
   */
  imagesTool: GenerateCharacterImagesTool;
  /**
   * Callback that persists the generated character attributes to the database.
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

class GenerateCharactersTool extends StructuredTool<typeof GenerateCharactersInput> {
  name = "generate_characters";
  description = "Generates character attributes and images using LLM with property preservation.";
  schema = GenerateCharactersInput;

  private readonly context: GenerateCharactersToolDeps["context"];
  private readonly imagesTool: GenerateCharacterImagesTool;
  private readonly insertCharacters: GenerateCharactersToolDeps["insertCharacters"];

  constructor(deps: GenerateCharactersToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
    this.imagesTool = deps.imagesTool;
    this.insertCharacters = deps.insertCharacters;
  }

  /** LangChain tool interface — returns serialised JSON string. */
  async _call(
    { characters, generationRules = [], attempt = 1 }: GenerateCharactersInput,
    _runManager?: CallbackManagerForToolRun,
  ): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: GenerateCharactersTool invoked. count: ${characters.length}`);

    const generated = await run(
      characters,
      generationRules,
      attempt,
      this.context,
      this.imagesTool,
      this.insertCharacters,
    );

    // serialiseResults expects the legacy shape — adapt from GenerateCharactersResult[]
    const adapted = generated.map((r) =>
      r.success ? { success: true, data: r.output } : { success: false, error: r.error },
    );

    const output = serialiseResults(adapted);
    console.log(`${traceId}: GenerateCharactersTool complete.`);
    return output;
  }

  /**
   * Programmatic interface for direct tool-to-tool calls.
   * Returns GenerateCharactersResult[] — same type as before.
   */
  async run({
    characters,
    generationRules = [],
    attempt = 1,
  }: GenerateCharactersInput): Promise<GenerateCharactersResult[]> {
    try {
      return await run(characters, generationRules, attempt, this.context, this.imagesTool, this.insertCharacters);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}

export function createGenerateCharactersTool(
  deps: GenerateCharactersToolDeps,
  params?: ToolParams,
): GenerateCharactersTool {
  return new GenerateCharactersTool(deps, params);
}
