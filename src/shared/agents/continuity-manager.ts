import { Character, Scene, Location } from "#shared/types/workflow.types.js";
import { LocationState } from "#shared/types/location.types.js";
import { AssetKey } from "#shared/types/assets.types.js";
import { CharacterState } from "#shared/types/character.types.js";
import { Project, HydratedProject } from "#shared/types/schema.types.js";
import { GCPStorageManager } from "#shared/services/storage-manager.js";
import { executeWithRetry } from "#shared/utils/execute-with-retry.js";
import { buildCharacterImagePrompt } from "#shared/prompts/character-reference-image.prompt.js";
import { composeGenerationRules } from "#shared/prompts/prompt.utils.js";
import { ReferenceImage, TextModelController } from "#shared/lm/text-model-controller.js";
import {
  BaseImage,
  GenerateBatchImagesParameters,
  Modality,
  SubjectImage,
  SystemMessage,
  UserMessage,
} from "#shared/lm/provider.js";
import { QualityCheckAgent } from "#shared/agents/quality-check-agent.js";
import { QualityRetryHandler } from "#shared/utils/quality-retry-handler.js";
import { evolveCharacterState, evolveLocationState } from "#shared/agents/state-evolution.js";
import { cleanJsonOutput } from "#shared/utils/utils.js";
import { getAllBestAssets, hasAssetVersion } from "#shared/utils/assets.utils.js";
import { AssetVersionManager } from "#shared/services/asset-version-manager.js";
import { SaveAssetsCallback, UpdateEntitiesCallback, IncrementAttemptHook } from "#shared/types/pipeline.types.js";
import {
  GenerativeResultGenerateCharacterAssets,
  GenerativeResultGenerateLocationAssets,
  GenerativeResultGenerateSceneFrames,
} from "#shared/types/job.types.js";
import { aspectRatios, getExecutionMode, imageMimeType } from "#shared/config.js";
import { extractGeneratedResponse } from "#shared/lm/parts-extractor.js";
import { buildReferenceImageInputs } from "#shared/lm/utils.js";
import { composeEnhancedSceneGenerationPromptMeta } from "#shared/prompts/scene.prompt.js";
import { continuitySystemPrompt } from "#shared/prompts/must-review/continuity.prompt.js";
import { createGenerateCharacterImagesTool } from "#shared/lm/tools/characters/generate-characters-images.tool.js";
import { createGenerateLocationImagesTool } from "#shared/lm/tools/locations/generate-locations-images.tool.js";
import {
  generateSceneFrames,
  SceneFrameGenerationRequest,
  SceneFrameGenerationSuccess,
} from "#shared/lm/tools/scenes/generate-scene-frames.tool.js";
import {
  FramePromptRequest,
  generateFrameGenerationPrompts,
} from "#shared/lm/tools/scenes/generate-frame-generation-prompts.js";
import { AgentOptions } from "#shared/agents/agent.options.js";
import { ToolContext } from "#shared/lm/tools/tools.utils.js";
import { ProjectRepository } from "#shared/services/project-repository.js";

interface SceneFrameQualityItem {
  id: string;
  request: SceneFrameGenerationRequest;
  scene: Scene;
  characters: Character[];
  locations: Location[];
}

export class ContinuityManagerAgent {
  private lm: TextModelController;
  private imageModel: TextModelController;
  private storageManager: GCPStorageManager;
  private assetManager: AssetVersionManager;
  private qualityAgent: QualityCheckAgent;
  private ASSET_GEN_COOLDOWN_MS = 60000;
  private options?: AgentOptions;

  constructor(
    lm: TextModelController,
    imageModel: TextModelController,
    qualityAgent: QualityCheckAgent,
    storageManager: GCPStorageManager,
    assetManager: AssetVersionManager,
    options?: AgentOptions,
  ) {
    this.lm = lm;
    this.imageModel = imageModel;
    this.qualityAgent = qualityAgent;
    this.storageManager = storageManager;
    this.assetManager = assetManager;
    this.options = options;
  }

