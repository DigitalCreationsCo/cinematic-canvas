import { filterDefined, ToolContext } from "#shared/lm/tools/tools.utils.js";
import { GenerateBatchContentParameters, TextModelController, UserMessage } from "../text-model-controller.js";
import { getModelCompatibleSchema } from "../../utils/utils.js";
import { getExecutionMode } from "../../config.js";
import { z } from "zod";
import { EntityType, EntityUnion, GenerateEntity } from "#shared/types/index.js";
import { BaseMessage } from "@langchain/core/messages";

interface GenerateEntityAttributesParams<T> {
    schema: z.ZodType<T>,
    entities: GenerateEntity<T>[],
    entityDescription: string,
}


export type GenerateEntityAttributesSuccessResult<T> = {
    success: true;
    id: string;
    attributes: T;
    entityType: EntityType;
    error?: never;
}

export type GenerateEntityAttributesResult<T> =
    | GenerateEntityAttributesSuccessResult<T>
    | {
        success: false;
        id: string;
        attributes: Partial<T>;
        entityType: EntityType;
        error: Error;
    };

/** Build the prompt parts (text + optional image attachments) for one entity. */
function buildEntityPromptParts<T>(
    attributes: Partial<T>,
    entityDescription: string,
    images?: { gcsUri: string; mimeType: string }[]
): any[] {

    const alreadyFilled = Object.keys(
        filterDefined(attributes as Record<string, unknown>)
    );

    const prompt = `You are an expert creative writer and world builder.
Complete the following ${entityDescription} by populating ONLY missing or empty fields.
DO NOT change these already-filled fields: ${alreadyFilled.length ? alreadyFilled.join(", ") : "(none — fill everything)"}.

Current (partial) data:
${JSON.stringify(attributes, null, 2)}

Return ONLY valid JSON with ALL fields populated.
Preserve filled fields exactly. Fill missing fields with rich, specific, internally consistent creative content.`;

    const parts: any[] = [{ text: prompt }];
    images?.forEach((image) => {
        if (image.gcsUri && image.mimeType) {
            parts.push({ fileData: { mimeType: image.mimeType, fileUri: image.gcsUri } });
        }
    });

    return parts;
}

/** Parse and merge a raw LLM text response for one entity. */
function parseAndMerge<T>(
    rawText: string,
    attributes: Partial<T>,
    schema: z.ZodType<T>
): T {
    const generated = JSON.parse(rawText.replace(/```json\n?|\n?```/g, ""));
    // Caller-provided values always win over LLM output.
    const merged = { ...generated, ...filterDefined(attributes as Record<string, unknown>) };
    return schema.parse(merged);
}

/**
 * Unified attribute generation for any entity type.
 *
 * Mirrors the multi-processing architecture of `generateCharacterAssets`:
 *   • PARALLEL / BATCH  — all entities are fired concurrently via Promise.all
 *                         (or a single batch call when the provider supports it).
 *   • SEQUENTIAL        — entities are processed one at a time in order.
 *
 * In every path the LLM fills ALL fields; caller-supplied values then
 * overwrite the generated ones — so user input is always preserved verbatim.
 */
