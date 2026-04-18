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

import type { StructuredToolInterface } from '@langchain/core/tools';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Type, type FunctionDeclaration, type Schema } from '@google/genai';

/**
 * Converts an array of LangChain StructuredTools to Google FunctionDeclarations.
 *
 * @example
 * const declarations = convertToolsToGoogleFunctions([searchTool, calcTool]);
 * // → pass to generateContent: config: { tools: [{ functionDeclarations: declarations }] }
 */
export function convertToolsToGoogleFunctions(
    tools: StructuredToolInterface[]
): FunctionDeclaration[] {
    return tools.map(convertTool);
}

// ─── Internal ────────────────────────────────────────────────────────────────

function convertTool(tool: StructuredToolInterface): FunctionDeclaration {
    // openApi3 target avoids $schema/$ref artifacts the Google API does not support.
    const jsonSchema = zodToJsonSchema(tool.schema, {
        target: 'openApi3',
        $refStrategy: 'none',   // flatten all $ref — Google won't resolve them
    });

    return {
        name: tool.name,
        description: tool.description,
        parameters: jsonSchemaToGoogleSchema(jsonSchema),
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
    // anyOf / oneOf / allOf — pick the first concrete (non-null) branch
    const compositeKey = ['anyOf', 'oneOf', 'allOf'].find((k) => Array.isArray(schema[k]));
    if (compositeKey) {
        const branches = schema[compositeKey] as Record<string, unknown>[];
        const firstConcrete = branches.find((b) => b.type && b.type !== 'null');
        if (firstConcrete) {
            return jsonSchemaToGoogleSchema({
                ...firstConcrete,
                description: schema.description,
            });
        }
    }

    const description = schema.description as string | undefined;

    switch (schema.type) {
        case 'object': {
            const rawProps = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
            const properties: Record<string, Schema> = {};
            for (const [key, val] of Object.entries(rawProps)) {
                properties[key] = jsonSchemaToGoogleSchema(val);
            }
            return {
                type: Type.OBJECT,
                description,
                properties,
                required: schema.required as string[] | undefined,
            };
        }

        case 'array': {
            const items = schema.items as Record<string, unknown> | undefined;
            return {
                type: Type.ARRAY,
                description,
                items: items ? jsonSchemaToGoogleSchema(items) : { type: Type.STRING },
            };
        }

        case 'string': {
            const enumValues = schema.enum as string[] | undefined;
            return {
                type: Type.STRING,
                description,
                ...(enumValues ? { enum: enumValues } : {}),
            };
        }

        case 'number':
            return { type: Type.NUMBER, description };

        case 'integer':
            return { type: Type.INTEGER, description };

        case 'boolean':
            return { type: Type.BOOLEAN, description };

        default:
            console.warn(
                `[tool-converter] Unrecognised JSON Schema type "${schema.type}" — mapping to STRING.`
            );
            return { type: Type.STRING, description };
    }
}