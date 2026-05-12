import { z } from "zod";
import { NarrativeEngine } from "narrative-engine";
import { NarrativeProvider } from "#shared/narrative/narrative-provider.js";
import { db } from "#shared/db/index.js";
import { createStoryBlockInstructions } from "#shared/prompts/storyblock.prompt.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { BlockAttributes } from "#shared/narrative/narrative.types.js";
import { getModelCompatibleSchema } from "#shared/utils/utils.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { ProjectRepository } from "#shared/services/project-repository.js";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

const BlockDirectives = z.array(z.string());
export type BlockDirectives = z.infer<typeof BlockDirectives>;

// Tool schema wrapped in object for Google Gemini API compatibility
const GenerateStoryBlocksInput = z.object({ directives: BlockDirectives });

export type BlockResult =
  | { success: true; index: number; block: BlockAttributes }
  | { success: false; index: number; error: Error };

export interface GenerateStoryBlocksToolDeps {
  context: ToolContext<TextModelController> & { projectRepository: ProjectRepository };
}

const TIMEOUT_CONTEXT_MS = 8_000;
const _provider = new NarrativeProvider(db);
const narrativeEngine = new NarrativeEngine(_provider);

async function generateContextBatch(
  channelId: string,
  directives: string[],
): Promise<Map<string, string>> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Context retrieval timeout")),
      TIMEOUT_CONTEXT_MS,
    ),
  );
  // Batch overload: one DB round-trip for all directives.
  // Returns a Map<directive, contextString> where each contextString already
  // includes lore, historical skeleton, and relevance survivors.
  return Promise.race([
    narrativeEngine.generateContext(channelId, directives),
    timeout,
  ]).catch(() => new Map<string, string>());
  // On timeout: proceed with empty context rather than failing the batch.
}

async function generateSingleBlock(
  directive: string,
  index: number,
  ragContext: string,
  context: GenerateStoryBlocksToolDeps["context"],
  narrativeAnchor: BlockAttributes | undefined,
): Promise<BlockResult> {
  try {
    const prompt = createStoryBlockInstructions({
      // Continuations use the seed as previousBlock for narrative coherence.
      // The seed uses its own directive string.
      previousBlock: narrativeAnchor ? JSON.stringify(narrativeAnchor) : directive,
      ragContext,
      isResolving: false,
    });

    const response = await context.provider.generateContent({
      messages: [
        new SystemMessage({ content: prompt }),
        new HumanMessage({ content: "Generate a storyblock:" }),
      ],
      config: {
        responseJsonSchema: getModelCompatibleSchema(BlockAttributes),
      },
    });

    if (!response.text) throw new Error("No text returned from model");

    const block = JSON.parse(response.text) as BlockAttributes;
    return { success: true, index, block };
  } catch (e) {
    return { success: false, index, error: e as Error };
  }
}

async function* yieldAsCompleted<T>(promises: Promise<T>[]): AsyncGenerator<T> {
  const queue: T[] = [];
  let notify: (() => void) | null = null;
  let remaining = promises.length;

  for (const p of promises) {
    p.then((value) => {
      queue.push(value);
      if (notify) { notify(); notify = null; }
    }).catch(() => {
      // generateSingleBlock never rejects — it catches internally and returns
      // { success: false }. This branch is a safety net only.
      remaining--;
      if (notify) { notify(); notify = null; }
    });
  }

  while (remaining > 0) {
    if (queue.length === 0) {
      await new Promise<void>((res) => { notify = res; });
    }
    while (queue.length > 0) {
      yield queue.shift() as T;
      remaining--;
    }
  }
}

