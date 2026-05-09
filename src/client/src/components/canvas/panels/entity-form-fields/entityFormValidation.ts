import { z } from "zod";
import { CharacterAttributes } from "#shared/types/character.types.js";
import { EntityCreatableType } from "#shared/types/entity.types.js";
import { LocationAttributes } from "#shared/types/location.types.js";
import { SceneAttributes } from "#shared/types/scene.types.js";
import { PropAttributes } from "#shared/types/workflow.types.js";
import { CreateSceneWithEntitiesInput } from "#shared/types/editable.types.js";

/**
 * Recursively transforms a Zod schema into a strict Patch schema:
 * 1. Strips all default values out of the AST.
 * 2. Makes all object properties optional.
 * 3. Retains underlying base validation constraints.
 */
// export function createPatchSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
//   const typeName = schema._zod.traits.typeName;

//   switch (typeName) {
//     // 1. Strip defaults entirely by bypassing the wrapper and processing the inner type
//     case z.ZodDefault:
//       return createPatchSchema((schema as z.ZodDefault).def.innerType);

//     // 2. Traverse objects and make all keys optional
//     case z.ZodFirstPartyTypeKind.ZodObject: {
//       const shape = (schema as z.ZodObject<any>).shape;
//       const patchShape: Record<string, z.ZodTypeAny> = {};

//       for (const key in shape) {
//         const processed = createPatchSchema(shape[key]);
//         // Prevent double-wrapping ZodOptionals
//         patchShape[key] =
//           processed._def.typeName === z.ZodFirstPartyTypeKind.ZodOptional ? processed : z.optional(processed);
//       }
//       return z.object(patchShape);
//     }

//     // 3. Traverse arrays but keep the array wrapper intact
//     case z.ZodFirstPartyTypeKind.ZodArray:
//       return z.array(createPatchSchema((schema as z.ZodArray<any>).element));

//     // 4. Unwrap Optionals/Nullables, process the inner type, and re-wrap
//     case z.ZodFirstPartyTypeKind.ZodOptional:
//       return z.optional(createPatchSchema((schema as z.ZodOptional<any>).unwrap()));

//     case z.ZodFirstPartyTypeKind.ZodNullable:
//       return z.nullable(createPatchSchema((schema as z.ZodNullable<any>).unwrap()));

//     // 5. Base case: Return strings, enums, numbers, etc., with validations intact
//     default:
//       return schema;
//   }
// }



// Mapping from field path to human-readable label
const FIELD_LABELS: Record<string, string> = {
  // Scene
  name: "Name",
  description: "Description",
  mood: "Mood",
  locationTextInput: "Location",
  charactersTextInput: "Characters",
  shotType: "Shot Type",
  cameraAngle: "Camera Angle",
  cameraMovement: "Camera Movement",
  transitionType: "Transition Type",
  audioSync: "Audio Sync",
  startTime: "Start Time",
  endTime: "End Time",
  duration: "Duration",
  type: "Type",
  intensity: "Intensity",
  tempo: "Tempo",
  musicalDescription: "Musical Description",
  // Location
  timeOfDay: "Time of Day",
  weather: "Weather",
  "state.season": "Season",
  colorPalette: "Color Palette",
  architecture: "Architecture",
  naturalElements: "Natural Elements",
  manMadeObjects: "Man-made Objects",
  groundSurface: "Ground Surface",
  skyOrCeiling: "Sky/Ceiling",
  // Character
  aliases: "Aliases",
  "physicalTraits.hair": "Hair",
  "physicalTraits.build": "Build",
  "physicalTraits.age": "Age",
  "physicalTraits.gender": "Gender",
  "physicalTraits.ethnicity": "Ethnicity",
  "physicalTraits.clothing": "Clothing",
  "physicalTraits.accessories": "Accessories",
  "physicalTraits.distinctiveFeatures": "Distinctive Features",
  "physicalTraits.appearanceNotes": "Appearance Notes",
  "state.emotionalState": "Emotional State",
  "state.position": "Position",
  "state.dirtLevel": "Dirt Level",
  "state.exhaustionLevel": "Exhaustion Level",
  // Prop
  referenceId: "Reference ID",
};

export function getFieldLabel(fieldPath: string): string {
  if (FIELD_LABELS[fieldPath]) {
    return FIELD_LABELS[fieldPath];
  }
  // Fallback: convert last segment (after dot) from camelCase to words
  const lastSegment = fieldPath.split(".").pop() || fieldPath;
  // Convert camelCase to words: insert space before uppercase letters and capitalize first letter
  const words = lastSegment
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
  return words;
}

export type DeepPartial<T> =
  T extends Array<infer U>
  ? DeepPartial<U>[]
  : T extends Record<string, unknown>
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export const createEntityData = <T extends EntityCreatableType>(
  fields: {
    id: string;
  } & EntityFormDataByType[T],
): EntityFormDataByType[T] & { id: string } => fields;

export type EntityFormDataByType = {
  character: DeepPartial<z.infer<typeof CharacterAttributes>>;
  location: DeepPartial<z.infer<typeof LocationAttributes>>;
  scene: CreateSceneWithEntitiesInput;
  prop: DeepPartial<z.infer<typeof PropAttributes>>;
};

