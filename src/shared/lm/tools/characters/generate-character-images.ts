import { aspectRatios, getExecutionMode, imageMimeType } from "#shared/config.js";
import { IncrementAttemptHook, Character } from "#shared/types/index.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { CharacterAttributes } from "#shared/types/index.js";
import {
    executeWithRetry,
} from "#shared/utils/execute-with-retry.js";
import { Modality } from "@google/genai";
import { buildCharacterImagePrompt } from "#shared/prompts/character-reference-image.prompt.js";
import { GenerateBatchImagesParameters, UserMessage } from "#shared/lm/provider.js";
import { extractGeneratedResponse } from "#shared/lm/parts-extractor.js";



interface GenerateCharacterImagesParams {
    characters: (Character & { version: number })[];
    generationRules: string[];
    attempt: number;
    incrementAttempt: IncrementAttemptHook;
};

export type GenerateCharacterImagesResultSuccess = {
    success: true;
    id: string;
    output: string;
    metadata: {
        model: string;
        prompt: string;
    }
    error?: never;
};

type GenerateCharacterImagesResult = GenerateCharacterImagesResultSuccess | {
    success: false;
    id: string;
    output?: never;
    error: Error;
};

/**
 * Generates portrait-orientation character images.
 *
 * Mirrors the multi-processing architecture of `generateEntityAttributes`:
 *   • BATCH       — all characters are sent in a single batch API call
 *   • PARALLEL    — all characters are fired concurrently via Promise.all
 *   • SEQUENTIAL  — characters are processed one at a time in order.
 *
 * In every path the caller-supplied values are preserved — results are sorted
 * to match input order in BATCH mode.
 */
