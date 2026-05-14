// shared/types/location.types.ts
import { z } from "zod";
import { Lighting } from "./cinematography.types.js";

// ============================================================================
// WEATHER & LOCATION STATE
// ============================================================================

export const WeatherIntensity = z.enum(["light", "moderate", "heavy"]).default("light");
export type WeatherIntensity = z.infer<typeof WeatherIntensity>;

export const LocationState = z.object({
  mood: z.string().describe("Atmospheric mood").default("Serene"),
  timeOfDay: z.string().describe("current time of day (evolves across scenes)").default("Dawn"),
  weather: z.string().describe("current weather conditions").default("Clear"),
  precipitation: z.enum(["none", "light", "moderate", "heavy"]).default("none").describe("current precipitation level"),
  visibility: z
    .enum(["clear", "slight_haze", "hazy", "foggy", "obscured"])
    .default("clear")
    .describe("atmospheric visibility"),

  lighting: Lighting.default(() => Lighting.parse({})),

  groundCondition: z
    .object({
      wetness: z.enum(["dry", "damp", "wet", "soaked", "flooded"]).default("dry"),
      debris: z.array(z.string()).default([]).describe("accumulated debris (e.g., 'broken glass', 'fallen leaves')"),
      damage: z.array(z.string()).default([]).describe("environmental damage (e.g., 'crater', 'burn marks')"),
    })
    .default({
      wetness: "dry",
      debris: [],
      damage: [],
    })
    .describe("progressive ground surface changes"),

  atmosphericEffects: z
    .array(
      z.object({
        type: z.string().describe("smoke, fog, dust, steam, etc."),
        intensity: z.enum(["light", "moderate", "heavy"]),
        addedInScene: z.number(),
        dissipating: z.boolean().default(false),
      }),
    )
    .default([])
    .describe("lingering atmospheric effects"),

  season: z
    .enum(["spring", "summer", "fall", "winter", "unspecified"])
    .default("unspecified")
    .describe("seasonal context for consistency"),
  temperatureIndicators: z
    .array(z.string())
    .default([])
    .describe("visual temperature cues (e.g., 'frost on windows', 'heat shimmer')"),
});
export type LocationState = z.infer<typeof LocationState>;

// ============================================================================
// LOCATION ATTRIBUTES
// ============================================================================

export const LocationAttributes = z.object({
  referenceId: z.string().describe("Narrative-scoped identifier for the location (e.g., Grand_Beach)"),
  name: z.string().describe("Location name"),
  description: z.string().describe("Location description"),
  type: z.string().describe("Location type"),
  lightingConditions: Lighting.default(() => Lighting.parse({})),
  mood: z.string().describe("Atmospheric mood").default("Serene"),
  timeOfDay: z.string().describe("Time of day").default("Dawn"),
  weather: z.string().describe("Weather conditions").default("Clear"),
  colorPalette: z.array(z.string()).describe("Dominant colors").default([]),
  architecture: z.array(z.string()).describe("Architectural features").default([]),
  naturalElements: z.array(z.string()).describe("Natural elements in scene").default([]),
  manMadeObjects: z.array(z.string()).describe("Man-made objects in scene").default([]),
  groundSurface: z.string().describe("Ground surface description").default(""),
  skyOrCeiling: z.string().describe("Sky or ceiling description").default(""),
  state: LocationState.default(() => LocationState.parse({})).describe("Location state"),
});
export type LocationAttributes = z.infer<typeof LocationAttributes>;