async function* streamBlocks(
  directives: BlockDirectives,
  context: GenerateStoryBlocksToolDeps["context"],
): AsyncGenerator<BlockResult> {
  const [seedDirective, ...continuationDirectives] = directives;
  if (!seedDirective) return;

  // ── Phase 1: Batch context fetch (one DB round-trip) ─────────────────────
  // channelId in the engine = projectId in Cinematic Canvas.
  // The returned context strings already contain lore + historical skeleton +
  // relevance-scored candidates, formatted by composeProse.
  const contextMap = await generateContextBatch(context.projectId, directives);

  // ── Phase 2: Seed block — serial ──────────────────────────────────────────
  // Must resolve before continuations start so it can serve as the anchor.
  const seedResult = await generateSingleBlock(
    seedDirective,
    0,
    contextMap.get(seedDirective) ?? "",
    context,
    undefined,
  );
  yield seedResult;

  if (continuationDirectives.length === 0) return;

  // ── Phase 3: Continuations — parallel, yielded in completion order ────────
  // If the seed failed, continuations still fire unanchored — a single LLM
  // failure does not abort the remaining batch.
  const narrativeAnchor = seedResult.success ? seedResult.block : undefined;

  const continuationPromises = continuationDirectives.map((directive, i) =>
    generateSingleBlock(
      directive,
      i + 1,
      contextMap.get(directive) ?? "",
      context,
      narrativeAnchor,
    ),
  );

  yield* yieldAsCompleted(continuationPromises);
}

function serialiseResults(results: BlockResult[]): string {
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;
  return JSON.stringify({
    // "partial" signals to callers that some blocks succeeded and some failed.
    status: failed === 0 ? "ok" : succeeded === 0 ? "error" : "partial",
    summary: { total: results.length, succeeded, failed },
    results: results.map((r) =>
      r.success
        ? { success: true, index: r.index, block: r.block }
        : { success: false, index: r.index, error: (r as Extract<BlockResult, { success: false }>).error.message },
    ),
  });
}

class GenerateStoryBlocksTool extends StructuredTool<typeof GenerateStoryBlocksInput> {
  name = "generate_storyblocks";
  description = "Generates story blocks used for composing scenes and storyboards";
  schema = GenerateStoryBlocksInput;

  private readonly context: GenerateStoryBlocksToolDeps["context"];

  constructor(deps: GenerateStoryBlocksToolDeps, params?: ToolParams) {
    super(params);
    this.context = deps.context;
  }

  /**
   * LangChain interface — buffers the complete stream and returns serialised
   * JSON. Backward compatible; existing agent usage requires no changes.
   */
  async _call(
    { directives }: z.infer<typeof GenerateStoryBlocksInput>,
    _runManager?: CallbackManagerForToolRun,
  ): Promise<string> {
    const { traceId } = this.context;
    console.log(`${traceId}: generateStoryBlocksTool invoked. count=${directives.length}`);

    const results: BlockResult[] = [];
    for await (const result of streamBlocks(directives, this.context)) {
      results.push(result);
    }

    const output = serialiseResults(results);
    console.log(`${traceId}: generateStoryBlocksTool complete. ${output}`);
    return output;
  }

  /**
   * Streaming interface — yields each block as its LLM call resolves.
   * Seed is always first. Continuations arrive in completion order.
   * Use this for progressive UI rendering.
   */
  override stream({ directives }: z.infer<typeof GenerateStoryBlocksInput>): any {
    return streamBlocks(directives, this.context) as AsyncGenerator<BlockResult>;
  }

  /**
   * Collect-all convenience method — throws on the first failure.
   * Use when you need all blocks or none.
   */
  async run({ directives }: z.infer<typeof GenerateStoryBlocksInput>): Promise<BlockAttributes[]> {
    const blocks: BlockAttributes[] = [];
    for await (const result of streamBlocks(directives, this.context)) {
      if (!result.success) throw result.error;
      blocks.push(result.block);
    }
    return blocks;
  }
}

export function createGenerateStoryBlocksTool(
  deps: GenerateStoryBlocksToolDeps,
  params?: ToolParams,
): GenerateStoryBlocksTool {
  return new GenerateStoryBlocksTool(deps, params);
}
