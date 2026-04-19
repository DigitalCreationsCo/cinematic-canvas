import { LocationWithAssets, LocationAttributes } from "../types/index.js";
import { getAllBestAssets } from "../utils/assets-utils.js";

export const promptVersion = "3.0.2";

/**
 * Generates reference images and specifies exact location appearance for continuity
 */
export const buildLocationFullSpec = (location: LocationWithAssets | LocationAttributes): string => {

  const assets = ('assets' in location) ? getAllBestAssets(location.assets) : {};
  const description = assets["description"]?.data || ("description" in location ? location.description : "");
  const state = location.state;
  const lighting = location.lightingConditions;

  const atmosphericParts: string[] = [];
  if (state.precipitation !== "none") atmosphericParts.push(`${state.precipitation} precipitation`);
  if (state.visibility !== "clear") atmosphericParts.push(`${state.visibility.replace("_", " ")} visibility`);
  state.atmosphericEffects?.forEach(e => {
    if (!e.dissipating) atmosphericParts.push(`${e.intensity} ${e.type}`);
  });
  location.state.temperatureIndicators.forEach(t => atmosphericParts.push(t));

  // Ground condition
  const groundParts: string[] = [];
  if (location.groundSurface) groundParts.push(location.groundSurface);
  if (state.groundCondition.wetness !== "dry") groundParts.push(`${state.groundCondition.wetness}`);
  if (state.groundCondition.debris.length > 0) groundParts.push(`scattered with ${state.groundCondition.debris.join(" and ")}`);
  if (state.groundCondition.damage.length > 0) groundParts.push(`marked by ${state.groundCondition.damage.join(" and ")}`);

  // Lighting description
  const lightingDesc = [
    lighting.atmosphere.haze,
    lighting.direction.contrastRatio && `${lighting.direction.contrastRatio} contrast ratio`,
    lighting.direction.keyLightPosition && `${lighting.direction.keyLightPosition} key light position`,
    lighting.direction.shadowDirection && `${lighting.direction.shadowDirection} shadow direction`,
    lighting.motivatedSources.accentLight && `${lighting.motivatedSources.accentLight} accent light`,
    lighting.motivatedSources.fillLight && `${lighting.motivatedSources.fillLight} fill light`,
    lighting.motivatedSources.lightBeams && `${lighting.motivatedSources.lightBeams} light beams`,
    lighting.motivatedSources.practicalLights && `${lighting.motivatedSources.practicalLights} practical lights`,
    lighting.motivatedSources.primaryLight && `${lighting.motivatedSources.primaryLight} primary light`,
    lighting.quality.colorTemperature && `${lighting.quality.colorTemperature} color temperature`,
    lighting.quality.hardness && `${lighting.quality.hardness} light hardness`,
    lighting.quality.intensity && `${lighting.quality.intensity} light intensity`,
  ].filter(Boolean).join(", ");

  const image = "assets" in location && getAllBestAssets(location.assets)["location_image"]?.data || "";

  return `${description}
${location.name}${location.type ? `, a ${location.type}` : ""}.
${location.naturalElements?.length > 0 ? `The environment features ${location.naturalElements.join(", ")}. ` : ""}
${location.architecture?.length > 0 ? `Architecture includes ${location.architecture.join(", ")}. ` : ""}
${location.manMadeObjects?.length > 0 ? `Man-made objects include ${location.manMadeObjects.join(", ")}. ` : ""}
${groundParts.length > 0 ? `The ground is ${groundParts.join(", ")}. ` : ""}
${location.skyOrCeiling ? `Overhead, ${location.skyOrCeiling}. ` : ""}
Set during ${location.timeOfDay}${state.season !== "unspecified" ? ` in ${state.season}` : ""}, 
with ${location.weather || "clear"} weather${atmosphericParts.length > 0 ? ` and ${atmosphericParts.join(", ")}` : ""}.
${state.temperatureIndicators?.length > 0 ? ` ${state.temperatureIndicators.join(", ")}.` : ""}

${lightingDesc ? `Lit by ${lightingDesc}.` : "Natural lighting matching the time of day."}
${location.colorPalette?.length > 0 ? ` Color palette: ${location.colorPalette.join(", ")}.` : ""}
${location.mood || "Neutral"} atmosphere — conveyed through light, color, and composition.
${image ? `Image: ${image}` : ""}
Reference ID: ${location.referenceId}`;
};
