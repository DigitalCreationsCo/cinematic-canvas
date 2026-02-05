import {
    retryLlmCall,
} from "../utils/llm-retry.js";
import {
    Character,
    Scene,
    Location,
    Storyboard,
    Project,
    AssetStatus,
    LocationState,
    AssetKey,
    CharacterState,
} from "../types/index.js";
import { GCPStorageManager } from "../services/storage-manager.js";
import { Modality } from "@google/genai";
import { FrameCompositionAgent } from "./frame-composition-agent.js";
import { buildCharacterImagePrompt } from "../prompts/character-image-instruction.js";
import { buildLocationImagePrompt } from "../prompts/location-image-instruction.js";
import { composeEnhancedSceneGenerationPromptMetav1, composeEnhancedSceneGenerationPromptMetav2, composeGenerationRules } from "../prompts/prompt-composer.js";
import { TextModelController } from "../llm/text-model-controller.js";
import { GenerateBatchContentParameters } from "../llm/provider-types.js";
import { imageModelName, textModelName } from "../llm/google/models.js";
import { ThinkingLevel } from "@google/genai";
import { buildllmParams } from "../llm/google/google-llm-params.js";
import { QualityCheckAgent } from "./quality-check-agent.js";
import { evolveCharacterState, evolveLocationState } from "./state-evolution.js";
import { GraphInterrupt } from "@langchain/langgraph";
import { cleanJsonOutput } from "../utils/utils.js";
import { getAllBestFromAssets, hasAssetVersion } from "../utils/assets-utils.js";
import { AssetVersionManager } from "../services/asset-version-manager.js";
import { SaveAssetsCallback, UpdateScenesCallback, IncrementAttemptHook } from "../types/index.js";
import { GenerativeResultEnvelope, GenerativeResultGenerateCharacterAssets, GenerativeResultGenerateLocationAssets, GenerativeResultGenerateSceneFrames, JobGenerateCharacterAssets, JobGenerateLocationAssets, JobGenerateSceneFrames } from "../types/job.types.js";
import { aspectRatios, EXECUTION_MODE, imageMimeType } from "../config.js";
import { extractGeneratedResponse } from "../llm/parts-extractor.js";



export class ContinuityManagerAgent {
    private llm: TextModelController;
    private imageModel: TextModelController;
    private storageManager: GCPStorageManager;
    private assetManager: AssetVersionManager;
    private frameComposer: FrameCompositionAgent;
    private qualityAgent: QualityCheckAgent;
    private ASSET_GEN_COOLDOWN_MS = 60000;
    private options?: { signal?: AbortSignal; };

    constructor(
        llm: TextModelController,
        imageModel: TextModelController,
        frameComposer: FrameCompositionAgent,
        qualityAgent: QualityCheckAgent,
        storageManager: GCPStorageManager,
        assetManager: AssetVersionManager,
        options?: { signal?: AbortSignal; }
    ) {
        this.llm = llm;
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
        startFrame?: string;
        characterReferenceImages?: string[];
        locationReferenceImages?: string[];
        sceneCharacters: Character[];
        location: Location;
        previousScene: Scene | undefined;
        generationRules: string[];
    }> {

        if (!state.metadata) throw new Error("No metadata available");
        if (!state.characters) throw new Error("No characters data available");
        if (!state.locations) throw new Error("No locations data available");
        if (!state.scenes) throw new Error("No scenes data available");

        const { characters, locations, scenes } = state;
        const generationRules = state.generationRules || [];

        const previousSceneIndex = scenes.findIndex(s => s.id === scene.id) - 1;
        const previousScene = previousSceneIndex >= 0 ? scenes[ previousSceneIndex ] : undefined;

        const charactersInScene = characters.filter(char =>
            scene.characterIds.includes(char.id)
        );
        const characterReferenceImages = charactersInScene.flatMap(c => {
            const assets = getAllBestFromAssets(c.assets);
            return assets[ 'character_image' ]?.data ? [ assets[ 'character_image' ].data ] : [];
        });

        const locationInScene = locations.find(loc => loc.id === scene.locationId)!;
        const locationAssets = getAllBestFromAssets(locationInScene?.assets);
        const locationReferenceImages = locationAssets[ 'location_image' ]?.data ? [ locationAssets[ 'location_image' ].data ] : [];

        let prompt = "";
        if (overridePrompt) {
            prompt = overridePrompt;
        } else {
            const [ promptAsset ] = await this.assetManager.getBestVersion(
                { projectId: scene.projectId, sceneIds: [ scene.id ] },
                [ 'scene_prompt' ]
            );
            if (promptAsset) {
                prompt = promptAsset.data;
                console.log({ sceneId: scene.id, projectId: scene.projectId }, `Using prompt override for Scene`);
            } else {
                console.log({ sceneId: scene.id, projectId: scene.projectId }, ` Prompt not found.`);
            }
        }

        if (!prompt) {
            console.log({ sceneId: scene.id, projectId: scene.projectId }, `Generating enhanced video prompt for Scene`);
            let metaPrompt = composeEnhancedSceneGenerationPromptMetav1(
                scene,
                charactersInScene,
                locations,
                previousScene,
            );

            console.log(`   📝 Meta-Prompt Instructions (First 500 chars):\n${metaPrompt.substring(0, 500)}...`);

            const params = buildllmParams({
                contents: metaPrompt,
                config: {
                    abortSignal: this.options?.signal,
                    thinkingConfig: {
                        thinkingLevel: ThinkingLevel.HIGH
                    }
                }
            });
            const response = await this.llm.generateContent(params);
            if (!response.text) {
                console.warn("   ⚠️ LLM failed to generate enhanced prompt. Using metaPrompt as fallback.");
                prompt = metaPrompt;
            } else {
                prompt = cleanJsonOutput(response.text);
            }
            prompt += composeGenerationRules(generationRules);
            saveAssets(
                { projectId: scene.projectId, sceneIds: [ scene.id ] },
                [ 'scene_prompt' ],
                'text',
                [ prompt ],
                [ { model: params.model, prompt: metaPrompt } ]
            );
            console.log(`   ✨ Generated Video Prompt:\n"${prompt}"`);
        }

        return {
            enhancedPrompt: prompt,
            generationRules,
            startFrame: previousScene ? getAllBestFromAssets(previousScene.assets)[ 'scene_end_frame' ]?.data : undefined,
            sceneCharacters: charactersInScene,
            location: locationInScene,
            characterReferenceImages,
            locationReferenceImages,
            previousScene,
        };
    }

