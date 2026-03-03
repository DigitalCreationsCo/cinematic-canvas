import {
    retryLlmCall,
} from "../utils/lm-retry.js";
import {
    Character,
    Scene,
    Location,
    Project,
    LocationState,
    AssetKey,
    CharacterState,
    RecordMetricsCallback,
} from "../types/index.js";
import { GCPStorageManager } from "../services/storage-manager.js";
import { Modality } from "@google/genai";
import { FrameCompositionAgent, FramePromptRequest, FrameCompositionItem } from "./frame-composition-agent.js";
import { buildCharacterImagePrompt } from "../prompts/character-reference-image.prompt.js";
import { buildLocationImagePrompt } from "../prompts/location-reference-image.prompt.js";
import { composeGenerationRules } from "../prompts/must-review/prompt-utils.js";
import { ReferenceImage, TextModelController } from "../lm/text-model-controller.js";
import { BaseImage, GenerateBatchImagesParameters, SubjectImage } from "../lm/provider.js";
import { ThinkingLevel } from "@google/genai";
import { QualityCheckAgent } from "./quality-check-agent.js";
import { QualityRetryHandler } from "../utils/quality-retry-handler.js";
import { evolveCharacterState, evolveLocationState } from "./state-evolution.js";
import { cleanJsonOutput } from "../utils/utils.js";
import { getAllBestAssets, hasAssetVersion } from "../utils/assets-utils.js";
import { AssetVersionManager } from "../services/asset-version-manager.js";
import { SaveAssetsCallback, UpdateScenesCallback, IncrementAttemptHook } from "../types/index.js";
import { GenerativeResultGenerateCharacterAssets, GenerativeResultGenerateLocationAssets, GenerativeResultGenerateSceneFrames, JobGenerateCharacterAssets, JobGenerateLocationAssets, JobGenerateSceneFrames } from "../types/job.types.js";
import { aspectRatios, IS_BATCH_PROCESSING_ENABLED, EXECUTION_MODE, imageMimeType } from "../config.js";
import { extractGeneratedResponse } from "../lm/parts-extractor.js";
import { buildReferenceImages } from "../lm/utils.js";
import { composeEnhancedSceneGenerationPromptMeta } from "../prompts/scene.prompt.js";



export class ContinuityManagerAgent {
    private lm: TextModelController;
    private imageModel: TextModelController;
    private storageManager: GCPStorageManager;
    private assetManager: AssetVersionManager;
    private frameComposer: FrameCompositionAgent;
    private qualityAgent: QualityCheckAgent;
    private ASSET_GEN_COOLDOWN_MS = 60000;
    private options?: { signal?: AbortSignal; };

    constructor(
        lm: TextModelController,
        imageModel: TextModelController,
        frameComposer: FrameCompositionAgent,
        qualityAgent: QualityCheckAgent,
        storageManager: GCPStorageManager,
        assetManager: AssetVersionManager,
        options?: { signal?: AbortSignal; }
    ) {
        this.lm = lm;
        this.imageModel = imageModel;
        this.frameComposer = frameComposer;
        this.qualityAgent = qualityAgent;
        this.storageManager = storageManager;
        this.assetManager = assetManager;
        this.options = options;
    }

