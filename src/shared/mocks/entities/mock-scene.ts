// @ts-nocheck
import { CharacterWithAssets, CharacterState, SceneWithAssets, AssetRegistry, AssetKey } from "../../types/index.js";
import { generateId } from "#shared/utils/id.js";

type SceneWithAssetsKV = Omit<SceneWithAssets, 'assets'> & {
    assets?: Partial<Record<AssetKey, string>>;
};

export const createMockScene = (overrides?: Partial<SceneWithAssetsKV>): SceneWithAssets => {
    const projectId = overrides?.projectId ?? generateId();
    const timestamp = new Date();
    const sceneIndex = overrides?.sceneIndex ?? 0;

    return {
        // IdentityBase
        id: overrides?.id ?? generateId(),
        createdAt: overrides?.createdAt ?? timestamp,
        updatedAt: overrides?.updatedAt ?? timestamp,
        // ProjectRef
        projectId,
        // SceneAttributes
        sceneIndex,
        lighting: overrides?.lighting ?? {
            quality: {
                hardness: "Soft",
                colorTemperature: "Neutral",
                intensity: "Medium",
            },
            motivatedSources: {
                primaryLight: "Sun through window",
                fillLight: "Ambient skylight",
                practicalLights: "",
                accentLight: "",
                lightBeams: "None",
            },
            direction: {
                keyLightPosition: "Front-left 45°",
                shadowDirection: "Falling right",
                contrastRatio: "Medium(1:4)",
            },
            atmosphere: {
                haze: "None",
            },
        },
        // Cinematography
        shotType: overrides?.shotType ?? "Medium Close-Up",
        cameraAngle: overrides?.cameraAngle ?? "Eye Level",
        cameraMovement: overrides?.cameraMovement ?? "Static",
        transitionType: overrides?.transitionType ?? "none",
        composition: overrides?.composition ?? {
            "Subject Placement": "Center",
            "Focal Point": "Center",
            "Depth Layers": "Midground",
            "Leading Lines": "None",
            "Headroom": "Standard",
            "Look Room": "None",
        },
        // AudioSegmentAttributes
        startTime: overrides?.startTime ?? sceneIndex * 5,
        endTime: overrides?.endTime ?? (sceneIndex + 1) * 5,
        duration: overrides?.duration ?? 5,
        type: overrides?.type ?? "lyrical",
        lyrics: overrides?.lyrics ?? "",
        musicalDescription: overrides?.musicalDescription ?? "Ambient background music",
        musicChange: overrides?.musicChange ?? "None",
        intensity: overrides?.intensity ?? "medium",
        mood: overrides?.mood ?? "neutral",
        tempo: overrides?.tempo ?? "moderate",
        audioEvidence: overrides?.audioEvidence ?? "Soft instrumental music",
        transientImpact: overrides?.transientImpact ?? "soft",
        // DirectorScene
        name: overrides?.name ?? `Scene ${sceneIndex + 1}`,
        audioSync: overrides?.audioSync ?? "Mood Sync",
        // ScriptSupervisorScene
        characterReferenceIds: overrides?.characterReferenceIds ?? [],
        locationReferenceId: overrides?.locationReferenceId ?? "loc_test",
        continuityNotes: overrides?.continuityNotes ?? [],
        // ScriptSupervisorScene (additional fields from .pick())
        characterIds: overrides?.characterIds ?? [],
        locationId: overrides?.locationId ?? 'test-location-id',
        // SceneStatus
        status: overrides?.status ?? "pending",
        progressMessage: overrides?.progressMessage ?? "",
        // AssetRegistry
        assets: overrides?.assets ?? AssetRegistry.parse({}),
    };
};