    // async generateCharacterAssets(
    //     characters: Character[],
    //     generationRules: string[],
    //     saveAssets: SaveAssetsCallback,
    //     incrementAttempt: IncrementAttemptHook,
    // ): Promise<GenerativeResultGenerateCharacterAssets> {

    //     const charactersToGenerateIds: string[] = [];
    //     const charactersToGenerate: Character[] = [];
    //     const updatedCharacters: Character[] = [ ...characters ];
    //     for (const character of characters) {
    //         const assets = getAllBestFromAssets(character.assets);
    //         if (!assets[ 'character_image' ]?.data) {

    //             console.log(`  → No image found for: ${character.name}. Queued for generation.`);
    //             charactersToGenerateIds.push(character.id);
    //             charactersToGenerate.push(character);
    //         }
    //     }

    //     console.log(`\n🎨 Generating reference images for ${charactersToGenerate.length} characters...`);
    //     if (charactersToGenerate.length > 0) {
    //         for (const [ index, character ] of charactersToGenerate.entries()) {
    //             const [ version ] = await this.assetManager.getNextVersionNumber({ projectId: character.projectId, characterIds: [ character.id ] }, 'character_image');

    //             const imagePrompt = buildCharacterImagePrompt(character, generationRules);

    //             saveAssets(
    //                 { projectId: character.projectId, characterIds: [ character.id ] },
    //                 'character_prompt',
    //                 'text',
    //                 [ imagePrompt ],
    //                 [{ model: textModelName }],
    //                 true
    //             );

    //             console.log(`\n🎨 Checking for existing reference images for ${characters.length} characters...`);
    //             const imagePath = this.storageManager.getObjectPath({ type: "character_image", characterId: character.id, version });
    //             const imageExists = await this.storageManager.fileExists(imagePath);
    //             if (imageExists) {
    //                 console.log(`  → Found existing image for: ${character.name}`);
    //                 const imageUrl = this.storageManager.getGcsUrl(imagePath);
    //                 const publicImage = this.storageManager.getPublicUrl(imageUrl);

    //                 saveAssets(
    //                     { projectId: character.projectId, characterIds: [ character.id ] },
    //                     'character_image',
    //                     'image',
    //                     [ publicImage ],
    //                     [{ model: imageModelName, prompt: imagePrompt }],
    //                     true
    //                 );
    //             } else {
    //                 console.log(`  → Generating: ${character.name}`);

    //                 try {
    //                     const maxRetries = this.qualityAgent.qualityConfig.safetyRetries + version;
    //                     const outputMimeType = "image/png";
    //                     const result = await retryLlmCall(
    //                         (params) => this.imageModel.generateContent({
    //                             model: params.imageModel,
    //                             contents: [ params.prompt ],
    //                             config: {
    //                                 abortSignal: this.options?.signal,
    //                                 candidateCount: 1,
    //                                 responseModalities: [ Modality.IMAGE ],
    //                                 seed: Math.floor(Math.random() * 1000000),
    //                                 imageConfig: {
    //                                     outputMimeType: outputMimeType
    //                                 }
    //                             }
    //                         }),
    //                         {
    //                             prompt: imagePrompt,
    //                             imageModel: imageModelName,
    //                         },
    //                         {
    //                             attempt: version,
    //                             maxRetries,
    //                             initialDelay: this.ASSET_GEN_COOLDOWN_MS,
    //                             projectId: character.projectId
    //                         },
    //                         async (error, attempt, params) => {
    //                             incrementAttempt(error.message, "BACKOFF_RETRY");
    //                             return {
    //                                 attempt,
    //                                 params
    //                             };
    //                         }
    //                     );
    //                     if (!result.candidates || result.candidates?.[ 0 ]?.content?.parts?.length === 0) {
    //                         throw new Error("Image generation failed to return any images.");
    //                     }