export async function generateEntityAttributes<T>(
    { schema, entities, entityDescription }: GenerateEntityAttributesParams<T>,
    context: ToolContext<TextModelController>
): Promise<GenerateEntityAttributesResult<T>[]> {

    const { projectId, traceId } = context;
    const executionMode = getExecutionMode();
    const responseJsonSchema = getModelCompatibleSchema(schema);

    if (executionMode === "BATCH") {

        // -------------------------------------------------------------------------
        // Path 1 – BATCH: fire all entities concurrently.
        // -------------------------------------------------------------------------
        console.log(
            { count: entities.length, mode: executionMode },
            `Generating ${entityDescription} attributes in batch`
        );

        const contextMap = new Map<string, { attributes: Partial<T> & { id: string }; entityType: EntityType; messages: BaseMessage[] }>();
        const batchRequests: GenerateBatchContentParameters["requests"] = [];

        for (const entity of entities) {
            let ctx = contextMap.get(entity.attributes.id);
            if (!ctx) {
                const prompt = buildEntityPromptParts(entity.attributes, entityDescription, entity.images);
                ctx = { attributes: entity.attributes, entityType: entity.entityType, messages: [new UserMessage({ content: prompt })] };
                contextMap.set(entity.attributes.id, ctx);
            }

            batchRequests.push({
                messages: ctx.messages,
                metadata: { custom_id: entity.attributes.id, version: 1, assetKey: "character_image" },
                config: {
                    abortSignal: context.options?.signal,
                    candidateCount: 1,
                    // seed: Math.floor(Math.random() * 1000000),
                },
            });
        }

        if (batchRequests.length === 0) {
            return [];
        }

        console.log({ projectId, traceId, count: batchRequests.length }, `Submitting batch ${entityDescription} generation`);

        try {

            const entityIndexMap = new Map(entities.map((e, i) => [e.attributes.id, i]));

            const results = await context.provider.generateBatchContent({
                projectId,
                model: context.provider.textModel,
                requests: batchRequests,
                config: {
                    abortSignal: context.options?.signal,
                },
            });

            const unordered = results.map((res) => {

                const ctx = contextMap.get(res.customId);

                if (!ctx) {
                    throw new Error(`Context not found for ${entityDescription} ${res.customId}`);
                }

                const { attributes, entityType } = ctx;

                if (res.status !== "SUCCESS") {
                    console.error(`${traceId}: Failed to generate ${entityDescription} for ${res.customId}:`, res.error);
                    return { success: false as const, id: res.customId, attributes, entityType, error: res.error ?? new Error("Batch generation failed") };
                }

                if (!res.text) {
                    return { success: false as const, id: res.customId, attributes, entityType, error: res.error ?? new Error("Batch generation failed") };
                }

                const merged = parseAndMerge(res.text, attributes, schema);

                console.log(`${traceId}: Successfully processed batch ${entityDescription} for ${res.customId}`);
                return { success: true as const, id: res.customId, attributes: merged, entityType };
            });

            return unordered.sort((a, b) => (entityIndexMap.get(a.id) ?? 0) - (entityIndexMap.get(b.id) ?? 0));
        } catch (error) {
            console.error(`${traceId}: Fatal batch failure:`, error);
            return entities.map((entity) => ({ success: false as const, id: entity.attributes.id, attributes: entity.attributes, entityType: entity.entityType, error: error as Error }));
        }

    } else if (executionMode === "PARALLEL") {

        // -------------------------------------------------------------------------
        // Path 2 – PARALLEL: fire all entities concurrently.
        // -------------------------------------------------------------------------
        console.log(
            { count: entities.length, mode: executionMode },
            `Generating ${entityDescription} attributes in parallel`
        );

        const results = await Promise.all(
            entities.map(async ({ attributes, entityType, images }, index) => {
                const parts = buildEntityPromptParts(attributes, entityDescription, images);

                const result = await context.provider.generateContent({
                    model: context.provider.textModel,
                    messages: [new UserMessage({ content: parts })],
                    config: { responseJsonSchema },
                });

                if (!result.text) {
                    return { success: false as const, id: attributes.id, attributes, entityType, error: new Error("LLM returned no content") };
                }

                return { success: true as const, id: attributes.id, attributes: parseAndMerge(result.text, attributes, schema), entityType };
            })
        );
        return results;

    } else {

        // -------------------------------------------------------------------------
        // Path 3 – SEQUENTIAL: process entities one at a time.
        // -------------------------------------------------------------------------
        const results: GenerateEntityAttributesResult<T>[] = [];

        for (let index = 0; index < entities.length; index++) {
            const { attributes, entityType, images } = entities[index];

            console.log(
                { index, total: entities.length },
                `Generating ${entityDescription} attributes sequentially`
            );

            try {
                const parts = buildEntityPromptParts(attributes, entityDescription, images);

                const result = await context.provider.generateContent({
                    model: context.provider.textModel,
                    messages: [new UserMessage({ content: parts })],
                    config: { responseJsonSchema },
                });

                if (!result.text) {
                    throw new Error(
                        `LLM returned no content for ${entityDescription} at index ${index}`
                    );
                }

                results.push({ success: true as const, id: attributes.id, attributes: parseAndMerge(result.text, attributes, schema), entityType });
            } catch (e) {
                results.push({ success: false as const, id: attributes.id, attributes, entityType, error: e as Error });
            }
        }
        return results;
    }
}