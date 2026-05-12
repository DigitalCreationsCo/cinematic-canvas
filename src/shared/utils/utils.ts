import { WorkflowState } from "../types/workflow.types.js";
import { StoryboardAttributes } from "../types/storyboard.types.js";
import { z } from "zod";

/**
 * Depracated - Sanitized the storyboard by removing any potentially hallucinated asset URLs.
 * This ensured that planning nodes do not accidentally introduce fake assets.
 * Currently returns the same object, as asset have been moved to dedicated `assets` object.
 *
 * @param storyboard - The storyboard to sanitize.
 * @returns A deep copy of the storyboard with asset fields removed.
 */
export function deleteBogusUrlsStoryboard(storyboard: StoryboardAttributes): StoryboardAttributes {
  const clean: StoryboardAttributes = JSON.parse(JSON.stringify(storyboard));

  if (clean.scenes) {
    clean.scenes = clean.scenes.map((s) => {
      // s.generatedVideo = "";
      // s.startFrame = "";
      // s.endFrame = "";
      return s;
    });
  }

  if (clean.characters) {
    clean.characters = clean.characters.map((c) => {
      // c.referenceImages = [];
      return c;
    });
  }

  if (clean.locations) {
    clean.locations = clean.locations.map((l) => {
      // l.referenceImages = [];
      return l;
    });
  }

  return clean;
}

/**
 * Cleans the LLM output to extract the JSON string.
 * It removes markdown code blocks and extracts the JSON object.
 *
 * @param output - The raw string output from the LLM.
 * @returns The cleaned JSON string.
 */
export function cleanJsonOutput(output: string): string {
  // Remove markdown code blocks
  let clean = output.replace(/```json\n?|```/g, "");

  // Find the first '{' and the last '}' to extract the JSON object
  const firstOpen = clean.indexOf("{");
  const lastClose = clean.lastIndexOf("}");

  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    clean = clean.substring(firstOpen, lastClose + 1);
  }

  return clean;
}

export const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Deeply traverses an object to convert ISO strings back to JavaScript Date objects.
 * Resolves the "JSON Date Bug" where dates are lost during DB serialization.
 * @param obj - The object or value to revive.
 * @returns The object with stringified dates restored as Date instances.
 */
export function reviveDates<T>(obj: T): T {
  const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d*)?Z$/;
  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "string" && ISO_DATE_REGEX.test(obj)) {
      return new Date(obj) as T;
    }
    return obj;
  }
  for (const key in obj) {
    obj[key] = reviveDates(obj[key]);
  }
  return obj;
}

/**
 * Deeply unwraps Zod types to find the core definition (strips defaults/optionals).
 */
function getCoreType(schema: any): z.ZodTypeAny {
  let current = schema;

  // In Zod v4, we check for 'typeName' in the definition to be version-agnostic
  while (current.def) {
    const typeName = current.def.innerType;

    if (typeName === "ZodOptional" || typeName === "ZodDefault" || typeName === "ZodNullable") {
      current = current.def.innerType;
    } else if (typeName === "ZodEffects") {
      // This handles .preprocess, .transform, and .refine in v4
      current = current.def.schema;
    } else {
      break;
    }
  }
  return current;
}