    //                     const generatedImageData = result.candidates[ 0 ].content?.parts?.[ 0 ]?.inlineData?.data;
    //                     if (!generatedImageData) {
    //                         throw new Error("Generated image is missing inline data.");
    //                     }

    //                     const imageBuffer = Buffer.from(generatedImageData, "base64");
    //                     const imagePath = this.storageManager.getObjectPath({ type: "character_image", characterId: character.id, version });
    //                     const imageUrl = await this.storageManager.uploadBuffer(
    //                         imageBuffer,
    //                         imagePath,
    //                         outputMimeType,
    //                     );
    //                     const publicUrl = this.storageManager.getPublicUrl(imageUrl);

    //                     saveAssets(
    //                         { projectId: character.projectId, characterIds: [ character.id ] },
    //                         'character_image',
    //                         'image',
    //                         [ publicUrl ],
    //                         [{ model: imageModelName, prompt: imagePrompt }],
    //                         true
    //                     );

    //                     console.log(` ✓ Saved character image: ${publicUrl}`);
    //                     // if (onProgress) { await onProgress(character.id, `Reference image generation complete.`, "complete"); }

    //                 } catch (error) {
    //                     console.error(`    ✗ Failed to generate image for ${character.name}:`, error);
    //                     if (error instanceof GraphInterrupt) throw error;
    //                     // if (onProgress) { await onProgress(character.id, `Reference image generation failed: ${(error as Error).message}`, "error"); }
    //                 }
    //             }
    //         }
    //     }

    //     // Ensure all characters have their state initialized with enhanced temporal tracking.
    //     const finalizedCharacters = updatedCharacters.map(character => ({
    //         ...character,
    //         state: {
    //             lastSeen: character.state?.lastSeen || undefined,
    //             position: character.state?.position || "center",
    //             lastExitDirection: character.state?.lastExitDirection || "none",
    //             emotionalState: character.state?.emotionalState || "neutral",
    //             emotionalHistory: character.state?.emotionalHistory || [],
    //             physicalCondition: character.state?.physicalCondition || "healthy",
    //             injuries: character.state?.injuries || [],
    //             dirtLevel: character.state?.dirtLevel || "clean",
    //             exhaustionLevel: character.state?.exhaustionLevel || "fresh",
    //             sweatLevel: character.state?.sweatLevel || "dry",
    //             costumeCondition: character.state?.costumeCondition || {
    //                 tears: [],
    //                 stains: [],
    //                 wetness: "dry",
    //                 damage: [],
    //             },
    //             hairCondition: character.state?.hairCondition || {
    //                 style: character.physicalTraits.hair,
    //                 messiness: "pristine",
    //                 wetness: "dry",
    //             },

    //         }
    //     }));
    //     return { data: { characters: finalizedCharacters }, metadata: { model: imageModelName, attempts: 1, acceptedAttempt: 1 } };
    // }


    // async generateSceneFramesBatch(
    //     project: Project,
    //     assetKey: 'scene_start_frame' | 'scene_end_frame',
    //     saveAssets: SaveAssetsCallback,
    //     updateScene: UpdateScenesCallback,
    //     incrementAttempt: IncrementAttemptHook,
    // ): Promise<GenerativeResultGenerateSceneFrames> {
    //     console.log(`\n🖼️ Generating ${assetKey} for ${project.scenes.length} scenes in batch...`);
    //     const updatedScenes: Scene[] = [];

    //     for (const scene of project.scenes) {
    //         const previousSceneIndex = project.scenes.findIndex(s => s.id === scene.id) - 1;
    //         const previousScene = previousSceneIndex >= 0 ? project.scenes[ previousSceneIndex ] : undefined;

    //         let currentScene = { ...scene };

    //         const sceneCharacters = project.characters.filter(char => currentScene.characterIds.includes(char.id));
    //         const sceneLocations = project.locations.filter(loc => currentScene.locationId.includes(loc.id));

    //         // --- Generate Start Frame ---
    //         const currentAssets = getAllBestFromAssets(currentScene.assets);
    //         const frame = currentAssets[ assetKey ]?.data;
    //         if (!frame) {
    //             const [ version ] = await this.assetManager.getNextVersionNumber({ projectId: project.id, sceneId: scene.id }, assetKey);
    //             const framePath = this.storageManager.getObjectPath({ type: assetKey, sceneId: scene.id, version });
    //             const frameExists = await this.storageManager.fileExists(framePath);

    //             const promptKey = assetKey === "scene_start_frame" ? "start_frame_prompt" : "end_frame_prompt";
    //             let framePrompt = currentAssets[ promptKey ]?.data;
    //             if (!framePrompt) {
    //                 console.warn(`No ${promptKey} found for Scene ${scene.sceneIndex + 1}`);

    //                 // Reconstruct the prompt for state consistency
    //                 framePrompt = await this.frameComposer.generateFrameGenerationPrompt(
    //                     assetKey === "scene_start_frame" ? "start" : "end",
    //                     currentScene,
    //                     sceneCharacters,
    //                     sceneLocations,
    //                     previousScene,
    //                     project.generationRules
    //                 );

    //                 saveAssets(
    //                     { projectId: project.id, sceneId: scene.id },
    //                     promptKey,
    //                     'text',
    //                     [ framePrompt ],
    //                     [{ model: textModelName }],
    //                     true
    //                 );
    //             }