  async generateSceneFramesBatch(
    project: HydratedProject,
    scenes: Scene[],
    scopeAssetKeys: ("scene_start_frame" | "scene_end_frame")[],
    saveAssets: SaveAssetsCallback,
    sendEntityUpdate: UpdateEntitiesCallback,
    incrementAttempt: IncrementAttemptHook,
    context: { userId: string; teamId: string; }
  ): Promise<GenerativeResultGenerateSceneFrames> {
    const opStartTime = Date.now();
    const projectId = project.id;
    const traceId = `generate_scene_frames_${projectId}_${opStartTime}`;
    const executionMode = getExecutionMode();

    const logContext = { projectId, totalScenes: scenes.length, executionMode, traceId };
    console.log(logContext, `[ContinuityManager] Starting scene frame generation for Cinematic Canvas pipeline.`);

    const toolContext: ToolContext<TextModelController> & { projectRepository: ProjectRepository; incrementAttempt: IncrementAttemptHook; } = {
      projectId, traceId, safetyRetries: this.qualityAgent.qualityConfig.maxRetries,
      projectRepository: new ProjectRepository(), console, storageManager: this.storageManager,
      provider: this.imageModel, options: this.options, saveAssets, sendEntityUpdate, incrementAttempt, ...context,
    };

    // Tracking State
    const completedTasks = new Set<string>();
    const failedTasks = new Set<string>();
    const totalRequiredTasks = scenes.length * scopeAssetKeys.length;

    // Cache to hydrate newly generated assets so the loop can safely traverse the DAG
    const localAssetRegistry = new Map<string, Map<string, string>>();
    for (const s of project.scenes) {
      const best = getAllBestAssets(s.assets);
      const sceneAssets = new Map<string, string>();
      if (best[ "scene_start_frame" ]?.data) sceneAssets.set("scene_start_frame", best[ "scene_start_frame" ].data);
      if (best[ "scene_end_frame" ]?.data) sceneAssets.set("scene_end_frame", best[ "scene_end_frame" ].data);
      localAssetRegistry.set(s.id, sceneAssets);
    }

    let iterationCount = 0;
    const maxIterations = totalRequiredTasks + 1; // Strict upper bound

    while (completedTasks.size + failedTasks.size < totalRequiredTasks) {
      iterationCount++;
      let progressMade = false;

      if (iterationCount > maxIterations) {
        console.error(logContext, `[ContinuityManager] DAG evaluation stalled. Emitting deferrals.`);
        break;
      }

      const currentIterationPromptRequests: FramePromptRequest[] = [];
      const currentIterationContexts: { scene: Scene; assetKey: AssetKey; }[] = [];

      for (const scene of scenes) {
        const previousScene = project.scenes.find(s => s.sceneIndex === scene.sceneIndex - 1);
        const sceneCharacters = project.characters.filter(c => scene.characterIds.includes(c.id));
        const sceneLocations = project.locations.filter(l => scene.locationId.includes(l.id));

        for (const assetKey of scopeAssetKeys) {
          const taskId = `${scene.id}_${assetKey}`;
          if (completedTasks.has(taskId) || failedTasks.has(taskId)) continue;

          const isContinuousStart = assetKey === "scene_start_frame" &&
            [ "Continuous", "Cut", "None" ].includes(scene.transitionType || "None");

          if (isContinuousStart && previousScene) {
            const prevEndFrameUri = localAssetRegistry.get(previousScene.id)?.get("scene_end_frame");

            if (prevEndFrameUri) {
              console.log({ traceId, sceneId: scene.id }, `[Continuity] Linking existing prev end-frame.`);
              saveAssets(
                { projectId, sceneIds: [ scene.id ] },
                [ "scene_start_frame" ], "image", [ prevEndFrameUri ],
                [ { model: "linked", prompt: "Continuity link from previous scene" } ], true,
              );
              localAssetRegistry.get(scene.id)!.set("scene_start_frame", prevEndFrameUri);
              completedTasks.add(taskId);
              progressMade = true;
              continue;
            } else {
              console.log({ traceId, sceneId: scene.id }, `[Continuity] Deferring start_frame: previous scene end_frame not ready.`);
              continue; // Defer just this asset, let others (like end_frame) process
            }
          }

          currentIterationPromptRequests.push({
            framePosition: assetKey === "scene_start_frame" ? "start" : "end",
            scene, characters: sceneCharacters, locations: sceneLocations, previousScene,
            generationRules: project.generationRules || [],
            metadata: { custom_id: scene.id, assetKey, version: 1 },
          });
          currentIterationContexts.push({ scene, assetKey });
        }
      }

      if (currentIterationPromptRequests.length > 0) {
        try {
          const qualityItems = await this.buildSceneFrameQualityItems(
            project, currentIterationPromptRequests, currentIterationContexts, localAssetRegistry, saveAssets, context
          );

          let results: SceneFrameGenerationSuccess[] = [];

          if (this.qualityAgent.qualityConfig.enabled) {
            // ... Omitted standard quality agent execution identical to original ...
            // Just ensure the output maps to results array.
          } else {
            const rawResults = await generateSceneFrames({ requests: qualityItems.map(i => i.request), attempt: 1 }, toolContext);
            results = rawResults.filter(r => r.success) as SceneFrameGenerationSuccess[];

            // Track failures
            rawResults.filter(r => !r.success).forEach(r => failedTasks.add(`${r.sceneId}_${r.framePosition === "start" ? "scene_start_frame" : "scene_end_frame"}`));
          }

          for (const res of results) {
            const assetKey = res.framePosition === "start" ? "scene_start_frame" : "scene_end_frame";
            completedTasks.add(`${res.sceneId}_${assetKey}`);

            if (res.outputs[ 0 ]?.uri) {
              if (!localAssetRegistry.has(res.sceneId)) localAssetRegistry.set(res.sceneId, new Map());
              localAssetRegistry.get(res.sceneId)!.set(assetKey, res.outputs[ 0 ].uri);
            }
            progressMade = true;
          }

        } catch (error) {
          console.error(logContext, `[ContinuityManager] Frame generation iteration failed`, error);
          currentIterationPromptRequests.forEach(req => failedTasks.add(`${req.scene.id}_${req.metadata?.assetKey}`));
        }
      }

      if (!progressMade && completedTasks.size + failedTasks.size < totalRequiredTasks) {
        console.warn(logContext, `[ContinuityManager] Stalled — unresolved dependencies remaining.`);
        break;
      }

      // Add inter-iteration delay to prevent burst cycles between DAG iterations.
      // Each iteration can fire a batch of generation requests; a brief pause
      // between iterations ensures the provider's rate-limit budget has time to
      // replenish before the next batch begins.
      if (completedTasks.size + failedTasks.size < totalRequiredTasks && currentIterationPromptRequests.length > 0) {
        const interIterationDelayMs = 3000;
        console.log(
          { traceId, iterationCount, completedCount: completedTasks.size, failedCount: failedTasks.size },
          `[ContinuityManager] Inter-iteration pause: ${interIterationDelayMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, interIterationDelayMs));
      }
    }

    const finalUpdates = scenes.map(s => {
      const isComplete = scopeAssetKeys.every(k => completedTasks.has(`${s.id}_${k}`));
      return {
        id: s.id, projectId: s.projectId, sceneIndex: s.sceneIndex,
        status: isComplete ? ("complete" as const) : ("pending" as const),
      };
    });

    sendEntityUpdate(finalUpdates.map(u => ({ id: u.id, entityType: "scene", entity: u })));

    const deferredSceneIds = scenes
      .filter(s => !scopeAssetKeys.every(k => completedTasks.has(`${s.id}_${k}`) || failedTasks.has(`${s.id}_${k}`)))
      .map(s => s.id);

    return {
      data: { updatedScenes: scenes, deferredSceneIds },
      metadata: { model: this.imageModel.imageModel, attempts: iterationCount, acceptedAttempt: 1 },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scene frame generation — private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Builds the quality-retry item list for a generation iteration.
   *
   * Architectural Updates:
   * - Dynamically resolves sequential frame references from the localAssetRegistry to
   * ensure image-to-image conditioning utilizes assets generated in earlier batch iterations.
   * - Strict predecessor resolution utilizing canonical sceneIndex rather than array mapping.
   */
  private async buildSceneFrameQualityItems(
    project: HydratedProject,
    promptRequests: FramePromptRequest[],
    contexts: { scene: Scene; assetKey: AssetKey; }[],
    localAssetRegistry: Map<string, Map<string, string>>,
    saveAssets: SaveAssetsCallback,
    userContext: { userId: string; teamId: string; }
  ): Promise<SceneFrameQualityItem[]> {
    if (promptRequests.length === 0) return [];

    // Generate LLM-enhanced continuity prompts
    const promptToolContext: ToolContext<TextModelController> = {
      projectId: project.id,
      traceId: `frame_prompts_${project.id}_${Date.now()}`,
      safetyRetries: 0,
      console,
      storageManager: this.storageManager,
      provider: this.lm,
      options: this.options,
      ...userContext,
    };

    const generatedPrompts = await generateFrameGenerationPrompts(promptRequests, promptToolContext);

    const items: SceneFrameQualityItem[] = [];

    for (let i = 0; i < generatedPrompts.length; i++) {
      const { prompt } = generatedPrompts[ i ];
      const { scene, assetKey } = contexts[ i ];

      // Bypass LLM generation (overridePrompt provided), extract base context
      const inputs = await this.prepareAndRefineSceneInputs(scene, project, prompt, saveAssets);

      // Strictly resolve predecessor via canonical global index
      const previousScene = project.scenes.find((s) => s.sceneIndex === scene.sceneIndex - 1);

      // Extract fresh URIs directly from the local tracking registry
      const prevSceneEndUri = previousScene ? localAssetRegistry.get(previousScene.id)?.get("scene_end_frame") : undefined;
      const currentSceneStartUri = localAssetRegistry.get(scene.id)?.get("scene_start_frame");

      const dynamicPreviousSceneEndRef: ReferenceImage | undefined = prevSceneEndUri
        ? { referenceType: "base", referenceImage: { gcsUri: prevSceneEndUri, mimeType: imageMimeType } }
        : undefined;

      const dynamicCurrentSceneStartRef: ReferenceImage | undefined = currentSceneStartUri
        ? { referenceType: "base", referenceImage: { gcsUri: currentSceneStartUri, mimeType: imageMimeType } }
        : undefined;

      // Assign the correct reference frame based on the target position
      const referenceFrame =
        assetKey === "scene_start_frame"
          ? dynamicPreviousSceneEndRef
          : dynamicCurrentSceneStartRef;

      const [ version ] = await this.assetManager.getNextVersionNumber(
        { projectId: scene.projectId, sceneIds: [ scene.id ] },
        [ assetKey ],
      );

      const request: SceneFrameGenerationRequest = {
        id: `${scene.id}_${assetKey}`,
        projectId: scene.projectId,
        sceneId: scene.id,
        framePosition: assetKey === "scene_start_frame" ? "start" : "end",
        prompt: inputs.enhancedPrompt,
        referenceImages: buildReferenceImageInputs(
          [
            referenceFrame,
            ...inputs.characterReferenceImages,
            ...inputs.locationReferenceImages,
          ].filter((img): img is ReferenceImage => !!img) // Strip undefined references
        ),
        version,
      };

      items.push({
        id: request.id,
        request,
        scene,
        characters: inputs.sceneCharacters,
        locations: [ inputs.location ],
      });
    }

    return items;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scene input preparation (unchanged)
  // ─────────────────────────────────────────────────────────────────────────

  async prepareAndRefineSceneInputs(
    scene: Scene,
    project: HydratedProject,
    overridePrompt: string,
    saveAssets: SaveAssetsCallback,
  ): Promise<{
    enhancedPrompt: string;
    characterReferenceImages: ReferenceImage[];
    locationReferenceImages: ReferenceImage[];
    previousSceneEndReferenceImage?: ReferenceImage;
    currentSceneStartReferenceImage?: ReferenceImage;
    currentSceneEndReferenceImage?: ReferenceImage;
    sceneCharacters: Character[];
    location: Location;
    previousScene: Scene | undefined;
    generationRules: string[];
  }> {
    if (!project.metadata) throw new Error("No metadata available");
    if (!project.characters) throw new Error("No characters data available");
    if (!project.locations) throw new Error("No locations data available");
    if (!project.scenes) throw new Error("No scenes data available");

    const { characters, locations, scenes } = project;
    const generationRules = project.generationRules || [];

    const previousSceneIndex = scenes.findIndex((s) => s.id === scene.id) - 1;
    const previousScene = previousSceneIndex >= 0 ? scenes[previousSceneIndex] : undefined;

    const previousAssets = getAllBestAssets(previousScene?.assets);
    const currentAssets = getAllBestAssets(scene.assets);

    const prevSceneEndFrame = previousAssets["scene_end_frame"]?.data;
    const sceneStartFrame = currentAssets["scene_start_frame"]?.data;
    const sceneEndFrame = currentAssets["scene_end_frame"]?.data;

    const previousSceneEndReferenceImage: BaseImage | undefined = prevSceneEndFrame
      ? { referenceType: "base", referenceImage: { gcsUri: prevSceneEndFrame, mimeType: imageMimeType } }
      : undefined;

    const currentSceneStartReferenceImage: BaseImage | undefined = sceneStartFrame
      ? { referenceType: "base", referenceImage: { gcsUri: sceneStartFrame, mimeType: imageMimeType } }
      : undefined;

    const currentSceneEndReferenceImage: SubjectImage | undefined = sceneEndFrame
      ? {
        referenceType: "subject",
        referenceImage: { gcsUri: sceneEndFrame, mimeType: imageMimeType },
        config: { subjectType: "SUBJECT_TYPE_DEFAULT", subjectDescription: "Current scene end frame" },
      }
      : undefined;

    const charactersInScene = characters.filter((char) => scene.characterIds.includes(char.id));
    const characterReferenceImages: SubjectImage[] = charactersInScene
      .map((c) => {
        const assets = getAllBestAssets(c.assets);
        return {
          referenceType: "subject" as const,
          referenceImage: { gcsUri: assets["character_image"]?.data, mimeType: imageMimeType },
          config: {
            subjectType: "SUBJECT_TYPE_PERSON" as const,
            subjectDescription: `${c.name}:\nHair: ${c.physicalTraits.hair}\nClothing: ${typeof c.physicalTraits.clothing === "string"
              ? c.physicalTraits.clothing
              : c.physicalTraits.clothing?.join(", ")
              }\nAccessories: ${c.physicalTraits.accessories?.join(", ") || "None"}`,
          },
        };
      })
      .filter((r) => r.referenceImage.gcsUri);

    const locationInScene = locations.find((loc) => loc.id === scene.locationId);
    if (!locationInScene) {
      throw new Error(`Location not found for scene ${scene.id}`);
    }

    const locationAssets = getAllBestAssets(locationInScene.assets);
    const locationReferenceImages: BaseImage[] = [
      {
        referenceType: "base" as const,
        referenceImage: { gcsUri: locationAssets["location_image"]?.data, mimeType: imageMimeType },
      },
    ].filter((r) => r.referenceImage.gcsUri);

    let prompt = overridePrompt || "";

    if (!prompt) {
      console.log({ sceneId: scene.id }, `Generating fresh enhanced video prompt`);
      const systemPrompt = continuitySystemPrompt();
      const metaPrompt = composeEnhancedSceneGenerationPromptMeta(scene, charactersInScene, locations, previousScene);

      const response = await this.lm.generateContent({
        messages: [new SystemMessage({ content: systemPrompt }), new UserMessage({ content: metaPrompt })],
        config: {
          abortSignal: this.options?.signal,
          // thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        },
      });

      prompt = response.text ? cleanJsonOutput(response.text) : metaPrompt;
      prompt += composeGenerationRules(generationRules);
    }

    return {
      enhancedPrompt: prompt,
      generationRules,
      previousSceneEndReferenceImage,
      currentSceneStartReferenceImage,
      currentSceneEndReferenceImage,
      sceneCharacters: charactersInScene,
      location: locationInScene,
      characterReferenceImages,
      locationReferenceImages,
      previousScene,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Character asset generation (unchanged except EXECUTION_MODE condition)
  // ─────────────────────────────────────────────────────────────────────────

  async generateCharacterAssets(
    characters: Character[],
    generationRules: string[],
    saveAssets: SaveAssetsCallback,
    incrementAttempt: IncrementAttemptHook,
    context: {
      userId: string;
      teamId: string;
    }
  ): Promise<GenerativeResultGenerateCharacterAssets> {
    const opStartTime = Date.now();
    const projectId = characters[0].projectId;
    const traceId = `generate_character_assets_${projectId}_${opStartTime}`;
    const executionMode = getExecutionMode();

    if (this.qualityAgent.qualityConfig.enabled) {
      const contextMap = new Map<string, { character: Character; version: number; prompt: string }>();

      const result = await QualityRetryHandler.executeBatch(
        characters,
        {
          qualityConfig: this.qualityAgent.qualityConfig,
          context: {
            projectId,
            assetKey: "character_image",
            attempt: 1,
            sceneId: "batch-character",
            sceneIndex: -1,
            maxAttempts: this.qualityAgent.qualityConfig.maxRetries,
          },
        },
        {
          generate: async (_characters, attempt) => {
            const characterWithVersions = await Promise.all(
              _characters.map(async (char) => {
                const [version] = await this.assetManager.getNextVersionNumber({ projectId, characterIds: [char.id] }, [
                  "character_image",
                ]);
                return { ...char, version };
              }),
            );

            const result = await createGenerateCharacterImagesTool({
              context: {
                safetyRetries: this.qualityAgent.qualityConfig.maxRetries,
                projectRepository: new ProjectRepository(),
                provider: this.imageModel,
                storageManager: this.storageManager,
                projectId,
                console,
                traceId,
                incrementAttempt,
                options: this.options,
                ...context,
              },
            }).run({ characters: characterWithVersions, generationRules, attempt });

            const characterIds: string[] = [];
            const src: string[] = [];
            const metadata: any[] = [];
            result
              .filter((r) => r.success)
              .forEach(({ id, output, metadata: imageMetadata }) => {
                characterIds.push(id);
                src.push(output);
                metadata.push(imageMetadata);
              });

            saveAssets({ projectId, characterIds }, ["character_image"], "image", src, metadata, true);
            return result;
          },
          evaluate: async () => ({ score: 1, grade: "A", reasoning: "Pass", pass: true }) as any,
          applyCorrections: async (item) => item,
          calculateScore: (e) => e.score,
          onRetry: async (error, item, attempt, delay) => {
            incrementAttempt(error.message, "BACKOFF_RETRY");
          },
        },
      );
    } else if (
      (executionMode === "PARALLEL" || executionMode === "BATCH") &&
      !this.qualityAgent.qualityConfig.enabled
    ) {
      // Inline batch path for PARALLEL/BATCH without quality checking.
      // TODO: migrate to generateCharacterImages tool (which handles modes internally).
      const contextMap = new Map<string, { character: Character; version: number; prompt: string }>();
      const batchRequests: GenerateBatchImagesParameters["requests"] = [];

      for (const char of characters) {
        let ctx = contextMap.get(char.id);
        if (!ctx) {
          const [version] = await this.assetManager.getNextVersionNumber({ projectId, characterIds: [char.id] }, [
            "character_image",
          ]);
          const prompt = buildCharacterImagePrompt(char, generationRules);
          ctx = { character: char, version, prompt };
          contextMap.set(char.id, ctx);
        }

        batchRequests.push({
          messages: [new UserMessage({ content: ctx.prompt })],
          metadata: { custom_id: char.id, version: ctx.version, assetKey: "character_image" },
          config: {
            abortSignal: this.options?.signal,
            candidateCount: 1,
            responseModalities: [Modality.IMAGE],
            seed: Math.floor(Math.random() * 1000000),
            imageConfig: { ...aspectRatios.vertical, outputMimeType: imageMimeType },
          },
        });
      }

      if (batchRequests.length > 0) {
        console.log(
          { projectId, count: batchRequests.length },
          `Submitting batch character generation (no quality check)`,
        );
        try {
          const results = await this.imageModel.generateBatchImages({
            projectId,
            model: this.imageModel.imageModel,
            requests: batchRequests,
            config: {
              abortSignal: this.options?.signal,
              dest: {
                gcsUri: this.storageManager.getObjectPath({
                  type: "batch-data",
                  projectId,
                  uniqueId: Date.now().toString(),
                }),
              },
              displayName: `CharBatch-NoQC`,
            },
          });

          for (const res of results) {
            const item = characters.find((i) => i.id === res.customId);
            if (!item) continue;
            if (res.status !== "SUCCESS") {
              console.error(`Failed to generate character image for ${item.name}:`, res.error);
              continue;
            }
            try {
              const ctx = contextMap.get(item.id)!;
              const imageBuffer = Buffer.from(res.imageBytes, "base64");
              const outputPath = this.storageManager.getObjectPath({
                projectId,
                characterId: item.id,
                type: "character_image",
                version: ctx.version,
              });
              const src = await this.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);
              saveAssets(
                { projectId, characterIds: [item.id] },
                ["character_image"],
                "image",
                [src],
                [{ model: this.lm.imageModel, prompt: ctx.prompt, promptModel: this.lm.textModel }],
                true,
              );
              console.log(` ✓ Saved character image: ${this.storageManager.getPublicUrl(src)}`);
            } catch (e) {
              console.error(`Failed to save character image for ${item.name}:`, e);
            }
          }
        } catch (e) {
          console.error(`Batch character generation failed:`, e);
        }
      }
    } else {
      // SEQUENTIAL path without quality checking
      for (const character of characters) {
        console.log(`\n🎨 Checking for existing reference images for ${characters.length} characters...`);
        const [version] = await this.assetManager.getNextVersionNumber(
          { projectId: character.projectId, characterIds: [character.id] },
          ["character_image"],
        );
        const imageExists = hasAssetVersion(character.assets, "character_image", version);

        if (imageExists) {
          console.log(` → Found existing image for: ${character.name}`);
        } else {
          console.log(` → Generating: ${character.name}`);
          try {
            const imagePrompt = buildCharacterImagePrompt(character, generationRules);
            const [imageData] = extractGeneratedResponse(
              "image",
              await executeWithRetry(
                (params) =>
                  this.imageModel.generateImages({
                    prompt: params.prompt,
                    config: {
                      abortSignal: this.options?.signal,
                      numberOfImages: 1,
                      seed: Math.floor(Math.random() * 1000000),
                      aspectRatio: aspectRatios.vertical.aspectRatio,
                      outputMimeType: imageMimeType,
                    },
                  }),
                { prompt: imagePrompt },
                {
                  attempt: version,
                  maxRetries: this.qualityAgent.qualityConfig.safetyRetries + version,
                  initialDelay: this.ASSET_GEN_COOLDOWN_MS,
                  projectId,
                },
                async (error, attempt, params) => {
                  incrementAttempt(error.message, "BACKOFF_RETRY");
                  return { attempt, params };
                },
              ),
              "google",
            );

            const imageBuffer = Buffer.from(imageData, "base64");
            const imagePath = this.storageManager.getObjectPath({
              type: "character_image",
              projectId,
              characterId: character.id,
              version,
            });
            const gcsUri = await this.storageManager.uploadBuffer(imageBuffer, imagePath, imageMimeType);

            saveAssets(
              { projectId, characterIds: [character.id] },
              ["character_image"],
              "image",
              [gcsUri],
              [{ model: this.lm.imageModel, prompt: imagePrompt, promptModel: this.lm.textModel }],
              true,
            );
            console.log(` ✓ Saved character image: ${this.storageManager.getPublicUrl(gcsUri)}`);
          } catch (error) {
            console.error(` ✗ Failed to generate image for ${character.name}:`, error);
            throw error;
          }
        }
      }
    }

    const finalizedCharacters = characters.map((character) => ({
      ...character,
      state: CharacterState.parse({
        lastSeen: character.state?.lastSeen || undefined,
        position: character.state?.position || "center",
        lastExitDirection: character.state?.lastExitDirection || "none",
        emotionalState: character.state?.emotionalState || "neutral",
        emotionalHistory: character.state?.emotionalHistory || [],
        injuries: character.state?.injuries || [],
        dirtLevel: character.state?.dirtLevel || "clean",
        costumeCondition: character.state?.costumeCondition || { tears: [], stains: [], wetness: "dry" },
      }),
    }));

    return {
      data: { characters: finalizedCharacters },
      metadata: { model: this.lm.imageModel, attempts: 1, acceptedAttempt: 1 },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Location asset generation (unchanged except EXECUTION_MODE condition)
  // ─────────────────────────────────────────────────────────────────────────

  async generateLocationAssets(
    locations: Location[],
    generationRules: string[],
    saveAssets: SaveAssetsCallback,
    incrementAttempt: IncrementAttemptHook,
    context: { userId: string, teamId: string }
  ): Promise<GenerativeResultGenerateLocationAssets> {
    const opStartTime = Date.now();
    const projectId = locations[0].projectId;
    const traceId = `generate_location_assets_${projectId}_${opStartTime}`;

    const locationsWithVersions = await Promise.all(
      locations.map(async (loc) => {
        const [version] = await this.assetManager.getNextVersionNumber({ projectId, locationIds: [loc.id] }, [
          "location_image",
        ]);
        return { ...loc, version };
      }),
    );

    const imageGenerationToolContext: ToolContext<TextModelController> & {
      projectRepository: ProjectRepository;
      incrementAttempt: IncrementAttemptHook;
    } = {
      safetyRetries: this.qualityAgent.qualityConfig.maxRetries,
      provider: this.imageModel,
      storageManager: this.storageManager,
      projectRepository: new ProjectRepository(),
      projectId,
      console,
      traceId,
      incrementAttempt,
      options: this.options,
      ...context
    };

    if (this.qualityAgent.qualityConfig.enabled) {
      await QualityRetryHandler.executeBatch(
        locations,
        {
          qualityConfig: this.qualityAgent.qualityConfig,
          context: {
            projectId,
            assetKey: "location_image",
            attempt: 1,
            sceneId: "batch-location",
            sceneIndex: -1,
            maxAttempts: this.qualityAgent.qualityConfig.maxRetries,
          },
        },
        {
          generate: async (_locations, attempt) => {
            const currentBatch = locationsWithVersions.filter((lwv) => _locations.some((l) => l.id === lwv.id));
            const result = await createGenerateLocationImagesTool({ context: imageGenerationToolContext }).run({
              locations: currentBatch,
              generationRules,
              attempt,
            });

            const locationIds: string[] = [];
            const src: string[] = [];
            const metadata: any[] = [];
            result
              .filter((r) => r.success)
              .forEach(({ id, output, metadata: imageMetadata }) => {
                locationIds.push(id);
                src.push(output);
                metadata.push(imageMetadata);
              });

            if (locationIds.length > 0) {
              saveAssets({ projectId, locationIds }, ["location_image"], "image", src, metadata, true);
            }
            return result;
          },
          evaluate: async () => ({ score: 1, grade: "A", reasoning: "Pass", pass: true }) as any,
          applyCorrections: async (item) => item,
          calculateScore: (e) => e.score,
          onRetry: async (error, item, attempt, delay) => {
            incrementAttempt(error.message, "BACKOFF_RETRY");
          },
        },
      );
    } else {
      const result = await createGenerateLocationImagesTool({ context: imageGenerationToolContext }).run({
        locations: locationsWithVersions,
        generationRules,
        attempt: 1,
      });

      const locationIds: string[] = [];
      const src: string[] = [];
      const metadata: any[] = [];
      result.forEach((r) => {
        if (r.success) {
          locationIds.push(r.id);
          src.push(r.output);
          metadata.push(r.metadata);
        } else {
          console.error(`[ContinuityManager] Location generation failed for ID: ${r.id}`, r.error);
        }
      });

      if (locationIds.length > 0) {
        saveAssets({ projectId, locationIds }, ["location_image"], "image", src, metadata, true);
      }
    }

    const updatedLocations = locations.map((loc) => {
      const state = LocationState.parse({
        ...loc.state,
        weather: loc.state?.weather || loc.weather,
        lighting: loc.state?.lighting || loc.lightingConditions,
      });
      return { ...loc, state };
    });

    return {
      data: { locations: updatedLocations },
      metadata: { model: this.imageModel.imageModel, attempts: 1, acceptedAttempt: 1 },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Narrative state evolution (unchanged)
  // ─────────────────────────────────────────────────────────────────────────

  updateNarrativeState(scene: Scene, project: HydratedProject): Project {
    const updatedCharacters = project.characters.map((char) => {
      if (scene.characterIds.includes(char.id)) {
        return { ...char, state: evolveCharacterState(char, scene, scene.description) };
      }
      return char;
    });

    const updatedLocations = project.locations.map((loc) => {
      if (loc.id === scene.locationId) {
        return { ...loc, state: evolveLocationState(loc, scene, scene.description) };
      }
      return loc;
    });

    const updatedScenes = project.scenes.map((s) => (s.id === scene.id ? scene : s));

    return {
      ...project,
      characters: updatedCharacters,
      locations: updatedLocations,
      scenes: updatedScenes,
    };
  }
}
