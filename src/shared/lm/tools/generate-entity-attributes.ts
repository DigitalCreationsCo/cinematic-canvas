import { filterDefined, ToolContext } from "#shared/lm/tools/tools.utils.js";
import { GenerateBatchContentParameters, TextModelController, UserMessage } from "../text-model-controller.js";
import { getModelCompatibleSchema } from "../../utils/utils.js";
import { getExecutionMode } from "../../config.js";
import { z } from "zod";
import { EntityCreatableType } from "#shared/types/entity.types.js";
import { BaseMessage } from "@langchain/core/messages";

export type GenerateEntityAttributesSuccessResultEntityEnvelope<T, P> = {
  success: true;
  id: string;
  // Intersection ensures TS knows 'data' has schema fields AND original fields
  data: T & P;
  entityType: EntityCreatableType;
  error?: never;
};

export type GenerateEntityAttributesResultEntityEnvelope<T, P> =
  | GenerateEntityAttributesSuccessResultEntityEnvelope<T, P>
  | {
      success: false;
      id: string;
      data: P; // Original partial data
      entityType: EntityCreatableType;
      error: Error;
    };

/** Build the prompt parts (text + optional image attachments) for one entity. */
function buildEntityPromptParts<T>(
  attributes: Partial<T>,
  entityDescription: string,
  images?: { gcsUri: string; mimeType: string }[],
): BaseMessage["content"] {
  const alreadyFilled = Object.keys(filterDefined(attributes as Record<string, unknown>));

  const prompt = `You are an expert creative writer and world builder.
Complete the following ${entityDescription} by populating ONLY missing or empty fields.
DO NOT change these already-filled fields: ${alreadyFilled.length ? alreadyFilled.join(", ") : "(none — fill everything)"}.

Current (partial) data:
${JSON.stringify(attributes, null, 2)}

Return ONLY valid JSON with ALL fields populated.
Preserve filled fields exactly. Fill missing fields with rich, specific, internally consistent creative content.`;

  const content: BaseMessage["content"] = [{ type: "text", text: prompt }];
  images?.forEach((image) => {
    if (image.gcsUri && image.mimeType) {
      content.push({ type: "file_data", fileData: { mimeType: image.mimeType, fileUri: image.gcsUri } });
    }
  });

  return content;
}

/**
 * Unified attribute generation with Type-Safe Property Preservation.
 */
