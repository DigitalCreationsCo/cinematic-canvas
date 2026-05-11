import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { LocationAttributes } from "#shared/types/location.types.js";
import { LocationBase, LocationWithAssets } from "#shared/types/workflow.types.js";
import { UploadResult } from "#shared/types/base.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { GenerateLocationImagesTool, GenerateLocationImagesResult } from "./generate-location-images.tool.js";

// ============================================================================
// SCHEMA
// generationRules and attempt are added so the tool can forward them to the
// image tool internally. Both are optional with sensible defaults so existing
// call-sites that don't supply them continue to compile without changes.
// ============================================================================

const GenerateLocationsInput = z.object({
  locations: z.array(
    LocationBase.partial().extend({
      id: z.string(),
      images: z.array(UploadResult).optional(),
    }),
  ),
  /** Forwarded verbatim to GenerateLocationImagesTool */
  generationRules: z.array(z.string()).default([]),
  /** Forwarded verbatim to GenerateLocationImagesTool */
  attempt: z.number().default(1),
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

// ============================================================================
// INTERNAL TYPES
// ============================================================================

type InsertedLocationRef = { id: string; name: string };

// ============================================================================
// CORE RUN FUNCTION
//
// Full self-contained pipeline per invocation:
//   1. Generate location attributes (LLM)
//   2. Save description assets inline (for successful items only)
//   3. Insert into DB via the injected insertLocations callback
//   4. Fetch full entities and emit ENTITY_CREATED
//   5. Generate images via the injected imagesTool (for successful items only)
//      → imagesTool saves image assets inline and emits ENTITY_UPDATED internally
// ============================================================================

async function run(
  inputs: GenerateLocationsInput["locations"],
  generationRules: string[],
  attempt: number,
  context: ToolContext<TextModelController> & { projectRepository: ProjectRepository },
  imagesTool: GenerateLocationImagesTool,
  insertLocations: (locs: Array<LocationAttributes & { projectId: string }>) => Promise<InsertedLocationRef[]>,
): Promise<GenerateLocationsResult[]> {
  const { projectId, traceId } = context;

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

  // ── Step 2: Insert successful locations into DB ───────────────────────────
  let insertedRefs: InsertedLocationRef[];
  try {
    insertedRefs = await insertLocations(successes.map((r) => ({ ...r.output, projectId })));
    console.log(`${traceId}: Inserted ${insertedRefs.length} location(s) into DB`);
  } catch (e) {
    console.error(`${traceId}: Insert failed — aborting image generation`, e);
    throw e;
  }

  // ── Step 3: Save description assets inline ────────────────────────────────
  if (context.saveAssets) {
    await context.saveAssets(
      { locationIds: successes.map((r) => r.id), projectId },
      ["description"],
      "text",
      successes.map((r) => r.output.description),
      successes
        .map((r) => (r.metadata ? { model: r.metadata.model, prompt: r.metadata.prompt } : undefined))
        .filter((m) => !!m),
      /* setBest */ true,
    );
    console.log(`${traceId}: Description assets saved for ${successes.length} location(s)`);
  }

  // ── Step 4: Emit ENTITY_CREATED ───────────────────────────────────────────
  if (context.publishPipelineEvent && insertedRefs.length > 0) {
    try {
      const insertedEntities = await context.projectRepository.getEntities(
        insertedRefs.map((ref) => ({
          entityId: ref.id,
          entityType: "location" as const,
          entity: {},
        })),
      );

      await context.publishPipelineEvent({
        type: "ENTITY_CREATED",
        worldId: context.worldId,
        payload: insertedEntities.map(({ entity, entityType }) => ({
          entityId: (entity as LocationWithAssets).id,
          entityType,
          entity,
        })),
      });

      console.log(`${traceId}: ENTITY_CREATED emitted for ${insertedEntities.length} location(s)`);
    } catch (e) {
      console.error(`${traceId}: ENTITY_CREATED publish failed (non-fatal)`, e);
    }
  }

  // ── Step 5: Generate images for successful locations ──────────────────────
  // imagesTool handles BATCH / PARALLEL / SEQUENTIAL internally.
  // It also saves image assets inline and emits ENTITY_UPDATED — no extra
  // plumbing needed here.
  //
  // We map insertedRefs so we use the authoritative IDs from the DB.
  const imageInput = {
    locations: insertedRefs.map((ref) => {
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
      console.error(`${traceId}: Image generation failed for ${imageFailures.length} location(s)`, imageFailures);
    }

    console.log(
      `${traceId}: Image generation complete. ` +
        `succeeded=${imageResults.filter((r) => r.success).length} ` +
        `failed=${imageFailures.length}`,
    );
  } catch (e) {
    // Image generation failure is non-fatal for the attribute pipeline —
    // locations are already inserted and ENTITY_CREATED was emitted.
    // Callers can schedule a retry via GENERATE_LOCATION_IMAGES command.
    console.error(`${traceId}: imagesTool.run() threw — image generation skipped`, e);
  }

  // Return the attribute-level results
  return attributeResults;
}

// ============================================================================
// DEPS
// ============================================================================

export interface GenerateLocationsToolDeps {
  context: ToolContext<TextModelController> & {
    /** Required for fetching inserted entities to build ENTITY_CREATED payload */
    projectRepository: ProjectRepository;
  };
  /**
   * Image tool instance injected by the owning agent.
   * Used internally to generate images for successfully generated locations.
   * The same instance continues to be available externally through the agent
   * for standalone GENERATE_LOCATION_IMAGES commands.
   */
  imagesTool: GenerateLocationImagesTool;
  /**
   * Callback that persists the generated location attributes to the database.
   * Typically wraps createInsertLocationsTool(...).run().
   *
   * @param locations - Array of fully-generated LocationAttributes with projectId attached
   * @returns Minimal refs (id + name) for the persisted records
   */
  insertLocations: (locs: Array<LocationAttributes & { projectId: string }>) => Promise<InsertedLocationRef[]>;
}

// ============================================================================
// TOOL CLASS
// ============================================================================

class GenerateLocationsTool extends StructuredTool<typeof GenerateLocationsInput> {
  name = "generate_locations";
  description = "Generates location attributes and images using LLM with property preservation.";
  schema = GenerateLocationsInput;

  private readonly context: GenerateLocationsToolDeps["context"];
  private readonly imagesTool: GenerateLocationImagesTool;
  private readonly insertLocations: GenerateLocationsToolDeps["insertLocations"];

  constructor(deps: GenerateLocationsToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
    this.imagesTool = deps.imagesTool;
    this.insertLocations = deps.insertLocations;
  }

  /** LangChain tool interface — returns serialised JSON string. */
  async _call(
    { locations, generationRules = [], attempt = 1 }: GenerateLocationsInput,
    _runManager?: CallbackManagerForToolRun,
  ): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: GenerateLocationsTool invoked. count: ${locations.length}`);

    const generated = await run(locations, generationRules, attempt, this.context, this.imagesTool, this.insertLocations);

    const adapted = generated.map((r) =>
      r.success ? { success: true, data: r.output } : { success: false, error: r.error },
    );

    const output = serialiseResults(adapted);
    console.log(`${traceId}: GenerateLocationsTool complete.`);
    return output;
  }

  /**
   * Programmatic interface for direct tool-to-tool calls.
   */
  async run({
    locations,
    generationRules = [],
    attempt = 1,
  }: GenerateLocationsInput): Promise<GenerateLocationsResult[]> {
    try {
      return await run(locations, generationRules, attempt, this.context, this.imagesTool, this.insertLocations);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}

export function createGenerateLocationsTool(deps: GenerateLocationsToolDeps, params?: ToolParams): GenerateLocationsTool {
  return new GenerateLocationsTool(deps, params);
}
