import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { z } from "zod";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";

export abstract class BasePipelineTool<TInput extends z.ZodObject<any>, TResult> extends StructuredTool {
  schema: TInput;

  constructor(
    protected deps: { context: ToolContext<TextModelController>; schema: TInput },
    params?: ToolParams,
  ) {
    super(params);
    this.schema = deps.schema;
  }

  /**
   * Orchestrates the three-stage pipeline:
   * 1. Attribute Expansion (LLM)
   * 2. Database Commitment (Persistence)
   * 3. Asset Generation (Images/Media)
   * Tag Registration
   */
  abstract runPipeline(input: z.infer<TInput>): Promise<TResult[]>;

  async _call(input: z.infer<TInput>): Promise<string> {
    const results = await this.runPipeline(input);
    return JSON.stringify(results);
  }
}
