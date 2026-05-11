import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { SceneAttributes } from "#shared/types/scene.types.js";
import { GenerateSceneInputVerbose } from "#shared/types/workflow.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

// ============================================================================
// SCHEMA
// generationRules and attempt are added so the tool can forward them to the
// images tool internally. Both are optional with sensible defaults so existing
// call-sites that don't supply them continue to compile without changes.
// ============================================================================

const GenerateScenesInput = z.object({
  scenes: z.array(GenerateSceneInputVerbose),
  /** Forwarded verbatim to the images tool */
  generationRules: z.array(z.string()).default([]),
  /** Forwarded verbatim to the images tool */
  attempt: z.number().default(1),
});
type GenerateScenesInput = z.input<typeof GenerateScenesInput>;

// ============================================================================
// RESULT TYPES
// ============================================================================

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

// ============================================================================
// INTERNAL TYPES
// ============================================================================

/** Shape returned by insertScenes after DB persistence. */
type InsertedSceneRef = { id: string; name: string };

// ============================================================================
// CORE RUN FUNCTION
//
// Full self-contained pipeline per invocation:
//   1. Generate scene attributes (LLM)
//   2. Save description assets inline (for successful items only)
//   3. Insert into DB via the injected insertScenes callback
//   4. Fetch full entities and emit ENTITY_CREATED
//   5. Trigger images via the injected imagesTool (for successful items only)
// ============================================================================

async function run(
  inputs: z.input<typeof GenerateSceneInputVerbose>[],
  generationRules: string[],
  attempt: number,
  context: ToolContext<TextModelController> & { projectRepository: ProjectRepository },
  imagesTool: { run: (input: any) => Promise<any[]> },
  insertScenes: (scenes: Array<SceneAttributes & { projectId: string }>) => Promise<InsertedSceneRef[]>,
): Promise<GenerateScenesResult[]> {
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

  // ── Step 2: Insert successful scenes into DB ──────────────────────────
  let insertedRefs: InsertedSceneRef[];
  try {
    insertedRefs = await insertScenes(successes.map((r) => ({ ...r.output, projectId })));
    console.log(`${traceId}: Inserted ${insertedRefs.length} scene(s) into DB`);
  } catch (e) {
    console.error(`${traceId}: Insert failed — aborting image generation`, e);
    throw e;
  }

  // ── Step 3: Save description assets inline ──────────────────────────
  if (context.saveAssets) {
    await context.saveAssets(
      { sceneIds: successes.map((r) => r.id), projectId },
      ["description"],
      "text",
      successes.map((r) => r.output.description),
      successes
        .map((r) => (r.metadata ? { model: r.metadata.model, prompt: r.metadata.prompt } : undefined))
        .filter((m) => !!m),
      /* setBest */ true,
    );
    console.log(`${traceId}: Description assets saved for ${successes.length} scene(s)`);
  }

  // ── Step 4: Emit ENTITY_CREATED ──────────────────────────────────────
  if (context.publishPipelineEvent && insertedRefs.length > 0) {
    try {
      const insertedEntities = await context.projectRepository.getEntities(
        insertedRefs.map((ref) => ({
          entityId: ref.id,
          entityType: "scene" as const,
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

      console.log(`${traceId}: ENTITY_CREATED emitted for ${insertedEntities.length} scene(s)`);
    } catch (e) {
      // Event emission failure must not abort later steps
      console.error(`${traceId}: ENTITY_CREATED publish failed (non-fatal)`, e);
    }
  }

  // ── Step 5: Trigger images via imagesTool ────────────────────────────
  if (insertedRefs.length > 0) {
    try {
      const imageInput = {
        scenes: insertedRefs.map((ref) => ({
          id: ref.id,
          name: ref.name,
          version: attempt,
        })),
        generationRules,
        attempt,
      };

      const imageResults = await imagesTool.run(imageInput);

      const imageFailures = imageResults.filter((r: any) => !r.success);
      if (imageFailures.length > 0) {
        console.error(`${traceId}: Image generation failed for ${imageFailures.length} scene(s)`, imageFailures);
      }

      console.log(
        `${traceId}: Image generation complete. ` +
          `succeeded=${imageResults.filter((r: any) => r.success).length} ` +
          `failed=${imageFailures.length}`,
      );
    } catch (e) {
      console.error(`${traceId}: imagesTool.run() threw — image generation skipped`, e);
    }
  }

  return attributeResults;
}

// ============================================================================
// DEPS
// ============================================================================

export interface GenerateScenesToolDeps {
  context: ToolContext<TextModelController> & {
    /** Required for fetching inserted entities to build ENTITY_CREATED payload */
    projectRepository: ProjectRepository;
  };
  /**
   * Images tool instance injected by the owning agent.
   * Used internally to generate images for successfully generated scenes.
   */
  imagesTool: { run: (input: any) => Promise<any[]> };
  /**
   * Callback that persists the generated scene attributes to the database.
   * Typically wraps createInsertScenesTool(...).run().
   *
   * @param scenes - Array of fully-generated SceneAttributes with projectId attached
   * @returns Minimal refs (id + name) for the persisted records
   */
  insertScenes: (scenes: Array<SceneAttributes & { projectId: string }>) => Promise<InsertedSceneRef[]>;
}

// ============================================================================
// TOOL CLASS
// ============================================================================

class GenerateScenesTool extends StructuredTool<typeof GenerateScenesInput> {
  name = "generate_scenes";
  description = "Generates scene attributes and images using LLM with property preservation.";
  schema = GenerateScenesInput;

  private readonly context: GenerateScenesToolDeps["context"];
  private readonly imagesTool: GenerateScenesToolDeps["imagesTool"];
  private readonly insertScenes: GenerateScenesToolDeps["insertScenes"];

  constructor(deps: GenerateScenesToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
    this.imagesTool = deps.imagesTool;
    this.insertScenes = deps.insertScenes;
  }

  /** LangChain tool interface — returns serialised JSON string. */
  async _call(
    { scenes, generationRules = [], attempt = 1 }: GenerateScenesInput,
    _runManager?: CallbackManagerForToolRun,
  ): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: GenerateScenesTool invoked. count: ${scenes.length}`);

    const generated = await run(scenes, generationRules, attempt, this.context, this.imagesTool, this.insertScenes);

    const adapted = generated.map((r) =>
      r.success ? { success: true, data: r.output } : { success: false, error: r.error },
    );

    const output = serialiseResults(adapted);
    console.log(`${traceId}: GenerateScenesTool complete.`);
    return output;
  }

  /**
   * Programmatic interface for direct tool-to-tool calls.
   */
  async run({ scenes, generationRules = [], attempt = 1 }: GenerateScenesInput): Promise<GenerateScenesResult[]> {
    try {
      return await run(scenes, generationRules, attempt, this.context, this.imagesTool, this.insertScenes);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}

export function createGenerateScenesTool(deps: GenerateScenesToolDeps, params?: ToolParams): GenerateScenesTool {
  return new GenerateScenesTool(deps, params);
}
