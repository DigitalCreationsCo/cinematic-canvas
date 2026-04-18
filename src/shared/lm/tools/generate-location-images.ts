import { aspectRatios, EXECUTION_MODE, imageMimeType } from "#shared/config.js";
import { IncrementAttemptHook, Location } from "#shared/types/index.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import {
    executeWithRetry,
} from "#shared/utils/execute-with-retry.js";
import { Modality } from "@google/genai";
import { buildLocationImagePrompt } from "#shared/prompts/location-reference-image.prompt.js";
import { GenerateBatchImagesParameters, UserMessage } from "#shared/lm/provider.js";
import { extractGeneratedResponse } from "#shared/lm/parts-extractor.js";

interface GenerateLocationImagesParams {
    locations: (Location & { version: number })[];
    generationRules: string[];
    attempt: number;
    incrementAttempt: IncrementAttemptHook;
}

type GenerateLocationImagesResult = {
    success: true;
    id: string;
    output: string;
    metadata: {
        model: string;
        prompt: string;
    }
    error?: never;
} | {
    success: false;
    id: string;
    output?: never;
    error: Error;
}

/** Generates a widescreen-orientation location reference image. */
export async function generateLocationImages({
    locations,
    generationRules,
    attempt,
    incrementAttempt,
}: GenerateLocationImagesParams,
    context: ToolContext<TextModelController>
): Promise<GenerateLocationImagesResult[]> {

    const { projectId, traceId } = context;
    console.log(`${traceId}: Execution Mode: ${EXECUTION_MODE}`);

    if (EXECUTION_MODE === "PARALLEL") {
        const contextMap = new Map<string, { location: Omit<Location, 'version'>, version: number, prompt: string; }>();
        const batchRequests: GenerateBatchImagesParameters['requests'] = [];

        for (const locationWithVersion of locations) {
            const { version, ...loc } = locationWithVersion;
            let ctx = contextMap.get(locationWithVersion.id);
            if (!ctx) {
                const prompt = buildLocationImagePrompt(loc as Location, generationRules);
                ctx = { location: loc, version, prompt };
                contextMap.set(loc.id, ctx);
            }

            batchRequests.push({
                messages: [new UserMessage({ content: ctx.prompt })],
                metadata: { custom_id: loc.id, version: ctx.version, assetKey: "location_image" },
                config: {
                    abortSignal: context.options?.signal,
                    candidateCount: 1,
                    responseModalities: [Modality.IMAGE],
                    imageConfig: {
                        ...aspectRatios.widescreen,
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
                    displayName: `generate_location_images_attempt_${attempt}`
                }
            });

            return Promise.all(results.map(async res => {
                const item = locations.find(l => l.id === res.customId);
                if (!item) {
                    console.error(`${traceId}: Unknown result ID from batch: ${res.customId}`);
                    return { success: false, id: res.customId, error: new Error("Unknown result ID") };
                }

                if (res.status !== "SUCCESS") {
                    console.error(`${traceId}: Item ${item.id} failed in batch:`, res.error);
                    return { success: false, id: item.id, error: res.error || new Error("Batch generation failed") };
                }

                try {
                    // Note: Fixed property mapping from user draft. Using item.id instead of referenceId.
                    const ctx = contextMap.get(item.id)!;
                    const imageBuffer = Buffer.from(res.imageBytes, "base64");
                    const outputPath = context.storageManager.getObjectPath({ projectId, locationId: item.id, type: "location_image", version: ctx.version });
                    const src = await context.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);

                    console.log(`${traceId}: Successfully processed batch image for ${item.id}`);
                    return { success: true, id: item.id, output: src, metadata: { prompt: ctx.prompt, model: context.provider.imageModel } };
                } catch (e) {
                    console.error(`${traceId}: Processing failure for ${item.id}:`, e);
                    return { success: false, id: item.id, error: e as Error };
                }
            }));
        } catch (e) {
            console.error(`${traceId}: Fatal batch failure:`, e);
            return locations.map(l => ({ success: false, id: l.id, error: e as Error }));
        }

    } else {
        console.log(`${traceId}: Sequential execution. Checking ${locations.length} locations...`);
        const results: GenerateLocationImagesResult[] = [];

        for (const locationWithVersion of locations) {
            const { version, ...location } = locationWithVersion;
            console.log(`${traceId}: Generating: ${location.name}`);
            try {
                const prompt = buildLocationImagePrompt(location as Location, generationRules);

                const [imageData] = extractGeneratedResponse("image", await executeWithRetry(
                    (params) => context.provider.generateImages({
                        prompt: params.prompt,
                        config: {
                            abortSignal: context.options?.signal,
                            numberOfImages: 1,
                            seed: Math.floor(Math.random() * 1000000),
                            aspectRatio: aspectRatios.widescreen.aspectRatio,
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
                        console.warn(`${traceId}: Retry triggered for ${location.name} on attempt ${attempt}. Reason: ${error.message}`);
                        incrementAttempt(error.message, "BACKOFF_RETRY");
                        return { attempt, params };
                    }
                ), "google");

                const imageBuffer = Buffer.from(imageData, "base64");
                const imagePath = context.storageManager.getObjectPath({ type: "location_image", projectId, locationId: location.id, version });
                const gcsUri = await context.storageManager.uploadBuffer(imageBuffer, imagePath, imageMimeType);

                results.push({ success: true, id: location.id, output: gcsUri, metadata: { prompt, model: context.provider.imageModel } });
                console.log(`${traceId}: Saved location image: ${context.storageManager.getPublicUrl(gcsUri)}`);
            } catch (error) {
                console.error(`${traceId}: Failed to generate image for ${location.name}:`, error);
                results.push({ success: false, id: location.id, error: error as Error });
            }
        }
        return results;
    }
}