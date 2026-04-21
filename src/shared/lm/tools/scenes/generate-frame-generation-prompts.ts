// #shared/lm/tools/generate-frame-generation-prompts.ts
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { AssetKey, Character, Location, Scene } from "#shared/types/index.js";
import { composeGenerationRules } from "#shared/prompts/prompt-utils.js";
import { cleanJsonOutput } from "#shared/utils/utils.js";
import { SystemMessage, UserMessage } from "#shared/lm/provider.js";
import { composeFrameGenerationPromptMeta } from "#shared/prompts/scene-frame.prompt.js";
import { continuitySystemPrompt } from "#shared/prompts/must-review/continuity.prompt.js";
import { ThinkingLevel } from "#shared/lm/google/provider.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input descriptor for a single frame prompt request.
 * Previously defined on FrameCompositionAgent — now lives alongside this tool.
 */
export type FramePromptRequest = {
    framePosition: "start" | "end";
    scene: Scene;
    characters: Character[];
    locations: Location[];
    previousScene?: Scene;
    generationRules?: string[];
    metadata: { custom_id: string; assetKey: AssetKey; version: number };
};

export type FramePromptResult = {
    prompt: string;
    metadata: {
        custom_id: string;
        assetKey: AssetKey;
        status: string;
        version: number;
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates enhanced image-generation prompts for a batch of scene frame requests
 * using the text (LLM) provider. Uses ThinkingLevel.HIGH for maximum quality.
 *
 * ToolContext.provider must be a TextModelController (multimodal LM, not image model).
 *
 * Falls back to the raw instruction string if the LLM returns an empty response.
 * Generation rules are appended to every prompt after LLM post-processing.
 */
export async function generateFrameGenerationPrompts(
    requests: FramePromptRequest[],
    context: ToolContext<TextModelController>
): Promise<FramePromptResult[]> {
    if (requests.length === 0) return [];

    const { traceId } = context;
    console.log(`[${traceId}] generateFrameGenerationPrompts: ${requests.length} request(s)`);

    const batchRequests = requests.map((req) => {
        const systemPrompt = continuitySystemPrompt();
        const instructions = composeFrameGenerationPromptMeta(
            req.scene,
            req.framePosition,
            req.characters,
            req.locations,
            req.previousScene,
            req.generationRules
        );

        return {
            messages: [
                new SystemMessage({ content: systemPrompt }),
                new UserMessage({ content: instructions }),
            ],
            metadata: { ...req.metadata },
            config: {
                abortSignal: context.options?.signal,
                thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
            },
        };
    });

    const batchResults = await context.provider.generateBatchContent({
        projectId: context.projectId,
        model: context.provider.textModel,
        requests: batchRequests,
        config: {
            abortSignal: context.options?.signal,
        },
    });

    return batchResults.map((res, index) => {
        const originalReq = requests[index];
        let content = res.status === "SUCCESS" ? cleanJsonOutput(res.text!) : null;

        if (!content) {
            console.warn(
                { sceneId: originalReq.scene.id },
                `[${traceId}] ⚠️ LLM returned empty response — falling back to raw instructions`
            );
            content = batchRequests[index].messages[1].content.toString();
        }

        // Append generation rules after LLM post-processing to avoid rules
        // being transformed or stripped by the model.
        const finalPrompt = content + composeGenerationRules(originalReq.generationRules);

        return {
            prompt: finalPrompt,
            metadata: {
                assetKey: originalReq.metadata.assetKey,
                version: res.version,
                custom_id: res.customId,
                status: res.status,
            },
        };
    });
}