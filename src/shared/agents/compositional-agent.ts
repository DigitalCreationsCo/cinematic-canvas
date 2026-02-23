import {
  InitialStoryboardContext,
  SceneBatch,
  StoryboardAttributes,
  SceneAttributes,
  isValidDuration,
  AudioAnalysisAttributes
} from "../types/index.js";
import { cleanJsonOutput, deleteBogusUrlsStoryboard, getJSONSchema, roundToValidDuration } from "../utils/utils.js";
import { GCPStorageManager } from "../services/storage-manager.js";
import { composeFrameGenerationPromptMeta } from "../prompts/frame-generation-instructions.js";
import { buildDirectorVisionPrompt } from "../prompts/must-review/role-director.js";
import { retryLlmCall, RetryConfig } from "../utils/lm-retry.js";
import { TextModelController } from "../lm/text-model-controller.js";
import { ThinkingLevel } from "@google/genai";
import { AssetVersionManager } from "../services/asset-version-manager.js";
import { SaveAssetsCallback } from "../types/pipeline.types.js";
import { GenerativeResultEnhanceStoryboard, GenerativeResultEnvelope, GenerativeResultExpandCreativePrompt, GenerativeResultGenerateStoryboard, JobExpandCreativePrompt, JobGenerateStoryboard } from "../types/job.types.js";
import { buildPromptExpansionSystemInstruction, buildPromptExpansionUserInstruction } from "../prompts/prompt-expansion-instruction.js";
import { composeStoryboardEnrichmentPrompt } from "../prompts/storyboard-enrichment-instructions.js";



// ============================================================================
// COMPOSITIONAL AGENT
// ============================================================================

export class CompositionalAgent {
  private lm: TextModelController;
  private storageManager: GCPStorageManager;
  private assetManager: AssetVersionManager;
  private options?: { signal?: AbortSignal; };

  constructor(
    lm: TextModelController,
    storageManager: GCPStorageManager,
    assetManager: AssetVersionManager,
    options?: { signal?: AbortSignal; }
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
        contents: [
          { role: "user", parts: [ { text: systemPrompt } ] },
          { role: "user", parts: [ { text: userPrompt } ] },
        ],
        config: {
          abortSignal: this.options?.signal,
          temperature: 0.9,
          // thinkingConfig: {
          //   thinkingLevel: ThinkingLevel.HIGH
          // }
        }
      };

      const response = await this.lm.generateContent(params);

      const expandedPrompt = response.text;

      if (!expandedPrompt || expandedPrompt.trim().length === 0) {
        throw new Error("No content generated from LLM for prompt expansion");
      }

