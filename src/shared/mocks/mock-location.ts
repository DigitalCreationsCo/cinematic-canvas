import { LocationWithAssets } from "#shared/types/workflow.types.js";
import { generateId } from "#shared/utils/id.js";
import { AssetRegistry } from "#shared/types/assets.types.js";
import { buildAssetRegistryFromMockKV, KVAssetsMap } from "#shared/mocks/mock.utils.js";

type LocationWithAssetsKV = Omit<LocationWithAssets, "assets"> & {
  assets?: KVAssetsMap;
  description?: string;
};

export const createMockLocation = (overrides?: Partial<LocationWithAssetsKV>): LocationWithAssets => {
  const projectId = overrides?.projectId ?? generateId();
  const timestamp = new Date();

  return {
    id: overrides?.id ?? generateId(),
    createdAt: overrides?.createdAt ?? timestamp,
    updatedAt: overrides?.updatedAt ?? timestamp,

    projectId,
    worldId: overrides?.worldId ?? generateId(),

    referenceId: overrides?.referenceId ?? `loc-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides?.name ?? "Test Location",
    description: overrides?.description ?? "",
    type: overrides?.type ?? "interior",
    lightingConditions: overrides?.lightingConditions ?? {
      quality: {
        hardness: "Soft",
        colorTemperature: "Neutral",
        intensity: "Medium",
      },
      motivatedSources: {
        primaryLight: "Overhead ceiling lights",
        fillLight: "Ambient reflection",
        practicalLights: "",
        accentLight: "",
        lightBeams: "None",
      },
      direction: {
        keyLightPosition: "Overhead",
        shadowDirection: "Below",
        contrastRatio: "Low(1:2)",
      },
      atmosphere: {
        haze: "None",
      },
    },
    mood: overrides?.mood ?? "Serene",
    timeOfDay: overrides?.timeOfDay ?? "Day",
    weather: overrides?.weather ?? "Clear",
    colorPalette: overrides?.colorPalette ?? [],
    architecture: overrides?.architecture ?? [],
    naturalElements: overrides?.naturalElements ?? [],
    manMadeObjects: overrides?.manMadeObjects ?? [],
    groundSurface: overrides?.groundSurface ?? "Hardwood floor",
    skyOrCeiling: overrides?.skyOrCeiling ?? "White ceiling",
    state: {
      mood: "neutral",
      timeOfDay: "day",
      weather: "Clear",
      precipitation: "none",
      visibility: "clear",
      lighting: {
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
      groundCondition: {
        wetness: "dry",
        debris: [],
        damage: [],
      },
      atmosphericEffects: [],
      season: "spring",
      temperatureIndicators: [],
      ...overrides?.state,
    },
    assets: overrides?.assets ? buildAssetRegistryFromMockKV(overrides.assets) : AssetRegistry.parse({}),
  };
};
