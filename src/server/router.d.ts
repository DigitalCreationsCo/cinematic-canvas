import { z } from 'zod';
import type { ActiveJobRecord } from '../services/job-control-plane.ts';
import { IEventBus } from '#shared/messaging/event-bus.types.js';
export interface RouterDependencies {
    eventBus: IEventBus;
    eventsRouter?: ReturnType<typeof import('#server/sse-events.js').createEventsRouter>;
}
export declare function createAppRouter(deps: RouterDependencies): import("@trpc/server").TRPCBuiltRouter<{
    ctx: {
        user: import("@supabase/supabase-js").AuthUser | null;
        teamId: string | undefined;
        worldId: string | undefined;
        projectId: string | undefined;
        headers: import("http").IncomingHttpHeaders;
    };
    meta: object;
    errorShape: {
        data: {
            zodError: z.core.$ZodFlattenedError<unknown, string> | null;
            code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
        };
        message: string;
        code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
    };
    transformer: true;
}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
    events?: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            user: import("@supabase/supabase-js").AuthUser | null;
            teamId: string | undefined;
            worldId: string | undefined;
            projectId: string | undefined;
            headers: import("http").IncomingHttpHeaders;
        };
        meta: object;
        errorShape: {
            data: {
                zodError: z.core.$ZodFlattenedError<unknown, string> | null;
                code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
                httpStatus: number;
                path?: string;
                stack?: string;
            };
            message: string;
            code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        project: import("@trpc/server").TRPCSubscriptionProcedure<{
            input: {
                projectId: string;
            };
            output: AsyncIterable<string, void, any>;
            meta: object;
        }>;
    }>> | undefined;
    teams: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            user: import("@supabase/supabase-js").AuthUser | null;
            teamId: string | undefined;
            worldId: string | undefined;
            projectId: string | undefined;
            headers: import("http").IncomingHttpHeaders;
        };
        meta: object;
        errorShape: {
            data: {
                zodError: z.core.$ZodFlattenedError<unknown, string> | null;
                code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
                httpStatus: number;
                path?: string;
                stack?: string;
            };
            message: string;
            code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                teams: {
                    createdAt: Date;
                    updatedAt: Date;
                    id: string;
                    name: string;
                }[];
            };
            meta: object;
        }>;
        joinOrCreate: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
            };
            output: {
                id: string;
                name: string;
            };
            meta: object;
        }>;
    }>>;
    worlds: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            user: import("@supabase/supabase-js").AuthUser | null;
            teamId: string | undefined;
            worldId: string | undefined;
            projectId: string | undefined;
            headers: import("http").IncomingHttpHeaders;
        };
        meta: object;
        errorShape: {
            data: {
                zodError: z.core.$ZodFlattenedError<unknown, string> | null;
                code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
                httpStatus: number;
                path?: string;
                stack?: string;
            };
            message: string;
            code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                worlds: {
                    id: string;
                    teamId: string;
                    createdAt: Date;
                    updatedAt: Date;
                    name: string;
                    description: string | null;
                    worldRepository: string;
                    sacRepoId: string | null;
                    sacRepoUrl: string | null;
                }[];
            };
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
                description: string;
            };
            output: {
                id: string;
                teamId: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                description: string | null;
                worldRepository: string;
                sacRepoId: string | null;
                sacRepoUrl: string | null;
            };
            meta: object;
        }>;
        entities: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                worldId: string;
            };
            output: {
                characters: import("#shared/types/index.js").CharacterWithAssets[];
                locations: import("#shared/types/index.js").LocationWithAssets[];
            };
            meta: object;
        }>;
        access: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                worldId: string;
            };
            output: {
                role: string;
                licenseType: string | null;
            };
            meta: object;
        }>;
    }>>;
    projects: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            user: import("@supabase/supabase-js").AuthUser | null;
            teamId: string | undefined;
            worldId: string | undefined;
            projectId: string | undefined;
            headers: import("http").IncomingHttpHeaders;
        };
        meta: object;
        errorShape: {
            data: {
                zodError: z.core.$ZodFlattenedError<unknown, string> | null;
                code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
                httpStatus: number;
                path?: string;
                stack?: string;
            };
            message: string;
            code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                worldId?: string | undefined;
            };
            output: {
                projects: {
                    id: string;
                    metadata: {
                        title: string;
                    };
                }[];
            };
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                initialPrompt: string;
                teamId: string;
                title?: string | undefined;
                audioGcsUri?: string | undefined;
                audioPublicUri?: string | undefined;
                worldId?: string | undefined;
                sacRepoId?: string | undefined;
                sacCommitSha?: string | undefined;
            };
            output: {
                id: string;
                title: string;
                createdAt: string;
            };
            meta: object;
        }>;
        get: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                projectId: string;
            };
            output: {
                id: string;
                teamId: string;
                worldId: string | undefined;
                createdAt: Date;
                updatedAt: Date;
                storyboard: Readonly<Readonly<{
                    metadata: {
                        title: string;
                        logline: string;
                        totalScenes: number;
                        style: string;
                        description: string;
                        colorPalette: string[];
                        tags: string[];
                        initialPrompt: string;
                        enhancedPrompt: string;
                        hasAudio: boolean;
                        duration: number;
                        bpm: number;
                        keySignature: string;
                        projectId: string;
                        audioGcsUri?: string | undefined;
                        audioPublicUri?: string | undefined;
                    };
                    characters: {
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        referenceId: string;
                        name: string;
                        description: string;
                        aliases: string[];
                        physicalTraits: {
                            hair: string;
                            clothing: string[];
                            accessories: string[];
                            distinctiveFeatures: string[];
                            build: string;
                            ethnicity: string;
                            age: string;
                            gender: "male" | "female" | "non-binary";
                            appearanceNotes: string[];
                        };
                        state: {
                            emotionalHistory: {
                                sceneId: string;
                                emotion: string;
                            }[];
                            injuries: {
                                type: string;
                                location: string;
                                severity: "minor" | "moderate" | "severe";
                                acquiredInScene: number;
                            }[];
                            dirtLevel: "clean" | "slightly_dirty" | "dirty" | "very_dirty" | "covered";
                            exhaustionLevel: "fresh" | "slightly_tired" | "tired" | "exhausted" | "collapsing";
                            lastSeen?: string | undefined;
                            position?: string | undefined;
                            lastExitDirection?: "none" | "left" | "right" | "up" | "down" | undefined;
                            emotionalState?: string | undefined;
                            costumeCondition?: {
                                tears: string[];
                                stains: string[];
                                wetness: "dry" | "damp" | "wet" | "soaked";
                                damage: string[];
                            } | undefined;
                            hairCondition?: {
                                messiness: "pristine" | "slightly_messy" | "messy" | "disheveled" | "wild";
                                wetness: "dry" | "damp" | "wet" | "soaked";
                                style?: string | undefined;
                            } | undefined;
                        };
                        projectId: string;
                        guidanceLevel?: number | null | undefined;
                    }[];
                    locations: {
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        referenceId: string;
                        name: string;
                        description: string;
                        type: string;
                        lightingConditions: {
                            quality: {
                                hardness: string;
                                colorTemperature: string;
                                intensity: string;
                            };
                            motivatedSources: {
                                primaryLight: string;
                                fillLight: string;
                                practicalLights: string;
                                accentLight: string;
                                lightBeams: string;
                            };
                            direction: {
                                keyLightPosition: string;
                                shadowDirection: string;
                                contrastRatio: string;
                            };
                            atmosphere: {
                                haze: string;
                            };
                        };
                        mood: string;
                        timeOfDay: string;
                        weather: string;
                        colorPalette: string[];
                        architecture: string[];
                        naturalElements: string[];
                        manMadeObjects: string[];
                        groundSurface: string;
                        skyOrCeiling: string;
                        state: {
                            mood: string;
                            timeOfDay: string;
                            weather: string;
                            precipitation: "none" | "moderate" | "light" | "heavy";
                            visibility: "clear" | "slight_haze" | "hazy" | "foggy" | "obscured";
                            lighting: {
                                quality: {
                                    hardness: string;
                                    colorTemperature: string;
                                    intensity: string;
                                };
                                motivatedSources: {
                                    primaryLight: string;
                                    fillLight: string;
                                    practicalLights: string;
                                    accentLight: string;
                                    lightBeams: string;
                                };
                                direction: {
                                    keyLightPosition: string;
                                    shadowDirection: string;
                                    contrastRatio: string;
                                };
                                atmosphere: {
                                    haze: string;
                                };
                            };
                            groundCondition: {
                                wetness: "dry" | "damp" | "wet" | "soaked" | "flooded";
                                debris: string[];
                                damage: string[];
                            };
                            atmosphericEffects: {
                                type: string;
                                intensity: "moderate" | "light" | "heavy";
                                addedInScene: number;
                                dissipating: boolean;
                            }[];
                            season: "spring" | "summer" | "fall" | "winter" | "unspecified";
                            temperatureIndicators: string[];
                        };
                        projectId: string;
                        guidanceLevel?: number | null | undefined;
                    }[];
                    scenes: {
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        status: "error" | "pending" | "generating" | "evaluating" | "complete";
                        progressMessage: string;
                        continuityNotes: string[];
                        characterReferenceIds: string[];
                        characterIds: string[];
                        locationReferenceId: string;
                        locationId: string;
                        name: string;
                        description: string;
                        mood: string;
                        audioSync: string;
                        startTime: number;
                        endTime: number;
                        duration: number;
                        type: "lyrical" | "instrumental" | "transition" | "breakdown" | "solo" | "climax";
                        lyrics: string;
                        musicalDescription: string;
                        musicChange: string;
                        intensity: "low" | "medium" | "high";
                        tempo: "moderate" | "slow" | "fast" | "very_fast";
                        transitionType: "none" | "Cut" | "Hard Cut" | "Jump Cut" | "Smash Cut" | "Dissolve" | "Cross Fade" | "Fade" | "Fade to Black" | "Iris In" | "Iris Out" | "Push" | "Slide" | "Continuous";
                        audioEvidence: string;
                        transientImpact: "none" | "soft" | "sharp" | "explosive";
                        shotType: "Extreme Close-Up" | "Close-Up" | "Medium Close-Up" | "Medium Shot" | "Medium Wide" | "Wide Shot" | "Very Wide/Establishing";
                        cameraAngle: "Eye Level" | "High Angle" | "Low Angle" | "Bird's Eye" | "Dutch Angle";
                        cameraMovement: "Static" | "Pan Left" | "Pan Right" | "Pan" | "Tilt Up" | "Tilt Down" | "Tilt" | "Dolly In" | "Dolly Out" | "Track Left" | "Track Right" | "Track" | "Crane Up" | "Crane Down" | "Crane" | "Handheld" | "Steadicam" | "Drone" | "Aerial" | "Orbit" | "Zoom In" | "Zoom Out";
                        composition: {
                            "Subject Placement": string;
                            "Focal Point": string;
                            "Depth Layers": string;
                            "Leading Lines": string;
                            Headroom: string;
                            "Look Room": string;
                        };
                        sceneIndex: number;
                        lighting: {
                            quality: {
                                hardness: string;
                                colorTemperature: string;
                                intensity: string;
                            };
                            motivatedSources: {
                                primaryLight: string;
                                fillLight: string;
                                practicalLights: string;
                                accentLight: string;
                                lightBeams: string;
                            };
                            direction: {
                                keyLightPosition: string;
                                shadowDirection: string;
                                contrastRatio: string;
                            };
                            atmosphere: {
                                haze: string;
                            };
                        };
                        projectId: string;
                        guidanceLevel?: number | null | undefined;
                    }[];
                }>>;
                metadata: {
                    title: string;
                    logline: string;
                    totalScenes: number;
                    style: string;
                    description: string;
                    colorPalette: string[];
                    tags: string[];
                    initialPrompt: string;
                    enhancedPrompt: string;
                    hasAudio: boolean;
                    duration: number;
                    bpm: number;
                    keySignature: string;
                    projectId: string;
                    audioGcsUri?: string | undefined;
                    audioPublicUri?: string | undefined;
                };
                status: "error" | "pending" | "generating" | "evaluating" | "complete";
                currentSceneIndex: number;
                forceRegenerateSceneIds: string[];
                generationRules: string[];
                generationRulesHistory: string[][];
                guidanceLevel: number;
                sacForkRepoId: string | null;
                sacForkRepoUrl: string | null;
                audioAnalysis?: {
                    duration: number;
                    bpm: number;
                    keySignature: string;
                    segments: {
                        startTime: number;
                        endTime: number;
                        duration: number;
                        type: "lyrical" | "instrumental" | "transition" | "breakdown" | "solo" | "climax";
                        lyrics: string;
                        musicalDescription: string;
                        musicChange: string;
                        intensity: "low" | "medium" | "high";
                        mood: string;
                        tempo: "moderate" | "slow" | "fast" | "very_fast";
                        transitionType: "none" | "Cut" | "Hard Cut" | "Jump Cut" | "Smash Cut" | "Dissolve" | "Cross Fade" | "Fade" | "Fade to Black" | "Iris In" | "Iris Out" | "Push" | "Slide" | "Continuous";
                        audioEvidence: string;
                        transientImpact: "none" | "soft" | "sharp" | "explosive";
                    }[];
                } | null | undefined;
            } & {
                assets: import("#shared/types/index.js").AssetRegistry;
            };
            meta: object;
        }>;
        start: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                payload: {
                    teamId: string;
                    initialPrompt: string;
                    worldId?: string | undefined;
                    audioGcsUri?: string | undefined;
                    audioPublicUri?: string | undefined;
                    title?: string | undefined;
                    guidanceLevel?: number | null | undefined;
                    systemInstructions?: string | undefined;
                    selectedCharacterIds?: string[] | undefined;
                    selectedLocationIds?: string[] | undefined;
                    styleReferenceUrls?: string[] | undefined;
                    loreContent?: string | undefined;
                    sacRepoId?: string | undefined;
                    sacCommitSha?: string | undefined;
                };
                projectId?: string | undefined;
                commandId?: string | undefined;
            };
            output: {
                projectId: string;
                message: string;
                commandId: string;
            };
            meta: object;
        }>;
        stop: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                projectId: string;
                commandId?: string | undefined;
            };
            output: {
                projectId: string;
                message: string;
                commandId: string;
            };
            meta: object;
        }>;
        resume: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                projectId: string;
                commandId?: string | undefined;
                payload?: any;
            };
            output: {
                projectId: string;
                message: string;
                commandId: string;
            };
            meta: object;
        }>;
        requestState: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                projectId: string;
                commandId?: string | undefined;
            };
            output: {
                projectId: string;
                message: string;
                commandId: string;
            };
            meta: object;
        }>;
        regenerateScene: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                projectId: string;
                payload: {
                    sceneId: string;
                    forceRegenerate: boolean;
                    promptModification?: string | undefined;
                };
                commandId?: string | undefined;
            };
            output: {
                projectId: string;
                message: string;
                commandId: string;
            };
            meta: object;
        }>;
        regenerateFrame: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                projectId: string;
                payload: {
                    sceneIds: string[];
                    assetKeys: ("scene_end_frame" | "scene_start_frame")[];
                    promptModifications?: string[] | undefined;
                };
                commandId?: string | undefined;
            };
            output: {
                projectId: string;
                message: string;
                commandId: string;
            };
            meta: object;
        }>;
        resolveIntervention: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                projectId: string;
                payload: {
                    action: "retry";
                    jobType: string;
                    revisedParams: Record<string, any>;
                } | {
                    action: "skip";
                    jobType?: string | undefined;
                } | {
                    action: "abort";
                    jobType?: string | undefined;
                };
                commandId?: string | undefined;
            };
            output: {
                projectId: string;
                message: string;
                commandId: string;
            };
            meta: object;
        }>;
        generateComposites: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                imageId: string;
                inputImages: {
                    src: string;
                    entityId: string;
                    assetKey: "description" | "scene_end_frame" | "scene_start_frame" | "batch-data" | "thumbnail" | "final_output" | "scene_video" | "render_video" | "image_file" | "character_image" | "location_image" | "enhanced_prompt" | "storyboard" | "audio_analysis" | "generation_rules" | "entity";
                    version: number;
                    weight: number;
                    blendMode: "normal" | "multiply" | "overlay" | "screen" | "soft-light";
                    type: "style" | "base" | "mask" | "control" | "subject" | "content";
                }[];
                prompt: string;
                negativePrompt?: string | undefined;
                numberOfOutputs?: number | undefined;
            };
            output: {
                projectId: string;
                message: string;
                imageId: string;
                commandId: string;
            };
            meta: object;
        }>;
        command: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                projectId: string;
                commandId: string;
            };
            output: {};
            meta: object;
        }>;
        assets: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                projectId: string;
            };
            output: Partial<Record<"description" | "scene_end_frame" | "scene_start_frame" | "batch-data" | "thumbnail" | "final_output" | "scene_video" | "render_video" | "image_file" | "character_image" | "location_image" | "enhanced_prompt" | "storyboard" | "audio_analysis" | "generation_rules" | "entity", {
                head: number;
                best: number;
                versions: {
                    version: number;
                    data: string;
                    type: "json" | "video" | "image" | "audio" | "text";
                    metadata: {
                        evaluation?: {
                            scores: {
                                narrativeFidelity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                characterConsistency: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                technicalQuality: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                emotionalAuthenticity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                continuity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                            };
                            issues: {
                                department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                category: string;
                                severity: "minor" | "critical" | "major";
                                description: string;
                                suggestedFix: string;
                                videoTimestamp?: string | null | undefined;
                                locationInFrame?: string | null | undefined;
                            }[];
                            feedback: string;
                            promptCorrections: {
                                department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                issueType: string;
                                originalPromptSection: string;
                                correctedPromptSection: string;
                                reasoning: string;
                            }[];
                            grade: "FAIL" | "ACCEPT" | "ACCEPT_WITH_NOTES" | "REGENERATE_MINOR" | "REGENERATE_MAJOR";
                            score: number;
                            model: string;
                            ruleSuggestion?: string | null | undefined;
                        } | null | undefined;
                        model?: string | null | undefined;
                        promptModel?: string | null | undefined;
                        jobId?: string | null | undefined;
                        prompt?: string | null | undefined;
                        duration?: number | null | undefined;
                        width?: number | null | undefined;
                        height?: number | null | undefined;
                        fps?: number | null | undefined;
                        bitrate?: number | null | undefined;
                    };
                    startedAt: Date;
                    createdAt: Date;
                    userFeedback?: {
                        userId: string;
                        rating: "liked" | "disliked";
                        recordedAt: Date;
                        note?: string | null | undefined;
                    } | null | undefined;
                }[];
            }>>;
            meta: object;
        }>;
        sceneAssets: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                projectId: string;
                sceneId: string;
            };
            output: Partial<Record<"description" | "scene_end_frame" | "scene_start_frame" | "batch-data" | "thumbnail" | "final_output" | "scene_video" | "render_video" | "image_file" | "character_image" | "location_image" | "enhanced_prompt" | "storyboard" | "audio_analysis" | "generation_rules" | "entity", {
                head: number;
                best: number;
                versions: {
                    version: number;
                    data: string;
                    type: "json" | "video" | "image" | "audio" | "text";
                    metadata: {
                        evaluation?: {
                            scores: {
                                narrativeFidelity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                characterConsistency: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                technicalQuality: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                emotionalAuthenticity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                continuity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                            };
                            issues: {
                                department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                category: string;
                                severity: "minor" | "critical" | "major";
                                description: string;
                                suggestedFix: string;
                                videoTimestamp?: string | null | undefined;
                                locationInFrame?: string | null | undefined;
                            }[];
                            feedback: string;
                            promptCorrections: {
                                department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                issueType: string;
                                originalPromptSection: string;
                                correctedPromptSection: string;
                                reasoning: string;
                            }[];
                            grade: "FAIL" | "ACCEPT" | "ACCEPT_WITH_NOTES" | "REGENERATE_MINOR" | "REGENERATE_MAJOR";
                            score: number;
                            model: string;
                            ruleSuggestion?: string | null | undefined;
                        } | null | undefined;
                        model?: string | null | undefined;
                        promptModel?: string | null | undefined;
                        jobId?: string | null | undefined;
                        prompt?: string | null | undefined;
                        duration?: number | null | undefined;
                        width?: number | null | undefined;
                        height?: number | null | undefined;
                        fps?: number | null | undefined;
                        bitrate?: number | null | undefined;
                    };
                    startedAt: Date;
                    createdAt: Date;
                    userFeedback?: {
                        userId: string;
                        rating: "liked" | "disliked";
                        recordedAt: Date;
                        note?: string | null | undefined;
                    } | null | undefined;
                }[];
            }>>;
            meta: object;
        }>;
        characterAssets: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                projectId: string;
                characterId: string;
            };
            output: Partial<Record<"description" | "scene_end_frame" | "scene_start_frame" | "batch-data" | "thumbnail" | "final_output" | "scene_video" | "render_video" | "image_file" | "character_image" | "location_image" | "enhanced_prompt" | "storyboard" | "audio_analysis" | "generation_rules" | "entity", {
                head: number;
                best: number;
                versions: {
                    version: number;
                    data: string;
                    type: "json" | "video" | "image" | "audio" | "text";
                    metadata: {
                        evaluation?: {
                            scores: {
                                narrativeFidelity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                characterConsistency: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                technicalQuality: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                emotionalAuthenticity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                continuity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                            };
                            issues: {
                                department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                category: string;
                                severity: "minor" | "critical" | "major";
                                description: string;
                                suggestedFix: string;
                                videoTimestamp?: string | null | undefined;
                                locationInFrame?: string | null | undefined;
                            }[];
                            feedback: string;
                            promptCorrections: {
                                department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                issueType: string;
                                originalPromptSection: string;
                                correctedPromptSection: string;
                                reasoning: string;
                            }[];
                            grade: "FAIL" | "ACCEPT" | "ACCEPT_WITH_NOTES" | "REGENERATE_MINOR" | "REGENERATE_MAJOR";
                            score: number;
                            model: string;
                            ruleSuggestion?: string | null | undefined;
                        } | null | undefined;
                        model?: string | null | undefined;
                        promptModel?: string | null | undefined;
                        jobId?: string | null | undefined;
                        prompt?: string | null | undefined;
                        duration?: number | null | undefined;
                        width?: number | null | undefined;
                        height?: number | null | undefined;
                        fps?: number | null | undefined;
                        bitrate?: number | null | undefined;
                    };
                    startedAt: Date;
                    createdAt: Date;
                    userFeedback?: {
                        userId: string;
                        rating: "liked" | "disliked";
                        recordedAt: Date;
                        note?: string | null | undefined;
                    } | null | undefined;
                }[];
            }>>;
            meta: object;
        }>;
        locationAssets: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                projectId: string;
                locationId: string;
            };
            output: Partial<Record<"description" | "scene_end_frame" | "scene_start_frame" | "batch-data" | "thumbnail" | "final_output" | "scene_video" | "render_video" | "image_file" | "character_image" | "location_image" | "enhanced_prompt" | "storyboard" | "audio_analysis" | "generation_rules" | "entity", {
                head: number;
                best: number;
                versions: {
                    version: number;
                    data: string;
                    type: "json" | "video" | "image" | "audio" | "text";
                    metadata: {
                        evaluation?: {
                            scores: {
                                narrativeFidelity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                characterConsistency: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                technicalQuality: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                emotionalAuthenticity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                continuity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                            };
                            issues: {
                                department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                category: string;
                                severity: "minor" | "critical" | "major";
                                description: string;
                                suggestedFix: string;
                                videoTimestamp?: string | null | undefined;
                                locationInFrame?: string | null | undefined;
                            }[];
                            feedback: string;
                            promptCorrections: {
                                department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                issueType: string;
                                originalPromptSection: string;
                                correctedPromptSection: string;
                                reasoning: string;
                            }[];
                            grade: "FAIL" | "ACCEPT" | "ACCEPT_WITH_NOTES" | "REGENERATE_MINOR" | "REGENERATE_MAJOR";
                            score: number;
                            model: string;
                            ruleSuggestion?: string | null | undefined;
                        } | null | undefined;
                        model?: string | null | undefined;
                        promptModel?: string | null | undefined;
                        jobId?: string | null | undefined;
                        prompt?: string | null | undefined;
                        duration?: number | null | undefined;
                        width?: number | null | undefined;
                        height?: number | null | undefined;
                        fps?: number | null | undefined;
                        bitrate?: number | null | undefined;
                    };
                    startedAt: Date;
                    createdAt: Date;
                    userFeedback?: {
                        userId: string;
                        rating: "liked" | "disliked";
                        recordedAt: Date;
                        note?: string | null | undefined;
                    } | null | undefined;
                }[];
            }>>;
            meta: object;
        }>;
    }>>;
    jobs: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            user: import("@supabase/supabase-js").AuthUser | null;
            teamId: string | undefined;
            worldId: string | undefined;
            projectId: string | undefined;
            headers: import("http").IncomingHttpHeaders;
        };
        meta: object;
        errorShape: {
            data: {
                zodError: z.core.$ZodFlattenedError<unknown, string> | null;
                code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
                httpStatus: number;
                path?: string;
                stack?: string;
            };
            message: string;
            code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                projectId: string;
            };
            output: {
                jobs: ActiveJobRecord[];
            } | {
                jobs: {
                    id: string;
                    type: "GENERATE_COMPOSITE" | "GENERATE_CHARACTERS" | "GENERATE_CHARACTER_IMAGES" | "GENERATE_LOCATIONS" | "GENERATE_LOCATION_IMAGES" | "GENERATE_ENTITIES" | "CREATE_SCENE_WITH_ENTITIES" | "GENERATE_SCENE_FRAMES" | "GENERATE_SCENE_VIDEO" | "EXPAND_CREATIVE_PROMPT" | "GENERATE_STORYBOARD" | "PROCESS_AUDIO_TO_SCENES" | "ENHANCE_STORYBOARD" | "SEMANTIC_ANALYSIS" | "RENDER_VIDEO";
                    state: "FAILED" | "PENDING" | "RUNNING" | "COMPLETED" | "FATAL" | "CANCELLED";
                    projectId: string;
                    userId: string;
                    teamId: string;
                    workflowId: string | null | undefined;
                    error: string;
                    createdAt: Date;
                    updatedAt: Date;
                }[];
            };
            meta: object;
        }>;
        cancel: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                projectId: string;
                jobId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
    }>>;
    entities: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            user: import("@supabase/supabase-js").AuthUser | null;
            teamId: string | undefined;
            worldId: string | undefined;
            projectId: string | undefined;
            headers: import("http").IncomingHttpHeaders;
        };
        meta: object;
        errorShape: {
            data: {
                zodError: z.core.$ZodFlattenedError<unknown, string> | null;
                code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
                httpStatus: number;
                path?: string;
                stack?: string;
            };
            message: string;
            code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: ({
                images: {
                    gcsUri: string;
                    publicUri: string;
                    mimeType: string;
                }[];
                entityType: "character";
                data: {
                    id: string;
                    referenceId?: string | undefined;
                    name?: string | undefined;
                    description?: string | undefined;
                    aliases?: string[] | undefined;
                    physicalTraits?: {
                        age: string;
                        gender: "male" | "female" | "non-binary";
                        hair?: string | undefined;
                        clothing?: string[] | undefined;
                        accessories?: string[] | undefined;
                        distinctiveFeatures?: string[] | undefined;
                        build?: string | undefined;
                        ethnicity?: string | undefined;
                        appearanceNotes?: string[] | undefined;
                    } | undefined;
                    state?: {
                        lastSeen?: string | undefined;
                        position?: string | undefined;
                        lastExitDirection?: "none" | "left" | "right" | "up" | "down" | undefined;
                        emotionalState?: string | undefined;
                        emotionalHistory?: {
                            sceneId: string;
                            emotion: string;
                        }[] | undefined;
                        injuries?: {
                            type: string;
                            location: string;
                            severity: "minor" | "moderate" | "severe";
                            acquiredInScene: number;
                        }[] | undefined;
                        dirtLevel?: "clean" | "slightly_dirty" | "dirty" | "very_dirty" | "covered" | undefined;
                        exhaustionLevel?: "fresh" | "slightly_tired" | "tired" | "exhausted" | "collapsing" | undefined;
                        costumeCondition?: {
                            tears?: string[] | undefined;
                            stains?: string[] | undefined;
                            wetness?: "dry" | "damp" | "wet" | "soaked" | undefined;
                            damage?: string[] | undefined;
                        } | undefined;
                        hairCondition?: {
                            style?: string | undefined;
                            messiness?: "pristine" | "slightly_messy" | "messy" | "disheveled" | "wild" | undefined;
                            wetness?: "dry" | "damp" | "wet" | "soaked" | undefined;
                        } | undefined;
                    } | undefined;
                };
            } | {
                images: {
                    gcsUri: string;
                    publicUri: string;
                    mimeType: string;
                }[];
                entityType: "location";
                data: {
                    id: string;
                    referenceId?: string | undefined;
                    name?: string | undefined;
                    description?: string | undefined;
                    type?: string | undefined;
                    lightingConditions?: {
                        quality?: {
                            hardness?: string | undefined;
                            colorTemperature?: string | undefined;
                            intensity?: string | undefined;
                        } | undefined;
                        motivatedSources?: {
                            primaryLight?: string | undefined;
                            fillLight?: string | undefined;
                            practicalLights?: string | undefined;
                            accentLight?: string | undefined;
                            lightBeams?: string | undefined;
                        } | undefined;
                        direction?: {
                            keyLightPosition?: string | undefined;
                            shadowDirection?: string | undefined;
                            contrastRatio?: string | undefined;
                        } | undefined;
                        atmosphere?: {
                            haze?: string | undefined;
                        } | undefined;
                    } | undefined;
                    mood?: string | undefined;
                    timeOfDay?: string | undefined;
                    weather?: string | undefined;
                    colorPalette?: string[] | undefined;
                    architecture?: string[] | undefined;
                    naturalElements?: string[] | undefined;
                    manMadeObjects?: string[] | undefined;
                    groundSurface?: string | undefined;
                    skyOrCeiling?: string | undefined;
                    state?: {
                        mood?: string | undefined;
                        timeOfDay?: string | undefined;
                        weather?: string | undefined;
                        precipitation?: "none" | "moderate" | "light" | "heavy" | undefined;
                        visibility?: "clear" | "slight_haze" | "hazy" | "foggy" | "obscured" | undefined;
                        lighting?: {
                            quality?: {
                                hardness?: string | undefined;
                                colorTemperature?: string | undefined;
                                intensity?: string | undefined;
                            } | undefined;
                            motivatedSources?: {
                                primaryLight?: string | undefined;
                                fillLight?: string | undefined;
                                practicalLights?: string | undefined;
                                accentLight?: string | undefined;
                                lightBeams?: string | undefined;
                            } | undefined;
                            direction?: {
                                keyLightPosition?: string | undefined;
                                shadowDirection?: string | undefined;
                                contrastRatio?: string | undefined;
                            } | undefined;
                            atmosphere?: {
                                haze?: string | undefined;
                            } | undefined;
                        } | undefined;
                        groundCondition?: {
                            wetness?: "dry" | "damp" | "wet" | "soaked" | "flooded" | undefined;
                            debris?: string[] | undefined;
                            damage?: string[] | undefined;
                        } | undefined;
                        atmosphericEffects?: {
                            type: string;
                            intensity: "moderate" | "light" | "heavy";
                            addedInScene: number;
                            dissipating?: boolean | undefined;
                        }[] | undefined;
                        season?: "spring" | "summer" | "fall" | "winter" | "unspecified" | undefined;
                        temperatureIndicators?: string[] | undefined;
                    } | undefined;
                };
            } | {
                images: {
                    gcsUri: string;
                    publicUri: string;
                    mimeType: string;
                }[];
                entityType: "prop";
                data: {
                    id: string;
                    name?: string | undefined;
                    description?: string | undefined;
                    type?: string | undefined;
                    referenceId?: string | undefined;
                };
            } | {
                images: {
                    gcsUri: string;
                    publicUri: string;
                    mimeType: string;
                }[];
                entityType: "file";
                data: {
                    id: string;
                    name?: string | undefined;
                    description?: string | undefined;
                    type?: string | undefined;
                    referenceId?: string | undefined;
                };
            })[];
            output: {
                message: string;
                entityIds: string[];
            };
            meta: object;
        }>;
        patch: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                projectId: string;
                updates: any[];
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        delete: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                entityId: string;
                entityType: "location" | "character" | "scene";
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        createSceneWithAutoFill: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                projectId: string;
                sceneFields: Record<string, any>;
                startFrameGcsUri?: string | undefined;
                startFrameMimeType?: string | undefined;
                endFrameGcsUri?: string | undefined;
                endFrameMimeType?: string | undefined;
            };
            output: {
                message: string;
                projectId: string;
            };
            meta: object;
        }>;
        sceneFrameInput: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                sceneId: string;
                projectId: string;
                sourceEntityId: string;
                sourceType: "image" | "scene";
            };
            output: {
                result: {
                    sceneId: string;
                    sourceType: "image" | "scene";
                    sourceEntityId: string;
                    data: string;
                    createdAt: string;
                };
                history: {
                    head: number;
                    best: number;
                    versions: {
                        version: number;
                        data: string;
                        type: "json" | "video" | "image" | "audio" | "text";
                        metadata: {
                            evaluation?: {
                                scores: {
                                    narrativeFidelity: {
                                        rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                        weight: number;
                                        details: string;
                                    };
                                    characterConsistency: {
                                        rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                        weight: number;
                                        details: string;
                                    };
                                    technicalQuality: {
                                        rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                        weight: number;
                                        details: string;
                                    };
                                    emotionalAuthenticity: {
                                        rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                        weight: number;
                                        details: string;
                                    };
                                    continuity: {
                                        rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                        weight: number;
                                        details: string;
                                    };
                                };
                                issues: {
                                    department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                    category: string;
                                    severity: "minor" | "critical" | "major";
                                    description: string;
                                    suggestedFix: string;
                                    videoTimestamp?: string | null | undefined;
                                    locationInFrame?: string | null | undefined;
                                }[];
                                feedback: string;
                                promptCorrections: {
                                    department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                    issueType: string;
                                    originalPromptSection: string;
                                    correctedPromptSection: string;
                                    reasoning: string;
                                }[];
                                grade: "FAIL" | "ACCEPT" | "ACCEPT_WITH_NOTES" | "REGENERATE_MINOR" | "REGENERATE_MAJOR";
                                score: number;
                                model: string;
                                ruleSuggestion?: string | null | undefined;
                            } | null | undefined;
                            model?: string | null | undefined;
                            promptModel?: string | null | undefined;
                            jobId?: string | null | undefined;
                            prompt?: string | null | undefined;
                            duration?: number | null | undefined;
                            width?: number | null | undefined;
                            height?: number | null | undefined;
                            fps?: number | null | undefined;
                            bitrate?: number | null | undefined;
                        };
                        startedAt: Date;
                        createdAt: Date;
                        userFeedback?: {
                            userId: string;
                            rating: "liked" | "disliked";
                            recordedAt: Date;
                            note?: string | null | undefined;
                        } | null | undefined;
                    }[];
                };
            };
            meta: object;
        }>;
    }>>;
    assets: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            user: import("@supabase/supabase-js").AuthUser | null;
            teamId: string | undefined;
            worldId: string | undefined;
            projectId: string | undefined;
            headers: import("http").IncomingHttpHeaders;
        };
        meta: object;
        errorShape: {
            data: {
                zodError: z.core.$ZodFlattenedError<unknown, string> | null;
                code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
                httpStatus: number;
                path?: string;
                stack?: string;
            };
            message: string;
            code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        get: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                entityId: string;
                entityType: "file" | "location" | "character" | "prop" | "scene" | "project";
            };
            output: Partial<Record<"description" | "scene_end_frame" | "scene_start_frame" | "batch-data" | "thumbnail" | "final_output" | "scene_video" | "render_video" | "image_file" | "character_image" | "location_image" | "enhanced_prompt" | "storyboard" | "audio_analysis" | "generation_rules" | "entity", {
                head: number;
                best: number;
                versions: {
                    version: number;
                    data: string;
                    type: "json" | "video" | "image" | "audio" | "text";
                    metadata: {
                        evaluation?: {
                            scores: {
                                narrativeFidelity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                characterConsistency: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                technicalQuality: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                emotionalAuthenticity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                                continuity: {
                                    rating: "FAIL" | "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
                                    weight: number;
                                    details: string;
                                };
                            };
                            issues: {
                                department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                category: string;
                                severity: "minor" | "critical" | "major";
                                description: string;
                                suggestedFix: string;
                                videoTimestamp?: string | null | undefined;
                                locationInFrame?: string | null | undefined;
                            }[];
                            feedback: string;
                            promptCorrections: {
                                department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                issueType: string;
                                originalPromptSection: string;
                                correctedPromptSection: string;
                                reasoning: string;
                            }[];
                            grade: "FAIL" | "ACCEPT" | "ACCEPT_WITH_NOTES" | "REGENERATE_MINOR" | "REGENERATE_MAJOR";
                            score: number;
                            model: string;
                            ruleSuggestion?: string | null | undefined;
                        } | null | undefined;
                        model?: string | null | undefined;
                        promptModel?: string | null | undefined;
                        jobId?: string | null | undefined;
                        prompt?: string | null | undefined;
                        duration?: number | null | undefined;
                        width?: number | null | undefined;
                        height?: number | null | undefined;
                        fps?: number | null | undefined;
                        bitrate?: number | null | undefined;
                    };
                    startedAt: Date;
                    createdAt: Date;
                    userFeedback?: {
                        userId: string;
                        rating: "liked" | "disliked";
                        recordedAt: Date;
                        note?: string | null | undefined;
                    } | null | undefined;
                }[];
            }>>;
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                projectId: string;
                entityId: string;
                entityType: "file" | "location" | "character" | "prop" | "scene" | "project";
                assetKey: "description" | "scene_end_frame" | "scene_start_frame" | "batch-data" | "thumbnail" | "final_output" | "scene_video" | "render_video" | "image_file" | "character_image" | "location_image" | "enhanced_prompt" | "storyboard" | "audio_analysis" | "generation_rules" | "entity";
                url: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        patch: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                entityId: string;
                entityType: "location" | "character" | "scene" | "project";
                assetKey: "description" | "scene_end_frame" | "scene_start_frame" | "batch-data" | "thumbnail" | "final_output" | "scene_video" | "render_video" | "image_file" | "character_image" | "location_image" | "enhanced_prompt" | "storyboard" | "audio_analysis" | "generation_rules" | "entity";
                version: number;
                projectId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        uploadAudio: import("@trpc/server").TRPCMutationProcedure<{
            input: FormData;
            output: {
                audioPublicUri: string;
                audioGcsUri: string;
            };
            meta: object;
        }>;
        uploadImage: import("@trpc/server").TRPCMutationProcedure<{
            input: FormData;
            output: {
                gcsUri: string;
                publicUri: string;
                mimeType: string;
                fileId: string;
            };
            meta: object;
        }>;
        generateCharacterImage: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                characterId: string;
                prompt: string;
                numberOfOutputs: number;
            }[];
            output: {
                message: string;
                characterIds: any[];
            };
            meta: object;
        }>;
        generateLocationImage: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                locationId: string;
                prompt: string;
                numberOfOutputs: number;
            }[];
            output: {
                message: string;
                locationIds: string[];
            };
            meta: object;
        }>;
    }>>;
    canvas: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            user: import("@supabase/supabase-js").AuthUser | null;
            teamId: string | undefined;
            worldId: string | undefined;
            projectId: string | undefined;
            headers: import("http").IncomingHttpHeaders;
        };
        meta: object;
        errorShape: {
            data: {
                zodError: z.core.$ZodFlattenedError<unknown, string> | null;
                code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
                httpStatus: number;
                path?: string;
                stack?: string;
            };
            message: string;
            code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        get: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                contextType: string;
                contextId: string;
            };
            output: {
                contextType: string;
                idLayout: string;
                idContext: string;
                idEntity: string;
                nodeType: string;
                valPosX: number;
                valPosY: number;
                valWidth: number | null;
                valHeight: number | null;
                jsonUiMetadata: unknown;
                idxVersion: number;
                tsUpdated: Date | null;
            }[];
            meta: object;
        }>;
        batch: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                contextType: string;
                contextId: string;
                updates: any[];
            };
            output: {
                success: boolean;
                newVersions: {
                    [entityId: string]: number;
                };
            };
            meta: object;
        }>;
        delete: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                contextType: string;
                contextId: string;
                entityId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        confirmChanges: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                projectId: string;
                updates: any[];
                pendingChanges: any[];
            };
            output: {
                success: boolean;
                newVersions: {
                    [entityId: string]: number;
                };
            };
            meta: object;
        }>;
    }>>;
    videos: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            user: import("@supabase/supabase-js").AuthUser | null;
            teamId: string | undefined;
            worldId: string | undefined;
            projectId: string | undefined;
            headers: import("http").IncomingHttpHeaders;
        };
        meta: object;
        errorShape: {
            data: {
                zodError: z.core.$ZodFlattenedError<unknown, string> | null;
                code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
                httpStatus: number;
                path?: string;
                stack?: string;
            };
            message: string;
            code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                startDate?: unknown;
                endDate?: unknown;
                limit?: unknown;
                status?: string | undefined;
                minDuration?: unknown;
            } | undefined;
            output: {
                success: boolean;
                count: number;
                data: {
                    projectId: string;
                    assetKey: "description" | "batch-data" | "thumbnail" | "final_output" | "scene_video" | "scene_start_frame" | "scene_end_frame" | "render_video" | "image_file" | "character_image" | "location_image" | "enhanced_prompt" | "storyboard" | "audio_analysis" | "generation_rules" | "entity";
                    version: number;
                    url: string;
                    metadata: {
                        evaluation?: {
                            scores: {
                                narrativeFidelity: {
                                    rating: "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES" | "FAIL";
                                    weight: number;
                                    details: string;
                                };
                                characterConsistency: {
                                    rating: "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES" | "FAIL";
                                    weight: number;
                                    details: string;
                                };
                                technicalQuality: {
                                    rating: "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES" | "FAIL";
                                    weight: number;
                                    details: string;
                                };
                                emotionalAuthenticity: {
                                    rating: "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES" | "FAIL";
                                    weight: number;
                                    details: string;
                                };
                                continuity: {
                                    rating: "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES" | "FAIL";
                                    weight: number;
                                    details: string;
                                };
                            };
                            issues: {
                                department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                category: string;
                                severity: "critical" | "major" | "minor";
                                description: string;
                                suggestedFix: string;
                                videoTimestamp?: string | null | undefined;
                                locationInFrame?: string | null | undefined;
                            }[];
                            feedback: string;
                            promptCorrections: {
                                department: "director" | "cinematographer" | "gaffer" | "script_supervisor" | "costume" | "production_design";
                                issueType: string;
                                originalPromptSection: string;
                                correctedPromptSection: string;
                                reasoning: string;
                            }[];
                            grade: "FAIL" | "ACCEPT" | "ACCEPT_WITH_NOTES" | "REGENERATE_MINOR" | "REGENERATE_MAJOR";
                            score: number;
                            model: string;
                            ruleSuggestion?: string | null | undefined;
                        } | null | undefined;
                        model?: string | null | undefined;
                        promptModel?: string | null | undefined;
                        jobId?: string | null | undefined;
                        prompt?: string | null | undefined;
                        duration?: number | null | undefined;
                        width?: number | null | undefined;
                        height?: number | null | undefined;
                        fps?: number | null | undefined;
                        bitrate?: number | null | undefined;
                    } | null;
                    createdAt: Date;
                }[];
            };
            meta: object;
        }>;
    }>>;
    mention: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            user: import("@supabase/supabase-js").AuthUser | null;
            teamId: string | undefined;
            worldId: string | undefined;
            projectId: string | undefined;
            headers: import("http").IncomingHttpHeaders;
        };
        meta: object;
        errorShape: {
            data: {
                zodError: z.core.$ZodFlattenedError<unknown, string> | null;
                code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
                httpStatus: number;
                path?: string;
                stack?: string;
            };
            message: string;
            code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        resolve: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                htmlInput: string;
                projectId: string;
                options?: {
                    includeUnauthorized?: boolean | undefined;
                } | undefined;
            };
            output: import("../services/sac/KBHydrator.ts").HydrationResult;
            meta: object;
        }>;
        suggest: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                query: string;
                projectId: string;
                limit?: unknown;
            };
            output: {
                suggestions: {
                    handle: string;
                    displayName: string;
                    entityType: "location" | "character" | "prop";
                    scope: "project" | "world";
                    isOrphaned: boolean;
                    avatarUrl?: string | undefined;
                }[];
                totalAvailable: number;
            };
            meta: object;
        }>;
        register: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                handle: string;
                entityId: string;
                entityType: "location" | "character" | "prop";
                worldId?: string | undefined;
                projectId?: string | undefined;
            };
            output: {
                handle: string;
                entityType: "location" | "character" | "prop";
                characterId?: string | undefined;
                locationId?: string | undefined;
                propId?: string | undefined;
                worldId?: string | undefined;
                projectId?: string | undefined;
                createdAt?: Date | undefined;
                updatedAt?: Date | undefined;
            };
            meta: object;
        }>;
        unregister: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                handle: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        getHandle: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                handle: string;
            };
            output: {
                handle: string;
                entityType: "location" | "character" | "prop";
                characterId?: string | undefined;
                locationId?: string | undefined;
                propId?: string | undefined;
                worldId?: string | undefined;
                projectId?: string | undefined;
                createdAt?: Date | undefined;
                updatedAt?: Date | undefined;
            };
            meta: object;
        }>;
    }>>;
    sac: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            user: import("@supabase/supabase-js").AuthUser | null;
            teamId: string | undefined;
            worldId: string | undefined;
            projectId: string | undefined;
            headers: import("http").IncomingHttpHeaders;
        };
        meta: object;
        errorShape: {
            data: {
                zodError: z.core.$ZodFlattenedError<unknown, string> | null;
                code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
                httpStatus: number;
                path?: string;
                stack?: string;
            };
            message: string;
            code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        worldRepo: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                worldId: string;
            };
            output: {
                repoId: string;
                repoUrl: string;
            };
            meta: object;
        }>;
        projectFork: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                projectId: string;
                worldId: string;
            };
            output: {
                forkRepoId: string;
                forkRepoUrl: string;
            };
            meta: object;
        }>;
        commit: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                repoId: string;
                ledger: any;
                message: string;
            };
            output: import("#shared/types/index.js").SacCommit;
            meta: object;
        }>;
        commits: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                repoId: string;
            };
            output: import("#shared/types/index.js").SacCommit[];
            meta: object;
        }>;
    }>>;
}>>;
export type AppRouter = ReturnType<typeof createAppRouter>;
//# sourceMappingURL=router.d.ts.map