// #shared/lm/tools/generate-frame-generation-prompts.ts
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { TextModelController } from "#shared/lm/text-model-controller.js";
import { AssetKey } from "#shared/types/assets.types.js";
import { Character, Location, Scene } from "#shared/types/workflow.types.js";
import { composeGenerationRules } from "#shared/prompts/prompt.utils.js";
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
 */
export type FramePromptRequest = {
    framePosition: "start" | "end";
    scene: Scene;
    characters: Character[];
    locations: Location[];
    previousScene?: Scene;
    generationRules?: string[];
    metadata: {
        custom_id: string; // unique identifier for batch internal processing
        assetKey: AssetKey; // ??
        version: number
    }; // version tracking number
};

export type FramePromptResultsEnvelope = {
    framePosition: "start" | "end";
    scene: Scene;
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
): Promise<FramePromptResultsEnvelope[]> {
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
                // thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
            },
        };
    });

    const batchResults = await context.provider.generateBatchContent({
        projectId: context.projectId,
        requests: batchRequests,
        config: {
            abortSignal: context.options?.signal,
        },
    });

    return batchResults.map((res, index) => {
        const originalReq = requests[index];
        let content: string | null = null;

        try {
            if (res.status === "SUCCESS" && res.text) {
                content = cleanJsonOutput(res.text);
            }
        } catch (error) {
            console.error(
                { sceneId: originalReq.scene.id, customId: originalReq.metadata.custom_id, error: error instanceof Error ? error.message : String(error) },
                `[${traceId}] ❌ Execution error in LLM output parsing.`
            );
        }

        if (!content) {
            console.warn(
                { sceneId: originalReq.scene.id },
                `[${traceId}] ⚠️ LLM returned empty/invalid response — falling back to raw instructions.`
            );
            content = batchRequests[index].messages[1].content.toString();
        }

        const finalPrompt = content + composeGenerationRules(originalReq.generationRules);

        return {
            framePosition: originalReq.framePosition,
            scene: originalReq.scene,
            prompt: finalPrompt,
            metadata: {
                custom_id: originalReq.metadata.custom_id,
                assetKey: originalReq.metadata.assetKey,
                status: res.status ?? "UNKNOWN_FAILURE",
                version: originalReq.metadata.version,
            },
        };
    });
}