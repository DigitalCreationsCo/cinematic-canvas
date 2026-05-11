import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { generateEntityAttributes } from "#shared/lm/tools/generate-entity-attributes.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { PropAttributes, PropBase, PropWithAssets } from "#shared/types/workflow.types.js";
import { UploadResult } from "#shared/types/base.types.js";
import { ProjectRepository } from "#shared/services/project-repository.js";
import {
  GeneratePropImagesTool,
  GeneratePropImagesInput,
} from "#shared/lm/tools/props/generate-prop-images.tool.js";

// ============================================================================
// SCHEMA
// generationRules and attempt are added so the tool can forward them to the
// images tool internally. Both are optional with sensible defaults so existing
// call-sites that don't supply them continue to compile without changes.
// ============================================================================

const GeneratePropsInput = z.object({
  props: z.array(
    PropBase.partial().extend({
      id: z.string(),
      images: z.array(UploadResult).optional(),
    }),
  ),
  /** Forwarded verbatim to the images tool */
  generationRules: z.array(z.string()).default([]),
  /** Forwarded verbatim to the images tool */
  attempt: z.number().default(1),
});
export type GeneratePropsInput = z.infer<typeof GeneratePropsInput>;

// ============================================================================
// RESULT TYPES — same pattern as GenerateCharactersResult
// ============================================================================

export type GeneratePropsResultSuccess = {
  success: true;
  id: string;
  output: PropAttributes;
  metadata?: { model: string; prompt: string };
};

export type GeneratePropsResult = GeneratePropsResultSuccess | { success: false; id: string; error: Error };

// ============================================================================
// SERIALISER — used by _call (LangChain string interface only)
// ============================================================================

type ToolResultItem = { success: true; prop: PropAttributes } | { success: false; error: string };

