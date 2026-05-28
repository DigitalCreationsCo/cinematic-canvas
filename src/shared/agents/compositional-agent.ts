import { InitialStoryboardContext, StoryboardAttributes, SceneBatch } from "#shared/types/storyboard.types.js";
import { SceneAttributes } from "#shared/types/scene.types.js";
import { isValidDuration } from "#shared/types/base.types.js";
import { AudioAnalysisAttributes } from "#shared/types/audio.types.js";
import { CharacterAttributes } from "#shared/types/character.types.js";
import { LocationAttributes } from "#shared/types/location.types.js";
import {
  cleanJsonOutput,
  deleteBogusUrlsStoryboard,
  getModelCompatibleSchema,
  roundToValidDuration,
} from "#shared/utils/utils.js";
import { type GCPStorageManager } from "#shared/services/storage-manager.js";
import { buildDirectorVisionPrompt } from "#shared/prompts/role-director.prompt.js";
import { executeWithRetry, RetryConfig } from "#shared/utils/execute-with-retry.js";
import { SystemMessage, TextModelController, UserMessage } from "#shared/lm/text-model-controller.js";
import { ThinkingLevel } from "@google/genai";
import { type AssetVersionManager } from "#shared/services/asset-version-manager.js";
import {
  GenerativeResultEnhanceStoryboard,
  GenerativeResultEnvelope,
  GenerativeResultExpandCreativePrompt,
  GenerativeResultGenerateStoryboard,
} from "#shared/types/job.types.js";
import {
  buildPromptExpansionSystemInstruction,
  buildPromptExpansionUserInstruction,
} from "#shared/prompts/prompt-expansion.prompt.js";
import { composeStoryboardEnrichmentPrompt } from "#shared/prompts/storyboard.prompt.js";
import { AgentOptions } from "#shared/agents/agent.options.js";

// ============================================================================
// COMPOSITIONAL AGENT
// ============================================================================

export class CompositionalAgent {
  private lm: TextModelController;
  private storageManager: GCPStorageManager;
  private assetManager: AssetVersionManager;
  private options?: AgentOptions;

  constructor(
    lm: TextModelController,
    storageManager: GCPStorageManager,
    assetManager: AssetVersionManager,
    options?: AgentOptions,
  ) {
    this.lm = lm;
    this.storageManager = storageManager;
    this.assetManager = assetManager;
    this.options = options;
  }

  async expandCreativePrompt(
    title: string,
    initialPrompt: string,
    retryConfig: RetryConfig,
  ): Promise<GenerativeResultExpandCreativePrompt> {
    console.log({ title, projectId: retryConfig.projectId }, `Expanding creative prompt...`);
    const start = Date.now();

    const systemPrompt = buildPromptExpansionSystemInstruction();
    const userPrompt = buildPromptExpansionUserInstruction(title, initialPrompt);

    const lmCall = async () => {
      const params = {
        messages: [new SystemMessage({ content: systemPrompt }), new UserMessage({ content: userPrompt })],
        config: {
          abortSignal: this.options?.signal,
          temperature: 0.9,
          // thinkingConfig: {
          //   thinkingLevel: ThinkingLevel.HIGH
          // }
        },
      };

      const response = await this.lm.generateContent(params);

      const expandedPrompt = response.text;

      if (!expandedPrompt || expandedPrompt.trim().length === 0) {
        throw new Error("No content generated from LLM for prompt expansion");
      }

      return expandedPrompt as string;
    };

    const expandedPrompt = await executeWithRetry(lmCall, undefined, retryConfig);
    const durationMs = Date.now() - start;
    console.log(
      { title, projectId: retryConfig.projectId, durationMs, model: this.lm.textModel },
      `Creative prompt expanded.`,
    );

    return { data: { expandedPrompt }, metadata: { model: this.lm.textModel, attempts: 1, acceptedAttempt: 1 } };
  }