    //             if (frameExists) {
    //                 console.log(`  → Found existing ${assetKey} for Scene ${scene.id} in storage`);
    //                 const gcsUrl = this.storageManager.getGcsUrl(framePath);
    //                 const publicUrl = this.storageManager.getPublicUrl(gcsUrl);

    //                 saveAssets(
    //                     { projectId: project.id, sceneId: scene.id },
    //                     assetKey,
    //                     'image',
    //                     [ publicUrl ],
    //                     [{ model: imageModelName, prompt: framePrompt }],
    //                     true
    //                 );


    //             } else {
    //                 console.log(`  → Generating ${assetKey} for Scene ${scene.id}...`);
    //                 const previousAssets = getAllBestFromAssets(previousScene?.assets);
    //                 const prevEndFrameOrSceneStartFrame =
    //                     assetKey === "scene_start_frame" ?
    //                         previousAssets[ 'scene_end_frame' ]?.data :
    //                         currentAssets[ 'scene_start_frame' ]?.data;

    //                 const charImages = sceneCharacters.flatMap(c => {
    //                     const a = getAllBestFromAssets(c.assets);
    //                     return a[ 'character_image' ]?.data ? [ a[ 'character_image' ].data ] : [];
    //                 });
    //                 const locImages = sceneLocations.flatMap(l => {
    //                     const a = getAllBestFromAssets(l.assets);
    //                     return a[ 'location_image' ]?.data ? [ a[ 'location_image' ].data ] : [];
    //                 });

    //                 await this.frameComposer.generateImage(
    //                     currentScene,
    //                     framePrompt,
    //                     assetKey === "scene_start_frame" ? "start" : "end",
    //                     sceneCharacters,
    //                     sceneLocations,
    //                     prevEndFrameOrSceneStartFrame,
    //                     [ ...charImages, ...locImages ],
    //                     saveAssets,
    //                     updateScene,
    //                     incrementAttempt,
    //                 );
    //             }
    //         } else {
    //             console.log(`  → Found existing ${assetKey} for Scene ${scene.id} in state: ${this.storageManager.getPublicUrl(frame)}`);
    //         }

    //         currentScene.progressMessage =
    //             `Saved ${assetKey}`;
    //         currentScene.status =
    //             "complete";

    //         updatedScenes.push(currentScene);

    //         sendUpdateScenes(currentScene);
    //     }
    //     return { data: { updatedScenes }, metadata: { model: imageModelName, attempts: 1, acceptedAttempt: 1 } };
    // }

    // async generateLocationAssets(
    //     locations: Location[],
    //     generationRules: string[],
    //     saveAssets: SaveAssetsCallback,
    //     incrementAttempt: IncrementAttemptHook,
    // ): Promise<GenerativeResultGenerateLocationAssets> {

    //     const locationsToGenerateIds: string[] = [];
    //     const locationsToGenerate: Location[] = [];
    //     let updatedLocations: Location[] = [ ...locations ];
    //     for (const loc of locations) {
    //         const assets = getAllBestFromAssets(loc.assets);
    //         if (!assets[ 'location_image' ]?.data) {

    //             console.log(`  → No image found for: ${loc.name}. Queued for generation.`);
    //             locationsToGenerateIds.push(loc.id);
    //             locationsToGenerate.push(loc);
    //         }
    //     }

    //     console.log(`\n🎨 Generating reference images for ${locationsToGenerate.length} locations...`);
    //     if (locationsToGenerate.length > 0) {
    //         for (const [ index, location ] of locationsToGenerate.entries()) {
    //             const [ version ] = await this.assetManager.getNextVersionNumber({ projectId: location.projectId, locationIds: [ location.id ] }, 'location_image');

    //             const imagePrompt = buildLocationImagePrompt(location, generationRules);

    //             saveAssets(
    //                 { projectId: location.projectId, locationIds: [ location.id ] },
    //                 'location_prompt',
    //                 'text',
    //                 [ imagePrompt ],
    //                 [{ model: textModelName }],
    //                 true
    //             );

    //             console.log(`\n🎨 Checking for existing reference images for ${locations.length} locations...`);
    //             const imagePath = this.storageManager.getObjectPath({ type: "location_image", locationId: location.id, version });
    //             const imageExists = await this.storageManager.fileExists(imagePath);

    //             if (imageExists) {
    //                 console.log(`  → Found existing image for: ${location.name}`);
    //                 const imageUrl = this.storageManager.getGcsUrl(imagePath);
    //                 const publicUrl = this.storageManager.getPublicUrl(imageUrl);

    //                 saveAssets(
    //                     { projectId: location.projectId, locationIds: [ location.id ] },
    //                     'location_image',
    //                     'image',
    //                     [ publicUrl ],
    //                     [{ model: imageModelName }],
    //                     true
    //                 );
    //             } else {
    //                 console.log(`  → Generating: ${location.name}`);