export async function generateEntityAttributes<T, P extends { id: string } & Record<string, any>>(
  {
    schema,
    entities,
    entityDescription,
  }: {
    schema: z.ZodType<T>;
    entities: { data: P; entityType: EntityCreatableType; images?: any[] }[];
    entityDescription: string;
  },
  context: ToolContext<TextModelController>,
): Promise<GenerateEntityAttributesResultEntityEnvelope<T, P>[]> {
  const { projectId, traceId } = context;
  const executionMode = getExecutionMode();
  const responseJsonSchema = getModelCompatibleSchema(schema);

  const parseAndMerge = (rawText: string, originalData: P): T & P => {
    const generated = JSON.parse(rawText.replace(/```json\n?|\n?```/g, ""));
    const validated = schema.parse(generated);

    return {
      ...validated,
      ...filterDefined(originalData as Record<string, unknown>),
    } as T & P;
  };

  if (executionMode === "BATCH") {
    console.log(
      { traceId, count: entities.length, mode: executionMode },
      `[generateEntityAttributes] Initiating batch processing for ${entityDescription}`,
    );

    // 2. FIX: Type the map to use 'P' directly instead of Partial<T>.
    // This preserves the full property set passed in by the caller.
    const contextMap = new Map<string, { data: P; entityType: EntityCreatableType; messages: BaseMessage[] }>();
    const batchRequests: GenerateBatchContentParameters["requests"] = [];

    for (const entity of entities) {
      if (!contextMap.has(entity.data.id)) {
        const prompt = buildEntityPromptParts(entity.data, entityDescription, entity.images);
        contextMap.set(entity.data.id, {
          data: entity.data,
          entityType: entity.entityType,
          messages: [new UserMessage({ content: prompt })],
        });
      }

      const ctx = contextMap.get(entity.data.id)!;
      batchRequests.push({
        messages: ctx.messages,
        metadata: { custom_id: entity.data.id, version: 1, assetKey: "character_image" },
        config: {
          abortSignal: context.options?.signal,
          candidateCount: 1,
        },
      });
    }

    if (batchRequests.length === 0) return [];

    try {
      const entityIndexMap = new Map(entities.map((e, i) => [e.data.id, i]));
      const results = await context.provider.generateBatchContent({
        projectId,
        model: context.provider.textModel,
        requests: batchRequests,
        config: { abortSignal: context.options?.signal },
      });

      const unordered = results.map((res): GenerateEntityAttributesResultEntityEnvelope<T, P> => {
        const ctx = contextMap.get(res.customId);

        if (!ctx) {
          console.error(`${traceId}: Orphaned batch response id: ${res.customId}`);
          throw new Error(`Context missing for ${res.customId}`);
        }

        const { data, entityType } = ctx;

        if (res.status !== "SUCCESS" || !res.text) {
          console.error(`${traceId}: Failed ${entityDescription} generation for ${res.customId}`, res.error);
          // 3. FIX: 'data' is now recognized as type 'P', matching the failure union.
          return {
            success: false,
            id: res.customId,
            data,
            entityType,
            error: res.error ?? new Error("Empty batch response"),
          };
        }

        try {
          const merged = parseAndMerge(res.text, data);
          console.log(`${traceId}: Successfully merged ${entityDescription} for ${res.customId}`);
          // 4. FIX: 'merged' is T & P, matching the success union.
          return { success: true, id: res.customId, data: merged, entityType };
        } catch (parseError) {
          console.error(`${traceId}: Parse/Schema failure for ${res.customId}:`, parseError);
          return { success: false, id: res.customId, data, entityType, error: parseError as Error };
        }
      });

      return unordered.sort((a, b) => (entityIndexMap.get(a.id) ?? 0) - (entityIndexMap.get(b.id) ?? 0));
    } catch (error) {
      console.error(`${traceId}: Fatal batch pipeline failure:`, error);
      return entities.map((entity) => ({
        success: false,
        id: entity.data.id,
        data: entity.data,
        entityType: entity.entityType,
        error: error as Error,
      }));
    }
  } else if (executionMode === "PARALLEL") {
    console.log(
      { traceId, count: entities.length, mode: executionMode },
      `[generateEntityAttributes] Initiating parallel processing for ${entityDescription}`,
    );

    return await Promise.all(
      entities.map(
        async ({ data, entityType, images }): Promise<GenerateEntityAttributesResultEntityEnvelope<T, P>> => {
          try {
            const parts = buildEntityPromptParts(data, entityDescription, images);
            const result = await context.provider.generateContent({
              model: context.provider.textModel,
              messages: [new UserMessage({ content: parts })],
              config: { responseJsonSchema },
            });

            if (!result.text) throw new Error("LLM returned empty payload.");

            const merged = parseAndMerge(result.text, data);
            return { success: true, id: data.id, data: merged, entityType };
          } catch (error) {
            console.error(`${traceId}: Parallel pipeline failure for ${data.id}:`, error);
            return { success: false, id: data.id, data, entityType, error: error as Error };
          }
        },
      ),
    );
  } else {
    console.log(
      { traceId, total: entities.length },
      `[generateEntityAttributes] Initiating sequential processing for ${entityDescription}`,
    );

    const results: GenerateEntityAttributesResultEntityEnvelope<T, P>[] = [];

    for (const { data, entityType, images } of entities) {
      try {
        const parts = buildEntityPromptParts(data, entityDescription, images);
        const result = await context.provider.generateContent({
          model: context.provider.textModel,
          messages: [new UserMessage({ content: parts })],
          config: { responseJsonSchema },
        });

        if (!result.text) throw new Error("LLM returned empty payload.");

        const merged = parseAndMerge(result.text, data);
        results.push({ success: true, id: data.id, data: merged, entityType });
      } catch (error) {
        console.error(`${traceId}: Sequential pipeline failure for ${data.id}:`, error);
        results.push({ success: false, id: data.id, data, entityType, error: error as Error });
      }
    }
    return results;
  }
}
