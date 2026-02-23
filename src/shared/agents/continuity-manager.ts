import {
    retryLlmCall,
} from "../utils/lm-retry.js";
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
    RecordMetricsCallback,
} from "../types/index.js";
import { GCPStorageManager } from "../services/storage-manager.js";
import { Modality } from "@google/genai";
import { FrameCompositionAgent, FramePromptRequest, FrameCompositionItem } from "./frame-composition-agent.js";
import { buildCharacterImagePrompt } from "../prompts/character-reference-image-prompt.js";
import { buildLocationImagePrompt } from "../prompts/location-reference-image-prompt.js";
import { composeGenerationRules } from "../prompts/must-review/prompt-utils.js";
import { ReferenceImage, BatchResultItem, TextModelController } from "../lm/text-model-controller.js";
import { BaseImage, Content, ContentImage, GenerateBatchContentParameters, GenerateBatchImagesParameters, SubjectImage } from "../lm/provider.js";
import { ThinkingLevel } from "@google/genai";
import { QualityCheckAgent } from "./quality-check-agent.js";
import { evolveCharacterState, evolveLocationState } from "./state-evolution.js";
import { cleanJsonOutput } from "../utils/utils.js";
import { getAllBestAssets, hasAssetVersion } from "../utils/assets-utils.js";
import { AssetVersionManager } from "../services/asset-version-manager.js";
import { SaveAssetsCallback, UpdateScenesCallback, IncrementAttemptHook } from "../types/index.js";
import { GenerativeResultEnvelope, GenerativeResultGenerateCharacterAssets, GenerativeResultGenerateLocationAssets, GenerativeResultGenerateSceneFrames, JobGenerateCharacterAssets, JobGenerateLocationAssets, JobGenerateSceneFrames } from "../types/job.types.js";
import { aspectRatios, IS_BATCH_PROCESSING_ENABLED, EXECUTION_MODE, imageMimeType } from "../config.js";
import { extractGeneratedResponse } from "../lm/parts-extractor.js";
import { buildProductionDesignerNarrative } from "../prompts/role-set-designer.js";
import { buildReferenceImages, toContentsFromReferenceImages } from "../lm/utils.js";
import { composeEnhancedSceneGenerationPromptMetav1 } from "../prompts/scene-generation-instructions.js";



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
            const metaPrompt = composeEnhancedSceneGenerationPromptMetav1(
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
    //         const assets = getAllBestAssets(character.assets);
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
    //                 [{ model: this.lm.textModel }],
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
    //         const currentAssets = getAllBestAssets(currentScene.assets);
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
    //                     [{ model: this.lm.textModel }],
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
    //                 const previousAssets = getAllBestAssets(previousScene?.assets);
    //                 const prevEndFrameOrSceneStartFrame =
    //                     assetKey === "scene_start_frame" ?
    //                         previousAssets[ 'scene_end_frame' ]?.data :
    //                         currentAssets[ 'scene_start_frame' ]?.data;

    //                 const charImages = sceneCharacters.flatMap(c => {
    //                     const a = getAllBestAssets(c.assets);
    //                     return a[ 'character_image' ]?.data ? [ a[ 'character_image' ].data ] : [];
    //                 });
    //                 const locImages = sceneLocations.flatMap(l => {
    //                     const a = getAllBestAssets(l.assets);
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
    //         const assets = getAllBestAssets(loc.assets);
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
    //                 [{ model: this.lm.textModel }],
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
    //                         [{ model: this.lm.textModel }],
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

    async generateSceneFramesBatch(
        project: Project,
        scenes: Scene[],
        scopeAssetKeys: ('scene_start_frame' | 'scene_end_frame')[],
        saveAssets: SaveAssetsCallback,
        sendUpdateScenes: UpdateScenesCallback,
        incrementAttempt: IncrementAttemptHook,
        recordMetrics: RecordMetricsCallback
    ): Promise<GenerativeResultGenerateSceneFrames> {
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

        await this.frameComposer.generateFrames(
            imageItems,
            saveAssets,
            sendUpdateScenes,
            incrementAttempt,
            recordMetrics,
            mode as any
        );

        return { data: { updatedScenes: scenes }, metadata: { model: "", attempts: 1, acceptedAttempt: 1 } };
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
            const pendingMap = new Map<string, { character: Character, version: number, prompt: string; }>();
            const batchRequests: GenerateBatchImagesParameters[ 'requests' ] = [];

            for (const character of characters) {

                const [ version ] = await this.assetManager.getNextVersionNumber(
                    { projectId, characterIds: [ character.id ] },
                    [ 'character_image' ]
                );

                const prompt = buildCharacterImagePrompt(character, generationRules);

                pendingMap.set(character.id, { character, version, prompt });

                batchRequests.push({
                    contents: [ { role: "user", parts: [ { text: prompt } ] } ],
                    metadata: { custom_id: character.id, version, assetKey: "character_image" },
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
                    { projectId, characterIds: [ character.id ] },
                    [ 'character_prompt' ],
                    'text',
                    [ prompt ],
                    [ { model: this.lm.textModel } ],
                    true
                );
            }

            if (batchRequests.length === 0) {
                return { data: { characters }, metadata: { model: "", attempts: 0, acceptedAttempt: 0 } };
            }

            console.log({ projectId, batchRequests: batchRequests.length }, `Submitting batch generation for characters`);

            let results = await this.imageModel.generateBatchImages({
                projectId,
                model: this.imageModel.imageModel,
                requests: batchRequests,
                config: {
                    abortSignal: this.options?.signal,
                    dest: { gcsUri: this.storageManager.getObjectPath({ type: 'batch', projectId, uniqueId: Date.now().toString() }) },
                    displayName: this.generateCharacterAssets.name,
                }
            });

            const successfulResults = results.filter(r => r.status === "SUCCESS");
            const srcs: string[] = [];
            const customIds: string[] = [];
            const versions: number[] = [];
            const metadatas: { prompt: string; model: string; }[] = [];

            for (const result of successfulResults) {
                const context = pendingMap.get(result.customId);

                if (context) {
                    const imageBuffer = Buffer.from(result.imageBytes, "base64");
                    const outputPath = this.storageManager.getObjectPath({ projectId, characterId: result.customId, type: "character_image", version: result.version });
                    const src = await this.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);

                    srcs.push(src);
                    customIds.push(context.character.id);
                    versions.push(context.version);
                    metadatas.push({
                        prompt: context.prompt,
                        model: this.lm.imageModel,
                    });
                }
            }

            if (srcs.length > 0) {
                saveAssets(
                    { projectId, characterIds: customIds },
                    [ 'character_image' ],
                    'image',
                    srcs,
                    metadatas,
                    true
                );

                characters.forEach((char, index) => {
                    recordMetrics([ {
                        entityId: char.id,
                        assetKey: 'character_image',
                        finalScore: 0,
                        attemptNumber: 1,
                        ruleAdded: [],
                        corrections: []
                    } ]).catch((error) => { console.error({ error, projectId: char.projectId }, `Failed to record metric`); });
                });

                //         console.log(` ✓ Saved batch result for: ${character.name}`);
                //     } else if(context && result.error) {
                //     console.error(` ✗ Batch item failed for ${context.character.name}: ${result.error.message}`);
                //     incrementAttempt(errorMsg, "BATCH_PARTIAL_FAIL");
                // }
            }

            const failedResults = results.filter(r => r.status !== "SUCCESS");
            if (failedResults.length > 0) {
                failedResults.forEach(err => {
                    const context = pendingMap.get(err.customId);
                    const errorMsg = err.error?.message || "Unknown batch error";

                    console.error(` ✗ Batch item failed for ${context?.character.name ?? err.customId}: ${errorMsg}`);

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
            const pendingMap = new Map<string, { location: Location, version: number, prompt: string; }>();
            const batchRequests: GenerateBatchImagesParameters[ 'requests' ] = [];

            for (const location of locations) {

                const [ version ] = await this.assetManager.getNextVersionNumber(
                    { projectId, locationIds: [ location.id ] },
                    [ 'location_image' ]
                );

                const prompt = buildLocationImagePrompt(location, generationRules);

                pendingMap.set(location.id, { location, version, prompt });

                batchRequests.push({
                    contents: [ { role: "user", parts: [ { text: prompt } ] } ],
                    metadata: { custom_id: location.id, version, assetKey: "location_image" },
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
                    { projectId, locationIds: [ location.id ] },
                    [ 'location_prompt' ],
                    'text',
                    [ prompt ],
                    [ { model: this.lm.textModel } ],
                    true
                );
            }

            if (batchRequests.length === 0) {
                return { data: { locations }, metadata: { model: "", attempts: 0, acceptedAttempt: 0 } };
            }

            console.log({ projectId, batchRequests: batchRequests.length }, `Submitting batch generation for locations`);

            let results = await this.imageModel.generateBatchImages({
                projectId,
                model: this.imageModel.imageModel,
                requests: batchRequests,
                config: {
                    abortSignal: this.options?.signal,
                    dest: { gcsUri: this.storageManager.getObjectPath({ type: 'batch', projectId, uniqueId: Date.now().toString() }) },
                    displayName: this.generateLocationAssets.name,
                }
            });

            const successfulResults = results.filter(r => r.status === "SUCCESS");
            const srcs: string[] = [];
            const customIds: string[] = [];
            const versions: number[] = [];
            const metadatas: { prompt: string; model: string; }[] = [];

            for (const result of successfulResults) {
                const context = pendingMap.get(result.customId);

                if (context) {
                    const imageBuffer = Buffer.from(result.imageBytes, "base64");
                    const outputPath = this.storageManager.getObjectPath({ projectId, locationId: result.customId, type: "location_image", version: result.version });
                    const src = await this.storageManager.uploadBuffer(imageBuffer, outputPath, imageMimeType);

                    srcs.push(src);
                    customIds.push(context.location.id);
                    versions.push(context.version);
                    metadatas.push({
                        prompt: context.prompt,
                        model: this.lm.imageModel
                    });
                }
            }

            if (srcs.length > 0) {
                saveAssets(
                    { projectId, locationIds: customIds },
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
                    const context = pendingMap.get(err.customId);
                    const errorMsg = err.error?.message || "Unknown batch error";

                    console.error(` ✗ Batch item failed for ${context?.location.name ?? err.customId}: ${errorMsg}`);

                    // Push to your metrics/retry queue
                    // incrementAttempt(errorMsg, "BATCH_PARTIAL_FAIL");
                    // incrementAttempt(errorMsg, "BACKOFF_RETRY");
                });
            }
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