    //                 const imagePrompt = buildLocationImagePrompt(location, generationRules);
    //                 try {
    //                     const maxRetries = this.qualityAgent.qualityConfig.maxRetries + version;
    //                     const outputMimeType = "image/png";
    //                     const result = await retryLlmCall(
    //                         (params) => {
    //                             return this.imageModel.generateContent({
    //                                 model: params.model,
    //                                 contents: [ params.prompt ],
    //                                 config: {
    //                                     abortSignal: this.options?.signal,
    //                                     candidateCount: 1,
    //                                     responseModalities: [ Modality.IMAGE ],
    //                                     seed: Math.floor(Math.random() * 1000000),
    //                                     imageConfig: {
    //                                         outputMimeType: outputMimeType
    //                                     }
    //                                 }
    //                             });
    //                         },
    //                         {
    //                             prompt: imagePrompt,
    //                             model: imageModelName
    //                         },
    //                         {
    //                             attempt: version,
    //                             maxRetries,
    //                             initialDelay: this.ASSET_GEN_COOLDOWN_MS,
    //                             projectId: location.projectId
    //                         },
    //                         async (error, attempt, params) => {
    //                             incrementAttempt(error.message, "BACKOFF_RETRY");
    //                             return {
    //                                 attempt,
    //                                 params,
    //                             };
    //                         }
    //                     );
    //                     if (!result.candidates || result.candidates?.[ 0 ]?.content?.parts?.length === 0) {
    //                         throw new Error("Image generation failed to return any images.");
    //                     }

    //                     const generatedImageData = result.candidates[ 0 ].content?.parts?.[ 0 ]?.inlineData?.data;
    //                     if (!generatedImageData) {
    //                         throw new Error("Generated image is missing inline data.");
    //                     }

    //                     const imageBuffer = Buffer.from(generatedImageData, "base64");
    //                     const imagePath = this.storageManager.getObjectPath({ type: "location_image", locationId: location.id, version });
    //                     const gcsUrl = await this.storageManager.uploadBuffer(
    //                         imageBuffer,
    //                         imagePath,
    //                         outputMimeType,
    //                     );
    //                     const publicUrl = this.storageManager.getPublicUrl(gcsUrl);

    //                     saveAssets(
    //                         { projectId: location.projectId, locationIds: [ location.id ] },
    //                         'location_image',
    //                         'image',
    //                         [ publicUrl ],
    //                         [{ model: imageModelName, prompt: imagePrompt }],
    //                         true
    //                     );

    //                     saveAssets(
    //                         { projectId: location.projectId, locationIds: [ location.id ] },
    //                         'location_prompt',
    //                         'text',
    //                         [ imagePrompt ],
    //                         [{ model: textModelName }],
    //                         true
    //                     );
    //                     console.log(`    ✓ Saved: ${publicUrl}`);
    //                     // if (onProgress) { await onProgress(location.id, `Reference image generation complete.`, "complete"); }

    //                 } catch (error) {
    //                     console.error(`    ✗ Failed to generate image for ${location.name}:`, error);
    //                     if (error instanceof GraphInterrupt) throw Error;
    //                     // if (onProgress) { await onProgress(location.id, `Reference image generation failed: ${(error as Error).message}`, "error"); }
    //                 }
    //             }
    //         }
    //     }

    //     // Ensure all locations have their state initialized with enhanced temporal tracking.
    //     updatedLocations = updatedLocations.map(location => {
    //         const state = LocationState.parse({
    //             ...location.state,
    //             weather: location.state?.weather || location.weather,
    //             lighting: location.state?.lighting || location.lightingConditions,
    //         });
    //         return {
    //             ...location,
    //             state
    //         };
    //     });

    //     return { data: { locations: updatedLocations }, metadata: { model: imageModelName, attempts: 1, acceptedAttempt: 1 } };
    // }