export const getModelCompatibleSchema = (schema: z.ZodType) => {
  return (
    schema.toJSONSchema?.({
      target: "openapi-3.0",
      unrepresentable: "any",
      override: (ctx: any) => {
        const core = getCoreType(ctx.zodSchema);

        // 1. Handle Unions (e.g., ValidDurations [6, 8] or TransitionTypes)
        if (core instanceof z.ZodUnion) {
          const options = core.def.options;
          const literals = options.map((opt: any) => getCoreType(opt));

          if (literals.every((l: any) => l instanceof z.ZodLiteral)) {
            const firstValue = literals[0].value;

            // NUCLEAR RESET: Purge all library-inferred properties
            Object.keys(ctx.jsonSchema).forEach((key) => delete ctx.jsonSchema[key]);

            ctx.jsonSchema.type = typeof firstValue; // Will be 'number' for ValidDurations
            ctx.jsonSchema.enum = literals.map((l: any) => l.value);
            ctx.jsonSchema.description = ctx.zodSchema.description || core.description;
            return;
          }
        }

        // 2. Handle Standalone Literals
        if (core instanceof z.ZodLiteral) {
          Object.keys(ctx.jsonSchema).forEach((key) => delete ctx.jsonSchema[key]);

          ctx.jsonSchema.type = typeof core.value === "number" ? "number" : "string";
          ctx.jsonSchema.enum = [core.value];
          ctx.jsonSchema.description = ctx.zodSchema.description || core.description;
          return;
        }

        // 3. Handle Dates & UUIDs
        if (core instanceof z.ZodUUID || core instanceof z.ZodDate) {
          ctx.jsonSchema.type = "string";
          ctx.jsonSchema.format = core instanceof z.ZodUUID ? "uuid" : "date-time";
          // Remove complex regex patterns that crash the Gemini FSM
          delete ctx.jsonSchema.pattern;
          return;
        }
      },
    }) ?? schema
  );
};

export function mergeParamsIntoState(
  currentState: WorkflowState,
  params: Partial<WorkflowState>,
): Partial<WorkflowState> {
  const updates: Partial<WorkflowState> = { ...currentState, ...params };

  // Merge scene prompt overrides
  // if (params..promptModification && params.sceneId !== undefined) {
  //   updates.scenePromptOverrides = {
  //     ...(currentState.scenePromptOverrides || {}),
  //     [ params.sceneId ]: params.promptModification
  //   };
  // }

  // // Merge creative prompt if provided
  // if (params.enhancedPrompt) {
  //   updates.enhancedPrompt = params.enhancedPrompt;
  // }

  // if (params.characters) {
  //   if (updates?.characters) {
  //     updates.characters = params.characters;
  //   }
  // }

  // if (params.sceneDescriptions && params.sceneDescriptions.length > 0) {
  //   if (updates?.scenes) {
  //     updates.scenes = updates.scenes.map((s, idx) => {
  //       return {
  //         ...s,
  //         description: params.sceneDescriptions![ idx ]
  //       };
  //     });
  //   }
  // }

  // Add other specific param mappings here as needed

  return updates;
}

/**
 * Resolves a resource string into a public HTTPS URL.
 * * Handles three primary cases:
 * 1. Pass-through of existing http/https URLs.
 * 2. Transformation of Google Cloud Storage (gs://) URIs to storage.googleapis.com.
 * 3. Fallback for relative paths or malformed inputs.
 *
 * @param {string|undefined|null} urlOrPath - The source string to resolve.
 * @returns {string} The resolved HTTPS URL, the original path if no transformation
 * is applicable, or an empty string if input is null/undefined.
 * * @example
 * // returns "https://storage.googleapis.com/my-bucket/image.png"
 * resolvePublicUrl("gs://my-bucket/image.png");
 * * @example
 * // returns "https://example.com/file.pdf"
 * resolvePublicUrl("https://example.com/file.pdf");
 */
export function resolvePublicUrl(urlOrPath: string | undefined | null): string {
  if (!urlOrPath) return "";

  // 1. Handle existing web URLs
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    return urlOrPath;
  }

  // 2. Handle Cloud Storage URIs
  if (urlOrPath.startsWith("gs://")) {
    const parts = urlOrPath.replace("gs://", "").split("/");
    const bucket = parts.shift();
    const path = parts.join("/");

    return bucket ? `https://storage.googleapis.com/${bucket}/${path}` : "";
  }

  // 3. Fallback for raw paths or malformed strings
  return urlOrPath;
}

const formDataField = (key: string) => z.custom<FormData>().transform((fd) => fd.get(key));

// Reusable schema factory
export const createFormDataSchema = <T extends z.ZodRawShape>(shape: T) => {
  return z
    .custom<FormData>((val) => val instanceof FormData)
    .transform((fd) => {
      const entries: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        entries[key] = fd.get(key);
      }
      return entries;
    })
    .pipe(z.object(shape));
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // Strip the Data-URL prefix (e.g., "data:audio/mpeg;base64,")
      const base64String = (reader.result as string).split(",")[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
};

export { roundToValidDuration } from "../types/base.types.js";