    async prepareAndRefineSceneInputs(
        scene: Scene,
        state: Project,
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
        // 1. Validation Logic (Remains the same)
        if (!state.metadata) throw new Error("No metadata available");
        if (!state.characters) throw new Error("No characters data available");
        if (!state.locations) throw new Error("No locations data available");
        if (!state.scenes) throw new Error("No scenes data available");

        const { characters, locations, scenes } = state;
        const generationRules = state.generationRules || [];

        // 2. Data Retrieval (Idempotent lookups)
        const previousSceneIndex = scenes.findIndex(s => s.id === scene.id) - 1;
        const previousScene = previousSceneIndex >= 0 ? scenes[ previousSceneIndex ] : undefined;

        const previousAssets = getAllBestAssets(previousScene?.assets);
        const currentAssets = getAllBestAssets(scene.assets);

        const prevSceneEndFrame = previousAssets[ 'scene_end_frame' ]?.data;
        const sceneStartFrame = currentAssets[ 'scene_start_frame' ]?.data;
        const sceneEndFrame = currentAssets[ 'scene_end_frame' ]?.data;

        const previousSceneEndReferenceImage: BaseImage | undefined = prevSceneEndFrame ? {
            referenceType: 'base',
            referenceImage: {
                gcsUri: prevSceneEndFrame,
                mimeType: imageMimeType,
            },
        } : undefined;

        const currentSceneStartReferenceImage: BaseImage | undefined = sceneStartFrame ? {
            referenceType: 'base',
            referenceImage: {
                gcsUri: sceneStartFrame,
                mimeType: imageMimeType,
            },
        } : undefined;

        const currentSceneEndReferenceImage: SubjectImage | undefined = sceneEndFrame ? {
            referenceType: 'subject',
            referenceImage: {
                gcsUri: sceneEndFrame,
                mimeType: imageMimeType,
            },
            config: {
                subjectType: "SUBJECT_TYPE_DEFAULT",
                subjectDescription: "Current scene end frame",
            },
        } : undefined;

        const charactersInScene = characters.filter(char => scene.characterIds.includes(char.id));
        const characterReferenceImages: SubjectImage[] = charactersInScene.flatMap(c => {
            const assets = getAllBestAssets(c.assets);
            return {
                referenceType: 'subject' as const,
                referenceImage: {
                    gcsUri: assets[ 'character_image' ]?.data,
                    mimeType: imageMimeType,
                },
                config: {
                    subjectType: "SUBJECT_TYPE_PERSON" as const,
                    subjectDescription: `${c.name}:
Hair: ${c.physicalTraits.hair}
Clothing: ${typeof c.physicalTraits.clothing === "string" ? c.physicalTraits.clothing : c.physicalTraits.clothing?.join(", ")}
Accessories: ${c.physicalTraits.accessories?.join(", ") || "None"}`,
                },
            };
        }).filter(r => r.referenceImage.gcsUri);

        const locationInScene = locations.find(loc => loc.id === scene.locationId);
        if (!locationInScene) {
            console.warn({ sceneId: scene.id, locationId: scene.locationId }, "Location not found for scene. Using empty narrative.");
            throw new Error(`Location not found for scene ${scene.id}`);
        }
        const locationAssets = locationInScene ? getAllBestAssets(locationInScene.assets) : {};
        const locationReferenceImages: BaseImage[] = locationInScene ? [ {
            referenceType: 'base' as const,
            referenceImage: {
                gcsUri: locationAssets[ 'location_image' ]?.data,
                mimeType: imageMimeType,
            },
            // configuration: {
            //     subjectType: "SUBJECT_TYPE_DEFAULT" as const,
            //     subjectDescription: buildProductionDesignerNarrative(locationInScene)
            // }
        } ].filter(r => r.referenceImage.gcsUri) : [];

        // 3. IDEMPOTENCY GUARD: Check for existing prompt before generating
        let prompt = overridePrompt || "";

        if (!prompt) {
            const [ existingPromptAsset ] = await this.assetManager.getBestVersion(
                { projectId: scene.projectId, sceneIds: [ scene.id ] },
                [ 'scene_prompt' ]
            );

            if (existingPromptAsset?.data) {
                console.log({ sceneId: scene.id }, `Idempotency hit: Using existing prompt.`);
                prompt = existingPromptAsset.data;
            }
        }

        // 4. Generative Logic (Only runs if no prompt exists)
        if (!prompt) {
            console.log({ sceneId: scene.id }, `Generating fresh enhanced video prompt`);
            const metaPrompt = composeEnhancedSceneGenerationPromptMeta(
                scene,
                charactersInScene,
                locations,
                previousScene,
            );

            const response = await this.lm.generateContent({
                contents: [ {
                    role: "user", parts: [ { text: metaPrompt } ]
                } ],
                config: {
                    abortSignal: this.options?.signal,
                    // Optional: Use a seed for deterministic LLM output if your SDK supports it
                    // seed: generateDeterministicSeed(scene.id) 
                    thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
                }
            });

            prompt = response.text ? cleanJsonOutput(response.text) : metaPrompt;
            prompt += composeGenerationRules(generationRules);

            // Save side-effect only happens once per unique scene ID
            saveAssets(
                { projectId: scene.projectId, sceneIds: [ scene.id ] },
                [ 'scene_prompt' ],
                'text',
                [ prompt ],
                [ { model: this.lm.textModel, prompt: metaPrompt } ],
                true
            );
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

    async generateSceneFramesBatch(
        project: Project,
        scenes: Scene[],
        scopeAssetKeys: ('scene_start_frame' | 'scene_end_frame')[],
        saveAssets: SaveAssetsCallback,
        sendUpdateScenes: UpdateScenesCallback,
        incrementAttempt: IncrementAttemptHook,
        recordMetrics: RecordMetricsCallback
    ): Promise<GenerativeResultGenerateSceneFrames> {
        try {
            console.log({ execMode: EXECUTION_MODE, scenes: scenes.length, scopeAssetKeys }, `\n🖼️ Generating ${scopeAssetKeys}...`);

            const promptRequests: FramePromptRequest[] = [];
            const sceneContexts: { scene: Scene, assetKey: AssetKey; }[] = [];

            for (const scene of scenes) {
                const prevIdx = project.scenes.findIndex(s => s.id === scene.id) - 1;
                const previousScene = prevIdx >= 0 ? project.scenes[ prevIdx ] : undefined;
                const sceneCharacters = project.characters.filter(c => scene.characterIds.includes(c.id));
                const sceneLocations = project.locations.filter(l => scene.locationId.includes(l.id));

                for (const assetKey of scopeAssetKeys) {
                    promptRequests.push({
                        framePosition: assetKey === "scene_start_frame" ? "start" : "end",
                        scene,
                        characters: sceneCharacters,
                        locations: sceneLocations,
                        previousScene,
                        generationRules: project.generationRules,
                        metadata: { custom_id: scene.id, assetKey, version: 1 }
                    });
                    sceneContexts.push({ scene, assetKey });
                }
            }

            const generatedPrompts = await this.frameComposer.generateFrameGenerationPrompts(promptRequests);

            const delayStaggerMs = 500;
            const imageItemPromises = generatedPrompts.map(async (item, i) => {
                await new Promise(resolve => setTimeout(resolve, i * delayStaggerMs));
                
                const { prompt } = item;
                const { scene, assetKey } = sceneContexts[i];

                const promptKey = assetKey === "scene_start_frame" ? "start_frame_prompt" : "end_frame_prompt";
                saveAssets(
                    { projectId: project.id, sceneIds: [ scene.id ] },
                    [ promptKey ],
                    'text',
                    [ prompt ],
                    [ { model: this.lm.textModel } ],
                    true
                );

                const {
                    enhancedPrompt,
                    previousSceneEndReferenceImage,
                    currentSceneStartReferenceImage,
                    characterReferenceImages,
                    locationReferenceImages,
                } = await this.prepareAndRefineSceneInputs(scene, project, prompt, saveAssets);

                const previousFrame = assetKey === "scene_start_frame" ?
                    previousSceneEndReferenceImage : currentSceneStartReferenceImage;

                return {
                    id: `${scene.id}_${assetKey}`,
                    framePosition: assetKey === "scene_start_frame" ? "start" : "end",
                    scene,
                    characters: project.characters.filter(c => scene.characterIds.includes(c.id)),
                    locations: project.locations.filter(l => scene.locationId.includes(l.id)),
                    metadata: {
                        custom_id: scene.id,
                        assetKey,
                        version: 0
                    },
                    prompt: enhancedPrompt,
                    referenceImages: buildReferenceImages([
                        previousFrame,
                        ...characterReferenceImages,
                        ...locationReferenceImages,
                    ]),
                    uniqueId: `${scene.id}_${assetKey}`
                } as FrameCompositionItem;
            });

            const results = await Promise.allSettled(imageItemPromises);
            const imageItems: FrameCompositionItem[] = [];
            
            for (const res of results) {
                if (res.status === 'fulfilled') {
                    imageItems.push(res.value);
                } else {
                    console.error(`Failed to prepare scene input for batch:`, res.reason);
                }
            }

            const mode = EXECUTION_MODE === "PARALLEL" ? (IS_BATCH_PROCESSING_ENABLED ? "BATCH" : "PARALLEL") : "SEQUENTIAL";

            const resultMap = await this.frameComposer.generateFrames(
                imageItems,
                saveAssets,
                sendUpdateScenes,
                incrementAttempt,
                recordMetrics,
                mode as any
            );

            const updates = scenes.map(s => {
                const errors: string[] = [];
                
                for (const assetKey of scopeAssetKeys) {
                    const uniqueId = `${s.id}_${assetKey}`;
                    const res = resultMap.get(uniqueId);
                    
                    if (res instanceof Error) {
                        errors.push(`${assetKey}: ${res.message}`);
                    }
                }
                
                if (errors.length > 0) {
                     return {
                        id: s.id,
                        projectId: s.projectId,
                        sceneIndex: s.sceneIndex,
                        status: "error" as const,
                        progressMessage: `Frame generation failed: ${errors.join(", ")}`
                    };
                }
                
                return {
                    id: s.id,
                    projectId: s.projectId,
                    sceneIndex: s.sceneIndex,
                    status: "complete" as const,
                    progressMessage: ""
                };
            });

            sendUpdateScenes(updates.map(u => u.id), updates);
                imageItems,
                saveAssets,
                sendUpdateScenes,
                incrementAttempt,
                recordMetrics,
                mode as any
            );

            sendUpdateScenes(scenes.map(s => s.id), scenes.map(s => ({
                id: s.id,
                projectId: s.projectId,
                sceneIndex: s.sceneIndex,
                status: "complete" as const,
                progressMessage: ""
            })));

            return { data: { updatedScenes: scenes }, metadata: { model: "", attempts: 1, acceptedAttempt: 1 } };
        } catch (error: any) {
            console.error({ scenes: scenes.map(s => s.id), error }, "Frame generation batch failed");
            sendUpdateScenes(scenes.map(s => s.id), scenes.map(s => ({
                id: s.id,
                projectId: s.projectId,
                sceneIndex: s.sceneIndex,
                status: "error" as const,
                progressMessage: `Frame generation failed: ${error.message}`
            })));
            throw error;
        }
    }
    async generateCharacterAssets(
        characters: Character[],
        generationRules: string[],
        saveAssets: SaveAssetsCallback,
        incrementAttempt: IncrementAttemptHook,
        recordMetrics: RecordMetricsCallback
    ): Promise<GenerativeResultGenerateCharacterAssets> {

        const opStartTime = Date.now();
        const projectId = characters[ 0 ].projectId;

        if (EXECUTION_MODE === "PARALLEL") {
            const contextMap = new Map<string, { character: Character, version: number, prompt: string; }>();

            await QualityRetryHandler.executeBatch(
                characters,
                {
                    qualityConfig: this.qualityAgent.qualityConfig,
                    context: {
                        projectId,
                        assetKey: 'character_image',
                        attempt: 1,
                        sceneId: 'batch-character',
                        sceneIndex: -1,
                        maxAttempts: this.qualityAgent.qualityConfig.maxRetries
                    }
                },
                {
                    generate: async (batchItems, attempt) => {
                        const batchRequests: GenerateBatchImagesParameters[ 'requests' ] = [];

                        for (const char of batchItems) {
                            let ctx = contextMap.get(char.id);
                            if (!ctx) {
                                const [ version ] = await this.assetManager.getNextVersionNumber(
                                    { projectId, characterIds: [ char.id ] },
                                    [ 'character_image' ]
                                );
                                const prompt = buildCharacterImagePrompt(char, generationRules);
                                ctx = { character: char, version, prompt };
                                contextMap.set(char.id, ctx);

                                saveAssets(
                                    { projectId, characterIds: [ char.id ] },
                                    [ 'character_prompt' ],
                                    'text',
                                    [ prompt ],
                                    [ { model: this.lm.textModel } ],
                                    true
                                );
                            }

                            batchRequests.push({
                                contents: [ { role: "user", parts: [ { text: ctx.prompt } ] } ],
                                metadata: { custom_id: char.id, version: ctx.version, assetKey: "character_image" },
                                config: {
                                    abortSignal: this.options?.signal,
                                    candidateCount: 1,
                                    responseModalities: [ Modality.IMAGE ],
                                    seed: Math.floor(Math.random() * 1000000),
                                    imageConfig: {
                                        ...aspectRatios.vertical,
                                        outputMimeType: imageMimeType
                                    }
                                }
                            });
                        }

                        if (batchRequests.length === 0) return [];

                        console.log({ projectId, count: batchRequests.length, attempt }, `Submitting batch generation for characters`);

                        try {
                            const results = await this.imageModel.generateBatchImages({
                                projectId,
                                model: this.imageModel.imageModel,
                                requests: batchRequests,
                                config: {
                                    abortSignal: this.options?.signal,
                                    dest: { gcsUri: this.storageManager.getObjectPath({ type: 'batch', projectId, uniqueId: Date.now().toString() }) },
                                    displayName: `CharBatch-Attempt${attempt}`
                                }
                            });

                            return Promise.all(results.map(async res => {
                                const item = batchItems.find(i => i.id === res.customId);
                                if (!item) return { id: res.customId, error: new Error("Unknown result ID") };

                                if (res.status !== "SUCCESS") {
                                    return { id: item.id, error: res.error || new Error("Batch generation failed") };
                                }

                                try {
                                    const ctx = contextMap.get(item.id)!;
                                    const imageBuffer = Buffer.from(res.imageBytes, "base64");
                                    const outputPath = this.storageManager.getObjectPath({ projectId, characterId: item.id, type: "character_image", version: ctx.version });
                                    const src = await this.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);

                                    saveAssets(
                                        { projectId, characterIds: [ item.id ] },
                                        [ 'character_image' ],
                                        'image',
                                        [ src ],
                                        [ { model: this.lm.imageModel, prompt: ctx.prompt } ],
                                        true
                                    );

                                    recordMetrics([ {
                                        entityId: item.id,
                                        assetKey: 'character_image',
                                        finalScore: 0,
                                        attemptNumber: attempt,
                                        ruleAdded: [],
                                        corrections: []
                                    } ]).catch((error) => { console.error({ error, projectId: item.projectId }, `Failed to record metric`); });

                                    return { id: item.id, output: src };
                                } catch (e) {
                                    return { id: item.id, error: e };
                                }
                            }));
                        } catch (e) {
                            return batchItems.map(i => ({ id: i.id, error: e }));
                        }
                    },
                    evaluate: async () => ({ score: 1, grade: 'A', reasoning: 'Pass', pass: true } as any),
                    applyCorrections: async (item) => item,
                    calculateScore: (e) => e.score,
                    onRetry: async (error, item, attempt, delay) => {
                        incrementAttempt(error.message, "BACKOFF_RETRY");
                    }
                }
            );
        } else {

            for (const character of characters) {

                console.log(`\n🎨 Checking for existing reference images for ${characters.length} characters...`);
                const [ version ] = await this.assetManager.getNextVersionNumber({ projectId: character.projectId, characterIds: [ character.id ] }, [ 'character_image' ]);
                const imageExists = hasAssetVersion(character.assets, "character_image", version);

                if (imageExists) {
                    console.log(` → Found existing image for: ${character.name}`);
                } else {

                    console.log(` → Generating: ${character.name}`);
                    try {

                        const imagePrompt = buildCharacterImagePrompt(character, generationRules);

                        saveAssets(
                            { projectId, characterIds: [ character.id ] },
                            [ 'character_prompt' ],
                            'text',
                            [ imagePrompt ],
                            [ { model: this.lm.textModel } ],
                            true
                        );

                        const [ imageData ] = extractGeneratedResponse("image", await retryLlmCall(
                            (params) => this.imageModel.generateImages({
                                prompt: params.prompt,
                                config: {
                                    abortSignal: this.options?.signal,
                                    numberOfImages: 1,
                                    seed: Math.floor(Math.random() * 1000000),
                                    aspectRatio: aspectRatios.vertical.aspectRatio,
                                    outputMimeType: imageMimeType
                                }
                            }),
                            { prompt: imagePrompt },
                            {
                                attempt: version,
                                maxRetries: this.qualityAgent.qualityConfig.safetyRetries + version,
                                initialDelay: this.ASSET_GEN_COOLDOWN_MS,
                                projectId
                            },
                            async (error, attempt, params) => {
                                incrementAttempt(error.message, "BACKOFF_RETRY");
                                return { attempt, params };
                            }
                        ), "google");

                        const imageBuffer = Buffer.from(imageData, "base64");
                        const imagePath = this.storageManager.getObjectPath({ type: "character_image", projectId, characterId: character.id, version });
                        const gcsUri = await this.storageManager.uploadBuffer(imageBuffer, imagePath, imageMimeType);

                        saveAssets(
                            { projectId, characterIds: [ character.id ] },
                            [ 'character_image' ],
                            'image',
                            [ gcsUri ],
                            [ { model: this.lm.imageModel, prompt: imagePrompt } ],
                            true
                        );

                        console.log(` ✓ Saved character image: ${this.storageManager.getPublicUrl(gcsUri)}`);
                    } catch (error) {
                        console.error(` ✗ Failed to generate image for ${character.name}:`, error);
                        throw error;
                    }
                }
            }
        }

        const finalizedCharacters = characters.map(character => ({
            ...character,
            state: CharacterState.parse({
                lastSeen: character.state?.lastSeen || undefined,
                position: character.state?.position || "center",
                lastExitDirection: character.state?.lastExitDirection || "none",
                emotionalState: character.state?.emotionalState || "neutral",
                emotionalHistory: character.state?.emotionalHistory || [],
                injuries: character.state?.injuries || [],
                dirtLevel: character.state?.dirtLevel || "clean",
                exhaustionLevel: character.state?.exhaustionLevel || "fresh",
                costumeCondition: character.state?.costumeCondition || {
                    tears: [],
                    stains: [],
                    wetness: "dry"
                }
            })
        }));

        return { data: { characters: finalizedCharacters }, metadata: { model: this.lm.imageModel, attempts: 1, acceptedAttempt: 1 } };
    }

