/**
 * Converts LangChain StructuredTool definitions (Zod-based) to Google GenAI
 * FunctionDeclaration format for use in generateContent config.tools.
 *
 * Define tools once using LangChain's `tool()` helper — they work with any
 * LangGraph ToolNode, and are converted to Google's native function-calling
 * format here when bound to GoogleChatModel via bindTools().
 *
 * Switching providers in future only requires a different converter;
 * tool definitions and graph code remain unchanged.
 *
 * Requires: pnpm add zod-to-json-schema
 */

import type { StructuredToolInterface } from "@langchain/core/tools";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Type, type FunctionDeclaration, type Schema } from "@google/genai";
import { z } from "zod";
import { getModelCompatibleSchema } from "#shared/utils/utils.js";

/**
 * Converts an array of LangChain StructuredTools to Google FunctionDeclarations.
 *
 * @example
 * const declarations = convertToolsToGoogleFunctions([searchTool, calcTool]);
 * // → pass to generateContent: config: { tools: [{ functionDeclarations: declarations }] }
 */
export function convertToolsToGoogleFunctions(tools: StructuredToolInterface[]): FunctionDeclaration[] {
  return tools.map(convertTool);
}

// ─── Internal ────────────────────────────────────────────────────────────────

function convertTool(tool: StructuredToolInterface): FunctionDeclaration {
  // openApi3 target avoids $schema/$ref artifacts the Google API does not support.
  const jsonSchema = zodToJsonSchema(tool.schema as any, {
    target: "openApi3",
    $refStrategy: "none", // flatten all $ref — Google won't resolve them
  });
  // const parametersSchema = jsonSchemaToGoogleSchema((tool.schema as z.ZodType).toJSONSchema());
  const parametersJsonSchema = getModelCompatibleSchema(tool.schema as z.ZodType);

  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: parametersJsonSchema,
  };
}

/**
 * Recursively maps a JSON Schema node to a Google GenAI Schema node.
 *
 * Google's Schema is a subset of JSON Schema — key gaps:
 *  - No $ref, anyOf, oneOf, allOf  → first concrete branch is used
 *  - enum only on STRING type
 *  - Properties must be concrete typed nodes
 */
function jsonSchemaToGoogleSchema(schema: Record<string, unknown>): Schema {
  // 0. Safety Unwrap: Handle cases where the library wraps the root in a `schema` property
  if (schema.schema && typeof schema.schema === "object") {
    return jsonSchemaToGoogleSchema(schema.schema as Record<string, unknown>);
  }

  // 1. anyOf / oneOf / allOf — pick the first concrete branch
  const compositeKey = ["anyOf", "oneOf", "allOf"].find((k) => Array.isArray(schema[k]));
  if (compositeKey) {
    const branches = schema[compositeKey] as Record<string, unknown>[];
    const firstConcrete = branches.find(
      (b) => b && typeof b === "object" && (b.type !== "null" || b.properties || b.items),
    );
    if (firstConcrete) {
      return jsonSchemaToGoogleSchema({
        ...firstConcrete,
        description: schema.description || firstConcrete.description,
      });
    }
  }

  const description = schema.description as string | undefined;

  // 2. Normalize the raw type (handles arrays like ["object", "null"] and uppercase "OBJECT")
  const rawType = schema.type;
  let schemaType: string | undefined = undefined;

  if (Array.isArray(rawType) && rawType.length > 0) {
    // Extract the primary concrete type from the array
    schemaType = String(rawType.find((t) => t !== "null") || rawType[0]);
  } else if (typeof rawType === "string") {
    schemaType = rawType;
  }

  // Force lowercase so it always matches our switch cases safely
  schemaType = schemaType?.toLowerCase();

  // 3. Duck-Typing Inference (If type was stripped by OpenAPI3 target)
  if (!schemaType || schemaType === "undefined") {
    if (schema.properties || schema.additionalProperties) schemaType = "object";
    else if (schema.items) schemaType = "array";
    else if (schema.enum) schemaType = "string";
  }

  // 4. Map to Google Types
  switch (schemaType) {
    case "object": {
      const rawProps = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
      const properties: Record<string, Schema> = {};

      for (const [key, val] of Object.entries(rawProps)) {
        if (val && typeof val === "object") {
          properties[key] = jsonSchemaToGoogleSchema(val);
        }
      }

      return {
        type: Type.OBJECT,
        description,
        properties,
        // Only include required if it's actually populated
        ...(Array.isArray(schema.required) && schema.required.length > 0
          ? { required: schema.required as string[] }
          : {}),
      };
    }

    case "array": {
      const items = schema.items as Record<string, unknown> | undefined;
      return {
        type: Type.ARRAY,
        description,
        items: items && typeof items === "object" ? jsonSchemaToGoogleSchema(items) : { type: Type.STRING },
      };
    }

    case "string": {
      const enumValues = schema.enum as string[] | undefined;
      return {
        type: Type.STRING,
        description,
        ...(Array.isArray(enumValues) && enumValues.length > 0 ? { enum: enumValues } : {}),
      };
    }

    case "number":
      return { type: Type.NUMBER, description };

    case "integer":
      return { type: Type.INTEGER, description };

    case "boolean":
      return { type: Type.BOOLEAN, description };

    default:
      // Extreme fallback: If we still failed to recognize the type but properties exist, force it to be an object.
      if (schema.properties && Object.keys(schema.properties).length > 0) {
        return jsonSchemaToGoogleSchema({ ...schema, type: "object" });
      }

      console.warn(
        `[tool-converter] Unrecognised/missing schema type (raw: ${JSON.stringify(rawType)}, inferred: ${schemaType}). Falling back to STRING.\nRaw Schema:`,
        JSON.stringify(schema),
      );
      return { type: Type.STRING, description };
  }
}
