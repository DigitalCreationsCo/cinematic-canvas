import { CharacterWithAssets, CharacterAttributes } from "../types/index.js";
import { getAllBestAssets } from "../utils/assets-utils.js";

export const promptVersion = "3.0.2";

/**
 * Generates reference images and specifies exact character appearance for continuity
 */
export const buildCharacterFullSpec = (character: CharacterWithAssets | CharacterAttributes): string => {
  const assets = ('assets' in character) ? getAllBestAssets(character.assets) : {};
  const characterDescription =
    assets?.["description"]?.data || ("description" in character ? character.description : "");

  const gender = character.physicalTraits.gender === "male" ? "man" : character.physicalTraits.gender === "female" ? "woman" : "non-binary-gender person";

  const clothing = character.physicalTraits.clothing?.length > 0
    ? character.physicalTraits.clothing.join(", ")
    : null;

  const accessories = character.physicalTraits.accessories?.length > 0
    ? character.physicalTraits.accessories.join(", ")
    : null;

  const distinctiveFeatures = character.physicalTraits.distinctiveFeatures?.length > 0
    ? character.physicalTraits.distinctiveFeatures.join("; ")
    : null;

  const appearanceNotes = character.physicalTraits.appearanceNotes?.length > 0
    ? character.physicalTraits.appearanceNotes.join(" ")
    : null;

  const appearanceSentences = [
    characterDescription,
    `A ${character.physicalTraits.age}-year-old ${character.physicalTraits?.ethnicity || ""} ${gender} with a ${character.physicalTraits.build} build.`,
    character.physicalTraits.hair
      ? `Their hair is ${character.physicalTraits.hair}.`
      : null,
    clothing
      ? `They are wearing ${clothing}.`
      : null,
    accessories
      ? `They are accessorized with ${accessories}.`
      : null,
    distinctiveFeatures
      ? `Distinctive features include ${distinctiveFeatures}.`
      : null,
    appearanceNotes
      ? appearanceNotes
      : null,
  ].filter(Boolean).join(" ");


  const state = character.state;

  const moistureLevel = (() => {
    const costumeWet = state?.costumeCondition?.wetness ?? "dry";
    const priority = ["drenched", "soaked", "heavy", "wet", "moderate", "damp", "slight", "dry"];
    return priority.find((l: any) => [costumeWet].includes(l)) ?? "dry";
  })();

  const physicalConditionParts = [
    state?.exhaustionLevel && state.exhaustionLevel !== "fresh"
      ? `appearing ${state.exhaustionLevel}`
      : null,
    state?.dirtLevel && state.dirtLevel !== "clean"
      ? `visibly ${state.dirtLevel.replace("_", " ")}`
      : null,
    moistureLevel !== "dry"
      ? `${moistureLevel} with moisture`
      : null,
  ].filter(Boolean);

  const costumeConditionParts = [
    state?.costumeCondition?.tears?.length
      ? `torn at the ${state.costumeCondition.tears.join(" and ")}`
      : null,
    state?.costumeCondition?.stains?.length
      ? `stained with ${state.costumeCondition.stains.join(" and ")}`
      : null,
    state?.costumeCondition?.damage?.length
      ? `damaged: ${state.costumeCondition.damage.join(", ")}`
      : null,
  ].filter(Boolean);

  const hairConditionParts = [
    state?.hairCondition?.messiness && state.hairCondition.messiness !== "pristine"
      ? `${state.hairCondition.messiness} hair`
      : null,
    state?.hairCondition?.wetness && state.hairCondition.wetness !== "dry"
      ? `${state.hairCondition.wetness} hair`
      : null,
  ].filter(Boolean);

  const injuryParts = state?.injuries?.length
    ? state.injuries.map((i) => `a ${i.severity} ${i.type} on their ${i.location}`)
    : [];

  const stateSentences = [
    state?.emotionalState
      ? `Their expression conveys ${state.emotionalState}.`
      : null,
    physicalConditionParts.length
      ? `They are ${physicalConditionParts.join(", ")}.`
      : null,
    costumeConditionParts.length
      ? `Their clothing is ${costumeConditionParts.join(", ")}.`
      : null,
    hairConditionParts.length
      ? `Their hair is ${hairConditionParts.join(" and ")}.`
      : null,
    injuryParts.length
      ? `They have ${injuryParts.join(", ")}.`
      : null,
  ].filter(Boolean).join(" ");

  const image = "assets" in character && getAllBestAssets(character.assets)["character_image"]?.data || "";

  return `${appearanceSentences}
  ${stateSentences ? ` ${stateSentences}` : ""}
  ${image ? `Image: ${image}` : ""}
  Reference ID: ${character.referenceId}`;
};