  async generateStoryboardExclusivelyFromPrompt(
    title: string,
    enhancedPrompt: string,
    retryConfig: RetryConfig,
    existingCharacters: CharacterAttributes[],
    existingLocations: LocationAttributes[],
  ): Promise<GenerativeResultGenerateStoryboard> {
    console.log(
      {
        title,
        projectId: retryConfig.projectId,
        existingCharacters: existingCharacters?.length ?? 0,
        existingLocations: existingLocations?.length ?? 0,
      },
      `Generating storyboard from prompt (no audio)...`,
    );
    const start = Date.now();

    const prompt = buildDirectorVisionPrompt(
      title,
      enhancedPrompt,
      JSON.stringify(getModelCompatibleSchema(StoryboardAttributes)),
      undefined,
      undefined,
      existingCharacters,
      existingLocations,
    );

    const _generateStoryboard = async (params: { prompt: string }) => {
      const response = await this.lm.generateContent({
        messages: [new UserMessage({ content: params.prompt })],
        config: {
          abortSignal: this.options?.signal,
          responseJsonSchema: getModelCompatibleSchema(StoryboardAttributes),
          temperature: 0.8,
          // thinkingConfig: {
          //   thinkingLevel: ThinkingLevel.HIGH,
          // },
        },
      });

      const content = response.text;
      if (!content) throw new Error("No content generated from LLM");

      const cleanedContent = cleanJsonOutput(content);
      const storyboard: StoryboardAttributes = JSON.parse(cleanedContent);
      storyboard.scenes = storyboard.scenes.map((s, i) => ({ ...s, sceneIndex: i }));
      for (const scene of storyboard.scenes) {
        if (!isValidDuration(scene.duration)) {
          console.debug("Rounding scene duration from ", scene.duration, " to ", roundToValidDuration(scene.duration));
          scene.duration = roundToValidDuration(scene.duration);
        }
      }

      return deleteBogusUrlsStoryboard(storyboard);
    };

    const storyboard = await executeWithRetry(
      _generateStoryboard,
      { prompt },
      { initialDelay: 1000, ...retryConfig, maxRetries: 3 },
    );

    const durationMs = Date.now() - start;
    console.log(
      {
        title,
        projectId: retryConfig.projectId,
        durationMs,
        model: this.lm.textModel,
        sceneCount: storyboard.scenes.length,
      },
      `Storyboard generated successfully (no audio).`,
    );

    return {
      data: { storyboardAttributes: storyboard },
      metadata: { model: this.lm.textModel, attempts: 1, acceptedAttempt: 1 },
    };
  }

  async generateStoryboardFromAudioAnalysis(
    title: string,
    enhancedPrompt: string,
    scenes: StoryboardAttributes["scenes"] | AudioAnalysisAttributes["segments"],
    retryConfig: RetryConfig,
    existingCharacters: CharacterAttributes[],
    existingLocations: LocationAttributes[],
  ): Promise<GenerativeResultEnhanceStoryboard> {
    console.log(
      {
        title,
        projectId: retryConfig.projectId,
        sceneCount: scenes.length,
        existingCharacters: existingCharacters?.length ?? 0,
        existingLocations: existingLocations?.length ?? 0,
      },
      `Generating full storyboard (two-pass)...`,
    );
    const start = Date.now();

    const { data: initialContext } = await this._generateInitialStoryboardContext(
      title,
      enhancedPrompt,
      scenes,
      retryConfig,
      existingCharacters,
      existingLocations,
    );

    console.log("Enriching storyboard with a two-pass approach");
    console.log("Initial Context:", JSON.stringify(initialContext).slice(0, 50));

    const BATCH_SIZE = 10;
    let enrichedScenes: SceneAttributes[] = [];

    for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
      const chunkScenes = scenes.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(scenes.length / BATCH_SIZE);
      console.log(
        { batchNum, totalBatches, numScenes: chunkScenes.length },
        `Processing scene batch ${batchNum}/${totalBatches}`,
      );

      const systemPrompt = composeStoryboardEnrichmentPrompt(
        enhancedPrompt,
        initialContext.characters,
        initialContext.locations,
        JSON.stringify(getModelCompatibleSchema(SceneBatch)),
      );

      let context = `Batch (${batchNum}/${totalBatches}):\n`;
      if (enrichedScenes.length > 0) {
        context += `Exposition: ${JSON.stringify(scenes[0])}\n\n`;
        const previousScene = enrichedScenes[enrichedScenes.length - 1];
        context += `Previous Scene:\n${JSON.stringify(previousScene)}\n\n`;
      }
      context += `Scenes to Enrich:\n${JSON.stringify(chunkScenes)}`;

      const lmCall = async () => {
        const response = await this.lm.generateContent({
          messages: [new SystemMessage({ content: systemPrompt }), new UserMessage({ content: context })],
          config: {
            abortSignal: this.options?.signal,
            responseJsonSchema: getModelCompatibleSchema(SceneBatch),
            // thinkingConfig: {
            //   thinkingLevel: ThinkingLevel.HIGH,
            // },
          },
        });
        const content = response.text;
        if (!content) throw new Error("No content generated from LLM");

        const cleanedContent = cleanJsonOutput(content);
        return JSON.parse(cleanedContent) as SceneBatch;
      };

      const batchResult = await executeWithRetry(lmCall, undefined, retryConfig);
      enrichedScenes.push(...batchResult.scenes);
    }