    async generateLocationAssets(
        locations: Location[],
        generationRules: string[],
        saveAssets: SaveAssetsCallback,
        incrementAttempt: IncrementAttemptHook,
        recordMetrics: RecordMetricsCallback
    ): Promise<GenerativeResultGenerateLocationAssets> {

        const projectId = locations[ 0 ].projectId;

        if (EXECUTION_MODE === "PARALLEL") {
            const contextMap = new Map<string, { location: Location, version: number, prompt: string; }>();

            await QualityRetryHandler.executeBatch(
                locations,
                {
                    qualityConfig: this.qualityAgent.qualityConfig,
                    context: {
                        projectId,
                        assetKey: 'location_image',
                        attempt: 1,
                        sceneId: 'batch-location',
                        sceneIndex: -1,
                        maxAttempts: this.qualityAgent.qualityConfig.maxRetries
                    }
                },
                {
                    generate: async (batchItems, attempt) => {
                        const batchRequests: GenerateBatchImagesParameters[ 'requests' ] = [];

                        for (const location of batchItems) {
                            let ctx = contextMap.get(location.id);
                            if (!ctx) {
                                const [ version ] = await this.assetManager.getNextVersionNumber(
                                    { projectId, locationIds: [ location.id ] },
                                    [ 'location_image' ]
                                );

                                const prompt = buildLocationImagePrompt(location, generationRules);
                                ctx = { location, version, prompt };
                                contextMap.set(location.id, ctx);

                                saveAssets(
                                    { projectId, locationIds: [ location.id ] },
                                    [ 'location_prompt' ],
                                    'text',
                                    [ prompt ],
                                    [ { model: this.lm.textModel } ],
                                    true
                                );
                            }

                            batchRequests.push({
                                contents: [ { role: "user", parts: [ { text: ctx.prompt } ] } ],
                                metadata: { custom_id: location.id, version: ctx.version, assetKey: "location_image" },
                                config: {
                                    abortSignal: this.options?.signal,
                                    candidateCount: 1,
                                    responseModalities: [ Modality.IMAGE ],
                                    seed: Math.floor(Math.random() * 1000000),
                                    imageConfig: {
                                        ...aspectRatios.widescreen,
                                        outputMimeType: imageMimeType
                                    }
                                }
                            });
                        }

                        if (batchRequests.length === 0) return [];

                        console.log({ projectId, count: batchRequests.length, attempt }, `Submitting batch generation for locations`);

                        try {
                            const results = await this.imageModel.generateBatchImages({
                                projectId,
                                model: this.imageModel.imageModel,
                                requests: batchRequests,
                                config: {
                                    abortSignal: this.options?.signal,
                                    dest: { gcsUri: this.storageManager.getObjectPath({ type: 'batch', projectId, uniqueId: Date.now().toString() }) },
                                    displayName: `LocBatch-Attempt${attempt}`
                                }
                            });

                            return Promise.all(results.map(async res => {
                                const item = batchItems.find(i => i.id === res.customId);
                                if (!item) return { id: res.customId, error: new Error("Unknown result ID") };

                                if (res.status !== "SUCCESS") {
                                    return { id: item.id, error: res.error || new Error("Batch generation failed") };
                                }

                                try {
                                    const ctx = contextMap.get(item.id)!;
                                    const imageBuffer = Buffer.from(res.imageBytes, "base64");
                                    const outputPath = this.storageManager.getObjectPath({ projectId, locationId: item.id, type: "location_image", version: ctx.version });
                                    const src = await this.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);

                                    saveAssets(
                                        { projectId, locationIds: [ item.id ] },
                                        [ 'location_image' ],
                                        'image',
                                        [ src ],
                                        [ { model: this.lm.imageModel, prompt: ctx.prompt } ],
                                        true
                                    );

                                    recordMetrics([ {
                                        entityId: item.id,
                                        assetKey: 'location_image',
                                        finalScore: 0,
                                        attemptNumber: attempt,
                                        ruleAdded: [],
                                        corrections: []
                                    } ]).catch((error) => { console.error({ error, projectId: item.projectId }, `Failed to record metric`); });

                                    return { id: item.id, output: src };
                                } catch (e) {
                                    return { id: item.id, error: e };
                                }
                            }));
                        } catch (e) {
                            return batchItems.map(i => ({ id: i.id, error: e }));
                        }
                    },
                    evaluate: async () => ({ score: 1, grade: 'A', reasoning: 'Pass', pass: true } as any),
                    applyCorrections: async (item) => item,
                    calculateScore: (e) => e.score,
                    onRetry: async (error, item, attempt, delay) => {
                        incrementAttempt(error.message, "BACKOFF_RETRY");
                    }
                }
            );
        } else {

            for (const location of locations) {

                console.log(`\n🎨 Checking for existing reference images for ${locations.length} locations...`);
                const [ version ] = await this.assetManager.getNextVersionNumber({ projectId, locationIds: [ location.id ] }, [ 'location_image' ]);
                const imagePath = this.storageManager.getObjectPath({ type: "location_image", projectId, locationId: location.id, version });
                const imageExists = hasAssetVersion(location.assets, 'location_image', version);

                if (imageExists) {
                    console.log(` → Found existing image for: ${location.name}`);
                } else {

                    console.log(` → Generating: ${location.name}`);
                    try {

                        const imagePrompt = buildLocationImagePrompt(location, generationRules);

                        const [ imageData ] = extractGeneratedResponse("image", await retryLlmCall(
                            (params) => {
                                return this.imageModel.generateImages({
                                    prompt: params.prompt,
                                    config: {
                                        abortSignal: this.options?.signal,
                                        numberOfImages: 1,
                                        seed: Math.floor(Math.random() * 1000000),
                                        aspectRatio: aspectRatios.widescreen.aspectRatio,
                                        outputMimeType: imageMimeType
                                    }
                                });
                            },
                            {
                                prompt: imagePrompt,
                            },
                            {
                                attempt: version,
                                maxRetries: this.qualityAgent.qualityConfig.maxRetries + version,
                                initialDelay: this.ASSET_GEN_COOLDOWN_MS,
                                projectId: location.projectId
                            },
                            async (error, attempt, params) => {
                                incrementAttempt(error.message, "BACKOFF_RETRY");
                                return {
                                    attempt,
                                    params,
                                };
                            },
                        ),
                            "google"
                        );

                        const imageBuffer = Buffer.from(imageData, "base64");
                        const imagePath = this.storageManager.getObjectPath({ type: "location_image", projectId, locationId: location.id, version });
                        const gcsUrl = await this.storageManager.uploadBuffer(
                            imageBuffer,
                            imagePath,
                            imageMimeType,
                        );

                        saveAssets(
                            { projectId, locationIds: [ location.id ] },
                            [ 'location_image' ],
                            'image',
                            [ gcsUrl ],
                            [ { model: this.lm.imageModel, prompt: imagePrompt } ],
                            true
                        );

                        saveAssets(
                            { projectId, locationIds: [ location.id ] },
                            [ 'location_prompt' ],
                            'text',
                            [ imagePrompt ],
                            [ { model: this.lm.textModel } ],
                            true
                        );

                        console.log(` ✓ Saved: ${this.storageManager.getPublicUrl(gcsUrl)}`);
                        // if (onProgress) { await onProgress(location.id, `Reference image generation complete.`, "complete"); }

                    } catch (error) {
                        console.error(` ✗ Failed to generate image for ${location.name}:`, error);
                        throw error;
                    }
                }
            }
        }