export async function generateCharacterImages({
    characters,
    generationRules,
    attempt,
    incrementAttempt,
}: GenerateCharacterImagesParams,
    context: ToolContext<TextModelController>
): Promise<GenerateCharacterImagesResult[]> {

    const { projectId, traceId } = context;
    const executionMode = getExecutionMode();
    console.log(`${traceId}: Execution Mode: ${executionMode}`);

    if (executionMode === "BATCH") {
        // -------------------------------------------------------------------------
        // Path 1 – BATCH: send all characters in a single batch API call
        // -------------------------------------------------------------------------
        console.log(`${traceId}: Batch execution. Generating ${characters.length} character images`);

        const contextMap = new Map<string, { character: CharacterAttributes, version: number, prompt: string; }>();
        const batchRequests: GenerateBatchImagesParameters['requests'] = [];

        for (const characterWithVersion of characters) {
            const { version, ...char } = characterWithVersion;
            let ctx = contextMap.get(characterWithVersion.id);
            if (!ctx) {
                const prompt = buildCharacterImagePrompt(char, generationRules);
                ctx = { character: char, version, prompt };
                contextMap.set(char.id, ctx);
            }

            batchRequests.push({
                messages: [new UserMessage({ content: ctx.prompt })],
                metadata: { custom_id: char.id, version: ctx.version, assetKey: "character_image" },
                config: {
                    abortSignal: context.options?.signal,
                    candidateCount: 1,
                    responseModalities: [Modality.IMAGE],
                    imageConfig: {
                        ...aspectRatios.vertical,
                        outputMimeType: imageMimeType
                    }
                }
            });
        }

        if (batchRequests.length === 0) return [];

        console.log(`${traceId}: Submitting batch generation. Project: ${projectId}, Count: ${batchRequests.length}, Attempt: ${attempt}`);

        try {
            // Create index map for maintaining input order
            const entityIndexMap = new Map(characters.map((c, i) => [c.id, i]));

            const results = await context.provider.generateBatchImages({
                projectId,
                model: context.provider.imageModel,
                requests: batchRequests,
                config: {
                    abortSignal: context.options?.signal,
                    dest: { gcsUri: context.storageManager.getObjectPath({ type: 'batch-data', projectId, uniqueId: Date.now().toString() }) },
                    displayName: `generate_character_images_attempt_${attempt}`
                }
            });

            const unordered = await Promise.all(results.map(async res => {
                const item = characters.find(c => c.id === res.customId);
                if (!item) {
                    console.error(`${traceId}: Unknown result ID from batch: ${res.customId}`);
                    return { success: false as const, id: res.customId, error: new Error("Unknown result ID") };
                }

                if (res.status !== "SUCCESS") {
                    console.error(`${traceId}: Item ${item.id} failed in batch:`, res.error);
                    return { success: false as const, id: item.id, error: res.error || new Error("Batch generation failed") };
                }

                try {
                    const ctx = contextMap.get(item.id)!;
                    const imageBuffer = Buffer.from(res.imageBytes, "base64");
                    const outputPath = context.storageManager.getObjectPath({ projectId, characterId: item.id, type: "character_image", version: ctx.version });
                    const src = await context.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);

                    console.log(`${traceId}: Successfully processed batch image for ${item.id}`);
                    return { success: true as const, id: item.id, output: src, metadata: { prompt: ctx.prompt, model: context.provider.imageModel } };
                } catch (e) {
                    console.error(`${traceId}: Processing failure for ${item.id}:`, e);
                    return { success: false as const, id: item.id, error: e };
                }
            }));

            // Sort to maintain input order
            return unordered.sort((a, b) => (entityIndexMap.get(a.id) ?? 0) - (entityIndexMap.get(b.id) ?? 0));
        } catch (e) {
            console.error(`${traceId}: Fatal batch failure:`, e);
            return characters.map(c => ({ success: false as const, id: c.id, error: e }));
        }

    } else if (executionMode === "PARALLEL") {
        // -------------------------------------------------------------------------
        // Path 2 – PARALLEL: fire all characters concurrently via Promise.all
        // -------------------------------------------------------------------------
        console.log(`${traceId}: Parallel execution. Generating ${characters.length} character images`);

        const results = await Promise.all(
            characters.map(async (characterWithVersion) => {
                const { version, ...character } = characterWithVersion;
                console.log(`${traceId}: Generating: ${character.name}`);

                try {
                    const prompt = buildCharacterImagePrompt(character, generationRules);

                    const [imageData] = extractGeneratedResponse("image", await executeWithRetry(
                        (params) => context.provider.generateImages({
                            prompt: params.prompt,
                            config: {
                                abortSignal: context.options?.signal,
                                numberOfImages: 1,
                                seed: Math.floor(Math.random() * 1000000),
                                aspectRatio: aspectRatios.vertical.aspectRatio,
                                outputMimeType: imageMimeType
                            }
                        }),
                        { prompt },
                        {
                            attempt: version,
                            maxRetries: context.safetyRetries + version,
                            projectId
                        },
                        async (error, attempt, params) => {
                            console.warn(`${traceId}: Retry triggered for ${character.name} on attempt ${attempt}. Reason: ${error.message}`);
                            incrementAttempt(error.message, "BACKOFF_RETRY");
                            return { attempt, params };
                        }
                    ), "google");

                    const imageBuffer = Buffer.from(imageData, "base64");
                    const imagePath = context.storageManager.getObjectPath({ type: "character_image", projectId, characterId: character.id, version });
                    const gcsUri = await context.storageManager.uploadBuffer(imageBuffer, imagePath, imageMimeType);

                    console.log(`${traceId}: Saved character image: ${context.storageManager.getPublicUrl(gcsUri)}`);
                    return { success: true as const, id: character.id, output: gcsUri, metadata: { prompt, model: context.provider.imageModel } };
                } catch (error) {
                    console.error(`${traceId}: Failed to generate image for ${character.name}:`, error);
                    return { success: false as const, id: character.id, error: error as Error };
                }
            })
        );
        return results;

    } else {
        // -------------------------------------------------------------------------
        // Path 3 – SEQUENTIAL: process characters one at a time
        // -------------------------------------------------------------------------
        console.log(`${traceId}: Sequential execution. Generating ${characters.length} character images`);
        const results: GenerateCharacterImagesResult[] = [];

        for (const characterWithVersion of characters) {
            const { version, ...character } = characterWithVersion;
            console.log(`${traceId}: Generating: ${character.name}`);

            try {
                const prompt = buildCharacterImagePrompt(character, generationRules);

                const [imageData] = extractGeneratedResponse("image", await executeWithRetry(
                    (params) => context.provider.generateImages({
                        prompt: params.prompt,
                        config: {
                            abortSignal: context.options?.signal,
                            numberOfImages: 1,
                            seed: Math.floor(Math.random() * 1000000),
                            aspectRatio: aspectRatios.vertical.aspectRatio,
                            outputMimeType: imageMimeType
                        }
                    }),
                    { prompt },
                    {
                        attempt: version,
                        maxRetries: context.safetyRetries + version,
                        projectId
                    },
                    async (error, attempt, params) => {
                        console.warn(`${traceId}: Retry triggered for ${character.name} on attempt ${attempt}. Reason: ${error.message}`);
                        incrementAttempt(error.message, "BACKOFF_RETRY");
                        return { attempt, params };
                    }
                ), "google");

                const imageBuffer = Buffer.from(imageData, "base64");
                const imagePath = context.storageManager.getObjectPath({ type: "character_image", projectId, characterId: character.id, version });
                const gcsUri = await context.storageManager.uploadBuffer(imageBuffer, imagePath, imageMimeType);

                results.push({ success: true, id: character.id, output: gcsUri, metadata: { prompt, model: context.provider.imageModel } });
                console.log(`${traceId}: Saved character image: ${context.storageManager.getPublicUrl(gcsUri)}`);
            } catch (error) {
                console.error(`${traceId}: Failed to generate image for ${character.name}:`, error);
                results.push({ success: false, id: character.id, error: error as Error });
            }
        }
        return results;
    }
}