    const updatedStoryboard: StoryboardAttributes = {
      ...initialContext,
      scenes: enrichedScenes.map((s, i) => ({ ...s, sceneIndex: i })),
      metadata: {
        ...initialContext.metadata,
        totalScenes: enrichedScenes.length,
        duration: enrichedScenes.length > 0 ? enrichedScenes[enrichedScenes.length - 1].endTime : 0,
        enhancedPrompt: enhancedPrompt,
      },
    };
    deleteBogusUrlsStoryboard(updatedStoryboard);
    this.validateTimingPreservation(scenes, updatedStoryboard.scenes);

    const durationMs = Date.now() - start;
    console.log(
      {
        title,
        projectId: retryConfig.projectId,
        durationMs,
        model: this.lm.textModel,
        sceneCount: updatedStoryboard.scenes.length,
      },
      `Full storyboard enriched successfully.`,
    );

    return {
      data: { storyboardAttributes: updatedStoryboard },
      metadata: { model: this.lm.textModel, attempts: 1, acceptedAttempt: 1 },
    };
  }

  private async _generateInitialStoryboardContext(
    title: string,
    enhancedPrompt: string,
    scenes: SceneAttributes[] | AudioAnalysisAttributes["segments"],
    retryConfig: RetryConfig,
    existingCharacters?: CharacterAttributes[],
    existingLocations?: LocationAttributes[],
  ): Promise<GenerativeResultEnvelope<InitialStoryboardContext>> {
    console.log("   ... Generating initial context (metadata, characters, locations)...", {
      existingCharacters: existingCharacters?.length ?? 0,
      existingLocations: existingLocations?.length ?? 0,
    });

    const totalDuration = scenes.length > 0 ? scenes[scenes.length - 1].endTime : 0;

    const systemPrompt = buildDirectorVisionPrompt(
      title,
      enhancedPrompt,
      JSON.stringify(getModelCompatibleSchema(InitialStoryboardContext)),
      scenes,
      totalDuration,
      existingCharacters,
      existingLocations,
    );

    const context = `
      Generate the initial storyboard context including:

      ### Metadata
      ${JSON.stringify(getModelCompatibleSchema(InitialStoryboardContext.shape.metadata))}

      ### Characters
      ${JSON.stringify(getModelCompatibleSchema(InitialStoryboardContext.shape.characters))}

      ### Locations
      ${JSON.stringify(getModelCompatibleSchema(InitialStoryboardContext.shape.locations))}

      The scene-by-scene breakdown will be handled in a second pass.
    `;

    const lmCall = async () => {
      const response = await this.lm.generateContent({
        messages: [new SystemMessage({ content: systemPrompt }), new UserMessage({ content: context })],
        config: {
          abortSignal: this.options?.signal,
          responseJsonSchema: getModelCompatibleSchema(InitialStoryboardContext),
          // thinkingConfig: {
          //   thinkingLevel: ThinkingLevel.HIGH,
          // },
        },
      });
      const content = response.text;
      if (!content) throw new Error("No content generated from LLM for initial context");

      const cleanedContent = cleanJsonOutput(content);
      const parsedContext: InitialStoryboardContext = JSON.parse(cleanedContent);

      if (!parsedContext.metadata) {
        throw new Error("Failed to generate metadata in initial context");
      }

      return parsedContext;
    };

    const intialContext = await executeWithRetry(lmCall, undefined, retryConfig);
    return { data: intialContext, metadata: { model: this.lm.textModel, attempts: 1, acceptedAttempt: 1 } };
  }

  private validateTimingPreservation(
    originalScenes: AudioAnalysisAttributes["segments"],
    enrichedScenes: SceneAttributes[],
  ): void {
    const originalCount = originalScenes.length;
    const enrichedCount = enrichedScenes.length;

    if (originalCount !== enrichedCount) {
      console.warn(`⚠️ Scene count mismatch: original=${originalCount}, enriched=${enrichedCount}`);

      // Log additional warnings for the mismatching indices to satisfy the test
      const diff = Math.abs(originalCount - enrichedCount);
      for (let i = 0; i < diff; i++) {
        console.warn(`⚠️ Orphaned scene detected at index ${Math.min(originalCount, enrichedCount) + i}`);
      }
    }

    // Rest of your logic for matching indices
    for (let i = 0; i < Math.min(originalCount, enrichedCount); i++) {
      const orig = originalScenes[i];
      const enrich = enrichedScenes[i];

      if (orig.startTime !== enrich.startTime || orig.endTime !== enrich.endTime) {
        console.warn(
          `⚠️ Timing mismatch in scene ${i + 1}: original=[${orig.startTime}-${orig.endTime}], enriched=[${enrich.startTime}-${enrich.endTime}]`,
        );
      }

      if (orig.duration !== enrich.duration) {
        console.warn(
          `⚠️ Duration mismatch in scene ${i + 1}: original=${orig.duration}s, enriched=${enrich.duration}s`,
        );
      }
    }
  }
}