export type CharacterFormData = EntityFormDataByType["character"];
export type LocationFormData = EntityFormDataByType["location"];
export type SceneFormData = EntityFormDataByType["scene"];
export type PropFormData = EntityFormDataByType["prop"];
export type EntityFormData = EntityFormDataByType[EntityCreatableType];
export type EntityFormErrors = Partial<Record<string, string>>;

export type EntityRequiredFieldsByType = {
  [K in EntityCreatableType]: readonly (keyof EntityFormDataByType[K])[];
};

export const ENTITY_FORM_REQUIRED_FIELDS: EntityRequiredFieldsByType = {
  character: ["description"],
  location: ["description"],
  scene: ["description", "locationTextInput"],
  prop: ["description"],
};

// Used only for required-field presence checks, not sanitization.
export const extractVisibleTextForValidation = (value: string): string =>
  value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\u200B/g, "")
    .trim();

export const getValueAtPath = (data: unknown, path: string): unknown => {
  let current = data;

  for (const segment of path.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

export const isValuePresent = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return extractVisibleTextForValidation(value).length > 0;
  }

  if (typeof value === "number") {
    return !Number.isNaN(value);
  }

  if (typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(isValuePresent);
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(isValuePresent);
  }

  return Boolean(value);
};

export const buildDeepPartialSchema = (schema: z.ZodTypeAny): z.ZodTypeAny => {
  if (schema instanceof z.ZodDefault) {
    return buildDeepPartialSchema(schema.removeDefault() as z.ZodTypeAny).optional();
  }

  if (schema instanceof z.ZodOptional) {
    return buildDeepPartialSchema(schema.unwrap() as z.ZodTypeAny).optional();
  }

  if (schema instanceof z.ZodNullable) {
    return buildDeepPartialSchema(schema.unwrap() as z.ZodTypeAny).nullable();
  }

  if (schema instanceof z.ZodArray) {
    return z.array(buildDeepPartialSchema(schema.element as z.ZodTypeAny));
  }

  if (schema instanceof z.ZodObject) {
    const partialShape: Record<string, z.ZodTypeAny> = {};

    for (const [key, value] of Object.entries(schema.shape)) {
      partialShape[key] = buildDeepPartialSchema(value as z.ZodTypeAny).optional();
    }

    return z.object(partialShape);
  }

  return schema;
};

const ENTITY_FORM_SCHEMAS: Record<EntityCreatableType, z.ZodTypeAny> = {
  character: buildDeepPartialSchema(CharacterAttributes),
  location: buildDeepPartialSchema(LocationAttributes),
  scene: buildDeepPartialSchema(SceneAttributes),
  prop: buildDeepPartialSchema(PropAttributes),
};

export const mapZodIssuesToFieldErrors = (issues: z.ZodIssue[]): EntityFormErrors => {
  const errors: EntityFormErrors = {};

  for (const issue of issues) {
    const path = issue.path.join(".");

    if (!path || errors[path]) {
      continue;
    }

    // Use human-readable field label in error message
    const fieldLabel = getFieldLabel(path);
    const message = issue.message === "Required" ? "is required" : issue.message;
    errors[path] = `${fieldLabel} ${message}`;
  }

  return errors;
};

export const getFieldError = (errors: EntityFormErrors, fieldPath: string): string | undefined => {
  if (errors[fieldPath]) {
    return errors[fieldPath];
  }

  return Object.entries(errors).find(([path]) => path.startsWith(`${fieldPath}.`))?.[1];
};

export const hasFieldError = (errors: EntityFormErrors, fieldPath: string): boolean =>
  Boolean(getFieldError(errors, fieldPath));

export const isFieldRequired = (requiredFields: readonly string[], fieldPath: string): boolean =>
  requiredFields.includes(fieldPath);

export const validateEntityForm = (
  entityType: EntityCreatableType,
  fields: EntityFormData,
  options?: {
    requiredFields?: readonly string[];
  },
): {
  isValid: boolean;
  errors: EntityFormErrors;
  requiredFields: readonly string[];
} => {
  const requiredFields = options?.requiredFields ?? ENTITY_FORM_REQUIRED_FIELDS[entityType];
  const errors: EntityFormErrors = {};

  // Attempt schema validation.  Some Zod schemas (e.g. those using
  // z.preprocess / z.transform) can throw when a field is undefined in the
  // input.  We catch those so that required-field presence checks below
  // still run and produce meaningful error messages for the user.
  try {
    const validationResult = ENTITY_FORM_SCHEMAS[entityType].safeParse(fields);
    if (!validationResult.success) {
      Object.assign(errors, mapZodIssuesToFieldErrors(validationResult.error.issues));
    }
  } catch {
    // Schema-level parse failed — fall through to required-field checks
  }

  for (const fieldPath of requiredFields) {
    if (!isValuePresent(getValueAtPath(fields, fieldPath)) && !getFieldError(errors, fieldPath)) {
      const fieldLabel = getFieldLabel(fieldPath);
      errors[fieldPath] = `${fieldLabel} is required`;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    requiredFields,
  };
};
