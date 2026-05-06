import { z } from "zod";
import { StructuredTool, ToolParams } from "@langchain/core/tools";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

import { aspectRatios, getExecutionMode, imageMimeType } from "#shared/config.js";
import { IncrementAttemptHook } from "#shared/types/pipeline.types.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { executeWithRetry } from "#shared/utils/execute-with-retry.js";
import { Modality } from "@google/genai";
import { buildLocationImagePrompt } from "#shared/prompts/location-reference-image.prompt.js";
import { GenerateBatchImagesParameters, UserMessage } from "#shared/lm/provider.js";
import { extractGeneratedResponse } from "#shared/lm/parts-extractor.js";

const GenerateLocationImagesInput = z.object({
    locations: z.array(z.object({
        id: z.string(),
        name: z.string(),
        version: z.number(),
    })),
    generationRules: z.array(z.string()),
    attempt: z.number(),
});
export type GenerateLocationImagesInput = z.input<typeof GenerateLocationImagesInput>;

export type GenerateLocationImagesResultSuccess = { success: true; id: string; output: string; metadata: { model: string; prompt: string } };

export type GenerateLocationImagesResult =
    | GenerateLocationImagesResultSuccess
    | { success: false; id: string; error: Error };

type SerialisedToolResultItem =
    | { success: true; id: string; output: string; metadata: { model: string; prompt: string } }
    | { success: false; id: string; error: string };

function serialiseResults(raw: { success: boolean; id: string; output?: string; error?: Error; metadata?: any }[]): string {
    const items: SerialisedToolResultItem[] = raw.map((r) =>
        r.success
            ? { success: true, id: r.id, output: r.output!, metadata: r.metadata! }
            : { success: false, id: r.id, error: r.error?.message ?? "unknown" }
    );

    const succeeded = items.filter((i) => i.success).length;
    const failed = items.filter((i) => !i.success).length;

    return JSON.stringify({
        summary: { total: items.length, succeeded, failed },
        results: items,
    });
}

