import { aspectRatios, EXECUTION_MODE, imageMimeType } from "#shared/config.js";
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

/** Generates a portrait-orientation character image. */
export async function generateCharacterImages({
    characters,
    generationRules,
    attempt,
    incrementAttempt,
}: GenerateCharacterImagesParams,
    context: ToolContext<TextModelController>
): Promise<GenerateCharacterImagesResult[]> {

    const { projectId, traceId } = context;
    console.log(`${traceId}: Execution Mode: ${EXECUTION_MODE}`);
    if (EXECUTION_MODE === "PARALLEL") {
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
                    // seed: Math.floor(Math.random() * 1000000),
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

            return Promise.all(results.map(async res => {
                const item = characters.find(c => c.id === res.customId);
                if (!item) {
                    console.error(`${traceId}: Unknown result ID from batch: ${res.customId}`);
                    return { success: false, id: res.customId, error: new Error("Unknown result ID") };
                }

                if (res.status !== "SUCCESS") {
                    console.error(`${traceId}: Item ${item.id} failed in batch:`, res.error);
                    return { success: false, id: item.id, error: res.error || new Error("Batch generation failed") };
                }

                try {
                    const ctx = contextMap.get(item.id)!;
                    const imageBuffer = Buffer.from(res.imageBytes, "base64");
                    const outputPath = context.storageManager.getObjectPath({ projectId, characterId: item.id, type: "character_image", version: ctx.version });
                    const src = await context.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);

                    console.log(`${traceId}: Successfully processed QC batch image for ${item.id}`);
                    return { success: true, id: item.id, output: src, metadata: { prompt: ctx.prompt, model: context.provider.imageModel } };
                } catch (e) {
                    console.error(`${traceId}: Processing failure for ${item.id}:`, e);
                    return { success: false, id: item.id, error: e };
                }
            }));
        } catch (e) {
            console.error(`${traceId}: Fatal batch failure:`, e);
            return characters.map(c => ({ success: false, id: c.id, error: e }));
        }

    } else {
        // Sequential fallback

        console.log(`${traceId}: Sequential execution. Checking ${characters.length} characters...`);
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