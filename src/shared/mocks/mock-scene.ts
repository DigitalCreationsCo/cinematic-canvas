import { SceneWithAssets } from "#shared/types/workflow.types.js";
import { AssetRegistry } from "#shared/types/assets.types.js";
import { generateId } from "#shared/utils/id.js";
import { buildAssetRegistryFromMockKV, KVAssetsMap } from "#shared/mocks/mock.utils.js";

type SceneWithAssetsKV = Omit<SceneWithAssets, "assets"> & {
  assets?: KVAssetsMap;
  description?: string;
};

export const createMockScene = (overrides?: Partial<SceneWithAssetsKV>): SceneWithAssets => {
  const projectId = overrides?.projectId ?? generateId();
  const timestamp = new Date();
  const sceneIndex = overrides?.sceneIndex ?? 0;

  return {
    id: overrides?.id ?? generateId(),
    createdAt: overrides?.createdAt ?? timestamp,
    updatedAt: overrides?.updatedAt ?? timestamp,
    projectId,

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

    shotType: overrides?.shotType ?? "Medium Close-Up",
    cameraAngle: overrides?.cameraAngle ?? "Eye Level",
    cameraMovement: overrides?.cameraMovement ?? "Static",
    transitionType: overrides?.transitionType ?? "None",
    composition: overrides?.composition ?? {
      "Subject Placement": "Center",
      "Focal Point": "Center",
      "Depth Layers": "Midground",
      "Leading Lines": "None",
      Headroom: "Standard",
      "Look Room": "None",
    },

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

    name: overrides?.name ?? `Scene ${sceneIndex + 1}`,
    // description: overrides?.description ?? "",
    audioSync: overrides?.audioSync ?? "Mood Sync",

    characterReferenceIds: overrides?.characterReferenceIds ?? [],
    locationReferenceId: overrides?.locationReferenceId ?? "loc_test",
    continuityNotes: overrides?.continuityNotes ?? [],
    characterIds: overrides?.characterIds ?? [generateId(), generateId()],
    locationId: overrides?.locationId ?? generateId(),

    status: overrides?.status ?? "pending",
    progressMessage: overrides?.progressMessage ?? "",

    assets: overrides?.assets ? buildAssetRegistryFromMockKV(overrides.assets) : AssetRegistry.parse({}),
  };
};