    async generateCharacterAssets(
        characters: Character[],
        generationRules: string[],
        saveAssets: SaveAssetsCallback,
        incrementAttempt: IncrementAttemptHook,
    ): Promise<GenerativeResultGenerateCharacterAssets> {

        if (EXECUTION_MODE === "PARALLEL") {
            const pendingMap = new Map<string, { character: Character, version: number, prompt: string; }>();
            const batchRequests: GenerateBatchContentParameters[ 'requests' ] = [];

            for (const character of characters) {

                const [ version ] = await this.assetManager.getNextVersionNumber(
                    { projectId: character.projectId, characterIds: [ character.id ] },
                    [ 'character_image' ]
                );

                const prompt = buildCharacterImagePrompt(character, generationRules);

                pendingMap.set(character.id, { character, version, prompt });

                batchRequests.push({
                    contents: [ { role: 'user', parts: [ { text: prompt } ] } ],
                    metadata: { custom_id: character.id, version },
                    model: imageModelName,
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

                saveAssets(
                    { projectId: character.projectId, characterIds: [ character.id ] },
                    [ 'character_prompt' ],
                    'text',
                    [ prompt ],
                    [ { model: textModelName } ],
                    true
                );
            }

            if (batchRequests.length === 0) {
                return { data: { characters }, metadata: { model: imageModelName, attempts: 0, acceptedAttempt: 0 } };
            }

            console.log({ projectId: characters[ 0 ].projectId, batchRequests: batchRequests.length }, `Submitting batch generation for characters`);

            // Batch job completion is awaited by the model controller
            let batchJob = await this.imageModel.generateBatchImages({
                model: imageModelName,
                requests: batchRequests,
                config: {
                    abortSignal: this.options?.signal,
                    dest: this.storageManager.getGcsUrl(this.storageManager.getProjectPath('characters')),
                    displayName: this.generateCharacterAssets.name,
                }
            });

            const results = await this.storageManager.processImageBatchResults(batchJob.dest?.gcsUri!);

            const successfulResults = results.filter(r => r.status === "SUCCESS");
            const srcs: string[] = [];
            const customIds: string[] = [];
            const versions: number[] = [];
            const metadatas: any[] = [];

            for (const result of successfulResults) {
                const context = pendingMap.get(result.custom_id);

                if (context) {
                    srcs.push(result.src);
                    customIds.push(context.character.id);
                    versions.push(context.version);
                    metadatas.push({
                        model: imageModelName,
                        prompt: context.prompt,
                        jobId: batchJob.name,
                    });
                }
            }

            if (srcs.length > 0) {
                saveAssets(
                    { projectId: characters[ 0 ].projectId, characterIds: customIds },
                    [ 'character_image' ],
                    'image',
                    srcs,
                    metadatas,
                    true
                );

                //         console.log(` ✓ Saved batch result for: ${character.name}`);
                //     } else if(context && result.error) {
                //     console.error(` ✗ Batch item failed for ${context.character.name}: ${result.error.message}`);
                //     incrementAttempt(result.error.message, "BATCH_PARTIAL_FAIL");
                // }
            }

            const failedResults = results.filter(r => r.status !== "SUCCESS");
            if (failedResults.length > 0) {
                failedResults.forEach(err => {
                    const context = pendingMap.get(err.custom_id);
                    const errorMsg = err.error?.message || "Unknown batch error";

                    console.error(` ✗ Batch item failed for ${context?.character.name ?? err.custom_id}: ${errorMsg}`);

                    // Push to your metrics/retry queue
                    // incrementAttempt(errorMsg, "BATCH_PARTIAL_FAIL");
                    incrementAttempt(errorMsg, "BACKOFF_RETRY");
                });
            }
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
                            { projectId: character.projectId, characterIds: [ character.id ] },
                            [ 'character_prompt' ],
                            'text',
                            [ imagePrompt ],
                            [ { model: textModelName } ],
                            true
                        );

                        const [ imageData ] = extractGeneratedResponse("image", await retryLlmCall(
                            (params) => this.imageModel.generateContent({
                                model: imageModelName,
                                contents: [ params.prompt ],
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
                            }),
                            { prompt: imagePrompt },
                            {
                                attempt: version,
                                maxRetries: this.qualityAgent.qualityConfig.safetyRetries + version,
                                initialDelay: this.ASSET_GEN_COOLDOWN_MS,
                                projectId: character.projectId
                            },
                            async (error, attempt, params) => {
                                incrementAttempt(error.message, "BACKOFF_RETRY");
                                return { attempt, params };
                            }
                        ), "google");

                        const imageBuffer = Buffer.from(imageData, "base64");
                        const imagePath = this.storageManager.getObjectPath({ type: "character_image", characterId: character.id, version });
                        const gcsUri = await this.storageManager.uploadBuffer(imageBuffer, imagePath, imageMimeType);

                        saveAssets(
                            { projectId: character.projectId, characterIds: [ character.id ] },
                            [ 'character_image' ],
                            'image',
                            [ gcsUri ],
                            [ { model: imageModelName, prompt: imagePrompt } ],
                            true
                        );

                        console.log(` ✓ Saved character image: ${this.storageManager.getPublicUrl(gcsUri)}`);
                    } catch (error) {
                        console.error(` ✗ Failed to generate image for ${character.name}:`, error);
                        if (error instanceof GraphInterrupt) throw error;
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
                physicalCondition: character.state?.physicalCondition || "healthy",
                injuries: character.state?.injuries || [],
                dirtLevel: character.state?.dirtLevel || "clean",
                exhaustionLevel: character.state?.exhaustionLevel || "fresh",
                sweatLevel: character.state?.sweatLevel || "dry",
                costumeCondition: character.state?.costumeCondition || {
                    tears: [],
                    stains: [],
                    wetness: "dry"
                }
            })
        }));

        return { data: { characters: finalizedCharacters }, metadata: { model: imageModelName, attempts: 1, acceptedAttempt: 1 } };
    }

    async generateLocationAssets(
        locations: Location[],
        generationRules: string[],
        saveAssets: SaveAssetsCallback,
        incrementAttempt: IncrementAttemptHook,
    ): Promise<GenerativeResultGenerateLocationAssets> {

        if (EXECUTION_MODE === "PARALLEL") {
            const pendingMap = new Map<string, { location: Location, version: number, prompt: string; }>();
            const batchRequests: GenerateBatchContentParameters[ 'requests' ] = [];

            for (const location of locations) {

                const [ version ] = await this.assetManager.getNextVersionNumber(
                    { projectId: location.projectId, locationIds: [ location.id ] },
                    [ 'location_image' ]
                );

                const prompt = buildLocationImagePrompt(location, generationRules);

                pendingMap.set(location.id, { location, version, prompt });

                batchRequests.push({
                    contents: [ { role: 'user', parts: [ { text: prompt } ] } ],
                    metadata: { custom_id: location.id, version },
                    model: imageModelName,
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

                saveAssets(
                    { projectId: location.projectId, locationIds: [ location.id ] },
                    [ 'location_prompt' ],
                    'text',
                    [ prompt ],
                    [ { model: textModelName } ],
                    true
                );
            }

            if (batchRequests.length === 0) {
                return { data: { locations }, metadata: { model: imageModelName, attempts: 0, acceptedAttempt: 0 } };
            }

            console.log({ projectId: locations[ 0 ].projectId, batchRequests: batchRequests.length }, `Submitting batch generation for locations`);

            // Batch job completion is awaited by the model controller
            let batchJob = await this.imageModel.generateBatchImages({
                model: imageModelName,
                requests: batchRequests,
                config: {
                    abortSignal: this.options?.signal,
                    dest: this.storageManager.getGcsUrl(this.storageManager.getProjectPath('locations')),
                    displayName: this.generateLocationAssets.name,
                }
            });

            const results = await this.storageManager.processImageBatchResults(batchJob.dest?.gcsUri!);

            const successfulResults = results.filter(r => r.status === "SUCCESS");
            const srcs: string[] = [];
            const customIds: string[] = [];
            const versions: number[] = [];
            const metadatas: any[] = [];

            for (const result of successfulResults) {
                const context = pendingMap.get(result.custom_id);

                if (context) {
                    srcs.push(result.src);
                    customIds.push(context.location.id);
                    versions.push(context.version);
                    metadatas.push({
                        model: imageModelName,
                        prompt: context.prompt,
                        jobId: batchJob.name,
                    });
                }
            }

            if (srcs.length > 0) {
                saveAssets(
                    { projectId: locations[ 0 ].projectId, locationIds: customIds },
                    [ 'location_image' ],
                    'image',
                    srcs,
                    metadatas,
                    true
                );
            }

            const failedResults = results.filter(r => r.status !== "SUCCESS");
            if (failedResults.length > 0) {
                failedResults.forEach(err => {
                    const context = pendingMap.get(err.custom_id);
                    const errorMsg = err.error?.message || "Unknown batch error";

                    console.error(` ✗ Batch item failed for ${context?.location.name ?? err.custom_id}: ${errorMsg}`);

                    // Push to your metrics/retry queue
                    // incrementAttempt(errorMsg, "BATCH_PARTIAL_FAIL");
                    incrementAttempt(errorMsg, "BACKOFF_RETRY");
                });
            }
        } else {

            for (const location of locations) {

                console.log(`\n🎨 Checking for existing reference images for ${locations.length} locations...`);
                const [ version ] = await this.assetManager.getNextVersionNumber({ projectId: location.projectId, locationIds: [ location.id ] }, [ 'location_image' ]);
                const imagePath = this.storageManager.getObjectPath({ type: "location_image", locationId: location.id, version });
                const imageExists = hasAssetVersion(location.assets, 'location_image', version);

                if (imageExists) {
                    console.log(` → Found existing image for: ${location.name}`);
                } else {

                    console.log(` → Generating: ${location.name}`);
                    try {

                        const imagePrompt = buildLocationImagePrompt(location, generationRules);

                        const [ imageData ] = extractGeneratedResponse("image", await retryLlmCall(
                            (params) => {
                                return this.imageModel.generateContent({
                                    model: imageModelName,
                                    contents: [ params.prompt ],
                                    config: {
                                        abortSignal: this.options?.signal,
                                        candidateCount: 1,
                                        responseModalities: [ Modality.IMAGE ],
                                        seed: Math.floor(Math.random() * 1000000),
                                        imageConfig: {
                                            outputMimeType: imageMimeType
                                        }
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
                        const imagePath = this.storageManager.getObjectPath({ type: "location_image", locationId: location.id, version });
                        const gcsUrl = await this.storageManager.uploadBuffer(
                            imageBuffer,
                            imagePath,
                            imageMimeType,
                        );

                        saveAssets(
                            { projectId: location.projectId, locationIds: [ location.id ] },
                            [ 'location_image' ],
                            'image',
                            [ gcsUrl ],
                            [ { model: imageModelName, prompt: imagePrompt } ],
                            true
                        );

                        saveAssets(
                            { projectId: location.projectId, locationIds: [ location.id ] },
                            [ 'location_prompt' ],
                            'text',
                            [ imagePrompt ],
                            [ { model: textModelName } ],
                            true
                        );

                        console.log(` ✓ Saved: ${this.storageManager.getPublicUrl(gcsUrl)}`);
                        // if (onProgress) { await onProgress(location.id, `Reference image generation complete.`, "complete"); }

                    } catch (error) {
                        console.error(` ✗ Failed to generate image for ${location.name}:`, error);
                        if (error instanceof GraphInterrupt) throw Error;
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

        return { data: { locations: updatedLocations }, metadata: { model: imageModelName, attempts: 1, acceptedAttempt: 1 } };
    }

    async generateSceneFramesBatch(
    project: Project,
    scenes: Scene[],
    scopeAssetKeys: ('scene_start_frame' | 'scene_end_frame')[],
    saveAssets: SaveAssetsCallback,
    sendUpdateScenes: UpdateScenesCallback,
    incrementAttempt: IncrementAttemptHook,
): Promise < GenerativeResultGenerateSceneFrames > {

    console.log({ scenes: scenes.length, scopeAssetKeys }, `\n🖼️ Preparing image batch ${scopeAssetKeys} for ${scenes.length} scenes...`);

    const pendingMap = new Map<string, { scene: Scene, assetKey: string, version: number, prompt: string; }>();
    const batchRequests: GenerateBatchContentParameters[ 'requests' ] = [];

    for(const scene of scenes) {

        const previousSceneIndex = project.scenes.findIndex(s => s.id === scene.id) - 1;
        const previousScene = previousSceneIndex >= 0 ? project.scenes[ previousSceneIndex ] : undefined;
        const sceneCharacters = project.characters.filter(char => scene.characterIds.includes(char.id));
        const sceneLocations = project.locations.filter(loc => scene.locationId.includes(loc.id));

        const currentAssets = getAllBestFromAssets(scene.assets);

        for (const assetKey of scopeAssetKeys) {

            let framePromptKey = assetKey === "scene_start_frame" ?
                "start_frame_prompt" as const :
                "end_frame_prompt" as const;

            let prompt = await this.frameComposer.generateFrameGenerationPrompt(
                assetKey === "scene_start_frame" ? "start" : "end",
                scene,
                sceneCharacters,
                sceneLocations,
                previousScene,
                project.generationRules
            );

            const [ version ] = await this.assetManager.getNextVersionNumber({ projectId: project.id, sceneIds: [ scene.id ] }, [ assetKey ]);

            pendingMap.set(scene.id, { scene, assetKey, version, prompt });

            batchRequests.push({
                contents: [ { role: 'user', parts: [ { text: prompt } ] } ],
                metadata: { custom_id: scene.id, version },
                model: imageModelName,
                config: {
                    abortSignal: this.options?.signal,
                    candidateCount: 1,
                    responseModalities: [ Modality.IMAGE ],
                    imageConfig: {
                        ...aspectRatios.widescreen,
                        outputMimeType: imageMimeType
                    }
                }
            });

            saveAssets(
                { projectId: project.id, sceneIds: [ scene.id ] },
                [ framePromptKey ],
                'text',
                [ prompt ],
                [ { model: textModelName } ],
                true
            );
        }
    }

        if(batchRequests.length === 0) {
    return { data: { updatedScenes: scenes }, metadata: { model: imageModelName, attempts: 0, acceptedAttempt: 0 } };
}

const sceneIds = Array.from(pendingMap.values()).map(({ scene }) => scene.id);
let updates = Array.from(pendingMap.values()).map(({ scene }) => ({
    id: scene.id,
    sceneIndex: scene.sceneIndex,
    projectId: scene.projectId,
    status: "generating",
    progressMessage: `Generating start and end images.`
}));
sendUpdateScenes(sceneIds, updates as any[]);

console.log({ projectId: scenes[ 0 ].projectId, batchRequests: batchRequests.length }, `Submitting batch generation for scene frames`);

let batchJob = await this.imageModel.generateBatchImages({
    model: imageModelName,
    requests: batchRequests,
    config: {
        abortSignal: this.options?.signal,
        dest: this.storageManager.getGcsUrl(this.storageManager.getProjectPath('scenes')),
        displayName: this.generateSceneFramesBatch.name,
    }
});

const results = await this.storageManager.processImageBatchResults(batchJob.dest?.gcsUri!);

const successfulResults = results.filter(r => r.status === "SUCCESS");
const srcs: string[] = [];
const customIds: string[] = [];
const versions: number[] = [];
const assetKeys: any[] = [];
const metadatas: any[] = [];

for (const result of successfulResults) {
    const context = pendingMap.get(result.custom_id);
    if (context) {

        srcs.push(result.src);
        customIds.push(context.scene.id);
        versions.push(context.version);
        assetKeys.push(context.assetKey);
        metadatas.push({
            model: imageModelName,
            prompt: context.prompt,
            jobId: batchJob.name,
        });

    }
}

if (srcs.length > 0) {
    saveAssets(
        { projectId: project.id, sceneIds: customIds },
        assetKeys,
        'image',
        srcs,
        metadatas,
        true
    );
}

const failedResults = results.filter(r => r.status !== "SUCCESS");
if (failedResults.length > 0) {
    failedResults.forEach(err => {
        const context = pendingMap.get(err.custom_id);
        const errorMsg = err.error?.message || "Unknown batch error";

        console.error(` ✗ Batch item failed for ${pendingMap.get(err.custom_id)?.scene.name ?? err.custom_id}: ${errorMsg}`);
        // incrementAttempt(errorMsg, "BACKOFF_RETRY");
    });
}

updates = Array.from(pendingMap.values()).map(({ scene }) => ({
    id: scene.id,
    sceneIndex: scene.sceneIndex,
    projectId: scene.projectId,
    status: "complete",
    progressMessage: `Saved ${assetKeys.join(', ')}.`
}));
sendUpdateScenes(customIds, updates as any[]);

return { data: { updatedScenes: scenes }, metadata: { model: imageModelName, attempts: 1, acceptedAttempt: 1 } };
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