      return expandedPrompt as string;
    };

    const expandedPrompt = await retryLlmCall(lmCall, undefined, retryConfig);
    const durationMs = Date.now() - start;
    console.log({ title, projectId: retryConfig.projectId, durationMs, model: this.lm.textModel }, `Creative prompt expanded.`);

    return { data: { expandedPrompt }, metadata: { model: this.lm.textModel, attempts: 1, acceptedAttempt: 1 } };
  }

  /**
   * Generates a storyboard from creative prompt without audio timing constraints.
   * Used when no audio file is provided.
   */
  async generateStoryboardExclusivelyFromPrompt(
    title: string, enhancedPrompt: string, retryConfig: RetryConfig
  ): Promise<GenerativeResultGenerateStoryboard> {
    console.log({ title, projectId: retryConfig.projectId }, `Generating storyboard from prompt (no audio)...`);
    const start = Date.now();

    const prompt = buildDirectorVisionPrompt(title, enhancedPrompt, JSON.stringify(getJSONSchema(StoryboardAttributes)));

    const _generateStoryboard = async (params: { prompt: string; }) => {
      const response = await this.lm.generateContent({
        contents: [
          { role: 'user', parts: [ { text: params.prompt } ] },
        ],
        config: {
          abortSignal: this.options?.signal,
          responseJsonSchema: getJSONSchema(StoryboardAttributes),
          temperature: 0.8,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH
          }
        }
      });

      const content = response.text;
      if (!content) throw new Error("No content generated from LLM");

      const cleanedContent = cleanJsonOutput(content);
      const storyboard: StoryboardAttributes = JSON.parse(cleanedContent);
      storyboard.scenes = storyboard.scenes.map((s, i) => ({ ...s, sceneIndex: i }));
      for (const scene of storyboard.scenes) {
        if (!isValidDuration(scene.duration)) {
          console.debug('Rounding scene duration from ', scene.duration, ' to ', roundToValidDuration(scene.duration));
          scene.duration = roundToValidDuration(scene.duration);
        }
      }

      return deleteBogusUrlsStoryboard(storyboard);
    };

    const storyboard = await retryLlmCall(_generateStoryboard, { prompt }, { initialDelay: 1000, ...retryConfig, maxRetries: 3 });

    const durationMs = Date.now() - start;
    console.log({
      title,
      projectId: retryConfig.projectId,
      durationMs,
      model: this.lm.textModel,
      sceneCount: storyboard.scenes.length
    }, `Storyboard generated successfully (no audio).`);

    return { data: { storyboardAttributes: storyboard }, metadata: { model: this.lm.textModel, attempts: 1, acceptedAttempt: 1 } };
  }

  async generateStoryboardFromAudioAnalysis(
    title: string,
    enhancedPrompt: string,
    scenes: (StoryboardAttributes[ 'scenes' ] | AudioAnalysisAttributes[ 'segments' ]),
    retryConfig: RetryConfig,
  ): Promise<GenerativeResultEnhanceStoryboard> {
    console.log({ title, projectId: retryConfig.projectId, sceneCount: scenes.length }, `Generating full storyboard (two-pass)...`);
    const start = Date.now();
    
    const { data: initialContext } = await this._generateInitialStoryboardContext(title, enhancedPrompt, scenes, retryConfig);
    
    console.log("Enriching storyboard with a two-pass approach");
    console.log("Initial Context:", JSON.stringify(initialContext).slice(0, 50));

    const BATCH_SIZE = 10;
    let enrichedScenes: SceneAttributes[] = [];

    for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
      const chunkScenes = scenes.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(scenes.length / BATCH_SIZE);
      console.log({ batchNum, totalBatches, numScenes: chunkScenes.length }, `Processing scene batch ${batchNum}/${totalBatches}`);

      const systemPrompt = composeStoryboardEnrichmentPrompt(
        enhancedPrompt,
        initialContext.characters,
        initialContext.locations,
        JSON.stringify(getJSONSchema(SceneBatch))
      );

      let context = `Batch (${batchNum}/${totalBatches}):\n`;
      if (enrichedScenes.length > 0) {
        context += `Exposition: ${JSON.stringify(scenes[ 0 ])}\n\n`;
        const lastScene = enrichedScenes[ enrichedScenes.length - 1 ];
        context += `Recent Scene:\n${JSON.stringify(lastScene)}\n\n`;
      }
      context += `Scenes to Enrich:\n${JSON.stringify(chunkScenes)}`;

      const lmCall = async () => {
        const response = await this.lm.generateContent({
          contents: [
            { role: 'user', parts: [ { text: systemPrompt } ] },
            { role: 'user', parts: [ { text: context } ] }
          ],
          config: {
            abortSignal: this.options?.signal,
            responseJsonSchema: getJSONSchema(SceneBatch),
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH
            }
          }
        });
        const content = response.text;
        if (!content) throw new Error("No content generated from LLM");

        const cleanedContent = cleanJsonOutput(content);
        return JSON.parse(cleanedContent) as SceneBatch;
      };

      const batchResult = await retryLlmCall(lmCall, undefined, retryConfig);
      enrichedScenes.push(...batchResult.scenes);
    }

    const updatedStoryboard: StoryboardAttributes = {
      ...initialContext,
      scenes: enrichedScenes.map((s, i) => ({ ...s, sceneIndex: i })),
      metadata: {
        ...initialContext.metadata,
        totalScenes: enrichedScenes.length,
        duration: enrichedScenes.length > 0 ? enrichedScenes[ enrichedScenes.length - 1 ].endTime : 0,
        enhancedPrompt: enhancedPrompt,
      }
    };
    deleteBogusUrlsStoryboard(updatedStoryboard);
    this.validateTimingPreservation(scenes, updatedStoryboard.scenes);

    const durationMs = Date.now() - start;
    console.log({
      title,
      projectId: retryConfig.projectId,
      durationMs,
      model: this.lm.textModel,
      sceneCount: updatedStoryboard.scenes.length
    }, `Full storyboard enriched successfully.`);

    return { data: { storyboardAttributes: updatedStoryboard }, metadata: { model: this.lm.textModel, attempts: 1, acceptedAttempt: 1 } };
  }

  private async _generateInitialStoryboardContext(
    title: string, enhancedPrompt: string, scenes: (SceneAttributes[] | AudioAnalysisAttributes[ 'segments' ]), retryConfig: RetryConfig
  ): Promise<GenerativeResultEnvelope<InitialStoryboardContext>> {
    console.log("   ... Generating initial context (metadata, characters, locations)...");

    const totalDuration = scenes.length > 0 ? scenes[ scenes.length - 1 ].endTime : 0;

    const systemPrompt = buildDirectorVisionPrompt(title, enhancedPrompt, JSON.stringify(getJSONSchema(InitialStoryboardContext)), scenes, totalDuration);

    const context = `
      Generate the initial storyboard context including:

      ### Metadata
      ${JSON.stringify(getJSONSchema(InitialStoryboardContext.shape.metadata))}

      ### Characters
      ${JSON.stringify(getJSONSchema(InitialStoryboardContext.shape.characters))}

      ### Locations
      ${JSON.stringify(getJSONSchema(InitialStoryboardContext.shape.locations))}

      The scene-by-scene breakdown will be handled in a second pass.
    `;

    const lmCall = async () => {
      const response = await this.lm.generateContent({
        contents: [
          { role: 'user', parts: [ { text: systemPrompt } ] },
          { role: 'user', parts: [ { text: context } ] }
        ],
        config: {
          abortSignal: this.options?.signal,
          responseJsonSchema: getJSONSchema(InitialStoryboardContext),
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH
          }
        }
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

    const intialContext = await retryLlmCall(lmCall, undefined, retryConfig);
    return { data: intialContext, metadata: { model: this.lm.textModel, attempts: 1, acceptedAttempt: 1 } };
  }

  private validateTimingPreservation(originalScenes: AudioAnalysisAttributes[ 'segments' ], enrichedScenes: SceneAttributes[]): void {
    if (originalScenes.length !== enrichedScenes.length) {
      console.warn(`⚠️ Scene count mismatch: original=${originalScenes.length}, enriched=${enrichedScenes.length}`);
    }

    for (let i = 0; i < Math.min(originalScenes.length, enrichedScenes.length); i++) {
      const orig = originalScenes[ i ];
      const enrich = enrichedScenes[ i ];

      if (orig.startTime !== enrich.startTime || orig.endTime !== enrich.endTime) {
        console.warn(`⚠️ Timing mismatch in scene ${i + 1}: original=[${orig.startTime}-${orig.endTime}], enriched=[${enrich.startTime}-${enrich.endTime}]`);
      }

      if (orig.duration !== enrich.duration) {
        console.warn(`⚠️ Duration mismatch in scene ${i + 1}: original=${orig.duration}s, enriched=${enrich.duration}s`);
      }
    }
  }
}