        // Ensure all locations have their state initialized with enhanced temporal tracking.

        const updatedLocations = locations.map(loc => {
            const state = LocationState.parse({
                ...loc.state,
                weather: loc.state?.weather || loc.weather,
                lighting: loc.state?.lighting || loc.lightingConditions,
            });
            return {
                ...loc,
                state
            };
        });

        return { data: { locations: updatedLocations }, metadata: { model: this.lm.imageModel, attempts: 1, acceptedAttempt: 1 } };
    }

    /**
     * Use state evolution logic to track progressive narrative changes
     * across scenes
     */
    updateNarrativeState(
        scene: Scene,
        currentStoryboardState: Project
    ): Project {

        const updatedCharacters = currentStoryboardState.characters.map((char: Character) => {
            if (scene.characterIds.includes(char.id)) {
                // Evolve character state based on scene narrative
                const evolvedState = evolveCharacterState(char, scene, scene.description);
                return {
                    ...char,
                    state: evolvedState
                };
            }
            return char;
        });

        const updatedLocations = currentStoryboardState.locations.map((loc: Location) => {
            if (loc.id === scene.locationId) {
                // Evolve location state based on scene narrative
                const evolvedState = evolveLocationState(loc, scene, scene.description);
                return {
                    ...loc,
                    state: evolvedState
                };
            }
            return loc;
        });

        // Update the specific scene in the scenes array with the latest generation data
        const updatedScenes = currentStoryboardState.scenes.map((s: Scene) => {
            if (s.id === scene.id) {
                return scene;
            }
            return s;
        });

        return {
            ...currentStoryboardState,
            characters: updatedCharacters,
            locations: updatedLocations,
            scenes: updatedScenes
        };
    }
}