function serialiseResults(raw: { success: boolean; data?: PropAttributes; error?: Error }[]): string {
  const items: ToolResultItem[] = raw.map((r) =>
    r.success
      ? { success: true, prop: r.data as PropAttributes }
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

type InsertedPropRef = { id: string; name: string };

// ============================================================================
// CORE RUN FUNCTION
//
// Full self-contained pipeline per invocation:
//   1. Generate prop attributes (LLM)
//   2. Save description assets inline (for successful items only)
//   3. Insert into DB via the injected insertProps callback
//   4. Fetch full entities and emit ENTITY_CREATED
//   5. Trigger images via the injected imagesTool (for successful items only)
// ============================================================================

async function run(
  inputs: GeneratePropsInput["props"],
  generationRules: string[],
  attempt: number,
  context: ToolContext<TextModelController> & { projectRepository: ProjectRepository },
  imagesTool: GeneratePropImagesTool,
  insertProps: (props: Array<PropAttributes & { projectId: string }>) => Promise<InsertedPropRef[]>,
): Promise<GeneratePropsResult[]> {
  const { projectId, traceId } = context;

  // ── Step 1: Generate prop attributes ─────────────────────────────────────
  console.log(`${traceId}: Generating attributes for ${inputs.length} prop(s)`);

  const rawResults = await generateEntityAttributes(
    {
      schema: PropAttributes,
      entities: inputs.map((p) => ({
        data: p,
        entityType: "prop",
        images: p.images,
      })),
      entityDescription: "prop profile",
    },
    context,
  );

  const attributeResults: GeneratePropsResult[] = rawResults.map((result) =>
    result.success
      ? { success: true, id: result.id, output: result.data }
      : { success: false, id: result.id, error: result.error },
  );

  // All subsequent steps operate only on items that succeeded here
  const successes = attributeResults.filter((r): r is GeneratePropsResultSuccess => r.success);

  if (successes.length === 0) {
    console.warn(`${traceId}: No prop attributes succeeded — skipping insert, asset save, and image generation`);
    return attributeResults;
  }

  // ── Step 2: Insert successful props into DB ─────────────────────────────
  let insertedRefs: InsertedPropRef[];
  try {
    insertedRefs = await insertProps(successes.map((r) => ({ ...r.output, projectId })));
    console.log(`${traceId}: Inserted ${insertedRefs.length} prop(s) into DB`);
  } catch (e) {
    console.error(`${traceId}: Insert failed — aborting image generation`, e);
    throw e;
  }

  // ── Step 3: Save description assets inline ─────────────────────────────
  if (context.saveAssets) {
    await context.saveAssets(
      { propIds: successes.map((r) => r.id), projectId },
      ["description"],
      "text",
      successes.map((r) => r.output.description),
      successes
        .map((r) => (r.metadata ? { model: r.metadata.model, prompt: r.metadata.prompt } : undefined))
        .filter((m) => !!m),
      /* setBest */ true,
    );
    console.log(`${traceId}: Description assets saved for ${successes.length} prop(s)`);
  }

  // ── Step 4: Emit ENTITY_CREATED ─────────────────────────────────────────
  if (context.publishPipelineEvent && insertedRefs.length > 0) {
    try {
      const insertedEntities = await context.projectRepository.getEntities(
        insertedRefs.map((ref) => ({
          entityId: ref.id,
          entityType: "prop" as const,
          entity: {},
        })),
      );

      await context.publishPipelineEvent({
        type: "ENTITY_CREATED",
        worldId: context.worldId,
        payload: insertedEntities.map(({ entity, entityType }) => ({
          entityId: (entity as PropWithAssets).id,
          entityType,
          entity,
        })),
      });

      console.log(`${traceId}: ENTITY_CREATED emitted for ${insertedEntities.length} prop(s)`);
    } catch (e) {
      console.error(`${traceId}: ENTITY_CREATED publish failed (non-fatal)`, e);
    }
  }

  // ── Step 5: Trigger images via imagesTool ──────────────────────────────
  if (insertedRefs.length > 0) {
    try {
      const imageInput: GeneratePropImagesInput = {
        props: insertedRefs.map((ref) => {
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

      const imageResults = await imagesTool.run(imageInput);

      const imageFailures = imageResults.filter((r) => !r.success);
      if (imageFailures.length > 0) {
        console.error(`${traceId}: Image generation failed for ${imageFailures.length} prop(s)`, imageFailures);
      }

      console.log(
        `${traceId}: Image generation complete. ` +
          `succeeded=${imageResults.filter((r) => r.success).length} ` +
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

export interface GeneratePropsToolDeps {
  context: ToolContext<TextModelController> & {
    /** Required for fetching inserted entities to build ENTITY_CREATED payload */
    projectRepository: ProjectRepository;
  };
  /**
   * Images tool instance injected by the owning agent.
   * Used internally to generate images for successfully generated props.
   * The same instance continues to be available externally through the agent
   * for standalone GENERATE_PROP_IMAGES commands.
   */
  imagesTool: GeneratePropImagesTool;
  /**
   * Callback that persists the generated prop attributes to the database.
   * Typically wraps createInsertPropsTool(...).run().
   *
   * @param props - Array of fully-generated PropAttributes with projectId attached
   * @returns Minimal refs (id + name) for the persisted records
   */
  insertProps: (props: Array<PropAttributes & { projectId: string }>) => Promise<InsertedPropRef[]>;
}

// ============================================================================
// TOOL CLASS
// ============================================================================

class GeneratePropsTool extends StructuredTool<typeof GeneratePropsInput> {
  name = "generate_props";
  description = "Generates prop attributes and images using LLM with property preservation.";
  schema = GeneratePropsInput;

  private readonly context: GeneratePropsToolDeps["context"];
  private readonly imagesTool: GeneratePropImagesTool;
  private readonly insertProps: GeneratePropsToolDeps["insertProps"];

  constructor(deps: GeneratePropsToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
    this.imagesTool = deps.imagesTool;
    this.insertProps = deps.insertProps;
  }

  /** LangChain tool interface — returns serialised JSON string. */
  async _call(
    { props, generationRules = [], attempt = 1 }: GeneratePropsInput,
    _runManager?: CallbackManagerForToolRun,
  ): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: GeneratePropsTool invoked. count: ${props.length}`);

    const generated = await run(props, generationRules, attempt, this.context, this.imagesTool, this.insertProps);

    const adapted = generated.map((r) =>
      r.success ? { success: true, data: r.output } : { success: false, error: r.error },
    );

    const output = serialiseResults(adapted);
    console.log(`${traceId}: GeneratePropsTool complete.`);
    return output;
  }

  /**
   * Programmatic interface for direct tool-to-tool calls.
   */
  async run({ props, generationRules = [], attempt = 1 }: GeneratePropsInput): Promise<GeneratePropsResult[]> {
    try {
      return await run(props, generationRules, attempt, this.context, this.imagesTool, this.insertProps);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}

export function createGeneratePropsTool(deps: GeneratePropsToolDeps, params?: ToolParams): GeneratePropsTool {
  return new GeneratePropsTool(deps, params);
}