async function run(
    params: {
        locations: { id: string; name: string; version: number }[];
        generationRules: string[];
        attempt: number;
        incrementAttempt: IncrementAttemptHook;
    },
    context: ToolContext<TextModelController>
): Promise<GenerateLocationImagesResult[]> {
    const { projectId, traceId } = context;
    const executionMode = getExecutionMode();

    if (executionMode === "BATCH") {
        console.log(`${traceId}: Batch execution. Generating ${params.locations.length} location images`);

        const contextMap = new Map<string, { location: any; version: number; prompt: string }>();
        const batchRequests: GenerateBatchImagesParameters["requests"] = [];

        for (const loc of params.locations) {
            let ctx = contextMap.get(loc.id);
            if (!ctx) {
                const prompt = buildLocationImagePrompt(loc as any, params.generationRules);
                ctx = { location: loc, version: loc.version, prompt };
                contextMap.set(loc.id, ctx);
            }

            batchRequests.push({
                messages: [new UserMessage({ content: ctx.prompt })],
                metadata: { custom_id: loc.id, version: ctx.version, assetKey: "location_image" },
                config: {
                    abortSignal: context.options?.signal,
                    candidateCount: 1,
                    responseModalities: [Modality.IMAGE],
                    imageConfig: { ...aspectRatios.widescreen, outputMimeType: imageMimeType },
                },
            });
        }

        if (batchRequests.length === 0) return [];

        try {
            const results = await context.provider.generateBatchImages({
                projectId,
                model: context.provider.imageModel,
                requests: batchRequests,
                config: {
                    abortSignal: context.options?.signal,
                    dest: { gcsUri: context.storageManager.getObjectPath({ type: "batch-data", projectId, uniqueId: Date.now().toString() }) },
                    displayName: `generate_location_images_attempt_${params.attempt}`,
                },
            });

            return Promise.all(params.locations.map(async (loc) => {
                const res = results.find(l => l.customId === loc.id);
                if (!res) return { success: false as const, id: loc.id, error: new Error("Result missing from batch response") };

                if (res.status !== "SUCCESS") return { success: false as const, id: loc.id, error: res.error || new Error("Batch generation failed") };

                try {
                    const ctx = contextMap.get(loc.id)!;
                    const imageBuffer = Buffer.from(res.imageBytes!, "base64");
                    const outputPath = context.storageManager.getObjectPath({ projectId, locationId: loc.id, type: "location_image", version: ctx.version });
                    const src = await context.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);
                    return { success: true as const, id: loc.id, output: src, metadata: { prompt: ctx.prompt, model: context.provider.imageModel } };
                } catch (e) {
                    return { success: false as const, id: loc.id, error: e as Error };
                }
            }));
        } catch (e) {
            return params.locations.map(l => ({ success: false as const, id: l.id, error: e as Error }));
        }
    } else if (executionMode === "PARALLEL") {
        console.log(`${traceId}: Parallel execution. Generating ${params.locations.length} location images`);

        return Promise.all(params.locations.map(async (loc) => {
            try {
                const prompt = buildLocationImagePrompt(loc as any, params.generationRules);
                const [imageData] = extractGeneratedResponse("image", await executeWithRetry(
                    (p) => context.provider.generateImages({ prompt: p.prompt, config: { abortSignal: context.options?.signal, numberOfImages: 1, seed: Math.floor(Math.random() * 1000000), aspectRatio: aspectRatios.widescreen.aspectRatio, outputMimeType: imageMimeType } }),
                    { prompt },
                    { attempt: loc.version, maxRetries: context.safetyRetries + loc.version, projectId },
                    async (error, attempt, p) => { params.incrementAttempt(error.message, "BACKOFF_RETRY"); return { attempt, params: p }; },
                ), "google");

                const imageBuffer = Buffer.from(imageData, "base64");
                const imagePath = context.storageManager.getObjectPath({ type: "location_image", projectId, locationId: loc.id, version: loc.version });
                const gcsUri = await context.storageManager.uploadBuffer(imageBuffer, imagePath, imageMimeType);
                return { success: true as const, id: loc.id, output: gcsUri, metadata: { prompt, model: context.provider.imageModel } };
            } catch (error) {
                return { success: false as const, id: loc.id, error: error as Error };
            }
        }));
    } else {
        console.log(`${traceId}: Sequential execution. Generating ${params.locations.length} location images`);
        const results: GenerateLocationImagesResult[] = [];

        for (const loc of params.locations) {
            try {
                const prompt = buildLocationImagePrompt(loc as any, params.generationRules);
                const [imageData] = extractGeneratedResponse("image", await executeWithRetry(
                    (p) => context.provider.generateImages({ prompt: p.prompt, config: { abortSignal: context.options?.signal, numberOfImages: 1, seed: Math.floor(Math.random() * 1000000), aspectRatio: aspectRatios.widescreen.aspectRatio, outputMimeType: imageMimeType } }),
                    { prompt },
                    { attempt: loc.version, maxRetries: context.safetyRetries + loc.version, projectId },
                    async (error, attempt, p) => { params.incrementAttempt(error.message, "BACKOFF_RETRY"); return { attempt, params: p }; },
                ), "google");

                const imageBuffer = Buffer.from(imageData, "base64");
                const imagePath = context.storageManager.getObjectPath({ type: "location_image", projectId, locationId: loc.id, version: loc.version });
                const gcsUri = await context.storageManager.uploadBuffer(imageBuffer, imagePath, imageMimeType);
                results.push({ success: true, id: loc.id, output: gcsUri, metadata: { prompt, model: context.provider.imageModel } });
            } catch (error) {
                results.push({ success: false, id: loc.id, error: error as Error });
            }
        }
        return results;
    }
}

export interface GenerateLocationImagesToolDeps {
    context: ToolContext<TextModelController> & { incrementAttempt: IncrementAttemptHook };
}

class GenerateLocationImagesTool extends StructuredTool<typeof GenerateLocationImagesInput> {
    name = "generate_location_images";
    description = "Generates location reference images.";
    schema = GenerateLocationImagesInput;

    private readonly context: GenerateLocationImagesToolDeps["context"];
    private readonly incrementAttempt: IncrementAttemptHook;

    constructor(deps: GenerateLocationImagesToolDeps, params?: ToolParams) {
        super(params);
        this.context = deps.context;
        this.incrementAttempt = deps.context.incrementAttempt;
    }

    async _call(
        input: GenerateLocationImagesInput,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {
        const { traceId } = this.context;
        console.log(`${traceId}: GenerateLocationImagesTool invoked. count: ${input.locations.length}`);

        const generated = await run({
            locations: input.locations,
            generationRules: input.generationRules,
            attempt: input.attempt,
            incrementAttempt: this.incrementAttempt,
        }, this.context);

        const output = serialiseResults(generated);
        console.log(`${traceId}: GenerateLocationImagesTool complete.`);
        return output;
    }

    async run(input: GenerateLocationImagesInput) {
        try {
            return await run({
                locations: input.locations,
                generationRules: input.generationRules,
                attempt: input.attempt,
                incrementAttempt: this.incrementAttempt,
            }, this.context);
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
}

export function createGenerateLocationImagesTool(
    deps: GenerateLocationImagesToolDeps,
    params?: ToolParams
): GenerateLocationImagesTool {
    return new GenerateLocationImagesTool(deps, params);
}